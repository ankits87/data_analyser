'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  messageId: string
}

export default function FeedbackButtons({ messageId }: Props) {
  const supabase = createClient()
  const [rating, setRating] = useState<1 | -1 | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleFeedback(value: 1 | -1) {
    if (rating === value) return
    setRating(value)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('message_feedback').upsert(
      { message_id: messageId, user_id: user.id, rating: value },
      { onConflict: 'message_id,user_id' }
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <button
        onClick={() => handleFeedback(1)}
        title="Helpful"
        className={`text-base transition-opacity ${rating === 1 ? 'opacity-100' : 'opacity-30 hover:opacity-70'}`}
      >
        👍
      </button>
      <button
        onClick={() => handleFeedback(-1)}
        title="Not helpful"
        className={`text-base transition-opacity ${rating === -1 ? 'opacity-100' : 'opacity-30 hover:opacity-70'}`}
      >
        👎
      </button>
      {saved && (
        <span className="text-xs text-zinc-400 animate-fade-in">Saved</span>
      )}
    </div>
  )
}
