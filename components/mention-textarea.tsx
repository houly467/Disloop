'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { UserName } from '@/components/user-name'

type Locale = 'en' | 'ar'
type MentionPerson = { id: string; username: string; displayName: string; avatarUrl: string | null; nameStyle: string | null; customTitle: string | null }

async function fetchPeople(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('mention_search_failed')
  return response.json() as Promise<{ people: MentionPerson[] }>
}

function renderMentions(text: string, keyPrefix: string) {
  const parts = text.split(/(@[a-zA-Z0-9._]{2,20})/g)
  return parts.map((part, index) => /^@[a-zA-Z0-9._]{2,20}$/.test(part)
    ? <a className="mention-link" key={`${keyPrefix}-${part}-${index}`} href={`/u/${encodeURIComponent(part.slice(1))}`} dir="ltr">{part}</a>
    : part)
}

export function RichText({ text }: { text: string }) {
  const linkPattern = /https?:\/\/[^\s<>"']+/gi
  const fragments = text.split(linkPattern)
  const links = [...text.matchAll(linkPattern)]
  const content = fragments.flatMap((fragment, index) => {
    const plain = renderMentions(fragment, `plain-${index}`)
    if (index >= links.length) return plain
    const rawLink = links[index][0]
    const trimmed = rawLink.replace(/[.,!?;:)\\]}]+$/g, '')
    const suffix = rawLink.slice(trimmed.length)
    try {
      const url = new URL(trimmed)
      if (!['http:', 'https:'].includes(url.protocol)) return [fragment, rawLink]
      return [...plain, <a className="safe-external-link" key={`url-${index}`} href={url.toString()} target="_blank" rel="noopener noreferrer nofollow" dir="ltr">{trimmed}</a>, suffix]
    } catch {
      return [...plain, rawLink]
    }
  })
  return <>{content}</>
}

function mentionTerm(value: string, caret: number) {
  const before = value.slice(0, caret)
  const match = before.match(/(?:^|\s)@([a-zA-Z0-9._]{2,20})$/)
  if (!match) return null
  return { query: match[1], start: caret - match[1].length - 1 }
}

export function MentionSuggestions({ value, caret, locale, onSelect }: {
  value: string
  caret: number
  locale: Locale
  onSelect: (nextValue: string, nextCaret: number) => void
}) {
  const term = useMemo(() => mentionTerm(value, caret), [caret, value])
  const { data } = useSWR<{ people: MentionPerson[] }>(term ? `/api/mentions?q=${encodeURIComponent(term.query)}` : null, fetchPeople)
  const people = data?.people ?? []
  if (!term || !people.length) return null

  return (
    <div className="mention-suggestions" role="listbox" aria-label={locale === 'ar' ? 'اقتراحات المستخدمين' : 'Mention suggestions'}>
      {people.map((person) => (
        <button key={person.id} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => {
          const inserted = `@${person.username} `
          const nextValue = `${value.slice(0, term.start)}${inserted}${value.slice(caret)}`
          onSelect(nextValue, term.start + inserted.length)
        }}>
          {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <span className="mention-avatar-fallback">{person.displayName.charAt(0)}</span>}
          <UserName userId={person.id} name={person.displayName} username={person.username} nameStyle={person.nameStyle} customTitle={person.customTitle} locale={locale} />
        </button>
      ))}
    </div>
  )
}

export function MentionTextarea({
  value,
  onChange,
  locale,
  placeholder,
  rows = 3,
  maxLength,
  className,
  id,
  required,
}: {
  value: string
  onChange: (value: string) => void
  locale: Locale
  placeholder: string
  rows?: number
  maxLength?: number
  className?: string
  id?: string
  required?: boolean
}) {
  const [caret, setCaret] = useState(0)
  return (
    <div className="mention-textarea-wrap">
      <textarea
        id={id}
        className={className}
        rows={rows}
        maxLength={maxLength}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(event) => { onChange(event.target.value); setCaret(event.target.selectionStart) }}
        onClick={(event) => setCaret(event.currentTarget.selectionStart)}
        onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
      />
      <MentionSuggestions value={value} caret={caret} locale={locale} onSelect={(nextValue, nextCaret) => {
        onChange(nextValue)
        setCaret(nextCaret)
      }} />
    </div>
  )
}
