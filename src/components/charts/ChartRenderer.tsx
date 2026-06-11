'use client'

import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { ChartConfig } from '@/types'

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2']

interface Props {
  config: ChartConfig
}

export default function ChartRenderer({ config }: Props) {
  const { type, data, x_key, y_keys, title } = config

  if (!data || data.length === 0) {
    return <p className="text-sm text-zinc-400 italic">No data to display.</p>
  }

  if (type === 'table') {
    const keys = Object.keys(data[0])
    const isWide = keys.length > 6
    const nonEmptyData = data.filter(row =>
      keys.some(k => row[k] !== null && row[k] !== undefined && String(row[k]).trim() !== '')
    )
    return (
      <div className="overflow-x-auto rounded-lg border border-zinc-200 text-sm max-h-96">
        <table className="min-w-full border-collapse">
          <thead className="bg-zinc-50 text-zinc-600 text-xs uppercase tracking-wide sticky top-0">
            <tr>
              {keys.map((k, i) => (
                <th
                  key={k}
                  className={`px-3 py-2 text-left font-medium whitespace-nowrap border-b border-zinc-200 ${isWide && i === 0 ? 'sticky left-0 bg-zinc-50 z-10' : ''}`}
                >
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {nonEmptyData.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-50">
                {keys.map((k, j) => (
                  <td
                    key={k}
                    className={`px-3 py-2 text-zinc-700 whitespace-nowrap ${isWide && j === 0 ? 'sticky left-0 bg-white font-medium' : ''}`}
                  >
                    {String(row[k] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'line') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey={x_key} tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {y_keys.map((key, i) => (
            <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'scatter') {
    const xKey = x_key
    const yKey = y_keys[0] ?? ''
    return (
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey={xKey} name={xKey} tick={{ fontSize: 12 }} />
          <YAxis dataKey={yKey} name={yKey} tick={{ fontSize: 12 }} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill={COLORS[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    )
  }

  // Default: bar chart
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey={x_key} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Legend />
        {y_keys.map((key, i) => (
          <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
