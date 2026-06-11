import alasql from 'alasql'
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

// alasql can't parse [ or ] inside backtick-quoted identifiers (e.g. `2010 [YR2010]`).
// Strip "[...]" annotations directly from SQL identifiers and row keys — no column map needed.

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

// Detect World Bank / wide-format data: 4+ columns whose names start with a 4-digit year.
// Transforms: [{ Country, 2010: v1, 2011: v2 }] → [{ Country, Year: "2010", Value: v1 }, ...]
// Empty-value rows are dropped naturally during the unpivot.
function maybeUnpivot(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length === 0) return rows
  const keys = Object.keys(rows[0])
  const yearKeys = keys.filter(k => /^\d{4}/.test(k.trim()))
  if (yearKeys.length < 4) return rows   // not wide format, return as-is
  const dimKeys = keys.filter(k => !yearKeys.includes(k))
  const long: Record<string, unknown>[] = []
  for (const row of rows) {
    for (const yk of yearKeys) {
      const val = row[yk]
      if (val === null || val === undefined || String(val).trim() === '') continue
      const yearLabel = yk.match(/^(\d{4})/)?.[1] ?? yk
      const entry: Record<string, unknown> = {}
      for (const dk of dimKeys) entry[dk] = row[dk]
      entry['Year'] = yearLabel
      entry['Value'] = typeof val === 'number' ? val : Number(val)
      long.push(entry)
    }
  }
  return long.length > 0 ? long : rows
}

// When long-format data has multiple entities (e.g. Brazil + Argentina), pivot to wide format
// so the chart can render a separate series per entity instead of one merged line.
// Input:  [{ "Country Name": "Brazil", Year: "2010", Value: 195e6 }, ...]
// Output: [{ Year: "2010", Brazil: 195e6, Argentina: 40e6 }, ...]
function maybePivotForChart(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length === 0) return rows
  const keys = Object.keys(rows[0])
  if (!keys.includes('Year') || !keys.includes('Value')) return rows
  const dimKey = keys.find(k => k !== 'Year' && k !== 'Value')
  if (!dimKey) return rows
  const entities = [...new Set(rows.map(r => String(r[dimKey])))]
  if (entities.length <= 1) return rows
  const years = [...new Set(rows.map(r => String(r['Year'])))]
    .sort((a, b) => Number(a) - Number(b))
  return years.map(year => {
    const entry: Record<string, unknown> = { Year: year }
    for (const entity of entities) {
      const match = rows.find(r => String(r['Year']) === year && String(r[dimKey]) === entity)
      entry[entity] = match?.['Value'] ?? null
    }
    return entry
  })
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

  const sqlSystemPrompt = `You are a SQL expert using alasql (in-memory JavaScript SQL engine).
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
- ALWAYS wrap every column name in backticks: e.g. \`Country Name\`, \`2010\`, \`Series Name\`
- Backtick-quoting is REQUIRED for all column names — even simple ones
- The table name is always "data"
- Write only a SELECT query — never INSERT, UPDATE, DELETE
- No CTEs (WITH clauses), no window functions, no table aliases (never use T1./T2. prefixes)
- Avoid these reserved words as aliases: count, sum, avg, total, value, index — use cnt, amount, avg_val, grand_total, num instead
- ALWAYS use LIKE with wildcards when filtering string columns on user-provided values: e.g. [Series Name] LIKE '%Population%', [Country Name] LIKE '%Argentina%'
- Only use exact = matching if the exact string is visible in the sample rows above
- Return ONLY the raw SQL — absolutely no other text before or after`

  // For SQL generation history: pass only the insight text for model turns.
  // Passing the raw SQL caused Gemini to echo "[SQL used: ...]" patterns back.
  const geminiHistory = history.map(m => ({
    role: m.role === 'user' ? 'user' as const : 'model' as const,
    parts: [{ text: m.content }],
  }))

  // Use generateContent with system prompt embedded as first user/model turn.
  // This avoids systemInstruction format differences across Gemini 2.x models.
  const sqlContents = [
    { role: 'user' as const, parts: [{ text: sqlSystemPrompt }] },
    { role: 'model' as const, parts: [{ text: 'Understood. I will return only raw SQL SELECT queries.' }] },
    ...geminiHistory,
    { role: 'user' as const, parts: [{ text: question }] },
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
    const { data: rowRecords } = await supabase
      .from('dataset_rows')
      .select('data')
      .eq('dataset_id', dataset_id)
      .order('row_index')
      .limit(10000)

    const preparedRows = prepareRows(
      (rowRecords ?? []).map(r => r.data as Record<string, unknown>),
      columns
    )

    const flatRows = sanitizeRowKeys(preparedRows)

    // Normalize for alasql:
    // 1. Replace "FROM data" with "FROM ?" (inline array syntax)
    // 2. Strip AS aliases from ? placeholders — alasql doesn't support FROM ? AS T1
    // 3. Strip table alias prefixes from column refs — T1.`col` → `col`
    // 4. Strip "[YR...]" bracket annotations from identifiers
    const normalizedSQL = sanitizeSQLIdentifiers(
      generatedSQL
        .replace(/\bFROM\s+data\b/gi, 'FROM ?')
        .replace(/\bJOIN\s+data\b/gi, 'JOIN ?')
        .replace(/(\bFROM\s+\?)\s+AS\s+\w+\b/gi, '$1')
        .replace(/(\bJOIN\s+\?)\s+AS\s+\w+\b/gi, '$1')
        .replace(/\b\w+\.(`[^`]+`)/g, '$1')
    )

    const placeholderCount = (normalizedSQL.match(/\bFROM\s+\?|\bJOIN\s+\?/gi) ?? []).length
    const sqlParams = Array(Math.max(1, placeholderCount)).fill(flatRows)

    try {
      const rawResult: Record<string, unknown>[] = alasql(normalizedSQL, sqlParams)
      // Drop fully-blank rows, then unpivot wide (year-column) data to long format
      const nonBlank = rawResult.filter(row =>
        Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '')
      )
      queryResult = maybePivotForChart(maybeUnpivot(nonBlank))
      console.log('[chat] SQL:', normalizedSQL)
      console.log('[chat] rows returned:', queryResult.length, '| sample:', JSON.stringify(queryResult[0] ?? null))
    } catch (err) {
      sqlError = err instanceof Error ? err.message : 'Unknown SQL error'
      console.error('[chat] alasql error:', sqlError, '| SQL:', normalizedSQL)
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
