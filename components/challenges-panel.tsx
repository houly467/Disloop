'use client'

import useSWR from 'swr'
import { useEffect, useState } from 'react'

type Challenge = { id: string; period: string; count: number; target: number; xp: number }
type ChallengeResponse = { challenges: Challenge[]; available?: boolean }
type InviteResponse = { inviteUrl: string | null; inviteCode: string | null }
type LeaderboardResponse = { rankings: { userId: string; displayName: string; username: string; avatarUrl: string | null; xp: number }[] }

export function ChallengesPanel({ locale, mode = 'all' }: { locale: 'en' | 'ar'; mode?: 'all' | 'leaderboard' }) {
  const { data, mutate } = useSWR<ChallengeResponse>('/api/challenges', async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('challenges_unavailable')
    return response.json()
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [claimed, setClaimed] = useState<Set<string>>(new Set())
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly')
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [incomingCode, setIncomingCode] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [challengeMessage, setChallengeMessage] = useState('')
  const { data: rankings } = useSWR<LeaderboardResponse>(`/api/leaderboard?period=${period}`, async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('leaderboard_unavailable')
    return response.json()
  })
  useEffect(() => {
    setIncomingCode(new URLSearchParams(window.location.search).get('invite') ?? '')
  }, [])

  async function claim(challengeId: string) {
    setBusy(challengeId)
    setChallengeMessage('')
    try {
      const response = await fetch('/api/challenges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId }) })
      if (!response.ok) throw new Error('claim_failed')
      setClaimed((current) => new Set(current).add(challengeId))
      await mutate()
    } catch {
      setChallengeMessage(locale === 'ar' ? 'تعذر استلام المكافأة.' : 'Could not claim the reward.')
    } finally {
      setBusy(null)
    }
  }

  async function createInvite() {
    setInviteBusy(true)
    setInviteMessage('')
    try {
      const response = await fetch('/api/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create' }) })
      if (!response.ok) throw new Error('invite_failed')
      const result = await response.json() as InviteResponse
      setInviteUrl(result.inviteUrl ?? '')
    } catch {
      setInviteMessage(locale === 'ar' ? 'تعذر إنشاء رابط الدعوة.' : 'Could not create an invite link.')
    } finally {
      setInviteBusy(false)
    }
  }

  async function claimInvite() {
    setInviteBusy(true)
    setInviteMessage('')
    try {
      const response = await fetch('/api/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: incomingCode }) })
      if (!response.ok) throw new Error('invite_claim_failed')
      setInviteMessage(locale === 'ar' ? 'تم تأكيد الدعوة.' : 'Invite confirmed.')
      const url = new URL(window.location.href)
      url.searchParams.delete('invite')
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
      setIncomingCode('')
    } catch {
      setInviteMessage(locale === 'ar' ? 'تعذر تأكيد الدعوة.' : 'Could not confirm invite.')
    } finally {
      setInviteBusy(false)
    }
  }

  const names: Record<string, { en: string; ar: string }> = {
    'publish-post': { en: 'Share a post today', ar: 'شارك منشورًا اليوم' },
    'comment-three': { en: 'Write 3 comments today', ar: 'اكتب ٣ تعليقات اليوم' },
    'five-likes': { en: 'Receive 5 likes today', ar: 'احصل على ٥ إعجابات اليوم' },
    'weekly-reel': { en: 'Publish a Reel this week', ar: 'انشر ريلز هذا الأسبوع' },
  }

  return <div className={`growth-panels${mode === 'leaderboard' ? ' growth-panels-leaderboard' : ''}`}>{mode !== 'leaderboard' && <section className="challenge-panel" aria-label={locale === 'ar' ? 'التحديات' : 'Challenges'}>
    <h2>{locale === 'ar' ? 'تحديات المجتمع' : 'Community challenges'}</h2>
    {(data?.challenges ?? []).map((challenge) => {
      const complete = challenge.count >= challenge.target
      return <article className="challenge-item" key={challenge.id}>
        <div><strong>{names[challenge.id]?.[locale] ?? challenge.id}</strong><span>{challenge.count}/{challenge.target} · {challenge.xp} XP</span></div>
        <progress value={Math.min(challenge.target, challenge.count)} max={challenge.target} />
        {complete && <button type="button" disabled={busy !== null || claimed.has(challenge.id)} onClick={() => void claim(challenge.id)}>{claimed.has(challenge.id) ? (locale === 'ar' ? 'تم الاستلام' : 'Claimed') : (locale === 'ar' ? 'استلام XP' : 'Claim XP')}</button>}
      </article>
    })}
    {challengeMessage && <p role="status">{challengeMessage}</p>}
  </section>}{mode !== 'leaderboard' && <section className="challenge-panel" aria-label={locale === 'ar' ? 'لوحة المتصدرين' : 'Leaderboard'}>
    <h2>{locale === 'ar' ? 'لوحة المتصدرين' : 'Leaderboard'}</h2>
    <label>{locale === 'ar' ? 'الفترة' : 'Period'} <select value={period} onChange={(event) => setPeriod(event.target.value as 'weekly' | 'monthly')}><option value="weekly">{locale === 'ar' ? 'أسبوعي' : 'Weekly'}</option><option value="monthly">{locale === 'ar' ? 'شهري' : 'Monthly'}</option></select></label>
    <ol>{(rankings?.rankings ?? []).slice(0, 5).map((person) => <li key={person.userId}><a href={`/u/${encodeURIComponent(person.username)}`}>{person.displayName}</a><span>{person.xp} XP</span></li>)}</ol>
  </section>}{mode !== 'leaderboard' && <section className="challenge-panel" aria-label={locale === 'ar' ? 'دعوة الأصدقاء' : 'Invites'}>
    <h2>{locale === 'ar' ? 'ادعُ صديقًا' : 'Invite a friend'}</h2>
    {incomingCode && <button type="button" disabled={inviteBusy} onClick={() => void claimInvite()}>{locale === 'ar' ? 'تأكيد الدعوة' : 'Claim invite'}</button>}
    {inviteUrl ? <input className="invite-link" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} aria-label={locale === 'ar' ? 'رابط الدعوة' : 'Invite link'} /> : <button type="button" disabled={inviteBusy} onClick={() => void createInvite()}>{inviteBusy ? '…' : (locale === 'ar' ? 'إنشاء رابط دعوة' : 'Create invite link')}</button>}
    {inviteMessage && <p role="status">{inviteMessage}</p>}
  </section>}</div>
}
