'use client'

import { useMemo, useState } from 'react'
import useSWR, { mutate } from 'swr'
import { Bell, Check, Heart, MessageCircle, Repeat2, UserPlus, X } from 'lucide-react'
import { UserName } from '@/components/user-name'
import type { CurrentUser } from '@/lib/session'

type Locale = 'en' | 'ar'
type Notification = {
  id: string
  type: string
  targetType: string
  targetId: string
  createdAt: string
  readAt: string | null
  actorId: string
  actorName: string
  actorUsername: string
  actorAvatar: string | null
  actorCreatedAt: string
  actorIsNewAccount: boolean
  actorNameStyle: string | null
  actorCustomTitle: string | null
  viewerFollowingActor: boolean
  groupInvite: { name: string | null; tag: string | null } | null
}
type NotificationData = { unreadCount: number; notifications: Notification[]; nextCursor: string | null }

async function fetchNotifications(url: string): Promise<NotificationData> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('notifications_failed')
  return response.json() as Promise<NotificationData>
}

const copy = {
  en: { title: 'Notifications', description: 'The latest activity around your community.', readAll: 'Mark all as read', empty: 'You’re all caught up.', follow: 'followed you', reply: 'replied to your comment', mention: 'mentioned you', repost: 'reposted your content', like: 'liked your Reel', andOthers: 'and {count} others', followBack: 'Follow back', following: 'Following', invitesDisabled: 'Group invitations are disabled. Join a group from the groups directory.', dismiss: 'Dismiss notification', loadEarlier: 'Load earlier notifications', error: 'Could not load notifications.' },
  ar: { title: 'الإشعارات', description: 'أحدث التفاعلات في مجتمعك.', readAll: 'تحديد الكل كمقروء', empty: 'أنت على اطلاع بكل شيء.', follow: 'بدأ بمتابعتك', reply: 'رد على تعليقك', mention: 'أشار إليك', repost: 'أعاد نشر محتواك', like: 'أعجب بالريلز الخاصة بك', andOthers: 'و{count} آخرين', followBack: 'متابعة أيضًا', following: 'تتابعه', invitesDisabled: 'دعوات المجموعات معطلة. انضم إلى مجموعة من دليل المجموعات.', dismiss: 'إخفاء الإشعار', loadEarlier: 'تحميل إشعارات سابقة', error: 'تعذر تحميل الإشعارات.' },
} satisfies Record<Locale, Record<string, string>>

function notificationText(type: string, locale: Locale) {
  const labels = copy[locale]
  if (type === 'follow') return labels.follow
  if (type === 'comment_reply') return labels.reply
  if (type === 'mention') return labels.mention
  if (type === 'repost') return labels.repost
  if (type === 'like') return labels.like
  return type === 'group_invite' ? labels.invitesDisabled : (locale === 'ar' ? 'تفاعل مع رسالتك' : 'reacted to your message')
}

function iconFor(type: string) {
  if (type === 'follow') return UserPlus
  if (type === 'comment_reply' || type === 'mention') return MessageCircle
  if (type === 'repost') return Repeat2
  return Heart
}

