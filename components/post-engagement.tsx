'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Heart, MessageCircle, Repeat2, Send, ChevronDown, X, Pin } from 'lucide-react'
import { MentionTextarea, RichText } from '@/components/mention-textarea'
import { NewAccountBadge } from '@/components/new-account-badge'
import { EquippedBadges } from '@/components/badge-display'
import type { CurrentUser } from '@/lib/session'

type Locale = 'en' | 'ar'
type ContentType = 'news' | 'reel' | 'daily'
type Comment = {
  id: string
  authorId: string
  threadRootId: string | null
  isPinned: boolean
  body: string
  createdAt: string
  authorName: string
  authorUsername: string
  authorAvatar: string | null
  authorCreatedAt: string | null
}
type CommentResponse = { comments: Comment[]; nextCursor: string | null }
type RepostResponse = { count: number; repostedByMe: boolean }
type LikeResponse = { count: number; likedByMe: boolean }
type Reaction = { userId: string; name: string; username: string; avatarUrl: string | null; createdAt: string; followsViewer: boolean }
type ReactionResponse = { reactions: Reaction[] }

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('request_failed')
  return response.json() as Promise<T>
}

const labels = {
  en: { reply: 'Reply', comments: 'Comments', repost: 'Repost', reposted: 'Reposted', write: 'Write a comment…', send: 'Send', signIn: 'Log in to comment or repost.', replies: 'Show replies', hideReplies: 'Hide replies', older: 'Load earlier comments', error: 'Could not load this conversation.', postError: 'Comment could not be posted.', repostError: 'Could not update your repost.', sent: 'Comment posted.', pin: 'Pin comment', unpin: 'Unpin comment', pinned: 'Pinned' },
  ar: { reply: 'رد', comments: 'التعليقات', repost: 'إعادة النشر', reposted: 'تمت إعادة النشر', write: 'اكتب تعليقًا…', send: 'إرسال', signIn: 'سجّل الدخول للتعليق أو إعادة النشر.', replies: 'عرض الردود', hideReplies: 'إخفاء الردود', older: 'تحميل التعليقات السابقة', error: 'تعذر تحميل المحادثة.', postError: 'تعذر نشر التعليق.', repostError: 'تعذر تحديث إعادة النشر.', sent: 'تم نشر التعليق.', pin: 'تثبيت التعليق', unpin: 'إلغاء تثبيت التعليق', pinned: 'مثبّت' },
} satisfies Record<Locale, Record<string, string>>

function formatDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function PostEngagement({ type, contentId, authorId, viewer, locale, onSignIn }: {
  type: ContentType
  contentId: string
  authorId: string
  viewer: CurrentUser | null
  locale: Locale
  onSignIn: () => void
}) {
  const copy = labels[locale]
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [reactionTab, setReactionTab] = useState<'likes' | 'reposts'>('likes')
  const [reactionSheetOpen, setReactionSheetOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const commentsKey = commentsOpen ? `/api/social/comments?type=${type}&id=${contentId}` : null
  const { data: commentData, mutate: mutateComments } = useSWR<CommentResponse>(commentsKey, fetchJson)
  const repostKey = `/api/social/reposts?type=${type}&id=${contentId}`
  const { data: repostData, mutate: mutateRepost } = useSWR<RepostResponse>(repostKey, fetchJson)
  const likeKey = `/api/social/likes?type=${type}&id=${contentId}`
  const { data: likeData, mutate: mutateLike } = useSWR<LikeResponse>(likeKey, fetchJson)
  const reactionKey = reactionSheetOpen ? `/api/social/reactions?type=${type}&id=${contentId}&kind=${reactionTab}` : null
  const { data: reactionData, isLoading: reactionsLoading } = useSWR<ReactionResponse>(reactionKey, fetchJson)
  const comments = commentData?.comments ?? []
  const roots = comments.filter((comment) => !comment.threadRootId)

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!viewer) return onSignIn()
    if (!draft.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/social/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, contentId, body: draft.trim(), replyToId: replyTo?.id ?? null }),
      })
      const result = await response.json() as { comment?: Comment; error?: string }
      if (!response.ok || !result.comment) throw new Error(result.error ?? 'comment_failed')
      await mutateComments((current) => current ? { ...current, comments: [...current.comments, result.comment!] } : { comments: [result.comment!], nextCursor: null }, false)
      setDraft('')
      setReplyTo(null)
    } catch {
      setError(copy.postError)
    } finally {
      setBusy(false)
    }
  }

  async function toggleLike() {
    if (!viewer) return onSignIn()
    if (viewer.id === authorId || busy) return
    setBusy(true)
    try {
      const response = await fetch(type === 'reel' ? `/api/reels/${encodeURIComponent(contentId)}/like` : '/api/social/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(type === 'reel' ? {} : { body: JSON.stringify({ type, contentId }) }),
      })
      const result = await response.json() as { liked?: boolean; count?: number }
      if (!response.ok) throw new Error('like_failed')
      await mutateLike({ count: result.count ?? likeData?.count ?? 0, likedByMe: Boolean(result.liked) }, false)
    } catch {
      setError(locale === 'ar' ? 'تعذر تحديث الإعجاب.' : 'Could not update your like.')
    } finally {
      setBusy(false)
    }
  }

  function openReactions(tab: 'likes' | 'reposts') {
    setReactionTab(tab)
    setReactionSheetOpen(true)
  }

  async function toggleRepost() {
    if (!viewer) return onSignIn()
    if (viewer.id === authorId || busy) return
    setBusy(true)
    setError('')
    try {
      const reposted = Boolean(repostData?.repostedByMe)
      const response = await fetch('/api/social/reposts', {
        method: reposted ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, contentId }),
      })
      const result = await response.json() as { reposted?: boolean; count?: number }
      if (!response.ok) throw new Error('repost_failed')
      await mutateRepost({ count: result.count ?? repostData?.count ?? 0, repostedByMe: Boolean(result.reposted) }, false)
    } catch {
      setError(copy.repostError)
    } finally {
      setBusy(false)
    }
  }

  async function togglePinnedComment(comment: Comment) {
    const pinned = !comment.isPinned
    setError('')
    try {
      const response = await fetch(`/api/social/comments/${encodeURIComponent(comment.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      })
      if (!response.ok) throw new Error('comment_update_failed')
      await mutateComments((current) => current ? {
        ...current,
        comments: current.comments.map((item) => ({ ...item, isPinned: pinned && item.id === comment.id })),
      } : current, false)
    } catch {
      setError(copy.postError)
    }
  }

  async function loadEarlier() {
    if (!commentData?.nextCursor || !commentsKey) return
    try {
      const older = await fetchJson<CommentResponse>(`${commentsKey}&before=${encodeURIComponent(commentData.nextCursor)}`)
      await mutateComments({ ...commentData, comments: [...older.comments, ...comments], nextCursor: older.nextCursor }, false)
    } catch {
      setError(copy.error)
    }
  }

  function beginReply(comment: Comment, rootId: string) {
    setReplyTo(comment)
    setDraft(`@${comment.authorUsername} `)
    setCommentsOpen(true)
    if (comment.threadRootId || rootId) setExpanded((current) => new Set(current).add(rootId))
  }

  function renderComment(comment: Comment, rootId?: string) {
    return (
      <article className={`social-comment ${rootId ? 'social-comment-reply' : ''}`} key={comment.id}>
        <div className="social-comment-avatar">{comment.authorAvatar ? <img src={comment.authorAvatar} alt="" /> : <span>{comment.authorName.charAt(0)}</span>}</div>
        <div className="social-comment-main">
          <div className="social-comment-heading"><a href={`/u/${encodeURIComponent(comment.authorUsername)}`}><strong>{comment.authorName}</strong><NewAccountBadge createdAt={comment.authorCreatedAt} locale={locale} /></a><small dir="ltr">@{comment.authorUsername}</small><EquippedBadges userId={comment.authorId} locale={locale} /><time dateTime={comment.createdAt}>{formatDate(comment.createdAt, locale)}</time></div>
          <p><RichText text={comment.body} /></p>
          <div className="social-comment-controls">
            {comment.isPinned && <span className="comment-pinned-pill"><Pin aria-hidden="true" />{copy.pinned}</span>}
            <button type="button" className="social-reply-button" onClick={() => beginReply(comment, rootId ?? comment.id)}>{copy.reply}</button>
            {viewer?.id === authorId && !rootId && <button type="button" className="social-reply-button" aria-pressed={comment.isPinned} onClick={() => void togglePinnedComment(comment)}>{copy[comment.isPinned ? 'unpin' : 'pin']}</button>}
          </div>
        </div>
      </article>
    )
  }

  return (
    <section className="post-engagement" aria-label={copy.comments}>
      <div className="post-engagement-actions">
        {viewer?.id !== authorId && <div className="post-reaction-control"><button className={`post-engagement-action ${likeData?.likedByMe ? 'post-engagement-action-active' : ''}`} type="button" aria-pressed={likeData?.likedByMe ?? false} onClick={() => void toggleLike()}><Heart aria-hidden="true" />{likeData?.likedByMe ? (locale === 'ar' ? 'أعجبك' : 'Liked') : (locale === 'ar' ? 'إعجاب' : 'Like')}</button><button className="post-reaction-count" type="button" onClick={() => openReactions('likes')} aria-label={locale === 'ar' ? `عرض ${likeData?.count ?? 0} إعجابات` : `View ${likeData?.count ?? 0} likes`}>{likeData?.count ?? 0}</button></div>}
        <button className="post-engagement-action" type="button" aria-expanded={commentsOpen} onClick={() => setCommentsOpen((open) => !open)}><MessageCircle aria-hidden="true" />{copy.comments}{commentData?.comments.length ? <span>{commentData.comments.length}</span> : null}</button>
        <div className="post-reaction-control">{viewer?.id !== authorId && <button className={`post-engagement-action ${repostData?.repostedByMe ? 'post-engagement-action-active' : ''}`} type="button" aria-pressed={repostData?.repostedByMe ?? false} onClick={() => void toggleRepost()}><Repeat2 aria-hidden="true" />{repostData?.repostedByMe ? copy.reposted : copy.repost}</button>}<button className="post-reaction-count" type="button" onClick={() => openReactions('reposts')} aria-label={locale === 'ar' ? `عرض ${repostData?.count ?? 0} إعادة نشر` : `View ${repostData?.count ?? 0} reposts`}>{repostData?.count ?? 0}</button></div>
      </div>
      {commentsOpen && (
        <div className="social-comments">
          {commentData?.nextCursor && <button type="button" className="social-load-older" onClick={() => void loadEarlier()}><ChevronDown aria-hidden="true" />{copy.older}</button>}
          {roots.map((root) => {
            const replies = comments.filter((comment) => comment.threadRootId === root.id)
            const isExpanded = expanded.has(root.id) || replies.length <= 2
            return <div className="social-comment-thread" key={root.id}>
              {renderComment(root)}
              {replies.length > 0 && <div className="social-comment-replies">
                {isExpanded ? replies.map((reply) => renderComment(reply, root.id)) : null}
                {replies.length > 2 && <button className="social-replies-toggle" type="button" onClick={() => setExpanded((current) => {
                  const next = new Set(current)
                  if (next.has(root.id)) next.delete(root.id)
                  else next.add(root.id)
                  return next
                })}>{isExpanded ? copy.hideReplies : `${copy.replies} (${replies.length})`}</button>}
              </div>}
            </div>
          })}
          {!comments.length && <p className="social-empty-comments">{copy.comments}</p>}
          <form className="social-comment-form" onSubmit={submitComment}>
            {replyTo && <div className="social-reply-context"><span>{copy.reply} @{replyTo.authorUsername}</span><button type="button" onClick={() => { setReplyTo(null); setDraft('') }} aria-label={locale === 'ar' ? 'إلغاء الرد' : 'Cancel reply'}>×</button></div>}
            <MentionTextarea value={draft} onChange={setDraft} locale={locale} placeholder={copy.write} maxLength={1000} rows={2} className="social-comment-input" />
            <button className="social-comment-submit" type="submit" disabled={busy || !draft.trim()} aria-label={copy.send}><Send aria-hidden="true" /></button>
          </form>
          {!viewer && <button type="button" className="social-sign-in" onClick={onSignIn}>{copy.signIn}</button>}
          {error && <p className="social-error" role="alert">{error}</p>}
        </div>
      )}
      {reactionSheetOpen && <div className="reaction-sheet-backdrop" onClick={() => setReactionSheetOpen(false)}>
        <section className="reaction-sheet" role="dialog" aria-modal="true" aria-labelledby="reaction-sheet-title" onClick={(event) => event.stopPropagation()}>
          <div className="reaction-sheet-heading"><h2 id="reaction-sheet-title">{locale === 'ar' ? 'التفاعلات' : 'Reactions'}</h2><button type="button" className="icon-button" onClick={() => setReactionSheetOpen(false)} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}><X aria-hidden="true" /></button></div>
          <div className="reaction-sheet-tabs" role="tablist" aria-label={locale === 'ar' ? 'نوع التفاعل' : 'Reaction type'}>
            {(['likes', 'reposts'] as const).map((tab) => <button key={tab} role="tab" type="button" aria-selected={reactionTab === tab} onClick={() => setReactionTab(tab)}>{tab === 'likes' ? (locale === 'ar' ? 'الإعجابات' : 'Likes') : (locale === 'ar' ? 'إعادات النشر' : 'Reposts')}</button>)}
          </div>
          {reactionsLoading && <p className="reaction-sheet-empty" role="status">{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p>}
          {reactionData?.reactions.length ? <ul className="reaction-people-list">{reactionData.reactions.map((reaction) => <li key={reaction.userId}><a href={`/u/${encodeURIComponent(reaction.username)}`}>{reaction.avatarUrl ? <img src={reaction.avatarUrl} alt="" /> : <span className="author-fallback">{reaction.name.charAt(0)}</span>}<span><strong>{reaction.name}</strong><small dir="ltr">@{reaction.username}</small></span></a><time dateTime={reaction.createdAt}>{formatDate(reaction.createdAt, locale)}</time></li>)}</ul> : !reactionsLoading && <p className="reaction-sheet-empty">{locale === 'ar' ? 'لا توجد تفاعلات بعد.' : 'No reactions yet.'}</p>}
        </section>
      </div>}
    </section>
  )
}
