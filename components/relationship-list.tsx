'use client'

import useSWR from 'swr'
import { useState } from 'react'

type RelationshipUser = { id: string; username: string; displayName: string; avatarUrl: string | null; following: boolean; followsYou: boolean }
const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then(async (response) => { if (!response.ok) throw new Error('request_failed'); return response.json() as Promise<{ users: RelationshipUser[] }> })

export function RelationshipList({ userId, direction }: { userId: string; direction: 'followers' | 'following' }) {
  const { data, mutate } = useSWR(`/api/social/follows?userId=${encodeURIComponent(userId)}&direction=${direction}`, fetcher)
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
      <a href={`/u/${encodeURIComponent(user.username)}`}><span>{user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : null}</span><strong>{user.displayName}</strong><small dir="ltr">@{user.username}</small></a>
      <div className="relationship-actions">{direction === 'followers' && <button type="button" disabled={busy === user.id} onClick={() => void update(user, 'remove')}>Remove</button>}{!user.following && user.followsYou && <button type="button" disabled={busy === user.id} onClick={() => void update(user, 'follow')}>Follow back</button>}{user.following && <button type="button" disabled={busy === user.id} onClick={() => void update(user, 'unfollow')}>Unfollow</button>}</div>
    </article>)}</div>}
  </section>
}
