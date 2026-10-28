'use client'

import useSWR from 'swr'
import { BadgeCheck } from 'lucide-react'

type Locale = 'en' | 'ar'
type Badge = {
  id: string
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  image: string
  earned: boolean
  earnedAt: string | null
  equipped: boolean
  count: number
  streak: number
  percentage: number
  progress: { current: number; target: number } | null
}

async function fetchBadges(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('badges_unavailable')
  return response.json() as Promise<{ badges: Badge[] }>
}

function BadgeChip({ badge, locale, compact = false }: { badge: Badge; locale: Locale; compact?: boolean }) {
  const name = locale === 'ar' ? badge.nameAr : badge.name
  return <details className={`badge-chip ${badge.earned ? '' : 'badge-chip-locked'} ${compact ? 'badge-chip-compact' : ''}`}>
    <summary aria-label={`${name}${badge.earned ? '' : locale === 'ar' ? ' · مقفلة' : ' · locked'}`}>
      {badge.id === 'verified' ? <BadgeCheck aria-hidden="true" /> : <img src={badge.image} alt="" loading="lazy" />}
      {!compact && <span>{name}</span>}
    </summary>
    <div className="badge-popover" role="tooltip">
      <strong>{name}</strong>
      <p>{locale === 'ar' ? badge.descriptionAr : badge.description}</p>
      {badge.earned ? <small>{locale === 'ar' ? 'تاريخ الاكتساب: ' : 'Earned: '}{badge.earnedAt ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' }).format(new Date(badge.earnedAt)) : locale === 'ar' ? 'تم التحقق' : 'Awarded'}</small> : badge.progress && <small>{locale === 'ar' ? 'التقدم' : 'Progress'}: {badge.progress.current} / {badge.progress.target}</small>}
      <small>{locale === 'ar' ? 'يمتلكها ' : 'Owned by '}{badge.percentage}% {locale === 'ar' ? 'من الأعضاء' : 'of members'}</small>
      {badge.id === 'daily-loop' && badge.earned && <small>{badge.streak} {locale === 'ar' ? 'أيام متتالية' : 'day streak'}</small>}
      {badge.id === 'top-maker' && badge.earned && <small>{badge.count} {locale === 'ar' ? 'منشورات ضمن الأبرز' : 'Top 3 posts'}</small>}
    </div>
  </details>
}

export function EquippedBadges({ userId, locale }: { userId: string; locale: Locale }) {
  const { data } = useSWR<{ badges: Badge[] }>(`/api/badges/${encodeURIComponent(userId)}`, fetchBadges)
  const equipped = data?.badges.filter((badge) => badge.equipped).slice(0, 3) ?? []
  if (!equipped.length) return null
  return <span className="equipped-badges" aria-label={locale === 'ar' ? 'الشارات المجهزة' : 'Equipped badges'}>{equipped.map((badge) => <BadgeChip key={badge.id} badge={badge} locale={locale} compact />)}</span>
}

export function BadgeCollection({ userId, locale, editable = false }: { userId: string; locale: Locale; editable?: boolean }) {
  const { data, mutate } = useSWR<{ badges: Badge[] }>(`/api/badges/${encodeURIComponent(userId)}`, fetchBadges)
  const badges = data?.badges ?? []
  const earnedBadges = badges.filter((badge) => badge.earned)
  async function toggle(badge: Badge) {
    if (!editable || !data) return
    const equipped = data.badges.filter((item) => item.equipped).map((item) => item.id)
    const next = badge.equipped ? equipped.filter((id) => id !== badge.id) : [...equipped.slice(-2), badge.id]
    const response = await fetch(`/api/badges/${encodeURIComponent(userId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipped: next }) })
    if (response.ok) await mutate({ badges: data.badges.map((item) => ({ ...item, equipped: next.includes(item.id) })) }, false)
  }
  if (!data) return <div className="badge-list badge-list-skeleton" aria-label={locale === 'ar' ? 'جارٍ تحميل الشارات' : 'Loading badges'}><span /><span /><span /></div>
  if (!earnedBadges.length) return <p className="badge-empty">{locale === 'ar' ? 'لا توجد شارات مكتسبة بعد.' : 'No badges earned yet.'}</p>
  return <div className="badge-list">{earnedBadges.map((badge) => <article className="community-badge community-badge-earned" key={badge.id}>
    <BadgeChip badge={badge} locale={locale} />
    {editable && badge.earned && <button className="badge-equip-button" type="button" aria-pressed={badge.equipped} onClick={() => void toggle(badge)}>{badge.equipped ? (locale === 'ar' ? 'إزالة' : 'Unequip') : (locale === 'ar' ? 'تجهيز' : 'Equip')}</button>}
  </article>)}</div>
}
