import type { ColumnDefinition } from '@/types'

// ── Whitespace trimming (auto-applied before upload) ─────────────────────────

export function trimWhitespace(
  rows: Record<string, unknown>[]
): Record<string, unknown>[] {
  return rows.map(row => {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === 'string' ? v.trim() : v
    }
    return out
  })
}

// ── Detection ─────────────────────────────────────────────────────────────────

export interface BlankColumnInfo {
  column: string
  count: number
}

export interface CasingColumnInfo {
  column: string
  count: number
  examples: string[]
}

export interface TypeMismatchColumnInfo {
  column: string
  count: number
  examples: string[]
}

export interface CleaningReport {
  blanks: BlankColumnInfo[]
  casing: CasingColumnInfo[]
  typeMismatches: TypeMismatchColumnInfo[]
  duplicates: {
    count: number
    examples: Record<string, unknown>[]
  }
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === ''
}

const NON_NUMERIC_RE = /^(n\/?a|null|none|undefined|[-–—]+|#n\/a|#value!?|#ref!?|na)$/i

export function detectBlanks(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[]
): BlankColumnInfo[] {
  return columns
    .map(col => ({
      column: col.original_name,
      count: rows.filter(r => isBlank(r[col.original_name])).length,
    }))
    .filter(r => r.count > 0)
}

export function detectCasing(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[]
): CasingColumnInfo[] {
  return columns
    .filter(c => c.type === 'string')
    .flatMap(col => {
      const name = col.original_name
      const groups = new Map<string, Set<string>>()

      for (const row of rows) {
        const v = row[name]
        if (typeof v !== 'string' || v.trim() === '') continue
        const lower = v.toLowerCase()
        if (!groups.has(lower)) groups.set(lower, new Set())
        groups.get(lower)!.add(v)
      }

      const inconsistent = [...groups.entries()].filter(([, variants]) => variants.size > 1)
      if (inconsistent.length === 0) return []

      const examples = inconsistent
        .slice(0, 2)
        .flatMap(([, variants]) => [...variants].slice(0, 3))
        .slice(0, 6)

      const inconsistentValues = new Set(
        inconsistent.flatMap(([, variants]) => [...variants])
      )
      const count = rows.filter(
        r => typeof r[name] === 'string' && inconsistentValues.has(r[name] as string)
      ).length

      return [{ column: name, count, examples }]
    })
}

export function detectTypeMismatches(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[]
): TypeMismatchColumnInfo[] {
  return columns
    .filter(c => c.type === 'number')
    .flatMap(col => {
      const name = col.original_name
      const badRows = rows.filter(r => {
        const v = r[name]
        if (v === null || v === undefined || v === '') return false
        if (typeof v === 'number') return false
        return typeof v === 'string' && (isNaN(Number(v)) || NON_NUMERIC_RE.test(v.trim()))
      })
      if (badRows.length === 0) return []
      const examples = [...new Set(badRows.map(r => String(r[name])))].slice(0, 3)
      return [{ column: name, count: badRows.length, examples }]
    })
}

export function detectDuplicates(
  rows: Record<string, unknown>[],
  keyColumns?: string[]
): { count: number; examples: Record<string, unknown>[] } {
  const seen = new Set<string>()
  const duplicateIndices: number[] = []

  rows.forEach((row, i) => {
    const key = keyColumns
      ? keyColumns.map(c => String(row[c] ?? '')).join('\x00')
      : JSON.stringify(Object.values(row))
    if (seen.has(key)) {
      duplicateIndices.push(i)
    } else {
      seen.add(key)
    }
  })

  return {
    count: duplicateIndices.length,
    examples: duplicateIndices.slice(0, 3).map(i => rows[i]),
  }
}

export function scanAllIssues(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[]
): CleaningReport {
  return {
    blanks: detectBlanks(rows, columns),
    casing: detectCasing(rows, columns),
    typeMismatches: detectTypeMismatches(rows, columns),
    duplicates: detectDuplicates(rows),
  }
}

// ── Client-side fix application (mirrors server logic for instant UI update) ──

export type BlankAction = 'remove_rows' | 'fill_zero' | 'fill_text' | 'skip'
export type CasingAction = 'lowercase' | 'titlecase' | 'uppercase' | 'skip'
export type TypeMismatchAction = 'replace_blank' | 'replace_zero' | 'remove_rows'

export function applyBlankFixes(
  rows: Record<string, unknown>[],
  fixes: { column: string; action: BlankAction }[]
): Record<string, unknown>[] {
  const active = fixes.filter(f => f.action !== 'skip')
  if (active.length === 0) return rows

  const removeColumns = active.filter(f => f.action === 'remove_rows').map(f => f.column)
  const fillZero = active.filter(f => f.action === 'fill_zero').map(f => f.column)
  const fillText = active.filter(f => f.action === 'fill_text').map(f => f.column)

  let result = rows
  if (removeColumns.length > 0) {
    result = result.filter(row => !removeColumns.some(col => isBlank(row[col])))
  }
  return result.map(row => {
    const out = { ...row }
    for (const col of fillZero) if (isBlank(out[col])) out[col] = 0
    for (const col of fillText) if (isBlank(out[col])) out[col] = 'Unknown'
    return out
  })
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

export function applyCasingFixes(
  rows: Record<string, unknown>[],
  fixes: { column: string; action: CasingAction }[]
): Record<string, unknown>[] {
  const active = fixes.filter(f => f.action !== 'skip')
  if (active.length === 0) return rows
  return rows.map(row => {
    const out = { ...row }
    for (const { column, action } of active) {
      const v = out[column]
      if (typeof v !== 'string') continue
      if (action === 'lowercase') out[column] = v.toLowerCase()
      else if (action === 'uppercase') out[column] = v.toUpperCase()
      else if (action === 'titlecase') out[column] = toTitleCase(v)
    }
    return out
  })
}

export function applyTypeMismatchFix(
  rows: Record<string, unknown>[],
  columns: string[],
  action: TypeMismatchAction
): Record<string, unknown>[] {
  if (action === 'remove_rows') {
    return rows.filter(row =>
      !columns.some(col => {
        const v = row[col]
        return typeof v === 'string' && v.trim() !== '' && (isNaN(Number(v)) || NON_NUMERIC_RE.test(v.trim()))
      })
    )
  }
  return rows.map(row => {
    const out = { ...row }
    for (const col of columns) {
      const v = out[col]
      if (typeof v === 'string' && v.trim() !== '' && (isNaN(Number(v)) || NON_NUMERIC_RE.test(v.trim()))) {
        out[col] = action === 'replace_zero' ? 0 : ''
      }
    }
    return out
  })
}

export function applyDuplicateFix(
  rows: Record<string, unknown>[],
  keyColumns?: string[]
): Record<string, unknown>[] {
  const seen = new Set<string>()
  return rows.filter(row => {
    const key = keyColumns
      ? keyColumns.map(c => String(row[c] ?? '')).join('\x00')
      : JSON.stringify(Object.values(row))
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
