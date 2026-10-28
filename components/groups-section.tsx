'use client'

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Check, Crown, Ellipsis, Hash, ImagePlus, LoaderCircle, MessageCircle, Plus, Search, Send, Trash2, Trophy, UserPlus, UsersRound, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ModalPortal } from '@/components/modal-portal'
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
    title: 'Groups', intro: 'Small circles for shared interests and conversations.', join: 'Join group', create: 'Create a group', name: 'Group name', description: 'What is this group about?', tag: 'Group tag', createAction: 'Create group', creating: 'Creating…', yourGroups: 'Explore groups', topGroups: 'Top groups', members: 'Members', messages: 'Group chat', send: 'Send', placeholder: 'Write a message…', groupSearch: 'Search groups by name, description, or #tag', owner: 'Group owner', attach: 'Attach image', imageAlt: 'Image shared in group chat', fileType: 'Choose a JPG, PNG, WebP, or GIF image.', fileSize: 'Images can be up to 10 MB.', loading: 'Loading groups…', loadError: 'Groups could not be loaded. Please retry.', retry: 'Retry', linkSafety: 'Only open links you trust. Links open in a new tab.', empty: 'No groups yet. Start a small circle.', noSearchResults: 'No groups match that search.', emptyMessages: 'Say hello to get the conversation started.', error: 'That did not work. Please try again.', tagTaken: 'That group tag is already taken.', membershipRequired: 'Join the Discord server before creating a group.', membershipUnavailable: 'Discord membership could not be checked. Please try again.', rank: 'Rank', xp: 'XP', yourGroup: 'Your group', yourBestGroup: 'Your highest-ranked group', liveStats: 'Live · refreshes every 10 seconds', xpPerPost: 'Every group post adds 10 XP', alreadyInGroup: 'You can only belong to one group at a time.', groupLimit: 'Each account can create one group in total.', deleteGroup: 'Delete group', deletingGroup: 'Deleting…', deleteGroupConfirm: 'Permanently delete this group and its messages? This cannot be undone.', invite: 'Invite', inviteSearch: 'Search people to invite', inviteEmpty: 'No matching people.', inviteInvite: 'Invite', inviteInvited: 'Invited', inviteCancel: 'Cancel', inviteStatusPending: 'Pending', inviteStatusAccepted: 'Accepted', inviteStatusRejected: 'Rejected', inviteClose: 'Close', inviteMembersOnly: 'Use this to invite people into the group.', inviteRoleOwner: 'Owner', inviteRoleAdmin: 'Admin', inviteRoleMember: 'Member', inviteErrorBlocked: 'That user has blocked you or you have blocked them.',
  },
  ar: {
    title: 'المجموعات', intro: 'مساحات صغيرة للاهتمامات المشتركة والحوار.', join: 'انضم للمجموعة', create: 'أنشئ مجموعة', name: 'اسم المجموعة', description: 'عن ماذا تتحدث المجموعة؟', tag: 'وسم المجموعة', createAction: 'إنشاء المجموعة', creating: 'جارٍ الإنشاء…', yourGroups: 'استكشف المجموعات', topGroups: 'أفضل المجموعات', members: 'الأعضاء', messages: 'محادثة المجموعة', send: 'إرسال', placeholder: 'اكتب رسالة…', groupSearch: 'ابحث عن المجموعات بالاسم أو الوصف أو #الوسم', owner: 'مالك المجموعة', attach: 'إرفاق صورة', imageAlt: 'صورة في محادثة المجموعة', fileType: 'اختر صورة JPG أو PNG أو WebP أو GIF.', fileSize: 'يجب ألا يتجاوز حجم الصورة ١٠ ميغابايت.', loading: 'جارٍ تحميل المجموعات…', loadError: 'تعذر تحميل المجموعات. حاول مرة أخرى.', retry: 'إعادة المحاولة', linkSafety: 'افتح الروابط التي تثق بها فقط. تفتح الروابط في نافذة جديدة.', empty: 'لا توجد مجموعات بعد. أنشئ مساحة صغيرة.', noSearchResults: 'لا توجد مجموعات تطابق هذا البحث.', emptyMessages: 'ابدأ المحادثة بتحية بسيطة.', error: 'تعذر إتمام ذلك. حاول مرة أخرى.', tagTaken: 'وسم المجموعة مستخدم بالفعل.', membershipRequired: 'انضم إلى سيرفر Discord قبل إنشاء مجموعة.', membershipUnavailable: 'تعذر التحقق من عضويتك في Discord. حاول مرة أخرى.', rank: 'الترتيب', xp: 'نقاط الخبرة', yourGroup: 'مجموعتك', yourBestGroup: 'مجموعتك الأعلى ترتيبًا', liveStats: 'مباشر · يتحدث كل ١٠ ثوانٍ', xpPerPost: 'كل منشور في المجموعة يضيف ١٠ نقاط خبرة', alreadyInGroup: 'يمكنك الانضمام إلى مجموعة واحدة فقط في كل مرة.', groupLimit: 'يمكن لكل حساب إنشاء مجموعة واحدة فقط طوال الوقت.', deleteGroup: 'حذف المجموعة', deletingGroup: 'جارٍ الحذف…', deleteGroupConfirm: 'هل تريد حذف هذه المجموعة ورسائلها نهائيًا؟ لا يمكن التراجع عن ذلك.', invite: 'دعوة', inviteSearch: 'ابحث عن الأشخاص للدعوة', inviteEmpty: 'لا توجد نتائج مطابقة.', inviteInvite: 'دعوة', inviteInvited: 'مدعو', inviteCancel: 'إلغاء', inviteStatusPending: 'قيد الانتظار', inviteStatusAccepted: 'مقبول', inviteStatusRejected: 'مرفوض', inviteClose: 'إغلاق', inviteMembersOnly: 'استخدم هذه الإضافة لدعوة أشخاص إلى المجموعة.', inviteRoleOwner: 'مالك', inviteRoleAdmin: 'مشرف', inviteRoleMember: 'عضو', inviteErrorBlocked: 'هذا المستخدم قام بحظرك أو أنت قمت بحظره.',
  },
} as const

