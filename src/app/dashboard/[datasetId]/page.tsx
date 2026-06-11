import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ChatPageClient from '@/components/chat/ChatPageClient'
import type { Dataset, ChatSession, ChatMessage } from '@/types'

export default async function DatasetPage({
  params,
}: {
  params: Promise<{ datasetId: string }>
}) {
  const { datasetId } = await params
  const supabase = await createClient()

  const [{ data: dataset }, { data: sessions }] = await Promise.all([
    supabase
      .from('datasets')
      .select('id, name, filename, row_count, columns, created_at')
      .eq('id', datasetId)
      .single(),
    supabase
      .from('chat_sessions')
      .select('id, user_id, dataset_id, title, created_at')
      .eq('dataset_id', datasetId)
      .order('created_at', { ascending: false }),
  ])

  if (!dataset) notFound()

  // Pre-load messages for the most recent session
  let initialMessages: ChatMessage[] = []
  if (sessions && sessions.length > 0) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessions[0].id)
      .order('created_at')
    initialMessages = (msgs ?? []) as ChatMessage[]
  }

  return (
    <ChatPageClient
      dataset={dataset as Dataset}
      initialSessions={(sessions ?? []) as ChatSession[]}
      initialMessages={initialMessages}
    />
  )
}
