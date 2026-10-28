'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, LoaderCircle, Pin, Play, Repeat2, Video, X } from 'lucide-react'
import { ModalPortal } from '@/components/modal-portal'
import { PostEngagement } from '@/components/post-engagement'
import { RichText } from '@/components/mention-textarea'
import type { CurrentUser } from '@/lib/session'
import type { PublicProfile } from '@/lib/users'

type Locale = 'en' | 'ar'
type Tab = 'posts' | 'reposts' | 'reels'
type ReelSort = 'newest' | 'viewed' | 'liked'
type Profile = (CurrentUser & { isNewAccount?: boolean; nameStyle?: string | null; customTitle?: string | null }) | PublicProfile
type NewsEntry = { id: string; authorId: string; title: string; body: string; category: string; tags: string[]; createdAt: string }
type RepostEntry = {
  id: string
  type: 'news' | 'reel'
  createdAt: string
  title: string | null
  body: string | null
  caption: string | null
  coverUrl: string | null
  videoUrl: string | null
  authorId: string
  authorName: string
  authorUsername: string
}
type ReelEntry = {
  id: string
  authorId: string
  videoUrl: string
  caption: string
  coverPath: string | null
  coverUrl: string | null
  isPinned: boolean
  createdAt: string
  viewCount: number
  likeCount: number
}
type Entry = NewsEntry | RepostEntry | ReelEntry
type Page = { entries: Entry[]; totalCount: number; hasMore: boolean }
type Stats = { posts: number; reels: number }
type PageState = { entries: Entry[]; totalCount: number; hasMore: boolean; loaded: boolean; loading: boolean; error: boolean }

const TABS: Tab[] = ['posts', 'reposts', 'reels']
const copy = {
  en: {
    tabs: { posts: 'Posts', reposts: 'Reposts', reels: 'Reels' },
    empty: { posts: 'No posts yet', reposts: 'No reposts yet', reels: 'No reels yet' },
    loading: 'Loading profile content…',
    loadMore: 'Load more',
    retry: 'Retry',
    sorting: 'Sort reels',
    sort: { newest: 'Newest', viewed: 'Most viewed', liked: 'Most liked' },
    followers: 'Followers',
    following: 'Following',
    posts: 'Posts',
    reels: 'Reels',
    views: 'views',
    noThumbnail: 'Reel thumbnail unavailable',
    play: 'Play reel',
    close: 'Close reel viewer',
    previous: 'Previous reel',
    next: 'Next reel',
    reposted: 'Reposted',
    from: 'Originally by',
    pinned: 'Pinned reel',
    pin: 'Pin reel',
    unpin: 'Unpin reel',
    pinLimit: 'You can pin up to 3 reels.',
    pinError: 'Could not update the pinned reel.',
    pinUnavailable: 'Reel pinning is unavailable until the database update is applied.',
  },
  ar: {
    tabs: { posts: 'المنشورات', reposts: 'إعادات النشر', reels: 'ريلز' },
    empty: { posts: 'لا توجد منشورات بعد', reposts: 'لا توجد إعادات نشر بعد', reels: 'لا توجد ريلز بعد' },
    loading: 'جارٍ تحميل محتوى الملف…',
    loadMore: 'تحميل المزيد',
    retry: 'إعادة المحاولة',
    sorting: 'ترتيب الريلز',
    sort: { newest: 'الأحدث', viewed: 'الأكثر مشاهدة', liked: 'الأكثر إعجابًا' },
    followers: 'المتابعون',
    following: 'يتابع',
    posts: 'المنشورات',
    reels: 'ريلز',
    views: 'مشاهدة',
    noThumbnail: 'الصورة المصغرة غير متاحة',
    play: 'تشغيل الريل',
    close: 'إغلاق مشغل الريل',
    previous: 'الريل السابق',
    next: 'الريل التالي',
    reposted: 'أعاد النشر',
    from: 'الناشر الأصلي',
    pinned: 'ريل مثبت',
    pin: 'تثبيت الريل',
    unpin: 'إلغاء تثبيت الريل',
    pinLimit: 'يمكنك تثبيت ٣ ريلز كحد أقصى.',
    pinError: 'تعذر تحديث الريل المثبت.',
    pinUnavailable: 'ميزة تثبيت الريلز غير متاحة حتى تطبيق تحديث قاعدة البيانات.',
  },
} as const

