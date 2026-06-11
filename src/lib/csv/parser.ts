import Papa from 'papaparse'
import type { ColumnType } from '@/types'

function inferType(values: unknown[]): ColumnType {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '')
  if (nonNull.length === 0) return 'string'

  if (nonNull.every(v => ['true', 'false', 'yes', 'no', '1', '0'].includes(String(v).toLowerCase()))) {
    return 'boolean'
  }

  if (nonNull.every(v => !isNaN(Number(v)))) {
    return 'number'
  }

  if (nonNull.every(v => {
    const d = Date.parse(String(v))
    return !isNaN(d) && String(v).length > 4
  })) {
    return 'date'
  }

  return 'string'
}

export function inferColumnTypes(
  headers: string[],
  rows: Record<string, unknown>[]
): Record<string, ColumnType> {
  const types: Record<string, ColumnType> = {}
  for (const header of headers) {
    types[header] = inferType(rows.map(r => r[header]))
  }
  return types
}

export function parseCSV(file: File): Promise<{
  headers: string[]
  rows: Record<string, unknown>[]
  errors: Papa.ParseError[]
}> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        resolve({
          headers: results.meta.fields ?? [],
          rows: results.data as Record<string, unknown>[],
          errors: results.errors,
        })
      },
    })
  })
}
