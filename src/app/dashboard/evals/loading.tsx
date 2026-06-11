export default function EvalsLoading() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="h-7 w-56 bg-zinc-200 rounded animate-pulse" />
        <div className="h-4 w-72 bg-zinc-100 rounded animate-pulse mt-2" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-zinc-200 px-5 py-5 space-y-2">
            <div className="h-3 w-24 bg-zinc-100 rounded animate-pulse" />
            <div className="h-8 w-16 bg-zinc-200 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-zinc-200 px-5 py-5">
        <div className="h-4 w-40 bg-zinc-200 rounded animate-pulse mb-4" />
        <div className="h-48 bg-zinc-50 rounded animate-pulse" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-zinc-200 px-5 py-5">
        <div className="h-4 w-44 bg-zinc-200 rounded animate-pulse mb-4" />
        {[1, 2, 3].map(i => (
          <div key={i} className="py-3 border-b border-zinc-100 flex gap-6">
            <div className="h-3 flex-1 bg-zinc-100 rounded animate-pulse" />
            <div className="h-3 w-12 bg-zinc-100 rounded animate-pulse" />
            <div className="h-3 w-10 bg-zinc-100 rounded animate-pulse" />
            <div className="h-3 w-10 bg-zinc-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