const emptyPage = (): PageState => ({ entries: [], totalCount: 0, hasMore: false, loaded: false, loading: false, error: false })

function isReel(entry: Entry): entry is ReelEntry {
  return 'videoUrl' in entry && 'viewCount' in entry
}

function isRepost(entry: Entry): entry is RepostEntry {
  return 'type' in entry
}

async function fetchPage(profileId: string, tab: Tab, offset: number, sort: ReelSort, signal?: AbortSignal): Promise<Page> {
  const query = new URLSearchParams({ tab, offset: String(offset) })
  if (tab === 'reels') query.set('sort', sort)
  const response = await fetch(`/api/profile/${encodeURIComponent(profileId)}/content?${query}`, { cache: 'no-store', signal })
  const result = await response.json() as Page & { error?: string }
  if (!response.ok) throw new Error(result.error ?? 'profile_content_unavailable')
  return result
}

export function ProfileContentTabs({
  profile,
  viewer,
  locale,
  editable,
  onSignIn,
  followerCount,
  followingCount,
  onOpenRelationship,
  pinPostId,
  canPinPost,
  onTogglePostPin,
}: {
  profile: Profile
  viewer?: CurrentUser | null
  locale: Locale
  editable: boolean
  onSignIn: () => void
  followerCount: number
  followingCount: number
  onOpenRelationship: (direction: 'followers' | 'following') => void
  pinPostId?: string | null
  canPinPost: boolean
  onTogglePostPin?: (postId: string) => void
}) {
  const labels = copy[locale]
  const [activeTab, setActiveTab] = useState<Tab>('posts')
  const [sort, setSort] = useState<ReelSort>('newest')
  const [pages, setPages] = useState<Record<string, PageState>>({})
  const [busyReelId, setBusyReelId] = useState<string | null>(null)
  const [pinError, setPinError] = useState('')
  const [pinUnavailable, setPinUnavailable] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const requestId = useRef(0)
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const pageKey = activeTab === 'reels' ? `${activeTab}:${sort}` : activeTab
  const page = pages[pageKey] ?? emptyPage()
  const profileContentPath = `/api/profile/${encodeURIComponent(profile.id)}/content`

  const loadPage = useCallback(async (tab: Tab, selectedSort: ReelSort, append: boolean, signal?: AbortSignal) => {
    const key = tab === 'reels' ? `${tab}:${selectedSort}` : tab
    const current = pagesRef.current[key] ?? emptyPage()
    const id = ++requestId.current
    setPages((state) => ({ ...state, [key]: { ...current, loading: true, error: false } }))
    try {
      const result = await fetchPage(profile.id, tab, append ? current.entries.length : 0, selectedSort, signal)
      if (id !== requestId.current || signal?.aborted) return
      setPages((state) => ({
        ...state,
        [key]: {
          entries: append ? [...current.entries, ...result.entries] : result.entries,
          totalCount: result.totalCount,
          hasMore: result.hasMore,
          loaded: true,
          loading: false,
          error: false,
        },
      }))
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
      if (id !== requestId.current) return
      console.error('[profile-content] page load failed', { profileId: profile.id, tab, error })
      setPages((state) => ({ ...state, [key]: { ...current, loading: false, error: true } }))
    }
  }, [profile.id])

  useEffect(() => {
    const tabFromHash = () => {
      const hash = window.location.hash.slice(1)
      if (TABS.includes(hash as Tab)) setActiveTab(hash as Tab)
    }
    tabFromHash()
    window.addEventListener('hashchange', tabFromHash)
    window.addEventListener('popstate', tabFromHash)
    return () => {
      window.removeEventListener('hashchange', tabFromHash)
      window.removeEventListener('popstate', tabFromHash)
    }
  }, [])

  useEffect(() => {
    const current = pagesRef.current[pageKey]
    if (current?.loaded || current?.loading) return
    const controller = new AbortController()
    void loadPage(activeTab, sort, false, controller.signal)
    return () => controller.abort()
  }, [activeTab, loadPage, pageKey, sort])

  function selectTab(tab: Tab) {
    if (tab === activeTab) return
    setActiveTab(tab)
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}#${tab}`)
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const direction = locale === 'ar' ? -1 : 1
    const nextIndex = event.key === 'ArrowRight'
      ? (currentIndex + direction + TABS.length) % TABS.length
      : event.key === 'ArrowLeft'
        ? (currentIndex - direction + TABS.length) % TABS.length
        : -1
    if (nextIndex < 0) return
    event.preventDefault()
    tabRefs.current[nextIndex]?.focus()
    selectTab(TABS[nextIndex])
  }

  async function loadMore() {
    if (page.loading || !page.hasMore) return
    await loadPage(activeTab, sort, true)
  }

  const reels = useMemo(() => page.entries.filter(isReel), [page.entries])
  const [viewerError, setViewerError] = useState('')
  const activeReel = viewerIndex === null ? null : reels[viewerIndex] ?? null

  useEffect(() => {
    if (!activeReel) return
    const handleViewerKeys = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') setViewerIndex((index) => index === null ? null : Math.min(index + 1, reels.length - 1))
      if (event.key === 'ArrowUp') setViewerIndex((index) => index === null ? null : Math.max(0, index - 1))
      if (event.key === 'Escape') setViewerIndex(null)
    }
    window.addEventListener('keydown', handleViewerKeys)
    return () => window.removeEventListener('keydown', handleViewerKeys)
  }, [activeReel, reels.length])

  async function togglePinnedReel(reel: ReelEntry) {
    if (!editable || busyReelId) return
    setBusyReelId(reel.id)
    setPinError('')
    setPinUnavailable(false)
    const previous = pagesRef.current[pageKey] ?? emptyPage()
    setPages((state) => ({
      ...state,
      [pageKey]: { ...previous, entries: previous.entries.map((entry) => isReel(entry) && entry.id === reel.id ? { ...entry, isPinned: !reel.isPinned } : entry) },
    }))
    try {
      const response = await fetch(`/api/reels/${encodeURIComponent(reel.id)}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !reel.isPinned }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) {
        if (result.error === 'reel_pin_limit_reached') setPinError(labels.pinLimit)
        else if (response.status === 404 || response.status === 500) setPinUnavailable(true)
        else setPinError(labels.pinError)
        throw new Error(result.error ?? 'pin_failed')
      }
      await loadPage('reels', sort, false)
    } catch (error) {
      console.error('[profile-content] reel pin request failed', { reelId: reel.id, error })
      setPages((state) => ({ ...state, [pageKey]: previous }))
      if (!pinUnavailable && !pinError) setPinError(labels.pinError)
    } finally {
      setBusyReelId(null)
    }
  }

  const statsKey = `${profileContentPath}?tab=stats`
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void fetch(statsKey, { cache: 'force-cache', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('profile_stats_failed')
        return response.json() as Promise<Stats>
      })
      .then(setStats)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('[profile-content] profile stats load failed', { profileId: profile.id, error })
        }
      })
    return () => controller.abort()
  }, [profile.id, statsKey])

  return (
    <>
      <section className="profile-posts" aria-label={locale === 'ar' ? 'محتوى الملف الشخصي' : 'Profile content'}>
        <div className="profile-content-tabs" role="tablist" aria-label={locale === 'ar' ? 'محتوى الملف الشخصي' : 'Profile content'} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
          {TABS.map((tab, index) => <button
            type="button"
            role="tab"
            id={`profile-tab-${tab}`}
            aria-controls={`profile-panel-${tab}`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            key={tab}
            ref={(element) => { tabRefs.current[index] = element }}
            className={activeTab === tab ? 'profile-content-tab profile-content-tab-active' : 'profile-content-tab'}
            onClick={() => selectTab(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >{labels.tabs[tab]}</button>)}
          <span className="profile-content-tab-indicator" aria-hidden="true" style={{ transform: `translateX(${(locale === 'ar' ? -1 : 1) * TABS.indexOf(activeTab) * 100}%)` }} />
        </div>
        <div id={`profile-panel-${activeTab}`} role="tabpanel" aria-labelledby={`profile-tab-${activeTab}`} className="profile-tab-panel">
          {activeTab === 'reels' && <div className="profile-reel-toolbar">
            <label htmlFor="profile-reel-sort">{labels.sorting}</label>
            <select id="profile-reel-sort" value={sort} onChange={(event) => setSort(event.target.value as ReelSort)}>
              <option value="newest">{labels.sort.newest}</option>
              <option value="viewed">{labels.sort.viewed}</option>
              <option value="liked">{labels.sort.liked}</option>
            </select>
          </div>}
          {page.error && <div className="profile-content-error" role="alert"><p>{labels.loading}</p><button type="button" onClick={() => void loadPage(activeTab, sort, false)}>{labels.retry}</button></div>}
          {!page.loaded && page.loading ? <div className="profile-content-skeleton" role="status" aria-label={labels.loading}>{Array.from({ length: 6 }, (_, index) => <span key={index} />)}</div>
            : activeTab === 'posts'
              ? page.entries.length ? <div className="news-list">{page.entries.filter((entry): entry is NewsEntry => !isReel(entry) && !isRepost(entry)).map((post) => <article className="search-post" key={post.id}>
                <span className="category-pill">{post.category}</span>
                {editable && canPinPost && <button className="profile-pin-button" type="button" aria-pressed={pinPostId === post.id} onClick={() => onTogglePostPin?.(post.id)}><Pin aria-hidden="true" />{pinPostId === post.id ? 'Unpin post' : 'Pin post'}</button>}
                <h3>{post.title}</h3><p><RichText text={post.body} /></p>
                <PostEngagement type="news" contentId={post.id} authorId={profile.id} viewer={viewer ?? null} locale={locale} onSignIn={onSignIn} />
              </article>)}</div> : page.loaded && <div className="section-empty profile-empty"><span className="section-empty-icon"><Video aria-hidden="true" /></span><h2>{labels.empty.posts}</h2></div>
              : activeTab === 'reposts'
                ? page.entries.length ? <div className="news-list">{page.entries.filter(isRepost).map((repost) => <article className="search-post profile-repost-card" key={`${repost.type}-${repost.id}`}>
                  <span className="profile-repost-label"><Repeat2 aria-hidden="true" />{labels.reposted}</span>
                  <span className="category-pill">{repost.type === 'reel' ? labels.reels : 'News'}</span>
                  <h3>{repost.type === 'reel' ? repost.caption || labels.reels : repost.title || 'News'}</h3>
                  {repost.type === 'news' && repost.body && <p><RichText text={repost.body} /></p>}
                  <a className="profile-repost-original" href={`/#${repost.type}-${repost.id}`}>{labels.from} @{repost.authorUsername}</a>
                </article>)}</div> : page.loaded && <div className="section-empty profile-empty"><span className="section-empty-icon"><Repeat2 aria-hidden="true" /></span><h2>{labels.empty.reposts}</h2></div>
                : page.entries.length ? <div className="profile-reel-grid">{reels.map((reel, index) => <article className="profile-reel-tile" key={reel.id}>
                  <button type="button" className="profile-reel-open" aria-label={`${labels.play}: ${reel.caption || labels.reels}`} onClick={() => { setViewerError(''); setViewerIndex(index) }}>
                    {reel.coverUrl ? <img src={reel.coverUrl} alt="" loading="lazy" decoding="async" /> : <span className="profile-reel-placeholder"><Video aria-hidden="true" /><small>{labels.noThumbnail}</small></span>}
                    <span className="profile-reel-play"><Play aria-hidden="true" fill="currentColor" /></span>
                    <span className="profile-reel-views">{reel.viewCount.toLocaleString(locale === 'ar' ? 'ar' : 'en-US')} {labels.views}</span>
                    {reel.isPinned && <span className="profile-reel-pinned" aria-label={labels.pinned}><Pin aria-hidden="true" /></span>}
                  </button>
                  {editable && <button type="button" className="profile-reel-pin-button" aria-label={reel.isPinned ? labels.unpin : labels.pin} aria-pressed={reel.isPinned} disabled={busyReelId === reel.id} onClick={() => void togglePinnedReel(reel)}>{busyReelId === reel.id ? <LoaderCircle aria-hidden="true" className="spin" /> : <Pin aria-hidden="true" />}</button>}
                </article>)}</div> : page.loaded && <div className="section-empty profile-empty"><span className="section-empty-icon"><Video aria-hidden="true" /></span><h2>{labels.empty.reels}</h2></div>}
          {page.loading && page.loaded && <p className="profile-content-loading" role="status"><LoaderCircle aria-hidden="true" />{labels.loading}</p>}
          {page.hasMore && <button type="button" className="profile-load-more" disabled={page.loading} onClick={() => void loadMore()}>{page.loading ? <LoaderCircle aria-hidden="true" className="spin" /> : null}{labels.loadMore}</button>}
          {activeTab === 'reels' && pinError && <p className="profile-action-error" role="alert">{pinError}</p>}
          {activeTab === 'reels' && pinUnavailable && <p className="profile-action-error" role="status">{labels.pinUnavailable}</p>}
        </div>
      </section>

      <section className="profile-stats-cards" aria-label={locale === 'ar' ? 'إحصاءات الملف الشخصي' : 'Profile statistics'}>
        <button type="button" onClick={() => onOpenRelationship('followers')}><strong>{followerCount.toLocaleString(locale === 'ar' ? 'ar' : 'en-US')}</strong><span>{labels.followers}</span></button>
        <button type="button" onClick={() => onOpenRelationship('following')}><strong>{followingCount.toLocaleString(locale === 'ar' ? 'ar' : 'en-US')}</strong><span>{labels.following}</span></button>
        <div><strong>{(stats?.posts ?? 0).toLocaleString(locale === 'ar' ? 'ar' : 'en-US')}</strong><span>{labels.posts}</span></div>
        <div><strong>{(stats?.reels ?? 0).toLocaleString(locale === 'ar' ? 'ar' : 'en-US')}</strong><span>{labels.reels}</span></div>
      </section>

      {activeReel && <ModalPortal backdropClassName="profile-reel-viewer-backdrop" dialogClassName="profile-reel-viewer" labelId="profile-reel-viewer-title" onClose={() => setViewerIndex(null)}>
        <header><h2 id="profile-reel-viewer-title">{activeReel.caption || labels.reels}</h2><button type="button" aria-label={labels.close} onClick={() => setViewerIndex(null)}><X aria-hidden="true" /></button></header>
        {viewerError && <p className="profile-action-error" role="alert">{viewerError}</p>}
        <video key={activeReel.id} src={activeReel.videoUrl} controls playsInline preload="none" autoPlay aria-label={activeReel.caption || labels.reels} onError={() => setViewerError(labels.noThumbnail)} />
        <div className="profile-reel-viewer-controls">
          <button type="button" disabled={viewerIndex === 0} onClick={() => setViewerIndex((index) => index === null ? null : Math.max(0, index - 1))}><ArrowUp aria-hidden="true" />{labels.previous}</button>
          <button type="button" disabled={viewerIndex === reels.length - 1 && !page.hasMore} onClick={() => {
            if (viewerIndex !== null && viewerIndex < reels.length - 1) setViewerIndex(viewerIndex + 1)
            else if (page.hasMore) void loadMore().then(() => setViewerIndex(reels.length))
          }}><ArrowDown aria-hidden="true" />{labels.next}</button>
        </div>
      </ModalPortal>}
    </>
  )
}
