'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, X } from 'lucide-react'

export type PollDraft = { options: string[]; endsAt: string }
export type PollData = {
  id: string
  contentId: string
  options: string[]
  endsAt: string | null
  totalVotes: number
  optionCounts: number[]
  percentages: number[]
  hasVoted: boolean
  ended: boolean
}
type PollResponse = { polls: PollData[]; available: boolean }
type Locale = 'en' | 'ar'

export async function fetchPolls(url: string): Promise<PollResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('polls_failed')
  return response.json() as Promise<PollResponse>
}

export function PollComposer({ value, onChange, locale }: {
  value: PollDraft | null
  onChange: (value: PollDraft | null) => void
  locale: Locale
}) {
  const isArabic = locale === 'ar'
  if (!value) {
    return <button className="poll-composer-toggle" type="button" onClick={() => onChange({ options: ['', ''], endsAt: '' })}>
      <Plus aria-hidden="true" />{isArabic ? 'إضافة استطلاع' : 'Add a poll'}
    </button>
  }
  const setOption = (index: number, option: string) => {
    const options = [...value.options]
    options[index] = option
    onChange({ ...value, options })
  }
  return <fieldset className="poll-composer" dir={isArabic ? 'rtl' : 'ltr'}>
    <legend>{isArabic ? 'استطلاع' : 'Poll'}</legend>
    {value.options.map((option, index) => <div className="poll-composer-option" key={index}>
      <input type="text" maxLength={80} required aria-label={`${isArabic ? 'الخيار' : 'Option'} ${index + 1}`} placeholder={`${isArabic ? 'الخيار' : 'Option'} ${index + 1}`} value={option} onChange={(event) => setOption(index, event.target.value)} />
      {value.options.length > 2 && <button type="button" aria-label={isArabic ? 'إزالة الخيار' : 'Remove option'} onClick={() => onChange({ ...value, options: value.options.filter((_, optionIndex) => optionIndex !== index) })}><X aria-hidden="true" /></button>}
    </div>)}
    <div className="poll-composer-footer">
      {value.options.length < 4 && <button type="button" onClick={() => onChange({ ...value, options: [...value.options, ''] })}><Plus aria-hidden="true" />{isArabic ? 'إضافة خيار' : 'Add option'}</button>}
      <label>{isArabic ? 'ينتهي في (اختياري)' : 'Ends at (optional)'}<input type="datetime-local" value={value.endsAt} onChange={(event) => onChange({ ...value, endsAt: event.target.value })} /></label>
      <button type="button" onClick={() => onChange(null)}>{isArabic ? 'إزالة الاستطلاع' : 'Remove poll'}</button>
    </div>
  </fieldset>
}

export function PollCard({ poll, locale, onVote, canVote = true, onSignIn }: {
  poll: PollData
  locale: Locale
  onVote: (poll: PollData) => void
  canVote?: boolean
  onSignIn?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isArabic = locale === 'ar'
  const showResults = poll.hasVoted || poll.ended

  async function vote(optionIndex: number) {
    if (busy || poll.hasVoted || poll.ended) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/social/polls/${encodeURIComponent(poll.id)}/votes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIndex }),
      })
      const result = await response.json() as { poll?: PollData; error?: string }
      if (!response.ok || !result.poll) throw new Error(result.error ?? 'poll_vote_failed')
      onVote(result.poll)
    } catch (caught) {
      setError(caught instanceof Error && caught.message === 'already_voted'
        ? (isArabic ? 'لقد صوّت بالفعل.' : 'You already voted.')
        : (isArabic ? 'تعذر تسجيل التصويت.' : 'Could not submit your vote.'))
    } finally {
      setBusy(false)
    }
  }

  return <section className="social-poll" aria-label={isArabic ? 'استطلاع' : 'Poll'} dir={isArabic ? 'rtl' : 'ltr'}>
    <strong>{isArabic ? 'استطلاع' : 'Poll'}</strong>
    <div className="social-poll-options">
      {poll.options.map((option, index) => showResults ? <div className="social-poll-result" key={`${poll.id}-${index}`}>
        <div><span>{option}</span><strong>{poll.percentages[index] ?? 0}%</strong></div>
        <span className="social-poll-result-track"><span style={{ width: `${poll.percentages[index] ?? 0}%` }} /></span>
      </div> : <button type="button" key={`${poll.id}-${index}`} disabled={busy || !canVote} onClick={() => canVote ? void vote(index) : onSignIn?.()}>{option}</button>)}
    </div>
    {!canVote && !showResults && <small>{isArabic ? 'سجّل الدخول للتصويت.' : 'Log in to vote.'}</small>}
    <small>{poll.totalVotes} {isArabic ? 'أصوات' : poll.totalVotes === 1 ? 'vote' : 'votes'}{poll.ended ? ` · ${isArabic ? 'انتهى الاستطلاع' : 'Poll ended'}` : poll.endsAt ? ` · ${isArabic ? 'ينتهي' : 'Ends'} ${new Date(poll.endsAt).toLocaleString(locale === 'ar' ? 'ar' : 'en')}` : ''}</small>
    {error && <small className="social-poll-error" role="alert">{error}</small>}
  </section>
}

export function updatePollResponse(current: PollResponse | undefined, updated: PollData): PollResponse | undefined {
  if (!current) return current
  return { ...current, polls: current.polls.map((poll) => poll.id === updated.id ? updated : poll) }
}
