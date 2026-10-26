'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { MessageReaction } from '@/lib/chat'

const choices = ['👍', '❤️', '😂', '🎉'] as const

export function ChatReactions({ chatType, messageId, reactions, locale, onChange }: {
  chatType: 'direct' | 'group'
  messageId: string
  reactions: MessageReaction[]
  locale: 'en' | 'ar'
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)

  async function toggle(reaction: string) {
    if (busy) return
    setBusy(true)
    try {
      const response = await fetch('/api/chat/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatType, messageId, reaction }),
      })
      if (!response.ok) throw new Error('reaction_failed')
      onChange()
    } catch {
      return
    } finally {
      setBusy(false)
    }
  }

  const copy = locale === 'ar' ? 'تفاعل' : 'React with'
  return (
    <div className="chat-reaction-row" role="group" aria-label={locale === 'ar' ? 'تفاعلات الرسالة' : 'Message reactions'}>
      {choices.map((choice) => {
        const existing = reactions.find((item) => item.reaction === choice)
        return <Button key={choice} type="button" size="xs" variant={existing?.reactedByMe ? 'secondary' : 'ghost'} disabled={busy} aria-pressed={Boolean(existing?.reactedByMe)} aria-label={`${copy} ${choice}`} onClick={() => void toggle(choice)}>{choice}{existing?.count ? <span>{existing.count}</span> : null}</Button>
      })}
    </div>
  )
}
