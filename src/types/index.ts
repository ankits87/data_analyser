export type ColumnType = 'string' | 'number' | 'date' | 'boolean'

export interface ColumnDefinition {
  original_name: string
  label: string
  description: string
  type: ColumnType
}

export interface Dataset {
  id: string
  user_id: string
  name: string
  filename: string
  row_count: number
  columns: ColumnDefinition[]
  created_at: string
}

export interface DatasetRow {
  id: string
  dataset_id: string
  row_index: number
  data: Record<string, unknown>
}

export interface ChatSession {
  id: string
  user_id: string
  dataset_id: string
  title: string | null
  created_at: string
}

export type MessageRole = 'user' | 'assistant'

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'table'

export interface ChartConfig {
  type: ChartType
  title: string
  x_key: string
  y_keys: string[]
  data: Record<string, unknown>[]
}

export interface ChatMessage {
  id: string
  session_id: string
  role: MessageRole
  content: string
  sql_query: string | null
  chart_config: ChartConfig | null
  created_at: string
}

export interface MessageFeedback {
  id: string
  message_id: string
  user_id: string
  rating: 1 | -1
  comment: string | null
  created_at: string
}

// Payload shapes for API routes

export interface CreateDatasetPayload {
  name: string
  filename: string
  columns: ColumnDefinition[]
  row_count: number
}

export interface EnrichColumnsPayload {
  headers: string[]
  sample_rows: Record<string, unknown>[]
}

export interface ChatPayload {
  session_id: string
  dataset_id: string
  question: string
  history: Pick<ChatMessage, 'role' | 'content' | 'sql_query'>[]
}
