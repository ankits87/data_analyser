import { createClient } from '@/lib/supabase/server'
import { geminiFlash } from '@/lib/gemini'
import type { EnrichColumnsPayload, ColumnDefinition } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body: EnrichColumnsPayload = await request.json()
  const { headers, sample_rows } = body

  const prompt = `You are a data analyst. Given CSV column headers and sample data, return a JSON array of column definitions.
For each column return exactly:
- original_name: exactly as provided
- label: human-readable name (title case, expand abbreviations, e.g. "emp_id" → "Employee ID")
- description: one sentence describing what this column likely contains
- type: one of "string", "number", "date", "boolean"

Headers: ${JSON.stringify(headers)}
Sample data (first rows): ${JSON.stringify(sample_rows)}

Return ONLY a valid JSON array. No explanation.`

  try {
    const result = await geminiFlash.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    })

    const text = result.response.text()
    const parsed = JSON.parse(text)

    // Gemini may return the array directly or wrap it in an object.
    // Walk the object's values to find the first array if the top level isn't one.
    let rawCols: ColumnDefinition[]
    if (Array.isArray(parsed)) {
      rawCols = parsed
    } else if (parsed && typeof parsed === 'object') {
      const arrayVal = Object.values(parsed).find(v => Array.isArray(v))
      rawCols = (arrayVal as ColumnDefinition[]) ?? []
      if (rawCols.length === 0) {
        console.error('[enrich] Gemini returned object with no array value:', JSON.stringify(parsed).slice(0, 300))
      }
    } else {
      rawCols = []
      console.error('[enrich] Unexpected Gemini response type:', typeof parsed)
    }

    // Merge Gemini output back onto the original header list so order and
    // completeness are guaranteed even if Gemini drops or reorders columns.
    const enriched: ColumnDefinition[] = headers.map((header, i) => {
      const col: Partial<ColumnDefinition> =
        rawCols.find(c => c.original_name === header) ?? rawCols[i] ?? {}
      return {
        original_name: header,
        label: col.label?.trim() || header.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: col.description?.trim() || '',
        type: col.type || 'string',
      }
    })

    return Response.json({ columns: enriched })
  } catch (err) {
    console.error('[enrich] Failed to parse Gemini response:', err)
    const fallback: ColumnDefinition[] = headers.map(h => ({
      original_name: h,
      label: h.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      description: '',
      type: 'string',
    }))
    return Response.json({ columns: fallback })
  }
}
