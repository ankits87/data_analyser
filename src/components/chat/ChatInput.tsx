'use client'

import { useState, useRef } from 'react'

interface Props {
  onSend: (message: string) => void
  disabled?: boolean
}

export default function ChatInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-3">
      <div className="flex gap-2 items-end max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about your data… (Enter to send, Shift+Enter for new line)"
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 disabled:opacity-50 disabled:bg-zinc-50 max-h-40 overflow-y-auto"
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="flex-shrink-0 bg-zinc-900 text-white rounded-xl px-4 py-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {disabled ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
