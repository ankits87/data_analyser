import { createClient } from '@/lib/supabase/server'
import type { CreateDatasetPayload } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body: CreateDatasetPayload = await request.json()
  const { name, filename, columns, row_count } = body

  const { data: dataset, error } = await supabase
    .from('datasets')
    .insert({ user_id: user.id, name, filename, columns, row_count })
    .select('id')
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ datasetId: dataset.id })
}
