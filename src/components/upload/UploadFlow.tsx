'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseCSV, inferColumnTypes } from '@/lib/csv/parser'
import { classifyErrors, type ParseIssue } from '@/lib/csv/validator'
import CsvDropzone from './CsvDropzone'
import ParseErrorSummary from './ParseErrorSummary'
import ColumnReviewTable from './ColumnReviewTable'
import type { ColumnDefinition } from '@/types'

type Step = 'idle' | 'parsing' | 'issues' | 'enriching' | 'review' | 'saving'

interface Props {
  onComplete: (datasetId: string) => void
  onCancel: () => void
}

const BATCH_SIZE = 500

export default function UploadFlow({ onComplete, onCancel }: Props) {
  const supabase = createClient()
  const [step, setStep] = useState<Step>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [issues, setIssues] = useState<ParseIssue[]>([])
  const [columns, setColumns] = useState<ColumnDefinition[]>([])
  const [saveProgress, setSaveProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function handleFileSelected(selectedFile: File) {
    setFile(selectedFile)
    setError(null)
    setStep('parsing')

    const { headers: rawH, rows: rawR, errors: e } = await parseCSV(selectedFile)

    // Drop columns that are papaparse artefacts:
    //   - empty/whitespace header             e.g. ""  or  " "
    //   - synthetic duplicate-empty names     e.g. "_1", " _1", "_2"
    // Trim first so " _1" (leading space from a whitespace header) also matches.
    // Only drop when the column has no data — a real column that coincidentally
    // looks like a pattern but has values is kept.
    const isSyntheticEmpty = (header: string) => {
      const t = header.trim()
      return t === '' || /^_\d+$/.test(t)
    }

    const h = rawH.filter(header => {
      if (!isSyntheticEmpty(header)) return true
      return rawR.some(row => row[header] !== null && row[header] !== undefined && row[header] !== '')
    })
    // Rebuild rows without the dropped keys
    const droppedKeys = new Set(rawH.filter(hdr => !h.includes(hdr)))
    const r = droppedKeys.size > 0
      ? rawR.map(row => {
          const clean: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(row)) {
            if (!droppedKeys.has(k)) clean[k] = v
          }
          return clean
        })
      : rawR

    if (h.length === 0) {
      setError('Could not read column headers. Make sure the file is a valid CSV.')
      setStep('idle')
      return
    }

    setHeaders(h)
    setRows(r)

    const foundIssues = classifyErrors(e, h, r)
    if (foundIssues.some(i => i.type === 'error')) {
      setIssues(foundIssues)
      setStep('issues')
      return
    }

    await enrichColumns(h, r)
  }

  async function enrichColumns(h: string[], r: Record<string, unknown>[]) {
    setStep('enriching')
    const inferredTypes = inferColumnTypes(h, r)
    const sampleRows = r.slice(0, 5)

    try {
      const res = await fetch('/api/columns/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: h, sample_rows: sampleRows }),
      })
      const data = await res.json()

      const enriched: ColumnDefinition[] = (data.columns as ColumnDefinition[]).map(col => ({
        ...col,
        type: col.type ?? inferredTypes[col.original_name] ?? 'string',
      }))
      setColumns(enriched)
    } catch {
      // Fallback to inferred types
      const fallback: ColumnDefinition[] = h.map(header => ({
        original_name: header,
        label: header.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: '',
        type: inferredTypes[header] ?? 'string',
      }))
      setColumns(fallback)
    }

    setStep('review')
  }

  async function handleConfirm(datasetName: string, editedColumns: ColumnDefinition[]) {
    if (!file) return
    setStep('saving')
    setSaveProgress(0)
    setError(null)

    try {
      // 1. Create dataset metadata record via API
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: datasetName,
          filename: file.name,
          columns: editedColumns,
          row_count: rows.length,
        }),
      })
      const { datasetId, error: apiError } = await res.json()
      if (apiError) throw new Error(apiError)

      // 2. Insert rows in batches directly via Supabase browser client
      const totalBatches = Math.ceil(rows.length / BATCH_SIZE)

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE).map((data, j) => ({
          dataset_id: datasetId,
          row_index: i + j,
          data,
        }))

        const { error: insertError } = await supabase.from('dataset_rows').insert(batch)
        if (insertError) throw new Error(insertError.message)

        const batchIndex = Math.floor(i / BATCH_SIZE)
        setSaveProgress(Math.round(((batchIndex + 1) / totalBatches) * 100))
      }

      onComplete(datasetId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save dataset')
      setStep('review')
    }
  }

  if (step === 'idle' || step === 'parsing') {
    return (
      <div className="space-y-4">
        <CsvDropzone onFileSelected={handleFileSelected} disabled={step === 'parsing'} />
        {step === 'parsing' && (
          <p className="text-sm text-center text-zinc-500 animate-pulse">Parsing file…</p>
        )}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}
        <button
          onClick={onCancel}
          className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (step === 'issues') {
    return (
      <ParseErrorSummary
        issues={issues}
        rowCount={rows.length}
        onContinue={() => enrichColumns(headers, rows)}
        onCancel={() => { setStep('idle'); setIssues([]) }}
      />
    )
  }

  if (step === 'enriching') {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="text-3xl animate-spin inline-block">⚙</div>
        <p className="text-sm text-zinc-500">Analysing columns with AI…</p>
      </div>
    )
  }

  if (step === 'review' || step === 'saving') {
    return (
      <>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>
        )}
        <ColumnReviewTable
          filename={file?.name ?? ''}
          columns={columns}
          rows={rows}
          onConfirm={handleConfirm}
          onBack={() => setStep('idle')}
          isSaving={step === 'saving'}
          saveProgress={saveProgress}
        />
      </>
    )
  }

  return null
}
