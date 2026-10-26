'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ArrowUpRight, Camera, ImagePlus, Images, Plus, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MentionTextarea, RichText } from '@/components/mention-textarea'
import { NewAccountBadge } from '@/components/new-account-badge'
import { PostEngagement } from '@/components/post-engagement'
import type { CurrentUser } from '@/lib/session'
import { compressImage } from '@/lib/image-compression'
import { uploadMedia } from '@/lib/client-upload'
import { localizedUploadError } from '@/lib/client-errors'

type Locale = 'en' | 'ar'
type Story = { id: string; authorId: string; body: string; mediaUrl: string | null; createdAt: string; expiresAt: string; authorName: string; authorUsername: string; authorAvatar: string | null }
type DailyPost = { id: string; authorId: string; body: string; mediaUrl: string | null; tags: string[]; createdAt: string; authorName: string; authorUsername: string; authorAvatar: string | null; authorCreatedAt: string | null }
type FeedData = { stories: Story[]; posts: DailyPost[]; nextCursor: string | null }

const labels = {
  en: { title: 'Stories & daily life', description: 'Small moments from the people in your community.', stories: 'Stories · 24 hours', moments: 'Daily moments', shareStory: 'Share a story', shareDaily: 'Share a daily moment', older: 'Load older moments', storyPlaceholder: 'What is happening right now?', dailyPlaceholder: 'A small moment worth sharing…', image: 'Add a photo', publishStory: 'Post story', publishDaily: 'Share moment', publishing: 'Publishing…', emptyStories: 'No active stories yet.', emptyPosts: 'Your everyday moments will be here.', imageAlt: 'Community moment', login: 'Log in with Discord to share a moment.', member: 'Join the Discord community to publish.', membershipUnavailable: 'Discord membership could not be checked. Please try again.', invalid: 'Check your text and image, then try again.', uploadError: 'The image upload failed. Please try again.', fileType: 'Choose a JPG, PNG, WebP, or GIF image.', fileSize: 'Images can be up to 10 MB.', error: 'Could not publish this moment. Please try again.', openStory: 'Open story', closeStory: 'Close story', expires: 'Expires',
  },
  ar: { title: 'القصص والحياة اليومية', description: 'لحظات صغيرة من أفراد مجتمعك.', stories: 'القصص · ٢٤ ساعة', moments: 'لحظات يومية', shareStory: 'شارك قصة', shareDaily: 'شارك لحظة يومية', older: 'تحميل لحظات أقدم', storyPlaceholder: 'ما الذي يحدث الآن؟', dailyPlaceholder: 'لحظة صغيرة تستحق المشاركة…', image: 'أضف صورة', publishStory: 'نشر القصة', publishDaily: 'مشاركة اللحظة', publishing: 'جارٍ النشر…', emptyStories: 'لا توجد قصص نشطة بعد.', emptyPosts: 'ستظهر لحظاتك اليومية هنا.', imageAlt: 'لحظة من المجتمع', login: 'سجّل الدخول عبر Discord لمشاركة لحظة.', member: 'انضم إلى مجتمع Discord للنشر.', membershipUnavailable: 'تعذر التحقق من عضويتك في Discord. حاول مرة أخرى.', invalid: 'تحقق من النص والصورة ثم حاول مرة أخرى.', uploadError: 'تعذر رفع الصورة. حاول مرة أخرى.', fileType: 'اختر صورة JPG أو PNG أو WebP أو GIF.', fileSize: 'يجب ألا يتجاوز حجم الصورة 10 ميغابايت.', error: 'تعذرت مشاركة اللحظة. حاول مرة أخرى.', openStory: 'عرض القصة', closeStory: 'إغلاق القصة', expires: 'تنتهي',
  },
} satisfies Record<Locale, Record<string, string>>

async function fetchFeed(url: string): Promise<FeedData> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('daily_feed_failed')
  return response.json()
}

