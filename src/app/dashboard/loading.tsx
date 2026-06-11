export default function DashboardLoading() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 w-36 bg-zinc-200 rounded animate-pulse" />
          <div className="h-4 w-52 bg-zinc-100 rounded animate-pulse mt-2" />
        </div>
        <div className="h-9 w-28 bg-zinc-200 rounded-lg animate-pulse" />
      </div>

      <div className="grid gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-zinc-200 px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-4 w-48 bg-zinc-200 rounded animate-pulse" />
                <div className="h-3 w-72 bg-zinc-100 rounded animate-pulse" />
              </div>
              <div className="h-3 w-16 bg-zinc-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
