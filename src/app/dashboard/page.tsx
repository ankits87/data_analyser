import { createClient } from '@/lib/supabase/server'
import DashboardContent from '@/components/dashboard/DashboardContent'
import type { Dataset } from '@/types'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: datasets } = await supabase
    .from('datasets')
    .select('id, name, filename, row_count, columns, created_at')
    .order('created_at', { ascending: false })

  return <DashboardContent initialDatasets={(datasets ?? []) as Dataset[]} />
}
