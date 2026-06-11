'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import SessionSidebar from './SessionSidebar'
import ChatWindow from './ChatWindow'
import ChatInput from './ChatInput'
import type { Dataset, ChatSession, ChatMessage } from '@/types'

interface Props {
  dataset: Dataset
  initialSessions: ChatSession[]
  initialMessages: ChatMessage[]
}

export default function ChatPageClient({ dataset, initialSessions, initialMessages }: Props) {
  const supabase = createClient()

  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions)
  const [activeSession, setActiveSession] = useState<ChatSession | null>(
    initialSessions[0] ?? null
  )
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [loading, setLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [lastQuestion, setLastQuestion] = useState<string | null>(null)

  const loadMessages = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at')
    setMessages((data ?? []) as ChatMessage[])
  }, [supabase])

  async function handleSelectSession(session: ChatSession) {
    if (session.id === activeSession?.id) return
    setActiveSession(session)
    await loadMessages(session.id)
  }

  async function handleNewSession() {
    setIsCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: session } = await supabase
        .from('chat_sessions')
        .insert({ user_id: user.id, dataset_id: dataset.id, title: null })
        .select()
        .single()

      if (session) {
        const newSession = session as ChatSession
        setSessions(prev => [newSession, ...prev])
        setActiveSession(newSession)
        setMessages([])
      }
    } finally {
      setIsCreating(false)
    }
  }

  async function handleSendMessage(question: string) {
    if (!activeSession || loading) return
    setLoading(true)
    setLastQuestion(question)

    const tempId = `temp-${Date.now()}`
    const tempUserMsg: ChatMessage = {
      id: tempId,
      session_id: activeSession.id,
      role: 'user',
      content: question,
      sql_query: null,
      chart_config: null,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      const history = messages.map(m => ({
        role: m.role,
        content: m.content,
        sql_query: m.sql_query,
      }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSession.id,
          dataset_id: dataset.id,
          question,
          history,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        console.error('[chat client] API error:', data)
        throw new Error(data.detail ?? data.error ?? `Server error ${res.status}`)
      }

      const assistantMsg: ChatMessage = {
        id: data.message_id ?? `temp-assist-${Date.now()}`,
        session_id: activeSession.id,
        role: 'assistant',
        content: data.content ?? 'Something went wrong.',
        sql_query: data.sql_query ?? null,
        chart_config: data.chart_config ?? null,
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])

      if (data.session_title) {
        setSessions(prev =>
          prev.map(s => s.id === activeSession.id ? { ...s, title: data.session_title } : s)
        )
        setActiveSession(prev => prev ? { ...prev, title: data.session_title } : prev)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      const isQuota = /quota|rate.?limit|exhausted/i.test(msg)
      setMessages(prev => [...prev, {
        id: `temp-err-${Date.now()}`,
        session_id: activeSession.id,
        role: 'assistant',
        content: isQuota
          ? '⚠️ Gemini API quota exceeded. Please try again tomorrow or check your API plan.'
          : msg || '⚠️ Something went wrong. Please try again.',
        sql_query: null,
        chart_config: null,
        created_at: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleRetry() {
    if (lastQuestion) {
      setMessages(prev => prev.slice(0, -2))
      handleSendMessage(lastQuestion)
    }
  }

  return (
    <div className="flex" style={{ height: 'calc(100vh - 57px)' }}>
      <SessionSidebar
        dataset={dataset}
        sessions={sessions}
        activeSessionId={activeSession?.id ?? null}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        isCreating={isCreating}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {activeSession ? (
          <>
            <ChatWindow messages={messages} loading={loading} onRetry={handleRetry} />
            <ChatInput onSend={handleSendMessage} disabled={loading} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center px-6">
            <div>
              <p className="text-3xl mb-3">📊</p>
              <p className="text-sm font-medium text-zinc-700">Start your first analysis</p>
              <p className="text-xs text-zinc-400 mt-1 mb-4">Create a chat to ask questions about your data</p>
              <button
                onClick={handleNewSession}
                disabled={isCreating}
                className="bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {isCreating ? 'Creating…' : 'Start a conversation'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
