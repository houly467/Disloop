'use client'

import { useDeferredValue, useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Crown, Hash, ImagePlus, MessageCircle, Plus, Search, Send, Trash2, Trophy, UsersRound, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CurrentUser } from '@/lib/session'
import { EquippedBadges } from '@/components/badge-display'
import { UserName } from '@/components/user-name'
import { ChatReactions } from '@/components/chat-reactions'
import { RichText } from '@/components/mention-textarea'
import type { MessageReaction } from '@/lib/chat'
import { compressImage } from '@/lib/image-compression'
import { uploadMedia } from '@/lib/client-upload'
import { localizedUploadError } from '@/lib/client-errors'

const copy = {
  en: {
    title: 'Groups', intro: 'Small circles for shared interests and conversations.', join: 'Join group', create: 'Create a group', name: 'Group name', description: 'What is this group about?', tag: 'Group tag', createAction: 'Create group', creating: 'Creating…', yourGroups: 'Explore groups', topGroups: 'Top groups', members: 'Members', messages: 'Group chat', send: 'Send', placeholder: 'Write a message…', groupSearch: 'Search groups by name, description, or #tag', owner: 'Group owner', attach: 'Attach image', imageAlt: 'Image shared in group chat', fileType: 'Choose a JPG, PNG, WebP, or GIF image.', fileSize: 'Images can be up to 10 MB.', loading: 'Loading groups…', loadError: 'Groups could not be loaded. Please retry.', retry: 'Retry', linkSafety: 'Only open links you trust. Links open in a new tab.', empty: 'No groups yet. Start a small circle.', noSearchResults: 'No groups match that search.', emptyMessages: 'Say hello to get the conversation started.', error: 'That did not work. Please try again.', tagTaken: 'That group tag is already taken.', membershipRequired: 'Join the Discord server before creating a group.', membershipUnavailable: 'Discord membership could not be checked. Please try again.', rank: 'Rank', xp: 'XP', yourGroup: 'Your group', yourBestGroup: 'Your highest-ranked group', liveStats: 'Live · refreshes every 10 seconds', xpPerPost: 'Every group post adds 10 XP', alreadyInGroup: 'You can only belong to one group at a time.', groupLimit: 'Each account can create one group in total.', deleteGroup: 'Delete group', deletingGroup: 'Deleting…', deleteGroupConfirm: 'Permanently delete this group and its messages? This cannot be undone.',
  },
  ar: {
    title: 'المجموعات', intro: 'مساحات صغيرة للاهتمامات المشتركة والحوار.', join: 'انضم للمجموعة', create: 'أنشئ مجموعة', name: 'اسم المجموعة', description: 'عن ماذا تتحدث المجموعة؟', tag: 'وسم المجموعة', createAction: 'إنشاء المجموعة', creating: 'جارٍ الإنشاء…', yourGroups: 'استكشف المجموعات', topGroups: 'أفضل المجموعات', members: 'الأعضاء', messages: 'محادثة المجموعة', send: 'إرسال', placeholder: 'اكتب رسالة…', groupSearch: 'ابحث عن المجموعات بالاسم أو الوصف أو #الوسم', owner: 'مالك المجموعة', attach: 'إرفاق صورة', imageAlt: 'صورة في محادثة المجموعة', fileType: 'اختر صورة JPG أو PNG أو WebP أو GIF.', fileSize: 'يجب ألا يتجاوز حجم الصورة ١٠ ميغابايت.', loading: 'جارٍ تحميل المجموعات…', loadError: 'تعذر تحميل المجموعات. حاول مرة أخرى.', retry: 'إعادة المحاولة', linkSafety: 'افتح الروابط التي تثق بها فقط. تفتح الروابط في نافذة جديدة.', empty: 'لا توجد مجموعات بعد. أنشئ مساحة صغيرة.', noSearchResults: 'لا توجد مجموعات تطابق هذا البحث.', emptyMessages: 'ابدأ المحادثة بتحية بسيطة.', error: 'تعذر إتمام ذلك. حاول مرة أخرى.', tagTaken: 'وسم المجموعة مستخدم بالفعل.', membershipRequired: 'انضم إلى سيرفر Discord قبل إنشاء مجموعة.', membershipUnavailable: 'تعذر التحقق من عضويتك في Discord. حاول مرة أخرى.', rank: 'الترتيب', xp: 'نقاط الخبرة', yourGroup: 'مجموعتك', yourBestGroup: 'مجموعتك الأعلى ترتيبًا', liveStats: 'مباشر · يتحدث كل ١٠ ثوانٍ', xpPerPost: 'كل منشور في المجموعة يضيف ١٠ نقاط خبرة', alreadyInGroup: 'يمكنك الانضمام إلى مجموعة واحدة فقط في كل مرة.', groupLimit: 'يمكن لكل حساب إنشاء مجموعة واحدة فقط طوال الوقت.', deleteGroup: 'حذف المجموعة', deletingGroup: 'جارٍ الحذف…', deleteGroupConfirm: 'هل تريد حذف هذه المجموعة ورسائلها نهائيًا؟ لا يمكن التراجع عن ذلك.',
  },
} as const

