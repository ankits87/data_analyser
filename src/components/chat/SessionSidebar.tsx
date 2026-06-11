'use client'

import Link from 'next/link'
import type { ChatSession, Dataset } from '@/types'

interface Props {
  dataset: Dataset
  sessions: ChatSession[]
  activeSessionId: string | null
  onSelectSession: (session: ChatSession) => void
  onNewSession: () => void
  isCreating: boolean
}

export default function SessionSidebar({
  dataset,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  isCreating,
}: Props) {
  return (
    <aside className="w-64 border-r border-zinc-200 bg-white flex flex-col flex-shrink-0">
      <div className="px-4 py-4 border-b border-zinc-100">
        <Link href="/dashboard" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
          ← All datasets
        </Link>
        <p className="font-medium text-zinc-900 text-sm mt-1 truncate" title={dataset.name}>
          {dataset.name}
        </p>
        <p className="text-xs text-zinc-400">
          {dataset.row_count.toLocaleString()} rows · {dataset.columns.length} columns
        </p>
      </div>

      <div className="px-3 py-3">
        <button
          onClick={onNewSession}
          disabled={isCreating}
          className="w-full text-left text-sm px-3 py-2 rounded-lg border border-dashed border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 disabled:opacity-50 transition-colors"
        >
          {isCreating ? 'Creating…' : '+ New chat'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4">
        {sessions.length === 0 ? (
          <p className="text-xs text-zinc-400 px-3 py-2">No chats yet</p>
        ) : (
          sessions.map(session => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session)}
              className={`
                w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                ${activeSessionId === session.id
                  ? 'bg-zinc-100 text-zinc-900 font-medium'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'}
              `}
            >
              <p className="truncate">{session.title ?? 'Untitled chat'}</p>
              <p className="text-xs text-zinc-400 mt-0.5" suppressHydrationWarning>
                {new Date(session.created_at).toLocaleDateString()}
              </p>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