type Locale = 'en' | 'ar'
type GroupSummary = { id: string; name: string; description: string; tag: string; ownerId: string; memberCount: number; isMember: boolean; xp: number; rank: number }
type GroupsData = { groups: GroupSummary[]; topGroups: GroupSummary[]; myGroup: GroupSummary | null; hasCreatedGroup: boolean }
type GroupMessage = { id: string; senderId: string; body: string; mediaUrl: string | null; mediaType: string | null; createdAt: string; senderName?: string; senderAvatar?: string | null; senderIsNewAccount?: boolean; senderNameStyle?: string | null; senderCustomTitle?: string | null; reactions: MessageReaction[] }
type GroupMember = { id: string; displayName: string; username: string; avatarUrl: string | null; isNewAccount: boolean; nameStyle: string | null; customTitle: string | null; role: string; joinedAt: string }
type GroupData = { group: Pick<GroupSummary, 'id' | 'name' | 'description' | 'tag' | 'ownerId'>; role: string; members: GroupMember[]; messages: GroupMessage[] }
type InvitePerson = { id: string; username: string; displayName: string; avatarUrl: string | null; isMember: boolean; membershipGroupId: string | null; pendingInviteId: string | null }
type InviteSearchData = { people: InvitePerson[] }
type InviteManagementData = { invites: Array<{ id: string; inviteeId: string; displayName: string; username: string; avatarUrl: string | null; createdAt: string; expiresAt: string }>; history: Array<{ inviteeId: string; displayName: string; username: string; status: string; actedAt: string }> }

