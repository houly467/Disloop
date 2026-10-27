'use client'

import { Crown } from 'lucide-react'
import { EquippedBadges } from '@/components/badge-display'
import { NewAccountBadge } from '@/components/new-account-badge'

export type UserFlair = {
  nameStyle?: string | null
  customTitle?: string | null
}

export function UserName({ userId, name, username, createdAt, nameStyle, customTitle, locale = 'en' }: {
  userId?: string
  name: string
  username?: string
  createdAt?: string | null
  nameStyle?: string | null
  customTitle?: string | null
  locale?: 'en' | 'ar'
}) {
  const validStyle = nameStyle === 'rainbow' || nameStyle === 'gold' ? nameStyle : undefined
  return (
    <span className="user-name-wrap">
      <span className={`user-name${validStyle ? ` user-name-${validStyle}` : ''}`}>{name}<NewAccountBadge createdAt={createdAt} locale={locale} /></span>
      {customTitle && <span className="user-name-title"><Crown aria-hidden="true" />{customTitle}</span>}
      {username && <small className="user-name-handle" dir="ltr">@{username}</small>}
      {userId && <EquippedBadges userId={userId} locale={locale} />}
    </span>
  )
}