export function NotificationsSection({ viewer, locale, onSignIn }: { viewer: CurrentUser | null; locale: Locale; onSignIn: () => void }) {
  const labels = copy[locale]
  const [busyActorId, setBusyActorId] = useState<string | null>(null)
  const { data, error, mutate: refresh } = useSWR<NotificationData>(viewer ? '/api/notifications' : null, fetchNotifications, { refreshInterval: 15000 })
  const items = data?.notifications ?? []
  const grouped = useMemo(() => {
    const groups = new Map<string, Notification[]>()
    for (const item of items) {
      const key = item.type === 'like' ? `${item.type}:${item.targetType}:${item.targetId}` : item.id
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    return [...groups.values()]
  }, [items])

  async function markRead(id: string) {
    await fetch(`/api/notifications/${encodeURIComponent(id)}`, { method: 'PATCH', keepalive: true })
    await Promise.all([refresh(), mutate('/api/notifications?summary=1')])
  }

  async function dismissGroup(group: Notification[]) {
    const results = await Promise.all(group.map((item) => fetch(`/api/notifications/${encodeURIComponent(item.id)}`, { method: 'DELETE' })))
    if (results.every((response) => response.ok)) await Promise.all([refresh(), mutate('/api/notifications?summary=1')])
  }

  async function followBack(item: Notification) {
    setBusyActorId(item.actorId)
    try {
      const response = await fetch(`/api/dm/follows/${encodeURIComponent(item.actorId)}`, { method: 'POST' })
      if (!response.ok) return
      await Promise.all([refresh(), mutate('/api/notifications?summary=1')])
    } finally {
      setBusyActorId(null)
    }
  }

  async function markAllRead() {
    const response = await fetch('/api/notifications/read', { method: 'POST' })
    if (response.ok) await Promise.all([refresh(), mutate('/api/notifications?summary=1')])
  }


  if (!viewer) return <section className="section-view notifications-view"><div className="section-heading"><span className="section-kicker"><Bell aria-hidden="true" />{labels.title}</span><h1>{labels.title}</h1><p>{locale === 'ar' ? 'سجّل الدخول للاطلاع على نشاط حسابك.' : 'Sign in to see activity on your account.'}</p></div><button className="section-primary-button" type="button" onClick={onSignIn}>{locale === 'ar' ? 'تسجيل الدخول عبر Discord' : 'Log in with Discord'}</button></section>

  return (
    <section className="section-view notifications-view" aria-labelledby="notifications-title">
      <div className="section-heading notifications-heading"><span className="section-kicker"><Bell aria-hidden="true" />{labels.title}</span><h1 id="notifications-title">{labels.title}</h1><p>{labels.description}</p>{Boolean(data?.unreadCount) && <button type="button" className="section-secondary-button" onClick={() => void markAllRead()}><Check aria-hidden="true" />{labels.readAll}</button>}</div>
      {error && <p className="social-error" role="alert">{labels.error}</p>}
      {!grouped.length ? <div className="section-empty"><span className="section-empty-icon"><Bell aria-hidden="true" /></span><h2>{labels.empty}</h2></div> : (
        <div className="notification-list">
          {grouped.map((group) => {
            const first = group[0]
            const Icon = iconFor(first.type)
            const contentTarget = first.targetType === 'news' || first.targetType === 'reel' || first.targetType === 'daily'
            const href = first.type === 'follow' || first.targetType === 'profile'
              ? `/u/${encodeURIComponent(first.actorUsername)}`
              : contentTarget
                ? `/#${first.targetType}-${encodeURIComponent(first.targetId)}`
                : `/?notification=${encodeURIComponent(first.targetId)}`
            const text = first.type === 'like' && group.length > 1 ? `${labels.like} · ${labels.andOthers.replace('{count}', String(group.length - 1))}` : notificationText(first.type, locale)
            return <article className={`notification-item ${first.readAt ? '' : 'notification-item-unread'}`} key={first.id}>
              <a className="notification-main" href={href} onClick={() => void markRead(first.id)}>
                <span className="notification-icon"><Icon aria-hidden="true" /></span>
                <span className="notification-actor-avatar">{first.actorAvatar ? <img src={first.actorAvatar} alt="" /> : <span>{first.actorName.charAt(0)}</span>}</span>
                <span className="notification-copy"><UserName userId={first.actorId} name={first.actorName} username={first.actorUsername} isNewAccount={first.actorIsNewAccount} nameStyle={first.actorNameStyle} customTitle={first.actorCustomTitle} locale={locale} /><span>{text}{first.groupInvite?.name ? ` · ${first.groupInvite.name}${first.groupInvite.tag ? ` · #${first.groupInvite.tag}` : ''}` : ''}</span><time dateTime={first.createdAt}>{new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(first.createdAt))}</time></span>
                {!first.readAt && <span className="notification-unread-dot" aria-label={locale === 'ar' ? 'غير مقروء' : 'Unread'} />}
              </a>
              {first.type === 'follow' && <button className="notification-follow-button" type="button" disabled={first.viewerFollowingActor || busyActorId === first.actorId} onClick={() => void followBack(first)}>{first.viewerFollowingActor ? labels.following : labels.followBack}</button>}
              <button className="notification-dismiss-button" type="button" aria-label={`${labels.dismiss}: ${first.actorName}`} onClick={() => void dismissGroup(group)}><X aria-hidden="true" /></button>
            </article>
          })}
          {data?.nextCursor && <button className="social-load-older" type="button" onClick={async () => {
            const older = await fetchNotifications(`/api/notifications?before=${encodeURIComponent(data.nextCursor!)}`)
            await refresh((current) => current ? { ...current, notifications: [...current.notifications, ...older.notifications], nextCursor: older.nextCursor } : older, false)
          }}>{labels.loadEarlier}</button>}
        </div>
      )}
    </section>
  )
}