const groupActionCopy = {
  en: {
    yourGroups: 'Your groups', topGroups: 'Your group rankings', groupSearch: 'Search your groups by name, description, or #tag',
    inviteSearch: 'Search by username or name', inviteEmpty: 'No users found.', inviteTypeMore: 'Enter at least 2 characters to search.',
    inviteLoading: 'Searching people…', inviteSend: 'Invite', invitePending: 'Pending', inviteMember: 'Member',
    inviteOtherGroup: 'In another group', inviteCancel: 'Cancel invite', inviteClose: 'Close',
    inviteError: 'Could not update the invitation. Please try again.', inviteErrorBlocked: 'That user has blocked you or you have blocked them.',
    invitePermissionError: 'Only a group owner or admin can invite people.',
    kickMenu: 'Member options', kick: 'Kick', kickConfirmTitle: 'Remove member?',
    kickConfirm: 'Remove @{username} from the group?', kickCancel: 'Cancel', kickWorking: 'Removing…',
    kickSuccess: 'Member removed.', kickError: 'Could not remove this member. Please try again.',
    kickPermissionError: 'Only a group owner or admin can remove members.',
  },
  ar: {
    yourGroups: 'مجموعاتك', topGroups: 'ترتيب مجموعاتك', groupSearch: 'ابحث في مجموعاتك بالاسم أو الوصف أو #الوسم',
    inviteSearch: 'ابحث باسم المستخدم أو الاسم', inviteEmpty: 'لم يتم العثور على أشخاص.', inviteTypeMore: 'أدخل حرفين على الأقل للبحث.',
    inviteLoading: 'جارٍ البحث عن الأشخاص…', inviteSend: 'دعوة', invitePending: 'قيد الانتظار', inviteMember: 'عضو',
    inviteOtherGroup: 'في مجموعة أخرى', inviteCancel: 'إلغاء الدعوة', inviteClose: 'إغلاق',
    inviteError: 'تعذر تحديث الدعوة. حاول مرة أخرى.', inviteErrorBlocked: 'قام هذا المستخدم بحظرك أو قمت بحظره.',
    invitePermissionError: 'يمكن لمالك المجموعة أو المشرف فقط دعوة الأشخاص.',
    kickMenu: 'خيارات العضو', kick: 'إزالة', kickConfirmTitle: 'إزالة عضو؟',
    kickConfirm: 'هل تريد إزالة @{username} من المجموعة؟', kickCancel: 'إلغاء', kickWorking: 'جارٍ الإزالة…',
    kickSuccess: 'تمت إزالة العضو.', kickError: 'تعذرت إزالة هذا العضو. حاول مرة أخرى.',
    kickPermissionError: 'يمكن لمالك المجموعة أو المشرف فقط إزالة الأعضاء.',
  },
} satisfies Record<Locale, Record<string, string>>

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) {
    console.error('[groups] API request failed', { path: new URL(url, window.location.origin).pathname, status: response.status, message: data.error ?? 'request_failed' })
    throw new Error(data.error ?? 'request_failed')
  }
  return data
}

