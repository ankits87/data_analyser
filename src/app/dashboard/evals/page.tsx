import { createClient } from '@/lib/supabase/server'
import EvalsClient from '@/components/evals/EvalsClient'

export default async function EvalsPage() {
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('message_feedback')
    .select(`
      id, rating, created_at,
      chat_messages (
        id, content,
        chat_sessions (
          datasets ( id, name )
        )
      )
    `)
    .order('created_at', { ascending: false })

  // Flatten the nested result into a clean shape
  type RawEntry = {
    id: string
    rating: 1 | -1
    created_at: string
    chat_messages: {
      id: string
      content: string
      chat_sessions: {
        datasets: { id: string; name: string } | null
      } | null
    } | null
  }

  const entries: EvalEntry[] = ((raw ?? []) as unknown as RawEntry[])
    .filter(r => r.chat_messages?.chat_sessions?.datasets)
    .map(r => ({
      id: r.id,
      rating: r.rating,
      created_at: r.created_at,
      message_content: r.chat_messages!.content,
      dataset_id: r.chat_messages!.chat_sessions!.datasets!.id,
      dataset_name: r.chat_messages!.chat_sessions!.datasets!.name,
    }))

  // ── Summary stats ─────────────────────────────────────────────────────────
  const total = entries.length
  const helpful = entries.filter(e => e.rating === 1).length
  const notHelpful = total - helpful

  // ── 30-day daily trend ────────────────────────────────────────────────────
  const now = new Date()
  const trend: DayBucket[] = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - (29 - i))
    return { date: d.toISOString().slice(0, 10), helpful: 0, not_helpful: 0 }
  })
  const trendMap = Object.fromEntries(trend.map(b => [b.date, b]))

  for (const e of entries) {
    const day = e.created_at.slice(0, 10)
    if (trendMap[day]) {
      if (e.rating === 1) trendMap[day].helpful++
      else trendMap[day].not_helpful++
    }
  }

  // ── Per-dataset breakdown ─────────────────────────────────────────────────
  const datasetMap = new Map<string, DatasetStats>()
  for (const e of entries) {
    if (!datasetMap.has(e.dataset_id)) {
      datasetMap.set(e.dataset_id, {
        dataset_id: e.dataset_id,
        dataset_name: e.dataset_name,
        total: 0, helpful: 0, not_helpful: 0, score: 0,
      })
    }
    const s = datasetMap.get(e.dataset_id)!
    s.total++
    if (e.rating === 1) s.helpful++
    else s.not_helpful++
  }
  const datasetStats: DatasetStats[] = Array.from(datasetMap.values()).map(s => ({
    ...s,
    score: s.total > 0 ? Math.round((s.helpful / s.total) * 100) : 0,
  })).sort((a, b) => b.total - a.total)

  const recentFeedback = entries.slice(0, 25)

  return (
    <EvalsClient
      summary={{ total, helpful, notHelpful }}
      trend={trend}
      datasetStats={datasetStats}
      recentFeedback={recentFeedback}
    />
  )
}

export interface EvalEntry {
  id: string
  rating: 1 | -1
  created_at: string
  message_content: string
  dataset_id: string
  dataset_name: string
}

export interface DayBucket {
  date: string
  helpful: number
  not_helpful: number
}

export interface DatasetStats {
  dataset_id: string
  dataset_name: string
  total: number
  helpful: number
  not_helpful: number
  score: number
}
