import type Papa from 'papaparse'

export interface ParseIssue {
  type: 'error' | 'warning'
  message: string
  rowNumbers?: number[]
}

export function classifyErrors(
  errors: Papa.ParseError[],
  headers: string[],
  rows: Record<string, unknown>[]
): ParseIssue[] {
  const issues: ParseIssue[] = []

  for (const error of errors) {
    issues.push({
      type: 'error',
      message: error.message,
      rowNumbers: error.row !== undefined ? [error.row + 1] : undefined,
    })
  }

  const dupes = headers.filter((h, i) => headers.indexOf(h) !== i)
  if (dupes.length > 0) {
    issues.push({
      type: 'error',
      message: `Duplicate column names: ${dupes.join(', ')}`,
    })
  }

  for (const header of headers) {
    const nullPct = computeNullPct(header, rows)
    if (nullPct > 50) {
      issues.push({
        type: 'warning',
        message: `Column "${header}" is ${nullPct}% empty — it may not be useful for analysis`,
      })
    }
  }

  return issues
}

export function computeNullPct(header: string, rows: Record<string, unknown>[]): number {
  if (rows.length === 0) return 0
  const nullCount = rows.filter(
    r => r[header] === null || r[header] === undefined || r[header] === ''
  ).length
  return Math.round((nullCount / rows.length) * 100)
}