type Locale = 'en' | 'ar'
type GroupSummary = { id: string; name: string; description: string; tag: string; ownerId: string; memberCount: number; isMember: boolean; xp: number; rank: number }
type GroupsData = { groups: GroupSummary[]; topGroups: GroupSummary[]; myGroup: GroupSummary | null; hasCreatedGroup: boolean }
type GroupMessage = { id: string; senderId: string; body: string; mediaUrl: string | null; mediaType: string | null; createdAt: string; senderName?: string; senderAvatar?: string | null; senderNameStyle?: string | null; senderCustomTitle?: string | null; reactions: MessageReaction[] }
type GroupMember = { id: string; displayName: string; username: string; avatarUrl: string | null; nameStyle: string | null; customTitle: string | null; role: string; joinedAt: string }
type GroupData = { group: Pick<GroupSummary, 'id' | 'name' | 'description' | 'tag' | 'ownerId'>; role: string; members: GroupMember[]; messages: GroupMessage[] }

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) {
    console.error('[groups] API request failed', { path: new URL(url, window.location.origin).pathname, status: response.status, message: data.error ?? 'request_failed' })
    throw new Error(data.error ?? 'request_failed')
  }
  return data
}

export function GroupsSection({ viewer, locale, onSignIn, onMembershipVerified }: { viewer: CurrentUser | null; locale: Locale; onSignIn: () => void; onMembershipVerified?: () => void }) {
  const labels = copy[locale]
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tag, setTag] = useState('')
  const [draft, setDraft] = useState('')
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [groupSearch, setGroupSearch] = useState('')
  const deferredGroupSearch = useDeferredValue(groupSearch.trim())
  const [deletingGroup, setDeletingGroup] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const groupsUrl = deferredGroupSearch ? `/api/groups?q=${encodeURIComponent(deferredGroupSearch)}` : '/api/groups'
  const { data, error: groupsLoadError, mutate: refreshGroups } = useSWR<GroupsData>(groupsUrl, fetcher, { refreshInterval: 10_000, keepPreviousData: true })
  const { data: groupDetail, mutate: refreshGroup } = useSWR<GroupData>(selectedGroupId ? `/api/groups/${selectedGroupId}` : null, fetcher)
  const groups = data?.groups ?? []
  const topGroups = data?.topGroups ?? []
  const myGroup = data?.myGroup ?? null
  const selectedGroup = groupDetail?.group

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description, tag }) })
      const result = await response.json() as { group?: { id: string }; error?: string }
      if (!response.ok || !result.group) throw new Error(result.error ?? 'create_failed')
      setName('')
      setDescription('')
      setTag('')
      onMembershipVerified?.()
      setSelectedGroupId(result.group.id)
      await refreshGroups()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setError(message === 'group_tag_taken' ? labels.tagTaken : message === 'group_limit_reached' ? labels.groupLimit : message === 'group_membership_exists' ? labels.alreadyInGroup : message === 'membership_required' ? labels.membershipRequired : message === 'membership_unavailable' ? labels.membershipUnavailable : labels.error)
    } finally {
      setBusy(false)
    }
  }

  async function joinGroup(group: GroupSummary) {
    try {
      const response = await fetch(`/api/groups/${group.id}/join`, { method: 'POST' })
      const result = await response.json() as { error?: string }
      if (!response.ok) {
        setError(result.error === 'group_membership_exists' ? labels.alreadyInGroup : labels.error)
        return
      }
      await refreshGroups()
      setSelectedGroupId(group.id)
    } catch {
      setError(labels.error)
    }
  }


  async function deleteGroup() {
    if (!selectedGroupId || !groupDetail || groupDetail.role !== 'owner' || deletingGroup) return
    if (!window.confirm(labels.deleteGroupConfirm)) return

    setDeletingGroup(true)
    setError('')
    try {
      const response = await fetch(`/api/groups/${selectedGroupId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('delete_failed')
      setSelectedGroupId(null)
      await refreshGroups()
    } catch {
      setError(labels.error)
    } finally {
      setDeletingGroup(false)
    }
  }

  function selectMedia(file: File | null) {
    setError('')
    if (!file) return setMediaFile(null)
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) return setError(labels.fileType)
    if (file.size > 5 * 1024 * 1024) return setError(labels.fileSize)
    setMediaFile(file)
  }

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedGroupId || (!draft.trim() && !mediaFile) || busy) return
    setBusy(true)
    setError('')
    try {
      let mediaUrl: string | null = null
      if (mediaFile) {
        const uploadFile = mediaFile.type === 'image/gif' ? mediaFile : await compressImage(mediaFile)
        const result = await uploadMedia({ endpoint: '/api/dm/upload', file: uploadFile, kind: 'group', onProgress: setUploadProgress })
        mediaUrl = result.url
      }
      const response = await fetch(`/api/groups/${selectedGroupId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: draft.trim(), mediaUrl, mediaType: mediaFile?.type ?? null }) })
      if (!response.ok) throw new Error('send_failed')
      setDraft('')
      setMediaFile(null)
      await Promise.all([refreshGroup(), refreshGroups()])
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : 'upload_failed'
      console.error('[groups] message flow failed', { reason: code })
      setError(localizedUploadError(code, locale, labels.error))
    } finally {
      setBusy(false)
      setUploadProgress(0)
    }
  }


  if (!viewer) return <section className="section-view groups-view" aria-labelledby="groups-title" dir={locale === 'ar' ? 'rtl' : 'ltr'}><div className="section-heading"><span className="section-kicker"><UsersRound aria-hidden="true" />{labels.title}</span><h1 id="groups-title">{labels.title}</h1><p>{labels.intro}</p></div><Button type="button" onClick={onSignIn}>{locale === 'ar' ? 'سجّل الدخول للانضمام' : 'Sign in to join'}</Button></section>

  return (
    <section className="section-view groups-view" aria-labelledby="groups-title" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="section-heading"><span className="section-kicker"><UsersRound aria-hidden="true" />{labels.title}</span><h1 id="groups-title">{labels.title}</h1><p>{labels.intro}</p></div>
      {groupsLoadError && <div className="groups-error" role="alert"><p>{labels.loadError}</p><Button type="button" size="sm" variant="outline" onClick={() => void refreshGroups()}>{labels.retry}</Button></div>}
      {error && <div className="groups-error" role="alert"><p>{error}</p>{mediaFile && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => document.querySelector<HTMLFormElement>('.group-message-form')?.requestSubmit()}>{labels.retry}</Button>}</div>}
      {selectedGroup && groupDetail ? (
        <div className="group-detail-view">
          <header className="group-detail-heading"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedGroupId(null)}><ArrowLeft data-icon="inline-start" />{labels.yourGroups}</Button><div><span className="group-tag-pill" dir="ltr"><Hash aria-hidden="true" />{selectedGroup.tag}</span><h2>{selectedGroup.name}</h2><p>{selectedGroup.description}</p></div></header>
          <div className="group-detail-grid">
            <section className="group-chat-panel" aria-label={labels.messages}>
              <h3><MessageCircle aria-hidden="true" />{labels.messages}</h3>
              <div className="group-message-list" role="log" aria-live="polite">
                {groupDetail.messages.length ? groupDetail.messages.map((message) => <article className="group-message" key={message.id}>{message.senderAvatar ? <img src={message.senderAvatar} alt="" /> : <span className="group-message-avatar">{message.senderName?.charAt(0) ?? 'D'}</span>}<div><UserName userId={message.senderId} name={message.senderName ?? viewer.displayName} nameStyle={message.senderNameStyle} customTitle={message.senderCustomTitle} locale={locale} />{message.body && <p><RichText text={message.body} /></p>}{message.mediaUrl && <img className="chat-attachment" src={message.mediaUrl} alt={labels.imageAlt} />}<ChatReactions chatType="group" messageId={message.id} reactions={message.reactions} locale={locale} onChange={() => { void refreshGroup() }} /></div><time>{new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { hour: 'numeric', minute: '2-digit' }).format(new Date(message.createdAt))}</time></article>) : <p className="group-empty-messages">{labels.emptyMessages}</p>}
              </div>
              <form className="group-message-form" onSubmit={sendMessage}><label className="chat-media-picker" title={labels.attach}><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={labels.attach} onChange={(event) => { selectMedia(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} /><ImagePlus aria-hidden="true" /></label><label className="sr-only" htmlFor="group-message-input">{labels.placeholder}</label><input id="group-message-input" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder={labels.placeholder} /><Button type="submit" size="sm" disabled={(!draft.trim() && !mediaFile) || busy} aria-label={labels.send}><Send data-icon="inline-start" />{labels.send}</Button></form>
              {mediaFile && <span className="chat-selected-media" dir="ltr">{mediaFile.name}</span>}
              {busy && mediaFile && <div className="upload-progress"><div><span>{labels.attach}</span><strong>{uploadProgress}%</strong></div><progress value={uploadProgress} max={100} aria-label={labels.attach} /></div>}
              <p className="chat-safety-note">{labels.linkSafety}</p>
            </section>
            <aside className="group-info-panel" aria-label={labels.members}>
              <div className="group-info-title"><h3>{labels.members}</h3><span>{groupDetail.members.length}</span></div>
              {groupDetail.members.map((member) => <div className="group-member-row" key={member.id}>{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : <span className="group-message-avatar">{member.displayName.charAt(0)}</span>}<UserName userId={member.id} name={member.displayName} username={member.username} nameStyle={member.nameStyle} customTitle={member.customTitle} locale={locale} />{member.role === 'owner' || member.role === 'admin' ? <span className="group-owner-badge" title={labels.owner} aria-label={labels.owner}><Crown aria-hidden="true" /></span> : null}</div>)}
              {groupDetail.role === 'owner' && selectedGroup.ownerId === viewer.id && <Button type="button" size="sm" variant="destructive" disabled={deletingGroup} onClick={() => void deleteGroup()}><Trash2 data-icon="inline-start" />{deletingGroup ? labels.deletingGroup : labels.deleteGroup}</Button>}
            </aside>
          </div>
        </div>
      ) : (
        <div className="groups-directory">
          <section className="top-groups" aria-labelledby="top-groups-title">
            <div className="groups-list-heading"><h2 id="top-groups-title">{labels.topGroups}</h2><span>{locale === 'ar' ? 'أفضل ٥' : 'TOP 5'}</span></div>
            <div className="groups-live-meta"><span><Zap aria-hidden="true" />{labels.liveStats}</span><span>{labels.xpPerPost}</span></div>
            {topGroups.map((group) => <button type="button" className="top-group-row" key={group.id} onClick={() => group.isMember ? setSelectedGroupId(group.id) : void joinGroup(group)} aria-label={`${labels.rank} ${group.rank}: ${group.name}, ${group.xp} ${labels.xp}`}>
              <strong className="top-group-rank">{String(group.rank).padStart(2, '0')}</strong>
              <span><strong>{group.name}</strong><small dir="ltr">#{group.tag}{group.isMember ? ` · ${labels.yourGroup}` : ''}</small></span>
              <span className="group-live-stats"><span><Zap aria-hidden="true" />{new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en-US').format(group.xp)} {labels.xp}</span><span><UsersRound aria-hidden="true" />{group.memberCount}</span></span>
            </button>)}
          </section>
          {myGroup && <section className="group-own-rank" aria-labelledby="group-own-rank-title">
            <h2 id="group-own-rank-title"><Trophy aria-hidden="true" />{labels.yourBestGroup}</h2>
            <button type="button" className="group-list-card" onClick={() => setSelectedGroupId(myGroup.id)} aria-label={`${labels.rank} ${myGroup.rank}: ${myGroup.name}`}>
              <span className="group-card-mark"><Trophy aria-hidden="true" /></span>
              <span className="group-list-copy"><strong>{myGroup.name}</strong><small dir="ltr">#{myGroup.tag}</small></span>
              <span className="group-list-stats"><strong>#{myGroup.rank}</strong><span>{new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en-US').format(myGroup.xp)} {labels.xp}</span><span className="group-member-count">{myGroup.memberCount} <UsersRound aria-hidden="true" /></span></span>
            </button>
          </section>}
          <section className="groups-list" aria-labelledby="groups-list-title">
            <div className="groups-list-heading"><h2 id="groups-list-title">{labels.yourGroups}</h2><span>{groups.length}</span></div>
            <label className="group-search-field"><Search aria-hidden="true" /><span className="sr-only">{labels.groupSearch}</span><input type="search" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder={labels.groupSearch} autoComplete="off" /></label>
            {groupsLoadError ? null : !data ? <p className="group-directory-empty">{labels.loading}</p> : groups.length ? groups.map((group) => <button type="button" className="group-list-card" key={group.id} onClick={() => group.isMember ? setSelectedGroupId(group.id) : void joinGroup(group)} aria-label={`${labels.rank} ${group.rank}: ${group.name}${group.isMember ? '' : ` — ${labels.join}`}`}>
              <span className="group-card-mark"><UsersRound aria-hidden="true" /></span>
              <span className="group-list-copy"><strong>{group.name}</strong><small>{group.description}</small><span className="group-tag-pill" dir="ltr"><Hash aria-hidden="true" />{group.tag}</span></span>
              <span className="group-list-stats"><strong>#{group.rank}</strong><span>{new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en-US').format(group.xp)} {labels.xp}</span><span className="group-member-count">{group.memberCount} <UsersRound aria-hidden="true" /></span></span>
            </button>) : <p className="group-directory-empty">{deferredGroupSearch ? labels.noSearchResults : labels.empty}</p>}
          </section>
          {data?.hasCreatedGroup
            ? <p className="group-create-limit" role="status">{labels.groupLimit}</p>
            : <form className="group-create-form" onSubmit={createGroup}><h2><Plus aria-hidden="true" />{labels.create}</h2><label>{labels.name}<input required maxLength={70} value={name} onChange={(event) => setName(event.target.value)} /></label><label>{labels.description}<textarea maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>{labels.tag}<input required dir="ltr" maxLength={24} value={tag} onChange={(event) => setTag(event.target.value.replace(/^#/, ''))} placeholder="#community" /></label><Button type="submit" disabled={busy || !name.trim() || !tag.trim()}>{busy ? labels.creating : labels.createAction}</Button></form>}
        </div>
      )}
    </section>
  )
}
