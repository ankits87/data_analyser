'use client'

import Link from 'next/link'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { EvalEntry, DayBucket, DatasetStats } from '@/app/dashboard/evals/page'

interface Props {
  summary: { total: number; helpful: number; notHelpful: number }
  trend: DayBucket[]
  datasetStats: DatasetStats[]
  recentFeedback: EvalEntry[]
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? 'bg-green-50 text-green-700' :
    score >= 40 ? 'bg-yellow-50 text-yellow-700' :
    'bg-red-50 text-red-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {score}%
    </span>
  )
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CustomTooltip = ({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name: string; color: string }[]
  label?: string
}) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-sm px-3 py-2 text-xs">
      <p className="font-medium text-zinc-700 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function EvalsClient({ summary, trend, datasetStats, recentFeedback }: Props) {
  const { total, helpful, notHelpful } = summary
  const score = total > 0 ? Math.round((helpful / total) * 100) : null

  // Only show days that have activity, or last 14 days minimum
  const activeTrend = trend.filter(d => d.helpful > 0 || d.not_helpful > 0)
  const trendData = activeTrend.length === 0
    ? trend.slice(-14)
    : trend.slice(-30)

  if (total === 0) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Response Quality</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Tracks thumbs up / down ratings across all your chat sessions</p>
        </div>

        <div className="mt-20 text-center text-zinc-400">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-sm font-medium text-zinc-600 mb-1">No feedback yet</p>
          <p className="text-sm max-w-sm mx-auto">
            Open any dataset, ask a question, then use the 👍 / 👎 buttons under each response to start tracking quality.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex mt-6 items-center gap-1.5 bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors"
          >
            ← Go to datasets
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-zinc-900">Response Quality</h2>
        <p className="text-sm text-zinc-500 mt-0.5">Thumbs up / down ratings across all your chat sessions</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-zinc-200 px-5 py-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Total rated</p>
          <p className="text-3xl font-bold text-zinc-900 mt-1">{total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 px-5 py-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Helpful</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{helpful.toLocaleString()}</p>
          {score !== null && (
            <p className="text-xs text-zinc-400 mt-1">{score}% of all ratings</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 px-5 py-5">
          <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium">Not helpful</p>
          <p className="text-3xl font-bold text-red-500 mt-1">{notHelpful.toLocaleString()}</p>
          {score !== null && (
            <p className="text-xs text-zinc-400 mt-1">{100 - score}% of all ratings</p>
          )}
        </div>
      </div>

      {/* 30-day trend chart */}
      <div className="bg-white rounded-xl border border-zinc-200 px-5 py-5">
        <h3 className="text-sm font-semibold text-zinc-800 mb-4">Daily ratings (last 30 days)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trendData} barSize={10} barGap={2}>
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 10, fill: '#a1a1aa' }}
              axisLine={false}
              tickLine={false}
              width={24}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
            <Bar dataKey="helpful" name="Helpful" fill="#22c55e" radius={[2, 2, 0, 0]} />
            <Bar dataKey="not_helpful" name="Not helpful" fill="#f87171" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-dataset breakdown */}
      {datasetStats.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100">
            <h3 className="text-sm font-semibold text-zinc-800">By dataset</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500 uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left font-medium">Dataset</th>
                <th className="px-5 py-3 text-right font-medium">Rated</th>
                <th className="px-5 py-3 text-right font-medium">👍</th>
                <th className="px-5 py-3 text-right font-medium">👎</th>
                <th className="px-5 py-3 text-right font-medium">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {datasetStats.map(s => (
                <tr key={s.dataset_id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/${s.dataset_id}`}
                      className="font-medium text-zinc-800 hover:text-zinc-900 hover:underline"
                    >
                      {s.dataset_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-right text-zinc-600">{s.total}</td>
                  <td className="px-5 py-3 text-right text-green-600 font-medium">{s.helpful}</td>
                  <td className="px-5 py-3 text-right text-red-500 font-medium">{s.not_helpful}</td>
                  <td className="px-5 py-3 text-right">
                    <ScoreBadge score={s.score} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent feedback */}
      {recentFeedback.length > 0 && (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100">
            <h3 className="text-sm font-semibold text-zinc-800">Recent feedback</h3>
          </div>
          <ul className="divide-y divide-zinc-100">
            {recentFeedback.map(entry => (
              <li key={entry.id} className="px-5 py-4 flex gap-4 items-start">
                <span className="text-lg flex-shrink-0 mt-0.5">
                  {entry.rating === 1 ? '👍' : '👎'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-700 line-clamp-2">{entry.message_content}</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    {entry.dataset_name} · {new Date(entry.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
