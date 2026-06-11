import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardHeader from '@/components/dashboard/DashboardHeader'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <DashboardHeader email={user.email ?? ''} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
