'use client'

import useSWR from 'swr'
import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { ModalPortal } from '@/components/modal-portal'
import { UserName } from '@/components/user-name'
import type { FollowCounts } from '@/lib/social-follows'

type RelationshipUser = { id: string; username: string; displayName: string; avatarUrl: string | null; isNewAccount: boolean; nameStyle: string | null; customTitle: string | null; following: boolean; followsYou: boolean }
type RelationshipResponse = FollowCounts & { users: RelationshipUser[] }

class RelationshipRequestError extends Error {
  constructor(readonly reason: string) {
    super(reason)
  }
}

const fetcher = async (url: string): Promise<RelationshipResponse> => {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json() as Partial<RelationshipResponse> & { reason?: string; error?: string }
  if (!response.ok) throw new RelationshipRequestError(result.reason ?? result.error ?? `http_${response.status}`)
  return result as RelationshipResponse
}

export function RelationshipList({ userId, direction }: { userId: string; direction: 'followers' | 'following' }) {
  const { data, mutate } = useSWR<RelationshipResponse>(`/api/social/follows?userId=${encodeURIComponent(userId)}&direction=${direction}`, fetcher)
  const [busy, setBusy] = useState<string | null>(null)
  async function update(target: RelationshipUser, action: 'follow' | 'unfollow' | 'remove') {
    setBusy(target.id)
    try {
      const response = await fetch(action === 'remove' ? `/api/social/follows?followerId=${encodeURIComponent(target.id)}` : `/api/dm/follows/${encodeURIComponent(target.id)}`, { method: action === 'follow' ? 'POST' : 'DELETE' })
      if (!response.ok) throw new Error('request_failed')
      await mutate()
    } finally { setBusy(null) }
  }
  return <section className="relationship-list" aria-labelledby="relationship-list-title">
    <h1 id="relationship-list-title">{direction === 'followers' ? 'Followers' : 'Following'}</h1>
    {!data?.users.length ? <p className="section-empty">No accounts here yet.</p> : <div className="relationship-list-items">{data.users.map((user) => <article className="relationship-row" key={user.id}>
      <a href={`/u/${encodeURIComponent(user.username)}`}><span>{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : null}</span><UserName userId={user.id} name={user.displayName} username={user.username} isNewAccount={user.isNewAccount} nameStyle={user.nameStyle} customTitle={user.customTitle} /></a>
      <div className="relationship-actions">{direction === 'followers' && <button type="button" disabled={busy === user.id} onClick={() => void update(user, 'remove')}>Remove</button>}{!user.following && user.followsYou && <button type="button" disabled={busy === user.id} onClick={() => void update(user, 'follow')}>Follow back</button>}{user.following && <button type="button" disabled={busy === user.id} onClick={() => void update(user, 'unfollow')}>Unfollow</button>}</div>
    </article>)}</div>}
  </section>
}

