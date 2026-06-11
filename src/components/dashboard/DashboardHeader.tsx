'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props {
  email: string
}

export default function DashboardHeader({ email }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function navClass(href: string) {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
    return `text-sm transition-colors ${active ? 'text-zinc-900 font-medium' : 'text-zinc-500 hover:text-zinc-800'}`
  }

  return (
    <header className="border-b border-zinc-200 bg-white px-6 h-[57px] flex items-center justify-between">
      <div className="flex items-center gap-6">
        <h1 className="font-semibold text-zinc-900">Data Analyser</h1>
        <nav className="flex items-center gap-4">
          <Link href="/dashboard" className={navClass('/dashboard')}>Datasets</Link>
          <Link href="/dashboard/evals" className={navClass('/dashboard/evals')}>Evaluations</Link>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-zinc-500">{email}</span>
        <button
          onClick={handleSignOut}
          className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
