import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { createClient } from '@/lib/supabase/server'
import { geminiFlash } from '@/lib/gemini'
import type { ChatPayload, ColumnDefinition, ChartConfig } from '@/types'

// Converts [col name] bracket-quoting AND bare unquoted col names to `col name` backtick-quoting.
// Processes longest column names first to avoid partial substitutions.
function fixColumnQuoting(sql: string, cols: ColumnDefinition[]): string {
  const problematic = cols
    .map(c => c.original_name)
    .filter(n => /[\s\[\](){}]/.test(n))
    .sort((a, b) => b.length - a.length)
  if (problematic.length === 0) return sql

  let result = sql
  for (const col of problematic) {
    const bt = `\`${col}\``
    const esc = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Step 1: [col name] → `col name`
    result = result.replace(new RegExp(`\\[${esc}\\]`, 'g'), bt)
    // Step 2: bare col name → `col name`
    // Only when surrounded by SQL separator chars so we skip inside string literals
    result = result.replace(
      new RegExp(`(?<=[ \\t\\n,(]|^)${esc}(?=[ \\t\\n,)=<>!]|$)`, 'gm'),
      bt
    )
  }
  return result
}

function prepareRows(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[]
): Record<string, unknown>[] {
  return rows.map(row => {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(row)) {
      const col = columns.find(c => c.original_name === key)
      if (col?.type === 'number' && val !== '' && val !== null && val !== undefined) {
        out[key] = Number(val)
      } else {
        out[key] = val
      }
    }
    return out
  })
}

// Cache the sql.js init promise so the wasm is only loaded once per function instance.
let sqlJsPromise: ReturnType<typeof initSqlJs> | null = null
function getSqlJs() {
  if (!sqlJsPromise) {
    const wasmBuffer = fs.readFileSync(
      path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
    )
    const wasmBinary = wasmBuffer.buffer.slice(
      wasmBuffer.byteOffset,
      wasmBuffer.byteOffset + wasmBuffer.byteLength
    ) as ArrayBuffer
    sqlJsPromise = initSqlJs({ wasmBinary })
  }
  return sqlJsPromise
}

// Load rows into an in-memory SQLite database and execute the query.
// sql.js is WebAssembly — no native binaries, works on Vercel and all serverless runtimes.
async function runSQLiteQuery(
  sql: string,
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[]
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return []

  const SQL = await getSqlJs()
  const db = new SQL.Database()

  try {
    const colNames = Object.keys(rows[0])
    const colDefs = colNames.map(col => {
      const def = columns.find(c => stripBracketAnnotation(c.original_name) === col)
      return `"${col}" ${def?.type === 'number' ? 'REAL' : 'TEXT'}`
    }).join(', ')

    db.run(`CREATE TABLE data (${colDefs})`)

    const placeholders = colNames.map(() => '?').join(', ')
    const insertSQL = `INSERT INTO data (${colNames.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
    const stmt = db.prepare(insertSQL)
    for (const row of rows) {
      stmt.run(colNames.map(col => {
        const v = row[col]
        return (v === null || v === undefined) ? null : v as string | number
      }))
    }
    stmt.free()

    const result = db.exec(sql)
    if (!result || result.length === 0) return []

    const { columns: cols, values } = result[0]
    return values.map(row => {
      const obj: Record<string, unknown> = {}
      cols.forEach((col, i) => { obj[col] = row[i] })
      return obj
    })
  } finally {
    db.close()
  }
}

function stripBracketAnnotation(name: string): string {
  return name.replace(/\s*\[.*?\]/g, '').trim()
}

function sanitizeSQLIdentifiers(sql: string): string {
  return sql.replace(/`([^`]+)`/g, (_, name) => '`' + stripBracketAnnotation(name) + '`')
}

function sanitizeRowKeys(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length === 0) return rows
  if (!Object.keys(rows[0]).some(k => /[\[\]]/.test(k))) return rows
  return rows.map(row => {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(row)) out[stripBracketAnnotation(key)] = val
    return out
  })
}


