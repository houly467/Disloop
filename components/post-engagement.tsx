'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { MessageCircle, Repeat2, Send, ChevronDown, X, Pin, Share2, Copy, MoreHorizontal } from 'lucide-react'
import { MentionTextarea, RichText } from '@/components/mention-textarea'
import { ModalPortal } from '@/components/modal-portal'
import type { CurrentUser } from '@/lib/session'
import { formatSocialCount, getOptimisticLikeState } from '@/lib/social-ui'
import { UserName } from '@/components/user-name'
import { ReportButton } from '@/components/report-dialog'
import { TranslateText } from '@/components/translate-text'

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
  authorNameStyle: string | null
  authorCustomTitle: string | null
}
type CommentResponse = { comments: Comment[]; nextCursor: string | null }
type RepostResponse = { count: number; repostedByMe: boolean }
type LikeResponse = { count: number; likedByMe: boolean }
type Reaction = { userId: string; name: string; username: string; avatarUrl: string | null; createdAt: string; followsViewer: boolean; nameStyle: string | null; customTitle: string | null }
type ReactionResponse = { reactions: Reaction[] }
type SharePerson = { id: string; username: string; displayName: string; avatarUrl: string | null; accountCreatedAt: string; nameStyle: string | null; customTitle: string | null }
type ShareConversation = { id: string; peer: SharePerson; lastMessage: { body: string; createdAt: string } | null; lastMessageAt: string }

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

