'use client'

import { useDeferredValue, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Check, ImagePlus, MessageCircle, Search, Send, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { Marker, MarkerContent } from '@/components/ui/marker'
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader } from '@/components/ui/message'
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from '@/components/ui/message-scroller'
import type { CurrentUser } from '@/lib/session'
import { MentionSuggestions, RichText } from '@/components/mention-textarea'
import { UserName } from '@/components/user-name'
import { ChatReactions } from '@/components/chat-reactions'
import type { MessageReaction } from '@/lib/chat'
import { compressImage } from '@/lib/image-compression'
import { uploadMedia } from '@/lib/client-upload'
import { localizedUploadError } from '@/lib/client-errors'

type Locale = 'en' | 'ar'
type Person = { id: string; username: string; displayName: string; avatarUrl: string | null; accountCreatedAt: string; isNewAccount: boolean; nameStyle: string | null; customTitle: string | null; following: boolean; followsYou: boolean }
type Peer = Pick<Person, 'id' | 'username' | 'displayName' | 'avatarUrl' | 'accountCreatedAt' | 'isNewAccount' | 'nameStyle' | 'customTitle'>
type DirectMessage = { id: string; senderId: string; body: string; mediaUrl: string | null; mediaType: string | null; createdAt: string; reactions: MessageReaction[] }
type Conversation = { id: string; peer: Peer; lastMessage: { body: string; senderId: string; createdAt: string } | null; lastMessageAt: string }
type ApiError = { error?: string }

const labels = {
  en: {
    title: 'Messages', intro: 'A quieter space for private conversations.', search: 'Find a community member', searchHint: 'Search by name or username', searchShort: 'Type at least 2 characters to find members.', searching: 'Searching members…', loadingMessages: 'Loading messages…', noPeople: 'No members found for that search.', conversations: 'Your conversations', noConversations: 'No conversations yet. Find a member and send them a message.', choose: 'Choose a conversation or find a member to message.', signInTitle: 'Sign in to send a message', signInBody: 'Log in with Discord to find members and start private conversations.', signIn: 'Log in with Discord', membershipTitle: 'Join the community first', membershipBody: 'Verify your Discord membership to follow members and send direct messages.', follow: 'Follow', following: 'Following', followBack: 'Follow Back', mutual: 'Mutual follow', mutualHint: 'No messages yet. Say hello.', waiting: 'Follows you', start: 'Message', locked: 'You can message any community member.', sendPlaceholder: 'Write a message…', send: 'Send', sending: 'Sending…', startNote: 'You can message any community member.', error: 'That did not work. Please try again.', messageError: 'Message could not be sent. Please try again.', emptyMessages: 'Start the conversation with a hello.', back: 'Back to conversations.', attach: 'Attach image', retry: 'Retry', imageAlt: 'Image shared in chat', fileType: 'Choose a JPG, PNG, WebP, or GIF image.', fileSize: 'Images can be up to 10 MB.', linkSafety: 'Only open links you trust. Links open in a new tab.',
  },
  ar: {
    title: 'الرسائل', intro: 'مساحة هادئة للمحادثات الخاصة.', search: 'ابحث عن عضو في المجتمع', searchHint: 'ابحث بالاسم أو اسم المستخدم', searchShort: 'اكتب حرفين على الأقل للبحث عن الأعضاء.', searching: 'جارٍ البحث…', loadingMessages: 'جارٍ تحميل الرسائل…', noPeople: 'لم نعثر على أعضاء بهذا البحث.', conversations: 'محادثاتك', noConversations: 'لا توجد محادثات بعد. ابحث عن عضو وأرسل له رسالة.', choose: 'اختر محادثة أو ابحث عن عضو لمراسلته.', signInTitle: 'سجّل الدخول لإرسال رسالة', signInBody: 'سجّل الدخول عبر Discord للبحث عن الأعضاء وبدء محادثات خاصة.', signIn: 'تسجيل الدخول عبر Discord', membershipTitle: 'انضم إلى المجتمع أولًا', membershipBody: 'تحقق من عضويتك في Discord لمتابعة الأعضاء وإرسال الرسائل.', follow: 'متابعة', following: 'تتابعه', followBack: 'متابعة أيضًا', mutual: 'متابعة متبادلة', mutualHint: 'لا توجد رسائل بعد. ابدأ التحية.', waiting: 'يتابعك', start: 'مراسلة', locked: 'يمكنك مراسلة أي عضو في المجتمع.', sendPlaceholder: 'اكتب رسالة…', send: 'إرسال', sending: 'جارٍ الإرسال…', startNote: 'يمكنك مراسلة أي عضو في المجتمع.', error: 'تعذر إتمام ذلك. حاول مرة أخرى.', messageError: 'تعذر إرسال الرسالة. حاول مرة أخرى.', emptyMessages: 'ابدأ المحادثة بتحية بسيطة.', back: 'العودة إلى المحادثات.', attach: 'إرفاق صورة', retry: 'إعادة المحاولة', imageAlt: 'صورة في المحادثة', fileType: 'اختر صورة JPG أو PNG أو WebP أو GIF.', fileSize: 'يجب ألا يتجاوز حجم الصورة ١٠ ميغابايت.', linkSafety: 'افتح الروابط التي تثق بها فقط. تفتح الروابط في نافذة جديدة.',
  },
} satisfies Record<Locale, Record<string, string>>

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json() as T & ApiError
  if (!response.ok) throw new Error(data.error ?? 'request_failed')
  return data
}

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value))
}

