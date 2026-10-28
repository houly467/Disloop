'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Bookmark, Check, Video } from 'lucide-react'
import { RichText } from '@/components/mention-textarea'
import { UserName } from '@/components/user-name'
import { Button } from '@/components/ui/button'
import type { CurrentUser } from '@/lib/session'

type SavedItem = {
  type: 'news' | 'reel'
  savedAt: string
  item: {
    id: string
    authorId: string
    title?: string
    body?: string
    category?: string
    coverUrl?: string | null
    videoUrl?: string
    caption?: string
    createdAt: string
    authorName: string | null
    authorUsername: string | null
    authorAvatar: string | null
    authorNameStyle: string | null
    authorCustomTitle: string | null
  }
}
type SavedResponse = { bookmarks: SavedItem[]; available: boolean }

async function fetchSaved(url: string): Promise<SavedResponse> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('saved_items_failed')
  return response.json()
}

export function SavedSection({ viewer, locale }: { viewer: CurrentUser | null; locale: 'en' | 'ar' }) {
  const copy = locale === 'ar'
    ? { title: 'المحفوظات', description: 'منشوراتك ومقاطعك المحفوظة خاصة بك.', empty: 'لا توجد عناصر محفوظة بعد.', unavailable: 'المحفوظات غير متاحة حتى يتم تطبيق تحديث قاعدة البيانات.', remove: 'إزالة من المحفوظات', error: 'تعذر تحديث العنصر المحفوظ.' }
    : { title: 'Saved', description: 'Your saved posts and Reels are private to you.', empty: 'Nothing saved yet.', unavailable: 'Saved items are unavailable until the database update is applied.', remove: 'Remove from saved items', error: 'Could not update this saved item.' }
  const { data, error, mutate } = useSWR(viewer ? '/api/social/bookmarks' : null, fetchSaved)
  const [updateError, setUpdateError] = useState('')

  async function unsave(item: SavedItem) {
    const previous = data
    if (!previous) return
    await mutate({ ...previous, bookmarks: previous.bookmarks.filter((entry) => entry.item.id !== item.item.id || entry.type !== item.type) }, false)
    setUpdateError('')
    try {
      const response = await fetch('/api/social/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: item.type, contentId: item.item.id, saved: false }),
      })
      if (!response.ok) throw new Error('bookmark_update_failed')
    } catch {
      await mutate(previous, false)
      console.error('[social-bookmarks] could not remove saved item', { contentType: item.type, contentId: item.item.id })
      setUpdateError(copy.error)
    }
  }

  return <section className="section-view saved-section" aria-labelledby="saved-section-title" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <div className="section-heading"><span className="section-kicker"><Bookmark aria-hidden="true" />{copy.title}</span><h1 id="saved-section-title">{copy.title}</h1><p>{copy.description}</p></div>
    {!viewer ? <div className="section-empty"><h2>{locale === 'ar' ? 'سجّل الدخول لعرض المحفوظات.' : 'Log in to view your saved items.'}</h2></div>
      : error ? <div className="section-empty"><h2>{copy.error}</h2></div>
        : data?.available === false ? <div className="section-empty"><h2>{copy.unavailable}</h2></div>
          : data?.bookmarks.length ? <>{updateError && <p className="profile-action-error" role="alert">{updateError}</p>}<div className="saved-card-grid">{data.bookmarks.map((saved) => <article className="search-post saved-content-card" key={`${saved.type}-${saved.item.id}`}>
            <div className="saved-content-author">
              {saved.item.authorAvatar ? <img src={saved.item.authorAvatar} alt="" /> : <span>{saved.item.authorName?.charAt(0) ?? '?'}</span>}
              <a href={`/u/${encodeURIComponent(saved.item.authorUsername ?? '')}`}><UserName userId={saved.item.authorId} name={saved.item.authorName ?? 'Disloop Community'} username={saved.item.authorUsername ?? 'community-team'} nameStyle={saved.item.authorNameStyle} customTitle={saved.item.authorCustomTitle} locale={locale} /></a>
              <Button type="button" variant="ghost" size="icon" aria-label={copy.remove} title={copy.remove} onClick={() => void unsave(saved)}><Check aria-hidden="true" /></Button>
            </div>
            {saved.type === 'news'
              ? <><span className="category-pill">{saved.item.category}</span><h2>{saved.item.title}</h2><p><RichText text={saved.item.body ?? ''} /></p>{saved.item.coverUrl && <img className="saved-content-cover" src={saved.item.coverUrl} alt="" />}</>
              : <><h2>{saved.item.caption || copy.title}</h2><video className="profile-reel-player" controls playsInline preload="metadata" src={saved.item.videoUrl} aria-label={saved.item.caption || copy.title} /><Video aria-hidden="true" /></>}
            <small>{new Date(saved.savedAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}</small>
          </article>)}</div></>
          : data && <div className="section-empty"><Bookmark aria-hidden="true" /><h2>{copy.empty}</h2></div>}
  </section>
}
