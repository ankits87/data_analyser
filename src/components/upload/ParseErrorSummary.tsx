'use client'

import type { ParseIssue } from '@/lib/csv/validator'

interface Props {
  issues: ParseIssue[]
  rowCount: number
  onContinue: () => void
  onCancel: () => void
}

export default function ParseErrorSummary({ issues, rowCount, onContinue, onCancel }: Props) {
  const errors = issues.filter(i => i.type === 'error')
  const warnings = issues.filter(i => i.type === 'warning')

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-zinc-900">Issues found in your file</h3>
        <p className="text-sm text-zinc-500 mt-0.5">
          {rowCount} rows parsed. Review the issues below before continuing.
        </p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
          <p className="text-sm font-medium text-red-700">Errors ({errors.length})</p>
          {errors.map((issue, i) => (
            <div key={i} className="text-sm text-red-600">
              {issue.rowNumbers ? (
                <span className="font-mono text-xs bg-red-100 px-1 rounded mr-2">
                  row {issue.rowNumbers.join(', ')}
                </span>
              ) : null}
              {issue.message}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-2">
          <p className="text-sm font-medium text-yellow-700">Warnings ({warnings.length})</p>
          {warnings.map((issue, i) => (
            <div key={i} className="text-sm text-yellow-700">{issue.message}</div>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onContinue}
          className="flex-1 bg-zinc-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
        >
          Skip bad rows & continue
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 hover:bg-zinc-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