// For "combined X% of total" questions: sort rows by the numeric column DESC,
// compute a running sum, and return only rows up to and including the one that
// pushes the cumulative total past the threshold percentage.
// Returns the original rows unchanged if the pattern doesn't apply.
function maybeCumulativeFilter(
  rows: Record<string, unknown>[],
  question: string
): Record<string, unknown>[] {
  if (rows.length === 0) return rows

  // Only activate when the question mentions "combined" or "cumulative" with a percentage
  const pctMatch = question.match(/(\d+(?:\.\d+)?)\s*%/)
  const isCumulative = /combined|cumulative|together|top.*?\%|\%.*?top/i.test(question)
  if (!pctMatch || !isCumulative) return rows

  const threshold = parseFloat(pctMatch[1]) / 100

  // Need exactly one label column and one numeric column
  const keys = Object.keys(rows[0])
  if (keys.length !== 2) return rows
  const numericKey = keys.find(k => rows.every(r => typeof r[k] === 'number' || (r[k] !== null && !isNaN(Number(r[k])))))
  if (!numericKey) return rows

  const total = rows.reduce((s, r) => s + Number(r[numericKey]), 0)
  if (total === 0) return rows

  const sorted = [...rows].sort((a, b) => Number(b[numericKey]) - Number(a[numericKey]))

  let running = 0
  const result: Record<string, unknown>[] = []
  for (const row of sorted) {
    running += Number(row[numericKey])
    result.push(row)
    if (running / total >= threshold) break
  }
  return result
}


