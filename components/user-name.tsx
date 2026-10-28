'use client'

import { Crown } from 'lucide-react'
import { EquippedBadges } from '@/components/badge-display'
import { NewAccountBadge } from '@/components/new-account-badge'

export type UserFlair = {
  nameStyle?: string | null
  customTitle?: string | null
}

export function UserName({ userId, name, username, isNewAccount = false, nameStyle, customTitle, locale = 'en', compact = false }: {
  userId?: string
  name: string
  username?: string
  isNewAccount?: boolean
  nameStyle?: string | null
  customTitle?: string | null
  locale?: 'en' | 'ar'
  compact?: boolean
}) {
  const validStyle = nameStyle === 'rainbow' || nameStyle === 'gold' ? nameStyle : undefined
  return (
    <span className={`user-name-wrap${compact ? ' user-name-wrap-compact' : ''}`}>
      <span className={`user-name${validStyle ? ` user-name-${validStyle}` : ''}`}><span className="user-name-text">{name}</span>{!compact && <NewAccountBadge isNew={isNewAccount} locale={locale} />}</span>
      {compact ? <>
        <span className="user-name-meta">
          {username && <small className="user-name-handle" dir="ltr">@{username}</small>}
          {customTitle && <span className="user-name-title"><Crown aria-hidden="true" />{customTitle}</span>}
          {userId && <EquippedBadges userId={userId} locale={locale} />}
        </span>
        <NewAccountBadge isNew={isNewAccount} locale={locale} />
      </> : <>
        {customTitle && <span className="user-name-title"><Crown aria-hidden="true" />{customTitle}</span>}
        {username && <small className="user-name-handle" dir="ltr">@{username}</small>}
        {userId && <EquippedBadges userId={userId} locale={locale} />}
      </>}
    </span>
  )
}