export function StoriesSection({ viewer, locale, onSignIn }: { viewer: CurrentUser | null; locale: Locale; onSignIn: () => void }) {
  const copy = labels[locale]
  const [storyBody, setStoryBody] = useState('')
  const [storyFile, setStoryFile] = useState<File | null>(null)
  const [dailyBody, setDailyBody] = useState('')
  const [dailyFile, setDailyFile] = useState<File | null>(null)
  const [activeStory, setActiveStory] = useState<Story | null>(null)
  const [storyBusy, setStoryBusy] = useState(false)
  const [dailyBusy, setDailyBusy] = useState(false)
  const [storyProgress, setStoryProgress] = useState(0)
  const [dailyProgress, setDailyProgress] = useState(0)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState('')
  const [retryTarget, setRetryTarget] = useState<'story' | 'daily' | null>(null)
  const { data, mutate } = useSWR('/api/daily', fetchFeed, { refreshInterval: 30000 })
  const stories = data?.stories ?? []
  const posts = data?.posts ?? []

  function validateFile(file: File | null) {
    if (!file) return true
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError(copy.fileType)
      return false
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(copy.fileSize)
      return false
    }
    setError('')
    return true
  }

  async function uploadImage(file: File | null, kind: 'story' | 'daily', onProgress: (percentage: number) => void) {
    if (!file) return null
    const uploadFile = file.type === 'image/gif' ? file : await compressImage(file)
    const result = await uploadMedia({ endpoint: '/api/daily/upload', file: uploadFile, kind, onProgress })
    return result.url
  }

  async function loadOlderPosts() {
    if (!data?.nextCursor || loadingOlder) return
    setLoadingOlder(true)
    try {
      const response = await fetch(`/api/daily?before=${encodeURIComponent(data.nextCursor)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('older_posts_failed')
      const older = await response.json() as FeedData
      await mutate((current) => current ? { ...current, posts: [...current.posts, ...older.posts], nextCursor: older.nextCursor } : current, false)
    } catch {
      setError(copy.error)
    } finally {
      setLoadingOlder(false)
    }
  }

  async function publishStory(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!viewer) return onSignIn()
    if ((!storyBody.trim() && !storyFile) || storyBusy) return
    setStoryBusy(true)
    setStoryProgress(0)
    setError('')
    setRetryTarget(null)
    let stage: 'upload' | 'publish' = 'upload'
    try {
      const mediaUrl = await uploadImage(storyFile, 'story', setStoryProgress)
      stage = 'publish'
      const response = await fetch('/api/stories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: storyBody.trim(), mediaUrl }) })
      const result = await response.json().catch(() => null) as { story?: Story; error?: string; reason?: string } | null
      if (!response.ok || !result?.story) {
        console.error('[stories] API request failed', { status: response.status, message: result?.reason ?? result?.error ?? 'story_failed' })
        throw new Error(result?.reason ?? result?.error ?? 'story_failed')
      }
      const createdStory = result.story
      void mutate((current) => {
        const feed = current ?? { stories: [], posts: [], nextCursor: null }
        return { ...feed, stories: [createdStory, ...feed.stories.filter((story) => story.id !== createdStory.id)].slice(0, 30) }
      }, false)
      setStoryBody('')
      setStoryFile(null)
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      console.error('[stories] publish flow failed', { message: code })
      setRetryTarget('story')
      setError(code === 'invalid_story' ? copy.invalid
        : stage === 'upload' ? localizedUploadError(code, locale, copy.uploadError) : copy.error)
    } finally {
      setStoryBusy(false)
      setStoryProgress(0)
    }
  }

  async function publishDaily(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!viewer) return onSignIn()
    if ((!dailyBody.trim() && !dailyFile) || dailyBusy) return
    setDailyBusy(true)
    setDailyProgress(0)
    setError('')
    setRetryTarget(null)
    let stage: 'upload' | 'publish' = 'upload'
    try {
      const mediaUrl = await uploadImage(dailyFile, 'daily', setDailyProgress)
      stage = 'publish'
      const response = await fetch('/api/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: dailyBody.trim(), mediaUrl }) })
      const result = await response.json().catch(() => null) as { post?: DailyPost; error?: string; reason?: string } | null
      if (!response.ok || !result?.post) {
        console.error('[daily] API request failed', { status: response.status, message: result?.reason ?? result?.error ?? 'daily_failed' })
        throw new Error(result?.reason ?? result?.error ?? 'daily_failed')
      }
      const createdPost = result.post
      void mutate((current) => {
        const feed = current ?? { stories: [], posts: [], nextCursor: null }
        return { ...feed, posts: [createdPost, ...feed.posts.filter((post) => post.id !== createdPost.id)] }
      }, false)
      setDailyBody('')
      setDailyFile(null)
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      console.error('[daily] publish flow failed', { message: code })
      setRetryTarget('daily')
      setError(code === 'invalid_daily_post' || code === 'too_many_tags' ? copy.invalid
        : stage === 'upload' ? localizedUploadError(code, locale, copy.uploadError) : copy.error)
    } finally {
      setDailyBusy(false)
      setDailyProgress(0)
    }
  }

  if (viewer && !viewer.isMember) return <section className="section-view stories-view" aria-labelledby="stories-title" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}><div className="section-heading"><span className="section-kicker"><Images aria-hidden="true" />{copy.title}</span><h1 id="stories-title">{copy.title}</h1><p>{copy.description}</p></div><p className="stories-access-note">{copy.member}</p></section>

  return (
    <section className="section-view stories-view" aria-labelledby="stories-title" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}>
      <div className="section-heading"><span className="section-kicker"><Images aria-hidden="true" />{copy.title}</span><h1 id="stories-title">{copy.title}</h1><p>{copy.description}</p></div>
      {!viewer && <button className="stories-access-note" type="button" onClick={onSignIn}>{copy.login}<ArrowUpRight aria-hidden="true" /></button>}
      {error && <div className="stories-error" role="alert"><p>{error}</p>{retryTarget && <Button type="button" size="sm" variant="outline" onClick={() => void (retryTarget === 'story' ? publishStory() : publishDaily())}>{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</Button>}</div>}
      {viewer && <div className="stories-composer-grid">
        <form className="story-composer" onSubmit={publishStory}><h2><Camera aria-hidden="true" />{copy.shareStory}</h2><MentionTextarea value={storyBody} onChange={setStoryBody} locale={locale} placeholder={copy.storyPlaceholder} maxLength={500} rows={2} className="story-composer-textarea" /><div className="story-composer-actions"><label className="reel-file-picker"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={copy.image} onChange={(event) => { const file = event.target.files?.[0] ?? null; if (validateFile(file)) setStoryFile(file); event.currentTarget.value = '' }} /><ImagePlus aria-hidden="true" /><span>{storyFile?.name ?? copy.image}</span></label><Button type="submit" size="sm" disabled={storyBusy || (!storyBody.trim() && !storyFile)}>{storyBusy ? copy.publishing : copy.publishStory}<Plus data-icon="inline-end" /></Button></div>{storyBusy && storyFile && <div className="upload-progress"><div><span>{copy.image}</span><strong>{storyProgress}%</strong></div><progress value={storyProgress} max={100} aria-label={copy.image} /></div>}</form>
        <form className="story-composer" onSubmit={publishDaily}><h2><Images aria-hidden="true" />{copy.shareDaily}</h2><MentionTextarea value={dailyBody} onChange={setDailyBody} locale={locale} placeholder={`${copy.dailyPlaceholder} #community`} maxLength={1000} rows={2} className="story-composer-textarea" /><div className="story-composer-actions"><label className="reel-file-picker"><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={copy.image} onChange={(event) => { const file = event.target.files?.[0] ?? null; if (validateFile(file)) setDailyFile(file); event.currentTarget.value = '' }} /><ImagePlus aria-hidden="true" /><span>{dailyFile?.name ?? copy.image}</span></label><Button type="submit" size="sm" disabled={dailyBusy || (!dailyBody.trim() && !dailyFile)}>{dailyBusy ? copy.publishing : copy.publishDaily}<Plus data-icon="inline-end" /></Button></div>{dailyBusy && dailyFile && <div className="upload-progress"><div><span>{copy.image}</span><strong>{dailyProgress}%</strong></div><progress value={dailyProgress} max={100} aria-label={copy.image} /></div>}</form>
      </div>}
      <section className="story-strip" aria-labelledby="story-strip-title"><div className="stories-section-heading"><h2 id="story-strip-title">{copy.stories}</h2><span>{stories.length}</span></div>{stories.length ? <div className="story-card-list">{stories.map((story) => <button className="story-card" type="button" key={story.id} onClick={() => setActiveStory(story)} aria-label={`${copy.openStory}: ${story.authorName}`}><span className="story-avatar">{story.authorAvatar ? <img src={story.authorAvatar} alt="" /> : <UserRound aria-hidden="true" />}</span><strong>{story.authorName}<NewAccountBadge createdAt={story.createdAt} locale={locale} /></strong><small dir="ltr">@{story.authorUsername}</small></button>)}</div> : <p className="stories-empty">{copy.emptyStories}</p>}</section>
      {activeStory && <dialog className="story-viewer" open aria-modal="true" aria-labelledby="story-viewer-title" onCancel={(event) => { event.preventDefault(); setActiveStory(null) }}><div className="story-viewer-header"><div>{activeStory.authorAvatar ? <img src={activeStory.authorAvatar} alt="" /> : <UserRound aria-hidden="true" />}<strong id="story-viewer-title">{activeStory.authorName}</strong><small dir="ltr">@{activeStory.authorUsername}</small></div><Button type="button" size="sm" variant="ghost" onClick={() => setActiveStory(null)}>{copy.closeStory}</Button></div>{activeStory.mediaUrl && <img className="story-viewer-media" src={activeStory.mediaUrl} alt={copy.imageAlt} />}{activeStory.body && <p>{activeStory.body}</p>}<small>{copy.expires} {new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(activeStory.expiresAt))}</small></dialog>}
      <section className="daily-post-list" aria-labelledby="daily-list-title"><div className="stories-section-heading"><h2 id="daily-list-title">{copy.moments}</h2><span>{posts.length}</span></div>{posts.length ? posts.map((post) => <article className="daily-post-card" key={post.id}><header className="daily-post-author">{post.authorAvatar ? <img src={post.authorAvatar} alt="" /> : <span><UserRound aria-hidden="true" /></span>}<a href={`/u/${encodeURIComponent(post.authorUsername)}`}><strong>{post.authorName}<NewAccountBadge createdAt={post.authorCreatedAt} locale={locale} /></strong><small dir="ltr">@{post.authorUsername}</small></a><time dateTime={post.createdAt}>{new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(post.createdAt))}</time></header>{post.body && <p className="daily-post-body"><RichText text={post.body} /></p>}{post.mediaUrl && <img className="daily-post-media" src={post.mediaUrl} alt={copy.imageAlt} />}{post.tags.length > 0 && <div className="tag-row">{post.tags.map((tag) => <a className="post-tag" key={tag} href={`/tags/${encodeURIComponent(tag)}?lang=${locale}`} dir="ltr">#{tag}</a>)}</div>}<PostEngagement type="daily" contentId={post.id} authorId={post.authorId} viewer={viewer} locale={locale} onSignIn={onSignIn} /></article>) : <p className="stories-empty">{copy.emptyPosts}</p>}{data?.nextCursor && <Button type="button" size="sm" variant="outline" onClick={() => void loadOlderPosts()} disabled={loadingOlder}>{loadingOlder ? copy.publishing : copy.older}<ArrowUpRight data-icon="inline-end" /></Button>}</section>
    </section>
  )
}
