'use client'

import { useState, useEffect } from 'react'
import {
  scanAllIssues,
  applyBlankFixes,
  applyCasingFixes,
  applyTypeMismatchFix,
  applyDuplicateFix,
  type CleaningReport,
  type BlankAction,
  type CasingAction,
  type TypeMismatchAction,
} from '@/lib/cleaning'
import type { ColumnDefinition } from '@/types'

interface Props {
  datasetId: string
  rows: Record<string, unknown>[]
  columns: ColumnDefinition[]
  onComplete: () => void
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-block bg-zinc-100 text-zinc-600 text-xs px-2 py-0.5 rounded-full">
      {label}
    </span>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
      {children}
    </div>
  )
}

// ── Blank Values Card ─────────────────────────────────────────────────────────

interface BlankFix { column: string; action: BlankAction }

function BlankValuesCard({
  blanks,
  columns,
  onApply,
  applying,
}: {
  blanks: CleaningReport['blanks']
  columns: ColumnDefinition[]
  onApply: (fixes: BlankFix[]) => Promise<void>
  applying: boolean
}) {
  const [open, setOpen] = useState(false)
  const [fixes, setFixes] = useState<Record<string, BlankAction>>(() =>
    Object.fromEntries(blanks.map(b => [b.column, 'skip']))
  )

  function setAction(col: string, action: BlankAction) {
    setFixes(prev => ({ ...prev, [col]: action }))
  }

  const totalAffected = blanks.reduce((s, b) => s + b.count, 0)
  const hasAction = Object.values(fixes).some(a => a !== 'skip')

  function getDefaultAction(col: string): BlankAction {
    const colDef = columns.find(c => c.original_name === col)
    return colDef?.type === 'number' ? 'fill_zero' : 'fill_text'
  }

  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-zinc-900 flex items-center gap-2">
            <span className="text-amber-500">⚠</span> Blank Values
          </p>
          <p className="text-sm text-zinc-500 mt-0.5">
            {totalAffected} blank {totalAffected === 1 ? 'value' : 'values'} across {blanks.length}{' '}
            {blanks.length === 1 ? 'column' : 'columns'}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {blanks.slice(0, 5).map(b => <Badge key={b.column} label={b.column} />)}
            {blanks.length > 5 && <Badge label={`+${blanks.length - 5} more`} />}
          </div>
        </div>
        <button
          onClick={() => onApply(Object.entries(fixes).map(([column, action]) => ({ column, action })))}
          disabled={!hasAction || applying}
          className="shrink-0 text-sm bg-zinc-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
        >
          {applying ? 'Applying…' : 'Apply Fix'}
        </button>
      </div>

      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1"
      >
        {open ? '▴' : '▾'} {open ? 'Hide' : 'See'} details
      </button>

      {open && (
        <div className="border-t border-zinc-100 pt-3 space-y-4">
          {blanks.map(b => (
            <div key={b.column}>
              <p className="text-sm font-medium text-zinc-700">
                {b.column} <span className="font-normal text-zinc-400">({b.count} blank{b.count !== 1 ? 's' : ''})</span>
              </p>
              <div className="flex flex-wrap gap-3 mt-1.5">
                {(['remove_rows', getDefaultAction(b.column), 'skip'] as BlankAction[]).map(action => (
                  <label key={action} className="flex items-center gap-1.5 cursor-pointer text-sm text-zinc-600">
                    <input
                      type="radio"
                      name={`blank-${b.column}`}
                      checked={fixes[b.column] === action}
                      onChange={() => setAction(b.column, action)}
                      className="accent-zinc-900"
                    />
                    {action === 'remove_rows' ? 'Remove rows' :
                      action === 'fill_zero' ? 'Fill with 0' :
                      action === 'fill_text' ? 'Fill with "Unknown"' : 'Skip'}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Inconsistent Casing Card ──────────────────────────────────────────────────

interface CasingFix { column: string; action: CasingAction }

function CasingCard({
  casing,
  onApply,
  applying,
}: {
  casing: CleaningReport['casing']
  onApply: (fixes: CasingFix[]) => Promise<void>
  applying: boolean
}) {
  const [open, setOpen] = useState(false)
  const [fixes, setFixes] = useState<Record<string, CasingAction>>(() =>
    Object.fromEntries(casing.map(c => [c.column, 'skip']))
  )

  const hasAction = Object.values(fixes).some(a => a !== 'skip')

  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-zinc-900 flex items-center gap-2">
            <span className="text-amber-500">⚠</span> Inconsistent Casing
          </p>
          <p className="text-sm text-zinc-500 mt-0.5">
            {casing.length} {casing.length === 1 ? 'column has' : 'columns have'} mixed casing
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {casing.flatMap(c => c.examples.slice(0, 2)).slice(0, 6).map((ex, i) => (
              <Badge key={i} label={ex} />
            ))}
          </div>
        </div>
        <button
          onClick={() => onApply(Object.entries(fixes).map(([column, action]) => ({ column, action })))}
          disabled={!hasAction || applying}
          className="shrink-0 text-sm bg-zinc-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
        >
          {applying ? 'Applying…' : 'Apply Fix'}
        </button>
      </div>

      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1"
      >
        {open ? '▴' : '▾'} {open ? 'Hide' : 'See'} details
      </button>

      {open && (
        <div className="border-t border-zinc-100 pt-3 space-y-4">
          {casing.map(c => (
            <div key={c.column}>
              <p className="text-sm font-medium text-zinc-700">
                {c.column} <span className="font-normal text-zinc-400">({c.count} affected rows)</span>
              </p>
              <div className="flex flex-wrap gap-1 mb-2">
                {c.examples.slice(0, 4).map((ex, i) => <Badge key={i} label={ex} />)}
              </div>
              <div className="flex flex-wrap gap-3">
                {(['lowercase', 'titlecase', 'uppercase', 'skip'] as CasingAction[]).map(action => (
                  <label key={action} className="flex items-center gap-1.5 cursor-pointer text-sm text-zinc-600">
                    <input
                      type="radio"
                      name={`casing-${c.column}`}
                      checked={fixes[c.column] === action}
                      onChange={() => setFixes(prev => ({ ...prev, [c.column]: action }))}
                      className="accent-zinc-900"
                    />
                    {action === 'lowercase' ? 'lowercase' :
                      action === 'titlecase' ? 'Title Case' :
                      action === 'uppercase' ? 'UPPERCASE' : 'Skip'}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ── Type Mismatches Card ──────────────────────────────────────────────────────

function TypeMismatchCard({
  mismatches,
  onApply,
  applying,
}: {
  mismatches: CleaningReport['typeMismatches']
  onApply: (columns: string[], action: TypeMismatchAction) => Promise<void>
  applying: boolean
}) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<TypeMismatchAction>('replace_blank')
  const totalCount = mismatches.reduce((s, m) => s + m.count, 0)
  const allColumns = mismatches.map(m => m.column)

  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-zinc-900 flex items-center gap-2">
            <span className="text-amber-500">⚠</span> Type Mismatches
          </p>
          <p className="text-sm text-zinc-500 mt-0.5">
            {totalCount} non-numeric {totalCount === 1 ? 'value' : 'values'} in number{' '}
            {mismatches.length === 1 ? 'column' : 'columns'}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {mismatches.flatMap(m => m.examples).slice(0, 6).map((ex, i) => (
              <Badge key={i} label={`"${ex}"`} />
            ))}
          </div>
        </div>
        <button
          onClick={() => onApply(allColumns, action)}
          disabled={applying}
          className="shrink-0 text-sm bg-zinc-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
        >
          {applying ? 'Applying…' : 'Apply Fix'}
        </button>
      </div>

      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1"
      >
        {open ? '▴' : '▾'} {open ? 'Hide' : 'See'} details
      </button>

      {open && (
        <div className="border-t border-zinc-100 pt-3 space-y-4">
          <div className="space-y-2">
            {mismatches.map(m => (
              <div key={m.column} className="text-sm text-zinc-600">
                <span className="font-medium text-zinc-700">{m.column}</span>
                {' '}({m.count} {m.count === 1 ? 'value' : 'values'}):
                {' '}{m.examples.map(e => `"${e}"`).join(', ')}
              </div>
            ))}
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">Fix action</p>
            <div className="flex flex-wrap gap-3">
              {([
                ['replace_blank', 'Replace with blank'],
                ['replace_zero', 'Replace with 0'],
                ['remove_rows', 'Remove rows'],
              ] as [TypeMismatchAction, string][]).map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer text-sm text-zinc-600">
                  <input
                    type="radio"
                    name="type_mismatch_action"
                    checked={action === val}
                    onChange={() => setAction(val)}
                    className="accent-zinc-900"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ── Duplicates Card ───────────────────────────────────────────────────────────

function DuplicatesCard({
  duplicates,
  allColumnNames,
  onApply,
  applying,
}: {
  duplicates: CleaningReport['duplicates']
  allColumnNames: string[]
  onApply: (keyColumns?: string[]) => Promise<void>
  applying: boolean
}) {
  const [open, setOpen] = useState(false)
  const [useKeyColumns, setUseKeyColumns] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])

  function toggleKey(col: string) {
    setSelectedKeys(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  const keyColumns = useKeyColumns && selectedKeys.length > 0 ? selectedKeys : undefined

  return (
    <SectionCard>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium text-zinc-900 flex items-center gap-2">
            <span className="text-amber-500">⚠</span> Duplicate Rows
          </p>
          <p className="text-sm text-zinc-500 mt-0.5">
            {duplicates.count} duplicate {duplicates.count === 1 ? 'row' : 'rows'} found
          </p>
        </div>
        <button
          onClick={() => onApply(keyColumns)}
          disabled={applying || (useKeyColumns && selectedKeys.length === 0)}
          className="shrink-0 text-sm bg-zinc-900 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-700 transition-colors"
        >
          {applying ? 'Removing…' : 'Remove Duplicates'}
        </button>
      </div>

      <button
        onClick={() => setOpen(o => !o)}
        className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1"
      >
        {open ? '▴' : '▾'} {open ? 'Hide' : 'See'} details
      </button>

      {open && (
        <div className="border-t border-zinc-100 pt-3 space-y-4">
          {duplicates.examples.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">Example duplicate rows</p>
              <div className="space-y-1">
                {duplicates.examples.map((row, i) => (
                  <p key={i} className="text-xs text-zinc-500 truncate font-mono bg-zinc-50 px-2 py-1 rounded">
                    {Object.entries(row).slice(0, 4).map(([, v]) => String(v ?? '')).join(' · ')}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer">
              <input
                type="checkbox"
                checked={useKeyColumns}
                onChange={e => setUseKeyColumns(e.target.checked)}
                className="accent-zinc-900"
              />
              Detect duplicates by specific columns (primary key)
            </label>
            {useKeyColumns && (
              <div className="mt-3 flex flex-wrap gap-2">
                {allColumnNames.map(col => (
                  <label key={col} className="flex items-center gap-1.5 cursor-pointer text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(col)}
                      onChange={() => toggleKey(col)}
                      className="accent-zinc-900"
                    />
                    {col}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ── Main CleaningStep ─────────────────────────────────────────────────────────

export default function CleaningStep({ datasetId, rows: initialRows, columns, onComplete }: Props) {
  const [rows, setRows] = useState(initialRows)
  const [report, setReport] = useState<CleaningReport | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setReport(scanAllIssues(rows, columns))
  }, [rows, columns])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function callAPI(fix: object) {
    const res = await fetch('/api/clean', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataset_id: datasetId, fix }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Fix failed')
    return data as { rows_remaining: number }
  }

  async function handleBlankFix(fixes: { column: string; action: BlankAction }[]) {
    const active = fixes.filter(f => f.action !== 'skip')
    if (active.length === 0) return
    setApplying('blanks')
    setError(null)
    try {
      const updated = applyBlankFixes(rows, fixes)
      await callAPI({ type: 'blanks', columns: active })
      setRows(updated)
      showToast(`Blank values fixed`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fix failed')
    } finally {
      setApplying(null)
    }
  }

  async function handleCasingFix(fixes: { column: string; action: CasingAction }[]) {
    const active = fixes.filter(f => f.action !== 'skip')
    if (active.length === 0) return
    setApplying('casing')
    setError(null)
    try {
      const updated = applyCasingFixes(rows, fixes)
      await callAPI({ type: 'casing', columns: active })
      setRows(updated)
      showToast(`Casing fixed`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fix failed')
    } finally {
      setApplying(null)
    }
  }

  async function handleTypeMismatchFix(cols: string[], action: TypeMismatchAction) {
    setApplying('type_mismatches')
    setError(null)
    try {
      const updated = applyTypeMismatchFix(rows, cols, action)
      await callAPI({ type: 'type_mismatches', columns: cols, action })
      setRows(updated)
      showToast(`Type mismatches fixed`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fix failed')
    } finally {
      setApplying(null)
    }
  }

  async function handleDuplicateFix(keyColumns?: string[]) {
    setApplying('duplicates')
    setError(null)
    try {
      const updated = applyDuplicateFix(rows, keyColumns)
      await callAPI({ type: 'duplicates', key_columns: keyColumns })
      setRows(updated)
      showToast(`Duplicate rows removed`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fix failed')
    } finally {
      setApplying(null)
    }
  }

  if (!report) {
    return (
      <div className="py-12 text-center text-sm text-zinc-400 animate-pulse">
        Scanning for data quality issues…
      </div>
    )
  }

  const totalIssues =
    report.blanks.length +
    report.casing.length +
    report.typeMismatches.length +
    (report.duplicates.count > 0 ? 1 : 0)

  const allColumnNames = columns.map(c => c.original_name)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-zinc-900">Data Quality Report</h3>
          <p className="text-sm text-zinc-500 mt-0.5">
            {totalIssues === 0
              ? 'No issues found — your data looks clean.'
              : `${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found. Fix what you need, then proceed.`}
          </p>
        </div>
        <button
          onClick={onComplete}
          className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
        >
          Proceed to Analysis →
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {totalIssues === 0 ? (
        <div className="text-center py-10 bg-white border border-zinc-200 rounded-xl">
          <p className="text-3xl mb-2">✓</p>
          <p className="text-sm text-zinc-500">Data is clean and ready for analysis.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {report.blanks.length > 0 && (
            <BlankValuesCard
              blanks={report.blanks}
              columns={columns}
              onApply={handleBlankFix}
              applying={applying === 'blanks'}
            />
          )}
          {report.casing.length > 0 && (
            <CasingCard
              casing={report.casing}
              onApply={handleCasingFix}
              applying={applying === 'casing'}
            />
          )}
          {report.typeMismatches.length > 0 && (
            <TypeMismatchCard
              mismatches={report.typeMismatches}
              onApply={handleTypeMismatchFix}
              applying={applying === 'type_mismatches'}
            />
          )}
          {report.duplicates.count > 0 && (
            <DuplicatesCard
              duplicates={report.duplicates}
              allColumnNames={allColumnNames}
              onApply={handleDuplicateFix}
              applying={applying === 'duplicates'}
            />
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50 animate-fade-in">
          ✓ {toast}
        </div>
      )}
    </div>
  )
}