export function GroupsSection({ viewer, locale, onSignIn }: { viewer: CurrentUser | null; locale: Locale; onSignIn: () => void }) {
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
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteQuery, setInviteQuery] = useState('')
  const [debouncedInviteQuery, setDebouncedInviteQuery] = useState('')
  const [inviteBusyUserId, setInviteBusyUserId] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [kickMenuMemberId, setKickMenuMemberId] = useState<string | null>(null)
  const [kickTarget, setKickTarget] = useState<GroupMember | null>(null)
  const [kickBusy, setKickBusy] = useState(false)
  const [memberNotice, setMemberNotice] = useState('')
  const inviteInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const groupsUrl = deferredGroupSearch ? `/api/groups?q=${encodeURIComponent(deferredGroupSearch)}` : '/api/groups'
  const { data, error: groupsLoadError, mutate: refreshGroups } = useSWR<GroupsData>(groupsUrl, fetcher, { refreshInterval: 10_000, keepPreviousData: true })
  const { data: groupDetail, error: groupDetailError, mutate: refreshGroup } = useSWR<GroupData>(selectedGroupId ? `/api/groups/${selectedGroupId}` : null, fetcher, { refreshInterval: 15_000 })
  const inviteSearchUrl = selectedGroupId && inviteModalOpen && debouncedInviteQuery.length >= 2
    ? `/api/groups/${selectedGroupId}/invites?q=${encodeURIComponent(debouncedInviteQuery)}`
    : null
  const { data: inviteSearchData, error: inviteSearchLoadError, isLoading: inviteSearchLoading, mutate: refreshInviteSearch } = useSWR<InviteSearchData>(inviteSearchUrl, fetcher)
  const { data: inviteManagementData, mutate: refreshInviteManagement } = useSWR<InviteManagementData>(
    selectedGroupId && inviteModalOpen ? `/api/groups/${selectedGroupId}/invites` : null,
    fetcher,
  )
  const groups = data?.groups ?? []
  const topGroups = data?.topGroups ?? []
  const myGroup = data?.myGroup ?? null
  const selectedGroup = groupDetail?.group
  const actionLabels = groupActionCopy[locale]

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedInviteQuery(inviteQuery.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [inviteQuery])

  useEffect(() => {
    if (!inviteModalOpen) return
    const timer = window.setTimeout(() => inviteInputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [inviteModalOpen])

  useEffect(() => {
    if (!kickMenuMemberId) return
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.group-member-actions')) setKickMenuMemberId(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setKickMenuMemberId(null)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [kickMenuMemberId])

  useEffect(() => {
    const groupId = new URLSearchParams(window.location.search).get('group')
    if (groupId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId)) {
      setSelectedGroupId(groupId)
    }
  }, [])

  useEffect(() => {
    if (groupDetailError instanceof Error && groupDetailError.message === 'group_membership_required') {
      setSelectedGroupId(null)
      void refreshGroup(undefined, { revalidate: false })
    }
  }, [groupDetailError, refreshGroup])

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
      setSelectedGroupId(result.group.id)
      await refreshGroups()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ''
      setError(message === 'group_tag_taken' ? labels.tagTaken : message === 'group_limit_reached' ? labels.groupLimit : message === 'group_membership_exists' ? labels.alreadyInGroup : message === 'membership_required' ? labels.membershipRequired : message === 'membership_unavailable' ? labels.membershipUnavailable : labels.error)
    } finally {
      setBusy(false)
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

  async function sendGroupInvite(person: InvitePerson) {
    if (!selectedGroupId || inviteBusyUserId) return
    setInviteBusyUserId(person.id)
    setInviteError('')
    try {
      const response = await fetch(`/api/groups/${selectedGroupId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: person.id }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'invite_failed')
      await Promise.all([refreshInviteSearch(), refreshInviteManagement()])
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      setInviteError(code === 'blocked' ? actionLabels.inviteErrorBlocked : code === 'group_invite_permission_required' ? actionLabels.invitePermissionError : actionLabels.inviteError)
    } finally {
      setInviteBusyUserId(null)
    }
  }

  async function cancelGroupInvite(inviteId: string, inviteeId: string) {
    if (!selectedGroupId || inviteBusyUserId) return
    setInviteBusyUserId(inviteeId)
    setInviteError('')
    try {
      const response = await fetch(`/api/groups/${selectedGroupId}/invites`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'invite_cancel_failed')
      await Promise.all([refreshInviteSearch(), refreshInviteManagement()])
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      setInviteError(code === 'group_invite_permission_required' ? actionLabels.invitePermissionError : actionLabels.inviteError)
    } finally {
      setInviteBusyUserId(null)
    }
  }

  async function kickGroupMember() {
    if (!selectedGroupId || !kickTarget || kickBusy) return
    const target = kickTarget
    setKickBusy(true)
    setError('')
    setMemberNotice('')
    await refreshGroup((current) => current
      ? { ...current, members: current.members.filter((member) => member.id !== target.id) }
      : current, { revalidate: false })
    try {
      const response = await fetch(`/api/groups/${selectedGroupId}/members/${target.id}`, { method: 'DELETE' })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'kick_failed')
      setMemberNotice(actionLabels.kickSuccess)
      await refreshGroups()
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      setError(code === 'group_member_permission_required' || code === 'group_admin_permission_required'
        ? actionLabels.kickPermissionError
        : actionLabels.kickError)
      await refreshGroup()
    } finally {
      setKickBusy(false)
      setKickTarget(null)
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


  if (!viewer) return <section className="section-view groups-view" aria-labelledby="groups-title" dir={locale === 'ar' ? 'rtl' : 'ltr'}><div className="section-heading"><span className="section-kicker"><UsersRound aria-hidden="true" />{labels.title}</span><h1 id="groups-title">{labels.title}</h1><p>{labels.intro}</p></div><Button type="button" onClick={onSignIn}>{locale === 'ar' ? 'سجّل الدخول لعرض مجموعاتك' : 'Sign in to view your groups'}</Button></section>

  return (
    <section className="section-view groups-view" aria-labelledby="groups-title" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <div className="section-heading"><span className="section-kicker"><UsersRound aria-hidden="true" />{labels.title}</span><h1 id="groups-title">{labels.title}</h1><p>{labels.intro}</p></div>
      {groupsLoadError && <div className="groups-error" role="alert"><p>{labels.loadError}</p><Button type="button" size="sm" variant="outline" onClick={() => void refreshGroups()}>{labels.retry}</Button></div>}
      {error && <div className="groups-error" role="alert"><p>{error}</p>{mediaFile && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => document.querySelector<HTMLFormElement>('.group-message-form')?.requestSubmit()}>{labels.retry}</Button>}</div>}
      {selectedGroup && groupDetail ? (
        <div className="group-detail-view">
          <header className="group-detail-heading"><Button type="button" size="sm" variant="outline" onClick={() => setSelectedGroupId(null)}><ArrowLeft data-icon="inline-start" />{actionLabels.yourGroups}</Button><div><span className="group-tag-pill" dir="ltr"><Hash aria-hidden="true" />{selectedGroup.tag}</span><h2>{selectedGroup.name}</h2><p>{selectedGroup.description}</p></div></header>
          <div className="group-detail-grid">
            <section className="group-chat-panel" aria-label={labels.messages}>
              <h3><MessageCircle aria-hidden="true" />{labels.messages}</h3>
              <div className="group-message-list" role="log" aria-live="polite">
                {groupDetail.messages.length ? groupDetail.messages.map((message) => <article className="group-message" key={message.id}>{message.senderAvatar ? <img src={message.senderAvatar} alt="" /> : <span className="group-message-avatar">{message.senderName?.charAt(0) ?? 'D'}</span>}<div><UserName userId={message.senderId} name={message.senderName ?? viewer.displayName} isNewAccount={message.senderIsNewAccount} nameStyle={message.senderNameStyle} customTitle={message.senderCustomTitle} locale={locale} />{message.body && <p><RichText text={message.body} /></p>}{message.mediaUrl && <img className="chat-attachment" src={message.mediaUrl} alt={labels.imageAlt} />}<ChatReactions chatType="group" messageId={message.id} reactions={message.reactions} locale={locale} onChange={() => { void refreshGroup() }} /></div><time>{new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en', { hour: 'numeric', minute: '2-digit' }).format(new Date(message.createdAt))}</time></article>) : <p className="group-empty-messages">{labels.emptyMessages}</p>}
              </div>
              <form className="group-message-form" onSubmit={sendMessage}><label className="chat-media-picker" title={labels.attach}><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label={labels.attach} onChange={(event) => { selectMedia(event.target.files?.[0] ?? null); event.currentTarget.value = '' }} /><ImagePlus aria-hidden="true" /></label><label className="sr-only" htmlFor="group-message-input">{labels.placeholder}</label><input id="group-message-input" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder={labels.placeholder} /><Button type="submit" size="sm" disabled={(!draft.trim() && !mediaFile) || busy} aria-label={labels.send}><Send data-icon="inline-start" />{labels.send}</Button></form>
              {mediaFile && <span className="chat-selected-media" dir="ltr">{mediaFile.name}</span>}
              {busy && mediaFile && <div className="upload-progress"><div><span>{labels.attach}</span><strong>{uploadProgress}%</strong></div><progress value={uploadProgress} max={100} aria-label={labels.attach} /></div>}
              <p className="chat-safety-note">{labels.linkSafety}</p>
            </section>
            <aside className="group-info-panel" aria-label={labels.members}>
              <div className="group-info-title"><h3>{labels.members}</h3><div className="group-info-actions">{(groupDetail.role === 'owner' || groupDetail.role === 'admin') && <Button type="button" size="sm" variant="outline" onClick={() => { setInviteError(''); setInviteQuery(''); setDebouncedInviteQuery(''); setInviteModalOpen(true) }}><UserPlus data-icon="inline-start" />{labels.invite}</Button>}<span>{groupDetail.members.length}</span></div></div>
              {memberNotice && <p className="group-member-notice" role="status">{memberNotice}</p>}
              {groupDetail.members.map((member) => <div className="group-member-row" key={member.id}>{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : <span className="group-message-avatar">{member.displayName.charAt(0)}</span>}<UserName userId={member.id} name={member.displayName} username={member.username} isNewAccount={member.isNewAccount} nameStyle={member.nameStyle} customTitle={member.customTitle} locale={locale} />{member.role === 'owner' || member.role === 'admin' ? <span className="group-owner-badge" title={labels.owner} aria-label={labels.owner}><Crown aria-hidden="true" /></span> : null}{(groupDetail.role === 'owner' || groupDetail.role === 'admin') && member.id !== selectedGroup.ownerId && member.role !== 'owner' && (groupDetail.role === 'owner' || member.role !== 'admin') && <div className="group-member-actions"><Button type="button" size="icon-sm" variant="ghost" aria-label={`${actionLabels.kickMenu}: @${member.username}`} aria-expanded={kickMenuMemberId === member.id} onClick={() => setKickMenuMemberId((current) => current === member.id ? null : member.id)}><Ellipsis aria-hidden="true" /></Button>{kickMenuMemberId === member.id && <div className="group-member-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setKickTarget(member); setKickMenuMemberId(null) }}><X aria-hidden="true" />{actionLabels.kick}</button></div>}</div>}</div>)}
              {groupDetail.role === 'owner' && selectedGroup.ownerId === viewer.id && <Button type="button" size="sm" variant="destructive" disabled={deletingGroup} onClick={() => void deleteGroup()}><Trash2 data-icon="inline-start" />{deletingGroup ? labels.deletingGroup : labels.deleteGroup}</Button>}
            </aside>
          </div>
        </div>
      ) : (
        <div className="groups-directory">
          <section className="top-groups" aria-labelledby="top-groups-title">
            <div className="groups-list-heading"><h2 id="top-groups-title">{actionLabels.topGroups}</h2><span>{locale === 'ar' ? 'أفضل ٥' : 'TOP 5'}</span></div>
            <div className="groups-live-meta"><span><Zap aria-hidden="true" />{labels.liveStats}</span><span>{labels.xpPerPost}</span></div>
            {topGroups.map((group) => <button type="button" className="top-group-row" key={group.id} onClick={() => setSelectedGroupId(group.id)} aria-label={`${labels.rank} ${group.rank}: ${group.name}, ${group.xp} ${labels.xp}`}>
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
            <div className="groups-list-heading"><h2 id="groups-list-title">{actionLabels.yourGroups}</h2><span>{groups.length}</span></div>
            <label className="group-search-field"><Search aria-hidden="true" /><span className="sr-only">{actionLabels.groupSearch}</span><input type="search" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder={actionLabels.groupSearch} autoComplete="off" /></label>
            {groupsLoadError ? null : !data ? <p className="group-directory-empty">{labels.loading}</p> : groups.length ? groups.map((group) => <button type="button" className="group-list-card" key={group.id} onClick={() => setSelectedGroupId(group.id)} aria-label={`${labels.rank} ${group.rank}: ${group.name}`}>
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
      {inviteModalOpen && selectedGroup && (groupDetail?.role === 'owner' || groupDetail?.role === 'admin') && <ModalPortal backdropClassName="groups-modal-backdrop" dialogClassName="groups-modal" labelId="group-invite-title" onClose={() => setInviteModalOpen(false)}>
        <header className="groups-modal-heading"><div><h2 id="group-invite-title">{labels.invite} · {selectedGroup.name}</h2><p>{actionLabels.inviteSearch}</p></div><Button type="button" size="icon-sm" variant="ghost" aria-label={actionLabels.inviteClose} onClick={() => setInviteModalOpen(false)}><X aria-hidden="true" /></Button></header>
        <label className="group-invite-search"><Search aria-hidden="true" /><span className="sr-only">{actionLabels.inviteSearch}</span><input ref={inviteInputRef} type="search" value={inviteQuery} onChange={(event) => setInviteQuery(event.target.value)} placeholder={actionLabels.inviteSearch} autoComplete="off" /></label>
        {inviteError && <p className="groups-modal-error" role="alert">{inviteError}</p>}
        {inviteSearchLoadError && <p className="groups-modal-error" role="alert">{actionLabels.inviteError}</p>}
        {inviteQuery.trim() !== debouncedInviteQuery || inviteSearchLoading ? <div className="group-invite-skeleton" role="status" aria-label={actionLabels.inviteLoading}><i /><i /><i /></div>
          : debouncedInviteQuery.length < 2 ? <p className="group-invite-empty">{actionLabels.inviteTypeMore}</p>
            : null}
        {debouncedInviteQuery.length >= 2 && inviteQuery.trim() === debouncedInviteQuery && !inviteSearchLoading && inviteSearchData?.people.length ? <div className="group-invite-results">{inviteSearchData.people.map((person) => {
              const busyPerson = inviteBusyUserId === person.id
              const status = person.isMember
                ? actionLabels.inviteMember
                : person.pendingInviteId
                  ? actionLabels.invitePending
                  : person.membershipGroupId
                    ? actionLabels.inviteOtherGroup
                    : null
              return <div className="group-invite-result" key={person.id}>
                {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <span className="group-message-avatar">{person.displayName.charAt(0)}</span>}
                <span className="group-invite-person"><strong>{person.displayName}</strong><small dir="ltr">@{person.username}</small></span>
                {person.pendingInviteId
                  ? <div className="group-invite-status-actions"><span className="group-invite-status"><Check aria-hidden="true" />{status}</span><Button type="button" size="sm" variant="ghost" disabled={Boolean(inviteBusyUserId)} onClick={() => void cancelGroupInvite(person.pendingInviteId!, person.id)}>{busyPerson ? <LoaderCircle aria-hidden="true" className="group-action-spinner" /> : actionLabels.inviteCancel}</Button></div>
                  : status
                    ? <span className="group-invite-status">{status}</span>
                    : <Button type="button" size="sm" disabled={Boolean(inviteBusyUserId)} onClick={() => void sendGroupInvite(person)}>{busyPerson ? <LoaderCircle aria-hidden="true" className="group-action-spinner" /> : <><UserPlus aria-hidden="true" />{actionLabels.inviteSend}</>}</Button>}
              </div>
            })}</div> : null}
        {debouncedInviteQuery.length >= 2 && inviteQuery.trim() === debouncedInviteQuery && !inviteSearchLoading && !inviteSearchLoadError && !inviteSearchData?.people.length
          ? <p className="group-invite-empty">{actionLabels.inviteEmpty}</p> : null}
        {inviteManagementData?.invites.length ? <section className="group-invite-pending"><h3>{actionLabels.invitePending}</h3>{inviteManagementData.invites.map((invite) => <div className="group-invite-result" key={invite.id}>{invite.avatarUrl ? <img src={invite.avatarUrl} alt="" /> : <span className="group-message-avatar">{invite.displayName.charAt(0)}</span>}<span className="group-invite-person"><strong>{invite.displayName}</strong><small dir="ltr">@{invite.username}</small></span><Button type="button" size="sm" variant="ghost" disabled={Boolean(inviteBusyUserId)} onClick={() => void cancelGroupInvite(invite.id, invite.inviteeId)}>{inviteBusyUserId === invite.inviteeId ? <LoaderCircle aria-hidden="true" className="group-action-spinner" /> : actionLabels.inviteCancel}</Button></div>)}</section> : null}
      </ModalPortal>}
      {kickTarget && <ModalPortal backdropClassName="groups-modal-backdrop" dialogClassName="groups-confirm-dialog" labelId="group-kick-title" onClose={() => { if (!kickBusy) setKickTarget(null) }}>
        <h2 id="group-kick-title">{actionLabels.kickConfirmTitle}</h2>
        <p>{actionLabels.kickConfirm.replace('{username}', kickTarget.username)}</p>
        {error && <p className="groups-modal-error" role="alert">{error}</p>}
        <div className="groups-confirm-actions"><Button type="button" variant="outline" disabled={kickBusy} onClick={() => setKickTarget(null)}>{actionLabels.kickCancel}</Button><Button type="button" variant="destructive" disabled={kickBusy} onClick={() => void kickGroupMember()}>{kickBusy ? <LoaderCircle aria-hidden="true" className="group-action-spinner" /> : <X data-icon="inline-start" />}{kickBusy ? actionLabels.kickWorking : actionLabels.kick}</Button></div>
      </ModalPortal>}
    </section>
  )
}
