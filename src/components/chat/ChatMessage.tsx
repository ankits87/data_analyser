'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ChartRenderer from '@/components/charts/ChartRenderer'
import FeedbackButtons from './FeedbackButtons'
import type { ChatMessage as ChatMessageType } from '@/types'

interface Props {
  message: ChatMessageType
  isLastMessage?: boolean
  onRetry?: () => void
}

export default function ChatMessage({ message, isLastMessage, onRetry }: Props) {
  const isUser = message.role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-zinc-900 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-3">
        <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-zinc-800 shadow-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto my-2">
                  <table className="min-w-full border-collapse text-xs">{children}</table>
                </div>
              ),
              th: ({ children }) => (
                <th className="px-2 py-1 bg-zinc-100 text-left font-medium border border-zinc-200 whitespace-nowrap">{children}</th>
              ),
              td: ({ children }) => (
                <td className="px-2 py-1 border border-zinc-200 whitespace-nowrap">{children}</td>
              ),
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {message.sql_query && (
          <details className="text-xs">
            <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600 select-none transition-colors">
              View SQL
            </summary>
            <pre className="mt-2 bg-zinc-900 text-zinc-100 rounded-lg px-4 py-3 overflow-x-auto text-xs leading-relaxed">
              {message.sql_query}
            </pre>
          </details>
        )}

        {message.chart_config && (
          <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
            {message.chart_config.title && (
              <p className="text-xs font-medium text-zinc-500 mb-3">{message.chart_config.title}</p>
            )}
            <ChartRenderer config={message.chart_config} />
          </div>
        )}

        {message.id.startsWith('temp-err-') && isLastMessage && onRetry ? (
          <button
            onClick={onRetry}
            className="text-xs text-zinc-500 hover:text-zinc-800 underline underline-offset-2 transition-colors"
          >
            Retry
          </button>
        ) : !message.id.startsWith('temp-') ? (
          <FeedbackButtons messageId={message.id} />
        ) : null}
      </div>
    </div>
  )
}