export function RelationshipModal({ userId, viewerId, initialDirection, followersCount, followingCount, locale, onCountsChange, onClose }: {
  userId: string
  viewerId: string | null
  initialDirection: 'followers' | 'following'
  followersCount: number
  followingCount: number
  locale: 'en' | 'ar'
  onCountsChange?: (counts: FollowCounts) => void
  onClose: () => void
}) {
  const [direction, setDirection] = useState(initialDirection)
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(20)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const key = `/api/social/follows?userId=${encodeURIComponent(userId)}&direction=${direction}`
  const { data, error: loadError, isLoading, mutate } = useSWR<RelationshipResponse>(key, fetcher)
  const ownProfile = viewerId === userId
  const copy = locale === 'ar'
    ? { followers: 'المتابعون', following: 'يتابع', search: 'ابحث عن أشخاص', followsYou: 'يتابعك', follow: 'متابعة', followBack: 'متابعة متبادلة', followingButton: 'تتابعه', remove: 'إزالة', more: 'تحميل المزيد', noFollowers: 'لا يوجد متابعون بعد', noFollowing: 'لا يتابع هذا الحساب أحدًا بعد', noMatches: 'لا توجد نتائج مطابقة.', loadError: 'تعذر تحميل قائمة المتابعة.', followError: 'تعذر تحديث المتابعة.', unfollowConfirm: 'هل تريد إلغاء متابعة هذا الحساب؟', removeConfirm: 'هل تريد إزالة هذا المتابع؟', close: 'إغلاق' }
    : { followers: 'Followers', following: 'Following', search: 'Search people', followsYou: 'Follows you', follow: 'Follow', followBack: 'Follow back', followingButton: 'Following', remove: 'Remove', more: 'Load more', noFollowers: 'No followers yet', noFollowing: 'Not following anyone yet', noMatches: 'No matching people.', loadError: 'Could not load this list.', followError: 'Could not update follow status.', unfollowConfirm: 'Unfollow this account?', removeConfirm: 'Remove this follower?', close: 'Close' }
  const filteredUsers = useMemo(() => {
    const term = search.trim().replace(/^@/, '').toLocaleLowerCase()
    if (!term) return data?.users ?? []
    return (data?.users ?? []).filter((user) => `${user.displayName} ${user.username}`.toLocaleLowerCase().includes(term))
  }, [data?.users, search])
  const users = filteredUsers.slice(0, visibleCount)
  const currentCounts = {
    followersCount: data?.followersCount ?? followersCount,
    followingCount: data?.followingCount ?? followingCount,
  }

  function changeDirection(next: 'followers' | 'following') {
    setDirection(next)
    setSearch('')
    setVisibleCount(20)
    setError('')
  }

  async function update(target: RelationshipUser, action: 'follow' | 'unfollow' | 'remove') {
    if (action === 'unfollow' && !window.confirm(copy.unfollowConfirm)) return
    if (action === 'remove' && !window.confirm(copy.removeConfirm)) return
    const previousData = data
    const previousCounts = {
      followersCount: data?.followersCount ?? followersCount,
      followingCount: data?.followingCount ?? followingCount,
    }
    const countDelta = ownProfile
      ? direction === 'followers'
        ? action === 'remove' ? { followersCount: -1, followingCount: 0 } : action === 'follow' ? { followersCount: 0, followingCount: 1 } : { followersCount: 0, followingCount: 0 }
        : action === 'unfollow' ? { followersCount: 0, followingCount: -1 } : { followersCount: 0, followingCount: 0 }
      : { followersCount: 0, followingCount: 0 }
    const optimisticCounts = {
      followersCount: Math.max(0, previousCounts.followersCount + countDelta.followersCount),
      followingCount: Math.max(0, previousCounts.followingCount + countDelta.followingCount),
    }
    setBusy(target.id)
    setError('')
    try {
      if (countDelta.followersCount || countDelta.followingCount) {
        onCountsChange?.(optimisticCounts)
        if (data) await mutate({ ...data, ...optimisticCounts }, false)
      }
      const response = await fetch(action === 'remove'
        ? `/api/social/follows?followerId=${encodeURIComponent(target.id)}`
        : `/api/dm/follows/${encodeURIComponent(target.id)}`, {
        method: action === 'follow' ? 'POST' : 'DELETE',
      })
      if (!response.ok) {
        const result = await response.json() as { reason?: string; error?: string }
        throw new RelationshipRequestError(result.reason ?? result.error ?? `http_${response.status}`)
      }
      const refreshed = await mutate()
      if (refreshed) onCountsChange?.({ followersCount: refreshed.followersCount, followingCount: refreshed.followingCount })
    } catch {
      if (countDelta.followersCount || countDelta.followingCount) {
        onCountsChange?.(previousCounts)
        if (previousData) await mutate(previousData, false)
      }
      setError(copy.followError)
    } finally {
      setBusy(null)
    }
  }

  return <ModalPortal backdropClassName="relationship-modal-backdrop" dialogClassName="relationship-modal" labelId="relationship-modal-title" onClose={onClose}>
      <header className="relationship-modal-heading">
        <h2 id="relationship-modal-title">{direction === 'followers' ? copy.followers : copy.following}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={copy.close}><X aria-hidden="true" /></button>
      </header>
      <div className="relationship-modal-tabs" role="tablist" aria-label={locale === 'ar' ? 'قوائم المتابعة' : 'Relationship lists'} data-active={direction}>
        <button type="button" role="tab" aria-selected={direction === 'followers'} onClick={() => changeDirection('followers')}>{copy.followers}<span>{currentCounts.followersCount.toLocaleString(locale)}</span></button>
        <button type="button" role="tab" aria-selected={direction === 'following'} onClick={() => changeDirection('following')}>{copy.following}<span>{currentCounts.followingCount.toLocaleString(locale)}</span></button>
      </div>
      <label className="relationship-search"><Search aria-hidden="true" /><input value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(20) }} placeholder={copy.search} aria-label={copy.search} /></label>
      <div className="relationship-modal-content">
      {error && <p className="relationship-error" role="alert">{error}</p>}
      {loadError ? <div className="relationship-load-failure"><p className="relationship-error" role="alert">{copy.loadError} ({loadError instanceof RelationshipRequestError ? loadError.reason : 'network_error'})</p><button type="button" className="relationship-load-more" onClick={() => void mutate()}>{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button></div>
        : isLoading ? <div className="relationship-skeletons" role="status" aria-label={locale === 'ar' ? 'جارٍ التحميل' : 'Loading relationships'}>
        {Array.from({ length: 5 }, (_, index) => <div className="relationship-skeleton" key={index}><span /><i /><b /></div>)}
      </div> : users.length ? <>
        <ul className="relationship-modal-list">
          {users.map((user) => <li className="relationship-modal-row" key={user.id}>
            <a href={`/u/${encodeURIComponent(user.username)}`} className="relationship-person">
              <span className="relationship-avatar">{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : user.displayName.charAt(0)}</span>
              <UserName userId={user.id} name={user.displayName} username={user.username} nameStyle={user.nameStyle} customTitle={user.customTitle} locale={locale} />
              {user.followsYou && <small className="relationship-follows-you">{copy.followsYou}</small>}
            </a>
            {ownProfile && direction === 'followers'
              ? <button type="button" className="relationship-action relationship-action-secondary" disabled={busy === user.id} onClick={() => void update(user, 'remove')}>{copy.remove}</button>
              : <button type="button" className={`relationship-action ${user.following ? 'relationship-action-secondary' : ''}`} disabled={busy === user.id || (ownProfile && direction === 'following' && !user.following)} onClick={() => void update(user, user.following ? 'unfollow' : 'follow')}>
                {user.following ? copy.followingButton : user.followsYou ? copy.followBack : copy.follow}
              </button>}
          </li>)}
        </ul>
        {!filteredUsers.length && <p className="relationship-empty">{search ? copy.noMatches : direction === 'followers' ? copy.noFollowers : copy.noFollowing}</p>}
        {filteredUsers.length > visibleCount && <button type="button" className="relationship-load-more" onClick={() => setVisibleCount((count) => count + 20)}>{copy.more}</button>}
      </> : <p className="relationship-empty">{search ? copy.noMatches : direction === 'followers' ? copy.noFollowers : copy.noFollowing}</p>}
      </div>
  </ModalPortal>
}
