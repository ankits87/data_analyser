'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import UploadFlow from '@/components/upload/UploadFlow'
import type { Dataset } from '@/types'

interface Props {
  initialDatasets: Dataset[]
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function DashboardContent({ initialDatasets }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [uploading, setUploading] = useState(false)
  const [datasets, setDatasets] = useState<Dataset[]>(initialDatasets)
  const [deleting, setDeleting] = useState<string | null>(null)

  function handleUploadComplete(datasetId: string) {
    setUploading(false)
    router.refresh()
    router.push(`/dashboard/${datasetId}`)
  }

  async function handleDelete(e: React.MouseEvent, dataset: Dataset) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Delete "${dataset.name}"? This cannot be undone.`)) return
    setDeleting(dataset.id)
    setDatasets(prev => prev.filter(d => d.id !== dataset.id))
    const { error } = await supabase.from('datasets').delete().eq('id', dataset.id)
    if (error) {
      setDatasets(prev => [dataset, ...prev].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ))
    }
    setDeleting(null)
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Your datasets</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Upload a CSV to start analysing</p>
        </div>
        {!uploading && (
          <button
            onClick={() => setUploading(true)}
            className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            + Upload CSV
          </button>
        )}
      </div>

      {uploading && (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 mb-6">
          <h3 className="font-medium text-zinc-900 mb-4">Upload new dataset</h3>
          <UploadFlow
            onComplete={handleUploadComplete}
            onCancel={() => setUploading(false)}
          />
        </div>
      )}

      {datasets.length === 0 && !uploading ? (
        <div className="text-center py-20 text-zinc-400">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm">No datasets yet. Upload a CSV to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {datasets.map(dataset => (
            <Link
              key={dataset.id}
              href={`/dashboard/${dataset.id}`}
              className="group block bg-white rounded-xl border border-zinc-200 px-5 py-4 hover:border-zinc-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900 truncate">{dataset.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {dataset.filename} · {dataset.row_count.toLocaleString()} rows · {dataset.columns.length} columns
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-zinc-400" suppressHydrationWarning>{timeAgo(dataset.created_at)}</span>
                  <button
                    onClick={e => handleDelete(e, dataset)}
                    disabled={deleting === dataset.id}
                    title="Delete dataset"
                    className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-all disabled:opacity-30 p-1 rounded"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
