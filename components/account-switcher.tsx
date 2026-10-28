'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Bookmark, ChevronDown, CircleUserRound, Plus, UserRound } from 'lucide-react'
import type { CurrentUser } from '@/lib/session'
import type { PresenceStatus } from '@/lib/profile'
import { UserName } from '@/components/user-name'

const labels = {
  en: { status: 'Status', accounts: 'Accounts', link: 'Link another account', saved: 'Saved', online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', invisible: 'Invisible', error: 'Could not update your account.' },
  ar: { status: 'الحالة', accounts: 'الحسابات', link: 'ربط حساب آخر', saved: 'المحفوظات', online: 'متصل', idle: 'خامل', dnd: 'عدم الإزعاج', invisible: 'مخفي', error: 'تعذر تحديث الحساب.' },
} as const

type Account = Pick<CurrentUser, 'id' | 'displayName' | 'username' | 'avatarUrl' | 'presenceStatus'> & { isNewAccount?: boolean }
type AccountResponse = { activeAccountId: string; accounts: Account[] }

async function fetchAccounts(url: string): Promise<AccountResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('accounts_failed')
  return response.json()
}

export function AccountSwitcher({ user, locale, nameStyle, customTitle }: {
  user: CurrentUser & { isNewAccount?: boolean }
  locale: 'en' | 'ar'
  nameStyle: string | null
  customTitle: string | null
}) {
  const copy = labels[locale]
  const [status, setStatus] = useState<PresenceStatus>(user.presenceStatus)
  const [error, setError] = useState('')
  const { data, mutate } = useSWR('/api/accounts', fetchAccounts)
  const accounts = data?.accounts ?? [{ id: user.id, displayName: user.displayName, username: user.username, avatarUrl: user.avatarUrl, presenceStatus: user.presenceStatus, isNewAccount: user.isNewAccount }]

  async function updateStatus(value: string) {
    const nextStatus = value as PresenceStatus
    setStatus(nextStatus)
    setError('')
    try {
      const response = await fetch('/api/presence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) throw new Error('presence_failed')
      await mutate()
    } catch {
      setStatus(user.presenceStatus)
      setError(copy.error)
    }
  }

  async function switchAccount(accountId: string) {
    if (accountId === user.id) return
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })
      if (!response.ok) throw new Error('switch_failed')
      window.location.reload()
    } catch {
      setError(copy.error)
    }
  }

  return (
    <details className="account-switcher">
      <summary aria-label={locale === 'ar' ? 'الحساب والحالة' : 'Account and presence'}>
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span className="account-avatar-fallback"><UserRound aria-hidden="true" /></span>}
        <span className={`presence-indicator presence-${status}`} aria-label={copy[status]} />
        <span className="account-switcher-copy"><UserName userId={user.id} name={user.displayName} username={user.username} isNewAccount={user.isNewAccount} nameStyle={nameStyle} customTitle={customTitle} locale={locale} compact /></span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="account-switcher-panel">
        <label htmlFor="presence-status">{copy.status}</label>
        <select id="presence-status" value={status} onChange={(event) => void updateStatus(event.target.value)}>
          {(['online', 'idle', 'dnd', 'invisible'] as const).map((value) => <option value={value} key={value}>{copy[value]}</option>)}
        </select>
        <a className="account-link-action" href="/?section=saved"><Bookmark aria-hidden="true" />{copy.saved}</a>
        <span className="account-switcher-label">{copy.accounts}</span>
        {accounts.map((account) => (
          <button className="linked-account-option" key={account.id} type="button" aria-current={account.id === user.id ? 'true' : undefined} onClick={() => void switchAccount(account.id)}>
            {account.avatarUrl ? <img src={account.avatarUrl} alt="" /> : <CircleUserRound aria-hidden="true" />}
            <span>{account.id === user.id
              ? <UserName userId={user.id} name={user.displayName} username={user.username} isNewAccount={account.isNewAccount ?? false} nameStyle={nameStyle} customTitle={customTitle} locale={locale} compact />
              : <><strong>{account.displayName}</strong><small dir="ltr">@{account.username}</small></>}
            </span>
            {account.id === user.id && <span className="account-active-mark" aria-label={locale === 'ar' ? 'نشط' : 'Active'} />}
          </button>
        ))}
        <a className="account-link-action" href="/auth/login?mode=link"><Plus aria-hidden="true" />{copy.link}</a>
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}