export async function POST(request: Request) {
  try {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body: ChatPayload = await request.json()
  const { session_id, dataset_id, question, history } = body

  // Fetch dataset schema
  const { data: dataset } = await supabase
    .from('datasets')
    .select('name, columns')
    .eq('id', dataset_id)
    .single()
  if (!dataset) return Response.json({ error: 'Dataset not found' }, { status: 404 })

  const columns: ColumnDefinition[] = dataset.columns

  // ── Step 1: NL → SQL via Gemini ──────────────────────────────────────
  // Fetch dataset metadata (row_count) to calculate spread sample offsets
  const { data: datasetMeta } = await supabase
    .from('datasets')
    .select('row_count')
    .eq('id', dataset_id)
    .single()
  const rowCount = datasetMeta?.row_count ?? 0

  // Sample rows spread across the full dataset (start, 25%, 50%, 75%, end)
  // so Gemini sees a variety of values — not just the first few rows.
  const sampleOffsets = rowCount <= 10
    ? [0]
    : [0, Math.floor(rowCount * 0.25), Math.floor(rowCount * 0.5), Math.floor(rowCount * 0.75), rowCount - 1]

  const sampleResults = await Promise.all(
    sampleOffsets.map(offset =>
      supabase
        .from('dataset_rows')
        .select('data')
        .eq('dataset_id', dataset_id)
        .order('row_index')
        .range(offset, offset + 1)
        .limit(2)
    )
  )
  const sampleRows = sanitizeRowKeys(
    sampleResults
      .flatMap(r => (r.data ?? []).map(row => row.data as Record<string, unknown>))
      .filter((row, i, arr) => arr.findIndex(r => JSON.stringify(r) === JSON.stringify(row)) === i)
  )

  // Show sanitized column names so Gemini never generates SQL with [ ] in identifiers.
  const schemaLines = columns
    .map(c => {
      const name = stripBracketAnnotation(c.original_name)
      return `  - \`${name}\` (${c.type}): ${c.label}${c.description ? ` — ${c.description}` : ''}`
    })
    .join('\n')

  const sampleSection = sampleRows.length > 0
    ? `\nSample rows spread across the dataset (shows actual values — use for reference):\n${JSON.stringify(sampleRows, null, 2)}`
    : ''

  const sqlSystemPrompt = `You are a SQL expert using SQLite (via sql.js — full standard SQL engine).
Table name: data
Schema:
${schemaLines}
${sampleSection}

Rules:
- YOUR RESPONSE MUST BE ONLY A SQL SELECT QUERY — no prose, no explanation, no markdown fences
- ALWAYS return a SQL SELECT query — never explain, never say data is missing, never refuse
- Even if you are unsure, write a best-effort SELECT that is likely to return relevant rows
- The sample rows are just examples; the full dataset may contain many more values not shown
- Use exact original column names (case-sensitive) in your SQL
- ALWAYS wrap every column name in double-quotes: e.g. "Country Name", "2010", "Series Name"
- Double-quote-quoting is REQUIRED for all column names — even simple ones
- The table name is always "data"
- Write only a SELECT query — never INSERT, UPDATE, DELETE
- CTEs (WITH clauses), window functions (ROW_NUMBER, RANK, SUM OVER, etc.), subqueries, and table aliases are fully supported — use them freely for complex analysis
- Avoid these reserved words as aliases: count, sum, avg, total, value, index — use cnt, amount, avg_val, grand_total, num instead
- ALWAYS use LIKE with wildcards when filtering string columns on user-provided values: e.g. "Series Name" LIKE '%Population%', "Country Name" LIKE '%Argentina%'
- Only use exact = matching if the exact string is visible in the sample rows above
- Wide-format data (columns named as years like "2010", "2011"...): use UNION ALL to convert to long format for trend/time-series questions. Example:
  SELECT '2010' AS year, "entity_col", CAST("2010" AS REAL) AS value FROM data
  UNION ALL SELECT '2011' AS year, "entity_col", CAST("2011" AS REAL) AS value FROM data
  ORDER BY "entity_col", year
- Always structure output to be chart-ready: for time-series use (year, value) or (year, entity, value); for comparisons use (label, value); for rankings use (rank, label, value)
- For "combined X% of total" or "cumulative" questions: return ALL rows with the label and numeric column ordered by value DESC — do NOT filter by percentage threshold. The system applies cumulative filtering automatically.
- LIMIT: only add a LIMIT clause when the user explicitly specifies a number (e.g. "top 5", "show 3"). For "the most" or "highest" without a number, use LIMIT 10. Never use LIMIT 1.
- ORDER BY: always add a secondary sort column to make results deterministic (e.g. ORDER BY cnt DESC, director_name ASC, actor_name ASC). This prevents ties from producing different results across queries.
- When multiple columns represent the same logical entity split across slots (columns sharing a common base name with a numeric suffix or prefix, e.g. "actor_1_name"/"actor_2_name"/"actor_3_name", "genre_1"/"genre_2", "tag1"/"tag2"/"tag3"), always UNION ALL all of them into a single column before grouping or counting. Never query just one of those columns — always combine all variants. Example pattern: WITH combined AS (SELECT "other_col", "entity_col_1" AS entity FROM data UNION ALL SELECT "other_col", "entity_col_2" AS entity FROM data UNION ALL SELECT "other_col", "entity_col_3" AS entity FROM data) SELECT entity, "other_col", COUNT(*) AS cnt FROM combined WHERE entity IS NOT NULL AND entity != '' GROUP BY entity, "other_col" ORDER BY cnt DESC
- Return ONLY the raw SQL — absolutely no other text before or after`

  // For SQL generation history: only include turns where the model produced real SQL.
  // Non-SQL responses ("11", prose) confuse Gemini into answering directly instead
  // of generating a query. We pair each valid SQL response with its user question.
  const geminiHistory: { role: 'user' | 'model'; parts: [{ text: string }] }[] = []
  for (let i = 0; i < history.length - 1; i++) {
    const userMsg = history[i]
    const assistantMsg = history[i + 1]
    if (
      userMsg?.role === 'user' &&
      assistantMsg?.role === 'assistant' &&
      assistantMsg.sql_query &&
      /^\s*(SELECT|WITH)\b/i.test(assistantMsg.sql_query)
    ) {
      geminiHistory.push({ role: 'user', parts: [{ text: userMsg.content }] })
      // Append a brief result summary as a SQL comment so follow-up queries can anchor
      // to the exact values shown to the user instead of recalculating and hitting ties.
      const resultSummary = assistantMsg.content
        ? `\n-- Result shown to user: ${assistantMsg.content.slice(0, 300).replace(/\n/g, ' ')}`
        : ''
      geminiHistory.push({ role: 'model', parts: [{ text: assistantMsg.sql_query + resultSummary }] })
      i++ // skip the assistant message on next iteration
    }
  }

  // Use generateContent with system prompt embedded as first user/model turn.
  // This avoids systemInstruction format differences across Gemini 2.x models.
  // For cumulative percentage questions, override Gemini's instinct to use a subquery filter.
  // Append an explicit instruction so it returns all rows sorted DESC instead.
  const isCumulativePctQuery = /combined|cumulative|together/i.test(question) && /\d+\s*%/.test(question)
  const questionForSQL = isCumulativePctQuery
    ? `${question}\n\n[INSTRUCTION: This is a cumulative percentage query. Return ALL rows with just the entity label column and the numeric value column, sorted by the numeric value DESC. Do NOT add any WHERE clause filtering by the percentage — cumulative filtering is applied automatically after your SQL runs.]`
    : question

  const sqlContents = [
    { role: 'user' as const, parts: [{ text: sqlSystemPrompt }] },
    { role: 'model' as const, parts: [{ text: 'Understood. I will return only raw SQL SELECT queries.' }] },
    ...geminiHistory,
    { role: 'user' as const, parts: [{ text: questionForSQL }] },
  ]

  let generatedSQL = ''
  try {
    const sqlRes = await geminiFlash.generateContent({ contents: sqlContents })
    let rawSQL = sqlRes.response.text()
      .replace(/```sql\n?/gi, '')
      .replace(/```\n?/gi, '')
      .replace(/^\[SQL used:\s*/i, '')
      .replace(/\][\s]*$/, '')
      .trim()

    // Gemini sometimes prepends prose before the SQL. Extract the SELECT/WITH block.
    if (!/^\s*(SELECT|WITH)\b/i.test(rawSQL)) {
      const sqlMatch = rawSQL.match(/(?:^|\n)((?:SELECT|WITH)\b[\s\S]+)/i)
      if (sqlMatch) rawSQL = sqlMatch[1].trim()
    }

    generatedSQL = fixColumnQuoting(rawSQL, columns)

    console.log('[chat] generated SQL:', generatedSQL.slice(0, 300))
  } catch (err) {
    console.error('[chat] SQL generation error:', err)
    const detail = err instanceof Error ? err.message : String(err)
    const isQuota = /quota|rate.?limit|resource.?exhausted|429/i.test(detail)
    return Response.json({
      error: isQuota
        ? 'AI quota exceeded. Please try again tomorrow or check your Gemini API plan.'
        : 'Failed to generate SQL',
      detail,
    }, { status: 500 })
  }

  // ── Step 2: Validate SQL, fetch rows, run with alasql ───────────────
  // Only skip execution if the response contains no SQL at all.
  // A response that starts with SELECT/WITH is always executed.
  const looksLikeSQL = /^\s*(SELECT|WITH)\b/i.test(generatedSQL)

  let queryResult: Record<string, unknown>[] = []
  let sqlError: string | null = null
  let naturalLanguageResponse: string | null = null

  if (!looksLikeSQL) {
    naturalLanguageResponse = generatedSQL
  } else {
    // Supabase PostgREST caps responses at 1000 rows by default — paginate to fetch all rows
    const PAGE = 1000
    const allRowRecords: { data: Record<string, unknown> }[] = []
    let from = 0
    while (true) {
      const { data: page } = await supabase
        .from('dataset_rows')
        .select('data')
        .eq('dataset_id', dataset_id)
        .order('row_index')
        .range(from, from + PAGE - 1)
      if (!page || page.length === 0) break
      allRowRecords.push(...(page as { data: Record<string, unknown> }[]))
      if (page.length < PAGE) break
      from += PAGE
    }
    const rowRecords = allRowRecords

    const flatRows = sanitizeRowKeys(
      prepareRows(
        (rowRecords ?? []).map(r => r.data as Record<string, unknown>),
        columns
      )
    )

    // Strip "[YR...]" bracket annotations; also convert any backticks Gemini emits → double-quotes
    const normalizedSQL = sanitizeSQLIdentifiers(generatedSQL)
      .replace(/`([^`]+)`/g, '"$1"')

    try {
      const rawResult = await runSQLiteQuery(normalizedSQL, flatRows, columns)
      const nonBlank = rawResult.filter(row =>
        Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '')
      )
      queryResult = maybeCumulativeFilter(nonBlank, question)
      console.log('[chat] SQL:', normalizedSQL)
      console.log('[chat] rows returned:', queryResult.length, '| sample:', JSON.stringify(queryResult[0] ?? null))
    } catch (err) {
      sqlError = err instanceof Error ? err.message : 'Unknown SQL error'
      console.error('[chat] duckdb error:', sqlError, '| SQL:', normalizedSQL)
    }
  }

  // ── Step 3: Insight + Chart config via Gemini ────────────────────────
  let insight = ''
  let chartConfig: ChartConfig | null = null

  if (naturalLanguageResponse) {
    insight = naturalLanguageResponse
  } else if (sqlError) {
    insight = `I couldn't execute that query.\n\nGenerated SQL:\n\`\`\`sql\n${generatedSQL}\n\`\`\`\nError: ${sqlError}`
  } else {
    // Cap rows sent to Gemini to keep prompt small; cap chart data to keep response small
    const previewRows = queryResult.slice(0, 30)
    const chartRows = queryResult.slice(0, 500)

    const insightPrompt = `You are a data analyst. Given a user's question and query result, return a JSON object.

Question: ${question}
Dataset: ${dataset.name}
Result (${queryResult.length} rows, showing first ${previewRows.length}): ${JSON.stringify(previewRows)}

Return JSON with exactly these keys:
{
  "insight": "2-3 sentence plain-text analysis — NO markdown, NO tables, NO bullet points — just sentences",
  "chart_type": "bar" or "line" or "pie" or "scatter" or "table",
  "title": "descriptive chart title",
  "x_key": "the key from result objects to use as x-axis or category label",
  "y_keys": ["one or more numeric keys to plot on y-axis"],
  "data": [the FULL result array as-is — MUST be non-empty — do NOT summarise or omit rows]
}

Rules:
- insight MUST be plain text sentences only — absolutely no markdown tables, no pipes, no dashes, no bullets
- data MUST be the full result array (all ${queryResult.length} rows) — never return an empty array
- For pie charts: each item must have exactly "name" and "value" keys
- For line/bar with time-series wide data: transform each wide row into multiple {year, value} objects (long format)
- Use "table" chart_type when result has more than 6 columns or is a raw listing
- Return ONLY valid JSON — no markdown fences, no explanation`

    console.log('[chat] calling insight generation')
    try {
      const insightRes = await geminiFlash.generateContent({
        contents: [{ role: 'user', parts: [{ text: insightPrompt }] }],
      })
      const rawInsight = insightRes.response.text()
      console.log('[chat] insight raw:', rawInsight.slice(0, 500))
      // Strip markdown fences Gemini sometimes wraps around JSON
      const jsonText = rawInsight
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
      const parsed = JSON.parse(jsonText)
      insight = parsed.insight ?? ''
      const rawData = Array.isArray(parsed.data) && parsed.data.length > 0 ? parsed.data : chartRows
      const cappedData = rawData.slice(0, 500)
      // Force table when data rows have many columns — wide-format datasets
      const columnCount = cappedData[0] ? Object.keys(cappedData[0]).length : 0
      const forcedType = columnCount > 6 ? 'table' : (parsed.chart_type ?? 'table')
      chartConfig = {
        type: forcedType,
        title: parsed.title ?? question,
        x_key: parsed.x_key ?? (cappedData[0] ? Object.keys(cappedData[0])[0] : ''),
        y_keys: Array.isArray(parsed.y_keys) ? parsed.y_keys : [],
        data: cappedData,
      }
      console.log('[chat] chartConfig type:', chartConfig.type, '| data rows:', chartConfig.data?.length, '| cols:', columnCount, '| x_key:', chartConfig.x_key)
    } catch (err) {
      console.error('[chat] insight error:', err)
      const detail = err instanceof Error ? err.message : String(err)
      if (/quota|rate.?limit|resource.?exhausted|429/i.test(detail)) {
        return Response.json({
          error: 'AI quota exceeded. Please try again tomorrow or check your Gemini API plan.',
          detail,
        }, { status: 429 })
      }
      insight = `Query returned ${queryResult.length} row${queryResult.length !== 1 ? 's' : ''}.`
      const firstKey = chartRows[0] ? Object.keys(chartRows[0])[0] : ''
      chartConfig = {
        type: 'table',
        title: question,
        x_key: firstKey,
        y_keys: [],
        data: chartRows,
      }
    }
  }

  // ── Step 4: Persist messages ─────────────────────────────────────────
  await supabase.from('chat_messages').insert({ session_id, role: 'user', content: question })
  const { data: savedMsg } = await supabase
    .from('chat_messages')
    .insert({ session_id, role: 'assistant', content: insight, sql_query: generatedSQL, chart_config: chartConfig })
    .select('id')
    .single()

  // ── Step 5: Generate session title on first message ──────────────────
  let sessionTitle: string | null = null
  if (history.length === 0) {
    try {
      const titleRes = await geminiFlash.generateContent(
        `Generate a short 3-5 word title for a data analysis session that starts with: "${question}". Return only the title, no quotes, no punctuation.`
      )
      sessionTitle = titleRes.response.text().trim()
      await supabase.from('chat_sessions').update({ title: sessionTitle }).eq('id', session_id)
    } catch {}
  }

  return Response.json({ content: insight, sql_query: generatedSQL, chart_config: chartConfig, session_title: sessionTitle, message_id: savedMsg?.id ?? null })
  } catch (err) {
    console.error('[chat] UNHANDLED ERROR:', err)
    return Response.json({ error: 'Internal server error', detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
