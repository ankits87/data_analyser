'use client'

import { useEffect, useRef } from 'react'
import ChatMessage from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/types'

interface Props {
  messages: ChatMessageType[]
  loading: boolean
  onRetry: () => void
}

export default function ChatWindow({ messages, loading, onRetry }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <div>
          <p className="text-3xl mb-3">💬</p>
          <p className="text-sm font-medium text-zinc-700">Ask anything about your data</p>
          <p className="text-xs text-zinc-400 mt-1">
            Try: "Show me the top 10 rows" or "What is the average value of each column?"
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            isLastMessage={i === messages.length - 1}
            onRetry={onRetry}
          />
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <span className="flex gap-1">
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