export function PostEngagement({ type, contentId, authorId, viewer, locale, onSignIn, variant, onLikeChange }: {
  type: ContentType
  contentId: string
  authorId: string
  viewer: CurrentUser | null
  locale: Locale
  onSignIn: () => void
  variant?: 'default' | 'reel'
  onLikeChange?: (liked: boolean) => void
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
  const [likePulse, setLikePulse] = useState(false)
  const [repostPulse, setRepostPulse] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareQuery, setShareQuery] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareSendingId, setShareSendingId] = useState<string | null>(null)
  const [shareError, setShareError] = useState('')
  const [shareSentTo, setShareSentTo] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [followStatuses, setFollowStatuses] = useState<Record<string, boolean>>({})
  const [followBusy, setFollowBusy] = useState<string | null>(null)
  const commentsKey = `/api/social/comments?type=${type}&id=${contentId}`
  const { data: commentData, error: commentLoadError, mutate: mutateComments } = useSWR<CommentResponse>(commentsKey, fetchJson, { refreshInterval: 30000 })
  const repostKey = `/api/social/reposts?type=${type}&id=${contentId}`
  const { data: repostData, error: repostLoadError, mutate: mutateRepost } = useSWR<RepostResponse>(repostKey, fetchJson, { refreshInterval: 30000 })
  const likeKey = `/api/social/likes?type=${type}&id=${contentId}`
  const { data: likeData, error: likeLoadError, mutate: mutateLike } = useSWR<LikeResponse>(likeKey, fetchJson, { refreshInterval: 30000 })
  const reactionKey = reactionSheetOpen ? `/api/social/reactions?type=${type}&id=${contentId}&kind=${reactionTab}` : null
  const { data: reactionData, isLoading: reactionsLoading, error: reactionLoadError } = useSWR<ReactionResponse>(reactionKey, fetchJson)
  const { data: blockData, isLoading: blocksLoading, error: blocksLoadError } = useSWR<{ blocks: { id: string }[] }>(reactionSheetOpen && viewer ? '/api/social/blocks' : null, fetchJson)
  const { data: sharePeople, error: sharePeopleError, isLoading: sharePeopleLoading } = useSWR<{ people: SharePerson[] }>(shareOpen && viewer && shareQuery.trim().length >= 2 ? `/api/dm/people?q=${encodeURIComponent(shareQuery.trim())}` : null, fetchJson)
  const { data: recentConversations, error: recentConversationsError, isLoading: recentConversationsLoading } = useSWR<{ conversations: ShareConversation[] }>(shareOpen && viewer ? '/api/dm/conversations' : null, fetchJson)
  const comments = commentData?.comments ?? []
  const roots = comments.filter((comment) => !comment.threadRootId)
  const blockedIds = new Set((blockData?.blocks ?? []).map((block) => block.id))
  const reactions = reactionData?.reactions.filter((reaction) => !blockedIds.has(reaction.userId)) ?? []

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
    if ((viewer.id === authorId && variant !== 'reel') || busy) return
    const previous = likeData
    const optimistic = getOptimisticLikeState(previous)
    setBusy(true)
    setError('')
    try {
      await mutateLike(optimistic, false)
      setLikePulse(true)
      window.setTimeout(() => setLikePulse(false), 350)
      const response = await fetch(type === 'reel' ? `/api/reels/${encodeURIComponent(contentId)}/like` : '/api/social/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(type === 'reel' ? {} : { body: JSON.stringify({ type, contentId }) }),
      })
      const result = await response.json() as { liked?: boolean; count?: number; likeCount?: number }
      if (!response.ok || typeof result.liked !== 'boolean') throw new Error('like_failed')
      await mutateLike({ count: result.count ?? result.likeCount ?? optimistic.count, likedByMe: result.liked }, false)
      onLikeChange?.(result.liked)
    } catch {
      await mutateLike(previous, false)
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
    const previous = repostData
    const reposted = Boolean(previous?.repostedByMe)
    const optimistic = { count: Math.max(0, (previous?.count ?? 0) + (reposted ? -1 : 1)), repostedByMe: !reposted }
    setBusy(true)
    setError('')
    try {
      await mutateRepost(optimistic, false)
      setRepostPulse(true)
      window.setTimeout(() => setRepostPulse(false), 350)
      const response = await fetch('/api/social/reposts', {
        method: reposted ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, contentId }),
      })
      const result = await response.json() as { reposted?: boolean; count?: number }
      if (!response.ok || typeof result.reposted !== 'boolean') throw new Error('repost_failed')
      await mutateRepost({ count: result.count ?? optimistic.count, repostedByMe: result.reposted }, false)
    } catch {
      await mutateRepost(previous, false)
      setError(copy.repostError)
    } finally {
      setBusy(false)
    }
  }

  async function shareReel(person: SharePerson, conversationId?: string) {
    if (!viewer || type !== 'reel' || shareBusy) return
    setShareBusy(true)
    setShareSendingId(person.id)
    setShareError('')
    setShareSentTo(null)
    try {
      let targetConversationId = conversationId
      if (!targetConversationId) {
        const conversationResponse = await fetch('/api/dm/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipientId: person.id }),
        })
        const conversation = await conversationResponse.json() as { conversationId?: string; error?: string }
        if (!conversationResponse.ok || !conversation.conversationId) throw new Error(conversation.error ?? 'conversation_failed')
        targetConversationId = conversation.conversationId
      }
      const reelLink = `${window.location.origin}/?section=reels#reel-${encodeURIComponent(contentId)}`
      const messageResponse = await fetch(`/api/dm/conversations/${encodeURIComponent(targetConversationId)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: `Reel: ${reelLink}` }),
      })
      const message = await messageResponse.json() as { error?: string }
      if (!messageResponse.ok) throw new Error(message.error ?? 'share_failed')
      setShareSentTo(person.displayName)
    } catch (caught) {
      setShareError(locale === 'ar' ? 'تعذر إرسال الريل.' : 'Could not send this Reel.')
    } finally {
      setShareBusy(false)
      setShareSendingId(null)
    }
  }

  async function copyReelLink() {
      const url = `${window.location.origin}/?section=reels#reel-${encodeURIComponent(contentId)}`
      try {
        await navigator.clipboard.writeText(url)
      } catch {
        setError(locale === 'ar' ? 'تعذر نسخ الرابط.' : 'Could not copy the Reel link.')
    }
  }

  async function followReactionUser(reaction: Reaction) {
    if (!viewer) return onSignIn()
    if (reaction.userId === viewer.id || followBusy) return
    setFollowBusy(reaction.userId)
    setError('')
    try {
      const statusResponse = await fetch(`/api/dm/follows/${encodeURIComponent(reaction.userId)}`, { cache: 'no-store' })
      if (!statusResponse.ok) throw new Error('follow_status_failed')
      const status = await statusResponse.json() as { following: boolean }
      if (!status.following) {
        const response = await fetch(`/api/dm/follows/${encodeURIComponent(reaction.userId)}`, { method: 'POST' })
        if (!response.ok) throw new Error('follow_failed')
      }
      setFollowStatuses((current) => ({ ...current, [reaction.userId]: true }))
    } catch {
      setError(locale === 'ar' ? 'تعذر تحديث المتابعة.' : 'Could not update follow status.')
    } finally {
      setFollowBusy(null)
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
          <div className="social-comment-heading"><a href={`/u/${encodeURIComponent(comment.authorUsername)}`}><UserName userId={comment.authorId} name={comment.authorName} username={comment.authorUsername} createdAt={comment.authorCreatedAt} nameStyle={comment.authorNameStyle} customTitle={comment.authorCustomTitle} locale={locale} /></a><time dateTime={comment.createdAt}>{formatDate(comment.createdAt, locale)}</time></div>
          <p><RichText text={comment.body} /></p><TranslateText text={comment.body} locale={locale} />
          <div className="social-comment-controls">
            {comment.isPinned && <span className="comment-pinned-pill"><Pin aria-hidden="true" />{copy.pinned}</span>}
            <button type="button" className="social-reply-button" onClick={() => beginReply(comment, rootId ?? comment.id)}>{copy.reply}</button>
            {viewer && viewer.id !== comment.authorId && <ReportButton targetType="comment" targetId={comment.id} locale={locale} className="social-reply-button social-report-button" />}
            {viewer?.id === authorId && !rootId && <button type="button" className="social-reply-button" aria-pressed={comment.isPinned} onClick={() => void togglePinnedComment(comment)}>{copy[comment.isPinned ? 'unpin' : 'pin']}</button>}
          </div>
        </div>
      </article>
    )
  }

  return (
    <section className={`post-engagement ${variant === 'reel' ? 'post-engagement-reel' : ''}`} aria-label={copy.comments}>
      <div className="post-engagement-actions">
        <div className="post-reaction-control">
          {(viewer?.id !== authorId || variant === 'reel') && <button className={`post-engagement-action ${likeData?.likedByMe ? 'post-engagement-action-liked' : ''} ${likePulse ? 'post-engagement-action-pulse' : ''}`} type="button" aria-pressed={likeData?.likedByMe ?? false} onClick={() => void toggleLike()}><span className="post-like-emoji" aria-hidden="true">👍</span><span>{locale === 'ar' ? 'إعجاب' : 'Like'}</span></button>}
          <button className={`post-reaction-count ${(likeData?.count ?? 0) === 0 ? 'post-reaction-count-zero' : ''}`} type="button" onClick={() => openReactions('likes')} aria-label={locale === 'ar' ? `عرض ${likeData?.count ?? 0} إعجابات` : `View ${likeData?.count ?? 0} likes`}>{formatSocialCount(likeData?.count ?? 0, locale)}</button>
        </div>
        <button className="post-engagement-action post-comment-action" type="button" aria-expanded={commentsOpen} onClick={() => setCommentsOpen((open) => !open)}><MessageCircle aria-hidden="true" /><span>{locale === 'ar' ? 'تعليق' : 'Comment'}</span><strong className={comments.length === 0 ? 'post-reaction-count-zero' : ''}>{formatSocialCount(comments.length, locale)}</strong></button>
        <div className="post-reaction-control">
          {viewer?.id !== authorId && <button className={`post-engagement-action ${repostData?.repostedByMe ? 'post-engagement-action-reposted' : ''} ${repostPulse ? 'post-engagement-action-pulse' : ''}`} type="button" aria-pressed={repostData?.repostedByMe ?? false} onClick={() => void toggleRepost()}><Repeat2 aria-hidden="true" /><span>{repostData?.repostedByMe ? copy.reposted : copy.repost}</span></button>}
          <button className={`post-reaction-count ${(repostData?.count ?? 0) === 0 ? 'post-reaction-count-zero' : ''}`} type="button" onClick={() => openReactions('reposts')} aria-label={locale === 'ar' ? `عرض ${repostData?.count ?? 0} إعادة نشر` : `View ${repostData?.count ?? 0} reposts`}>{formatSocialCount(repostData?.count ?? 0, locale)}</button>
        </div>
        {variant === 'reel' && viewer && <button className="post-engagement-action" type="button" onClick={() => { setShareOpen(true); setShareError(''); setShareSentTo(null); setShareQuery('') }}><Share2 aria-hidden="true" /><span>{locale === 'ar' ? 'إرسال' : 'Share to DM'}</span></button>}
        {variant === 'reel' && <button className="post-engagement-action" type="button" onClick={() => void copyReelLink()}><Copy aria-hidden="true" /><span>{locale === 'ar' ? 'نسخ الرابط' : 'Copy link'}</span></button>}
        {variant === 'reel' && viewer && viewer.id !== authorId && <button className="post-engagement-action" type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}><MoreHorizontal aria-hidden="true" /><span>{locale === 'ar' ? 'المزيد' : 'More'}</span></button>}
        {variant === 'reel' && moreOpen && viewer && <div className="reel-more-menu"><ReportButton targetType={type} targetId={contentId} locale={locale} className="post-engagement-action post-report-button" /></div>}
        {variant !== 'reel' && viewer && viewer.id !== authorId && <ReportButton targetType={type} targetId={contentId} locale={locale} className="post-engagement-action post-report-button" />}
      </div>
      {error && <p className="social-error" role="alert">{error}</p>}
      {(likeLoadError || repostLoadError || commentLoadError) && <p className="social-error" role="alert">{locale === 'ar' ? 'تعذر تحميل التفاعلات أو التعليقات.' : 'Could not load engagement counts or comments.'}</p>}
      {commentsOpen && variant === 'reel' && <ModalPortal backdropClassName="reel-comments-backdrop" dialogClassName="social-comments reel-comments-sheet" labelId="reel-comments-title" onClose={() => setCommentsOpen(false)}>
          <header className="reel-comments-heading"><h2 id="reel-comments-title">{copy.comments}</h2><button className="icon-button" type="button" onClick={() => setCommentsOpen(false)} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}><X aria-hidden="true" /></button></header>
          <div className="reel-comments-scroll">
          {!commentData && !commentLoadError && <p className="social-empty-comments" role="status">{locale === 'ar' ? 'جارٍ تحميل التعليقات…' : 'Loading comments…'}</p>}
          {commentLoadError && <p className="social-error" role="alert">{locale === 'ar' ? 'تعذر تحميل التعليقات.' : 'Could not load comments.'}</p>}
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
          {commentData && !comments.length && <p className="social-empty-comments">{locale === 'ar' ? 'لا توجد تعليقات بعد.' : 'No comments yet.'}</p>}
          {error && <p className="social-error" role="alert">{error}</p>}
          </div>
          {viewer ? <form className="social-comment-form reel-comment-form" onSubmit={submitComment}>
            {replyTo && <div className="social-reply-context"><span>{copy.reply} @{replyTo.authorUsername}</span><button type="button" onClick={() => { setReplyTo(null); setDraft('') }} aria-label={locale === 'ar' ? 'إلغاء الرد' : 'Cancel reply'}>×</button></div>}
            <MentionTextarea value={draft} onChange={setDraft} locale={locale} placeholder={copy.write} maxLength={1000} rows={2} className="social-comment-input" />
            <button className="social-comment-submit" type="submit" disabled={busy || !draft.trim()} aria-label={copy.send}><Send aria-hidden="true" /></button>
          </form> : <button type="button" className="social-sign-in reel-comment-sign-in" onClick={onSignIn}>{copy.signIn}</button>}
      </ModalPortal>}
      {commentsOpen && variant !== 'reel' && (
        <div className="social-comments">
          {commentData?.nextCursor && <button type="button" className="social-load-older" onClick={() => void loadEarlier()}><ChevronDown aria-hidden="true" />{copy.older}</button>}
          {roots.map((root) => {
            const replies = comments.filter((comment) => comment.threadRootId === root.id)
            const isExpanded = expanded.has(root.id) || replies.length <= 2
            return <div className="social-comment-thread" key={root.id}>{renderComment(root)}{replies.length > 0 && <div className="social-comment-replies">{isExpanded ? replies.map((reply) => renderComment(reply, root.id)) : null}{replies.length > 2 && <button className="social-replies-toggle" type="button" onClick={() => setExpanded((current) => { const next = new Set(current); if (next.has(root.id)) next.delete(root.id); else next.add(root.id); return next })}>{isExpanded ? copy.hideReplies : `${copy.replies} (${replies.length})`}</button>}</div>}</div>
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
      {reactionSheetOpen && <ModalPortal backdropClassName="reaction-sheet-backdrop" dialogClassName="reaction-sheet" labelId="reaction-sheet-title" onClose={() => setReactionSheetOpen(false)}>
          <div className="reaction-sheet-heading"><h2 id="reaction-sheet-title">{locale === 'ar' ? 'التفاعلات' : 'Reactions'}</h2><button type="button" className="icon-button" onClick={() => setReactionSheetOpen(false)} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}><X aria-hidden="true" /></button></div>
          <div className="reaction-sheet-tabs" role="tablist" aria-label={locale === 'ar' ? 'نوع التفاعل' : 'Reaction type'} data-active={reactionTab}>
            <button role="tab" type="button" aria-selected={reactionTab === 'likes'} onClick={() => setReactionTab('likes')}>{locale === 'ar' ? 'الإعجابات' : 'Likes'} ({formatSocialCount(likeData?.count ?? 0, locale)})</button>
            <button role="tab" type="button" aria-selected={reactionTab === 'reposts'} onClick={() => setReactionTab('reposts')}>{locale === 'ar' ? 'إعادات النشر' : 'Reposts'} ({formatSocialCount(repostData?.count ?? 0, locale)})</button>
          </div>
          {(reactionsLoading || blocksLoading) && <p className="reaction-sheet-empty" role="status">{locale === 'ar' ? 'جارٍ التحميل…' : 'Loading…'}</p>}
          {(reactionLoadError || blocksLoadError) && <p className="social-error" role="alert">{locale === 'ar' ? 'تعذر تحميل التفاعلات.' : 'Could not load reactions.'}</p>}
          {reactions.length ? <ul className="reaction-people-list">{reactions.map((reaction) => <li key={reaction.userId}>
            <a href={`/u/${encodeURIComponent(reaction.username)}`}>{reaction.avatarUrl ? <img src={reaction.avatarUrl} alt="" /> : <span className="author-fallback">{reaction.name.charAt(0)}</span>}<UserName userId={reaction.userId} name={reaction.name} username={reaction.username} nameStyle={reaction.nameStyle} customTitle={reaction.customTitle} locale={locale} /></a>
            {viewer?.id !== reaction.userId && <button type="button" className={`reaction-follow-button ${followStatuses[reaction.userId] ? 'reaction-following' : ''}`} disabled={followBusy === reaction.userId || followStatuses[reaction.userId]} onClick={() => void followReactionUser(reaction)}>{followStatuses[reaction.userId] ? (locale === 'ar' ? 'تتابعه' : 'Following') : reaction.followsViewer ? (locale === 'ar' ? 'متابعة متبادلة' : 'Follow back') : (locale === 'ar' ? 'متابعة' : 'Follow')}</button>}
          </li>)}</ul> : !reactionsLoading && !blocksLoading && !reactionLoadError && !blocksLoadError && <p className="reaction-sheet-empty">{locale === 'ar' ? 'لا توجد تفاعلات بعد.' : 'No reactions yet.'}</p>}
          {error && <p className="social-error" role="alert">{error}</p>}
      </ModalPortal>}
      {shareOpen && <ModalPortal backdropClassName="reel-share-backdrop" dialogClassName="reaction-sheet reel-share-sheet" labelId="reel-share-title" onClose={() => setShareOpen(false)}>
        <div className="reaction-sheet-heading"><h2 id="reel-share-title">{locale === 'ar' ? 'إرسال الريل' : 'Share this Reel'}</h2><button type="button" className="icon-button" onClick={() => setShareOpen(false)} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}><X aria-hidden="true" /></button></div>
        <label className="reel-share-search"><span>{locale === 'ar' ? 'ابحث عن عضو' : 'Search members'}</span><input type="search" autoComplete="off" aria-label={locale === 'ar' ? 'ابحث عن عضو' : 'Search members'} value={shareQuery} onChange={(event) => { setShareQuery(event.target.value); setShareSentTo(null); setShareError('') }} placeholder={locale === 'ar' ? 'اكتب اسمًا أو اسم مستخدم' : 'Name or username'} autoFocus /></label>
        {shareSentTo && <p className="reel-share-success" role="status">{locale === 'ar' ? `تم إرسال الريل إلى ${shareSentTo}` : `Reel sent to ${shareSentTo}`}</p>}
        <div className="reel-share-people">
          <>
            <h3 className="reel-share-list-heading">{locale === 'ar' ? 'محادثات حديثة' : 'Recent conversations'}</h3>
            {recentConversationsLoading && <p className="reel-share-empty" role="status">{locale === 'ar' ? 'جارٍ تحميل المحادثات…' : 'Loading recent conversations…'}</p>}
            {recentConversationsError && <p className="social-error" role="alert">{locale === 'ar' ? 'تعذر تحميل المحادثات.' : 'Could not load recent conversations.'}</p>}
            {(recentConversations?.conversations ?? []).slice(0, 6).map((conversation) => <button key={conversation.id} type="button" disabled={shareBusy} onClick={() => void shareReel(conversation.peer, conversation.id)}><UserName userId={conversation.peer.id} name={conversation.peer.displayName} username={conversation.peer.username} nameStyle={conversation.peer.nameStyle} customTitle={conversation.peer.customTitle} locale={locale} /><small>{shareSendingId === conversation.peer.id ? (locale === 'ar' ? 'جارٍ الإرسال…' : 'Sending…') : conversation.lastMessage?.body || `@${conversation.peer.username}`}</small></button>)}
            {!recentConversationsLoading && !recentConversationsError && !recentConversations?.conversations.length && <p className="reel-share-empty">{locale === 'ar' ? 'لا توجد محادثات حديثة.' : 'No recent conversations yet.'}</p>}
          </>
          {shareQuery.trim().length >= 2 && <>
            <h3 className="reel-share-list-heading">{locale === 'ar' ? 'نتائج البحث' : 'Search results'}</h3>
            {sharePeopleLoading && <p className="reel-share-empty" role="status">{locale === 'ar' ? 'جارٍ البحث…' : 'Searching…'}</p>}
            {sharePeopleError && <p className="social-error" role="alert">{locale === 'ar' ? 'تعذر البحث عن الأعضاء.' : 'Could not search members.'}</p>}
            {!sharePeopleLoading && !sharePeopleError && sharePeople?.people.length ? sharePeople.people.map((person) => <button key={person.id} type="button" disabled={shareBusy} onClick={() => void shareReel(person)}><UserName userId={person.id} name={person.displayName} username={person.username} nameStyle={person.nameStyle} customTitle={person.customTitle} locale={locale} /><small>{shareSendingId === person.id ? (locale === 'ar' ? 'جارٍ الإرسال…' : 'Sending…') : `@${person.username}`}</small></button>) : null}
            {!sharePeopleLoading && !sharePeopleError && !sharePeople?.people.length && <p className="reel-share-empty" role="status">{locale === 'ar' ? 'لم يتم العثور على أعضاء.' : 'No members found.'}</p>}
          </>}
        </div>
        {shareError && <p className="social-error" role="alert">{shareError}</p>}
      </ModalPortal>}
    </section>
  )
}