function Avatar({ avatarUrl, name }: { avatarUrl: string | null; name: string }) {
  return avatarUrl
    ? <img className="dm-avatar" src={avatarUrl} alt="" />
    : <span className="dm-avatar dm-avatar-fallback" aria-hidden="true"><UserRound /></span>
}

export function DirectMessagesSection({ viewer, locale, onSignIn, initialMessageTo }: { viewer: CurrentUser | null; locale: Locale; onSignIn: () => void; initialMessageTo?: string | null }) {
  const copy = labels[locale]
  const [search, setSearch] = useState(initialMessageTo ?? '')
  const deferredSearch = useDeferredValue(search.trim())
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [activePeer, setActivePeer] = useState<Peer | null>(null)
  const [draft, setDraft] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [caret, setCaret] = useState(0)
  const [sending, setSending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [busyPersonId, setBusyPersonId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const initialMessageOpened = useRef(false)
  const eligible = Boolean(viewer)

  const { data: peopleData, isLoading: peopleLoading, mutate: refreshPeople } = useSWR<{ people: Person[] }>(
    eligible && deferredSearch.length >= 2 ? `/api/dm/people?q=${encodeURIComponent(deferredSearch)}` : null,
    fetcher,
  )
  const { data: conversationsData, mutate: refreshConversations } = useSWR<{ conversations: Conversation[] }>(
    eligible ? '/api/dm/conversations' : null,
    fetcher,
    { refreshInterval: 7000 },
  )
  const { data: messagesData, error: messagesError, isLoading: messagesLoading, mutate: refreshMessages } = useSWR<{ messages: DirectMessage[] }>(
    eligible && activeConversationId ? `/api/dm/conversations/${activeConversationId}/messages` : null,
    fetcher,
    { refreshInterval: 5000 },
  )

  useEffect(() => {
    if (initialMessageOpened.current || !initialMessageTo || !peopleData?.people) return
    const person = peopleData.people.find((candidate) => candidate.username.toLowerCase() === initialMessageTo.toLowerCase())
    if (!person) return
    initialMessageOpened.current = true
    void createConversation(person)
  }, [initialMessageTo, peopleData?.people])

  async function createConversation(person: Peer) {
    setError('')
    try {
      const response = await fetch('/api/dm/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: person.id }),
      })
      const data = await response.json() as { conversationId?: string; error?: string }
      if (!response.ok || !data.conversationId) throw new Error(data.error ?? 'request_failed')
      setActivePeer(person)
      setActiveConversationId(data.conversationId)
      await refreshConversations()
    } catch {
      setError(copy.error)
    }
  }

  async function toggleFollow(person: Person) {
    setBusyPersonId(person.id)
    setError('')
    try {
      const response = await fetch(`/api/dm/follows/${person.id}`, { method: person.following ? 'DELETE' : 'POST' })
      if (!response.ok) throw new Error('follow_failed')
      await refreshPeople()
      await refreshConversations()
      if (!person.following && person.followsYou) await createConversation(person)
    } catch {
      setError(copy.error)
    } finally {
      setBusyPersonId(null)
    }
  }

  function selectMedia(file: File | null) {
    setError('')
    if (!file) return setMediaFile(null)
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return setError(copy.fileType)
    if (file.size > 10 * 1024 * 1024) return setError(copy.fileSize)
    setMediaFile(file)
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeConversationId || (!draft.trim() && !mediaFile) || sending) return
    setSending(true)
    setUploadProgress(0)
    setError('')
    try {
      let mediaUrl: string | null = null
      let mediaType: string | null = null
      if (mediaFile) {
        const uploadFile = mediaFile.type === 'image/gif' ? mediaFile : await compressImage(mediaFile)
        const result = await uploadMedia({ endpoint: '/api/dm/upload', file: uploadFile, kind: 'dm', onProgress: setUploadProgress })
        mediaUrl = result.url
        mediaType = uploadFile.type
      }
      const response = await fetch(`/api/dm/conversations/${activeConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim(), mediaUrl, mediaType }),
      })
      if (!response.ok) throw new Error('message_send_failed')
      setDraft('')
      setMediaFile(null)
      await Promise.all([refreshMessages(), refreshConversations()])
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'upload_failed'
      console.error('[dm] message flow failed', { reason: code })
      setError(localizedUploadError(code, locale, copy.messageError))
    } finally {
      setSending(false)
      setUploadProgress(0)
    }
  }

  if (!viewer) {
    return (
      <section className="section-view dm-view" aria-labelledby="dm-title">
        <div className="section-heading"><span className="section-kicker"><MessageCircle aria-hidden="true" />{copy.title}</span><h1 id="dm-title">{copy.signInTitle}</h1><p>{copy.signInBody}</p></div>
        <Button type="button" onClick={onSignIn}>{copy.signIn}</Button>
      </section>
    )
  }

  if (!eligible) {
    return (
      <section className="section-view dm-view" aria-labelledby="dm-title">
        <div className="section-heading"><span className="section-kicker"><MessageCircle aria-hidden="true" />{copy.title}</span><h1 id="dm-title">{copy.membershipTitle}</h1><p>{copy.membershipBody}</p></div>
      </section>
    )
  }

  const conversations = conversationsData?.conversations ?? []
  const people = peopleData?.people ?? []

  return (
    <section className="section-view dm-view" aria-labelledby="dm-title">
      <div className="section-heading dm-heading">
        <span className="section-kicker"><MessageCircle aria-hidden="true" />{copy.title}</span>
        <h1 id="dm-title">{copy.title}</h1>
        <p>{copy.intro}</p>
        <label className="section-search dm-search">
          <Search aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchHint} aria-label={copy.search} />
        </label>
      </div>

      {error && <div className="dm-error" role="alert"><p>{error}</p><Button type="button" size="sm" variant="outline" disabled={sending} onClick={() => document.querySelector<HTMLFormElement>('.dm-composer')?.requestSubmit()}>{copy.retry}</Button></div>}
      {search.trim().length > 0 && search.trim().length < 2 && <p className="dm-search-hint">{copy.searchShort}</p>}
      {deferredSearch.length >= 2 && (
        <section className="dm-search-results" aria-label={copy.search} aria-live="polite">
          {peopleLoading ? <p className="dm-search-hint">{copy.searching}</p> : people.length ? people.map((person) => (
            <article className="dm-person" key={person.id}>
              <a className="dm-person-link" href={`/u/${encodeURIComponent(person.username)}`}>
                <Avatar avatarUrl={person.avatarUrl} name={person.displayName} />
                <UserName userId={person.id} name={person.displayName} username={person.username} isNewAccount={person.isNewAccount} nameStyle={person.nameStyle} customTitle={person.customTitle} locale={locale} />
              </a>
              <span className="dm-person-actions">
                {person.followsYou && person.following ? <span className="dm-mutual"><Check aria-hidden="true" />{copy.mutual}</span> : person.following ? <span className="dm-follow-state">{copy.following}</span> : person.followsYou ? <span className="dm-follow-state">{copy.waiting}</span> : null}
                <Button type="button" size="sm" onClick={() => void createConversation(person)}>{copy.start}</Button>
                {(!person.following || !person.followsYou) && <Button type="button" variant={person.following ? 'outline' : 'secondary'} size="sm" disabled={busyPersonId === person.id} onClick={() => void toggleFollow(person)}>{person.following ? copy.following : person.followsYou ? copy.followBack : copy.follow}</Button>}
              </span>
            </article>
          )) : <p className="dm-search-hint">{copy.noPeople}</p>}
        </section>
      )}

      <div className="dm-workspace">
        <aside className={`dm-conversation-list ${activeConversationId ? 'dm-list-hidden-mobile' : ''}`} aria-label={copy.conversations}>
          <div className="dm-list-heading"><h2>{copy.conversations}</h2><span>{conversations.length}</span></div>
          {conversations.length ? conversations.map((conversation) => (
            <button className={`dm-conversation ${activeConversationId === conversation.id ? 'dm-conversation-active' : ''}`} key={conversation.id} type="button" onClick={() => { setActivePeer(conversation.peer); setActiveConversationId(conversation.id); setError('') }}>
              <Avatar avatarUrl={conversation.peer.avatarUrl} name={conversation.peer.displayName} />
              <span className="dm-conversation-copy"><UserName userId={conversation.peer.id} name={conversation.peer.displayName} username={conversation.peer.username} isNewAccount={conversation.peer.isNewAccount} nameStyle={conversation.peer.nameStyle} customTitle={conversation.peer.customTitle} locale={locale} /><small>{conversation.lastMessage ? <RichText text={conversation.lastMessage.body} /> : copy.mutualHint}</small></span>
              <time>{formatTime(conversation.lastMessageAt, locale)}</time>
            </button>
          )) : <Empty className="dm-list-empty"><EmptyHeader><EmptyMedia variant="icon"><MessageCircle aria-hidden="true" /></EmptyMedia><EmptyTitle>{copy.conversations}</EmptyTitle><EmptyDescription>{copy.noConversations}</EmptyDescription></EmptyHeader></Empty>}
        </aside>

        <div className={`dm-chat-panel ${activeConversationId ? 'dm-chat-panel-active' : ''}`}>
          {activeConversationId && activePeer ? (
            <>
              <header className="dm-chat-header">
                <Button className="dm-back-button" variant="ghost" size="icon" type="button" onClick={() => { setActiveConversationId(null); setActivePeer(null) }} aria-label={copy.back}><ArrowLeft /></Button>
                <Avatar avatarUrl={activePeer.avatarUrl} name={activePeer.displayName} />
                <UserName userId={activePeer.id} name={activePeer.displayName} username={activePeer.username} isNewAccount={activePeer.isNewAccount} nameStyle={activePeer.nameStyle} customTitle={activePeer.customTitle} locale={locale} />
              </header>
              <MessageScrollerProvider autoScroll>
                <MessageScroller className="dm-transcript" role="log" aria-label={`${copy.title} with ${activePeer.displayName}`} aria-live="polite" aria-relevant="additions text">
                  <MessageScrollerViewport>
                    <MessageScrollerContent className="dm-message-list">
                      <MessageScrollerItem><Marker variant="separator" className="dm-start-marker"><MarkerContent>{copy.startNote}</MarkerContent></Marker></MessageScrollerItem>
                      {messagesLoading && !messagesData ? <MessageScrollerItem><p className="dm-search-hint">{copy.loadingMessages}</p></MessageScrollerItem> : messagesData?.messages.length ? messagesData.messages.map((message, index) => {
                        const own = message.senderId === viewer.id
                        return (
                          <MessageScrollerItem key={message.id} scrollAnchor={index === messagesData.messages.length - 1}>
                            <MessageGroup>
                              <Message align={own ? 'end' : 'start'}>
                                {!own && <MessageAvatar><Avatar avatarUrl={activePeer.avatarUrl} name={activePeer.displayName} /></MessageAvatar>}
                                <MessageContent>
                                  {!own && <MessageHeader><UserName userId={activePeer.id} name={activePeer.displayName} username={activePeer.username} isNewAccount={activePeer.isNewAccount} nameStyle={activePeer.nameStyle} customTitle={activePeer.customTitle} locale={locale} /></MessageHeader>}
                                  <Bubble align={own ? 'end' : 'start'} variant={own ? 'tinted' : 'muted'}>
                                    <BubbleContent>{message.body && <RichText text={message.body} />}{message.mediaUrl && <img className="chat-attachment" src={message.mediaUrl} alt={copy.imageAlt} />}</BubbleContent>
                                  </Bubble>
                                  <MessageFooter>{formatTime(message.createdAt, locale)}</MessageFooter>
                                  <ChatReactions chatType="direct" messageId={message.id} reactions={message.reactions} locale={locale} onChange={() => { void refreshMessages() }} />
                                </MessageContent>
                              </Message>
                            </MessageGroup>
                          </MessageScrollerItem>
                        )
                      }) : <MessageScrollerItem><p className="dm-first-message">{messagesError ? copy.messageError : copy.emptyMessages}</p></MessageScrollerItem>}
                    </MessageScrollerContent>
                  </MessageScrollerViewport>
                  <MessageScrollerButton className="dm-jump-button" />
                </MessageScroller>
              </MessageScrollerProvider>
              <form className="dm-composer" onSubmit={sendMessage}>
                <label className="sr-only" htmlFor="dm-message-input">{copy.sendPlaceholder}</label>
                <InputGroup className="dm-composer-group">
                  <InputGroupTextarea id="dm-message-input" rows={1} maxLength={2000} value={draft} onChange={(event) => { setDraft(event.target.value); setCaret(event.target.selectionStart) }} onClick={(event) => setCaret(event.currentTarget.selectionStart)} onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)} placeholder={copy.sendPlaceholder} />
                  <InputGroupAddon className="dm-composer-addon" align="block-end">
                    <label className="chat-media-picker" title={copy.attach}>
                      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={copy.attach} onChange={(event) => { selectMedia(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} />
                      <ImagePlus aria-hidden="true" />
                    </label>
                    <InputGroupButton type="submit" disabled={(!draft.trim() && !mediaFile) || sending} aria-label={sending ? copy.sending : copy.send}>
                      <Send data-icon="inline-start" />{sending ? copy.sending : copy.send}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                {mediaFile && <span className="chat-selected-media" dir="ltr">{mediaFile.name}</span>}
                {sending && mediaFile && <div className="upload-progress"><div><span>{copy.attach}</span><strong>{uploadProgress}%</strong></div><progress value={uploadProgress} max={100} aria-label={copy.attach} /></div>}
                <MentionSuggestions value={draft} caret={caret} locale={locale} onSelect={(value, nextCaret) => {
                  setDraft(value)
                  setCaret(nextCaret)
                }} />
              </form>
              <p className="chat-safety-note">{copy.linkSafety}</p>
            </>
          ) : (
            <div className="dm-placeholder"><span><MessageCircle aria-hidden="true" /></span><p>{copy.choose}</p></div>
          )}
        </div>
      </div>
    </section>
  )
}
