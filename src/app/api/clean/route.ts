import { createClient } from '@/lib/supabase/server'
import {
  applyBlankFixes,
  applyCasingFixes,
  applyTypeMismatchFix,
  applyDuplicateFix,
  type BlankAction,
  type CasingAction,
  type TypeMismatchAction,
} from '@/lib/cleaning'

async function fetchAllRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dataset_id: string
): Promise<Record<string, unknown>[]> {
  const PAGE = 1000
  const all: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data: page, error } = await supabase
      .from('dataset_rows')
      .select('data')
      .eq('dataset_id', dataset_id)
      .order('row_index')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!page || page.length === 0) break
    all.push(...page.map(r => r.data as Record<string, unknown>))
    if (page.length < PAGE) break
    from += PAGE
  }
  return all
}

async function saveRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dataset_id: string,
  rows: Record<string, unknown>[]
) {
  const { error: delErr } = await supabase
    .from('dataset_rows')
    .delete()
    .eq('dataset_id', dataset_id)
  if (delErr) throw new Error(delErr.message)

  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((data, j) => ({
      dataset_id,
      row_index: i + j,
      data,
    }))
    const { error } = await supabase.from('dataset_rows').insert(batch)
    if (error) throw new Error(error.message)
  }

  await supabase.from('datasets').update({ row_count: rows.length }).eq('id', dataset_id)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { dataset_id, fix } = body as {
      dataset_id: string
      fix:
        | { type: 'blanks'; columns: { column: string; action: BlankAction }[] }
        | { type: 'casing'; columns: { column: string; action: CasingAction }[] }
        | { type: 'type_mismatches'; columns: string[]; action: TypeMismatchAction }
        | { type: 'duplicates'; key_columns?: string[] }
    }

    let rows = await fetchAllRows(supabase, dataset_id)

    if (fix.type === 'blanks') {
      rows = applyBlankFixes(rows, fix.columns)
    } else if (fix.type === 'casing') {
      rows = applyCasingFixes(rows, fix.columns)
    } else if (fix.type === 'type_mismatches') {
      rows = applyTypeMismatchFix(rows, fix.columns, fix.action)
    } else if (fix.type === 'duplicates') {
      rows = applyDuplicateFix(rows, fix.key_columns)
    }

    await saveRows(supabase, dataset_id, rows)

    return Response.json({ rows_remaining: rows.length })
  } catch (err) {
    console.error('[clean]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
