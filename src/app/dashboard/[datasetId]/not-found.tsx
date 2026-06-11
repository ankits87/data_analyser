import Link from 'next/link'

export default function DatasetNotFound() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <p className="text-4xl mb-4">🔍</p>
        <h2 className="text-lg font-semibold text-zinc-900 mb-1">Dataset not found</h2>
        <p className="text-sm text-zinc-500 mb-6">
          This dataset doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
        >
          ← Back to datasets
        </Link>
      </div>
    </div>
  )
}
