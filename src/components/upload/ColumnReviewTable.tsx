'use client'

import { useState } from 'react'
import type { ColumnDefinition, ColumnType } from '@/types'
import { computeNullPct } from '@/lib/csv/validator'

interface Props {
  filename: string
  columns: ColumnDefinition[]
  rows: Record<string, unknown>[]
  onConfirm: (datasetName: string, columns: ColumnDefinition[]) => void
  onBack: () => void
  isSaving: boolean
  saveProgress: number
}

const TYPE_OPTIONS: ColumnType[] = ['string', 'number', 'date', 'boolean']

export default function ColumnReviewTable({
  filename,
  columns,
  rows,
  onConfirm,
  onBack,
  isSaving,
  saveProgress,
}: Props) {
  const [datasetName, setDatasetName] = useState(
    filename.replace(/\.csv$/i, '').replace(/[_-]/g, ' ')
  )
  const [editedColumns, setEditedColumns] = useState<ColumnDefinition[]>(columns)

  function updateColumn(index: number, patch: Partial<ColumnDefinition>) {
    setEditedColumns(prev =>
      prev.map((col, i) => (i === index ? { ...col, ...patch } : col))
    )
  }

  function removeColumn(index: number) {
    setEditedColumns(prev => prev.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-zinc-900">Review your columns</h3>
        <p className="text-sm text-zinc-500 mt-0.5">
          {rows.length} rows · {columns.length} columns. Edit labels and types before saving.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">Dataset name</label>
        <input
          value={datasetName}
          onChange={e => setDatasetName(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
          placeholder="Give this dataset a name"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-zinc-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Original name</th>
              <th className="px-4 py-3 text-left font-medium">Label</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Null %</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {editedColumns.map((col, i) => {
              const nullPct = computeNullPct(col.original_name, rows)
              return (
                <tr key={col.original_name} className="bg-white">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">{col.original_name}</td>
                  <td className="px-4 py-3">
                    <input
                      value={col.label}
                      onChange={e => updateColumn(i, { label: e.target.value })}
                      className="w-full px-2 py-1 rounded border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={col.description}
                      onChange={e => updateColumn(i, { description: e.target.value })}
                      placeholder="Short description of this column"
                      className="w-full px-2 py-1 rounded border border-zinc-200 text-xs text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-900 placeholder:text-zinc-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={col.type}
                      onChange={e => updateColumn(i, { type: e.target.value as ColumnType })}
                      className="px-2 py-1 rounded border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 bg-white"
                    >
                      {TYPE_OPTIONS.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${nullPct > 30 ? 'text-yellow-600' : 'text-zinc-500'}`}>
                      {nullPct}%{nullPct > 30 ? ' ⚠' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => removeColumn(i)}
                      title="Remove column"
                      className="text-zinc-300 hover:text-red-500 transition-colors p-1 rounded"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {isSaving && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Saving rows…</span>
            <span>{saveProgress}%</span>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-900 rounded-full transition-all duration-300"
              style={{ width: `${saveProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          onClick={() => onConfirm(datasetName.trim() || filename, editedColumns)}
          disabled={isSaving || !datasetName.trim()}
          className="flex-1 bg-zinc-900 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? 'Saving…' : 'Save to database'}
        </button>
        <button
          onClick={onBack}
          disabled={isSaving}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  )
}
