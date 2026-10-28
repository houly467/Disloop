'use client'

import useSWR from 'swr'
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {   ArrowUpRight,
  BadgeCheck,
  Ban, Eye, Check, Flag, Heart, Link2, MapPin, MessageCircle, MoreHorizontal, Pencil, Plus, Repeat2, Search, ShieldAlert, Upload, UserRound, Video, X } from 'lucide-react'
import type { CommunityReel } from '@/lib/reels'
import type { NewsPost } from '@/lib/news'
import type { CurrentUser } from '@/lib/session'
import type { PublicProfile } from '@/lib/users'
import type { ProfileLinkField, SocialLinks } from '@/lib/profile'
import { MentionTextarea, RichText } from '@/components/mention-textarea'
import { NewAccountBadge } from '@/components/new-account-badge'
import { BadgeCollection, EquippedBadges } from '@/components/badge-display'
import { PostEngagement } from '@/components/post-engagement'
import { RelationshipModal } from '@/components/relationship-list'
import { ModalPortal } from '@/components/modal-portal'
import type { FollowCounts } from '@/lib/social-follows'
import { getVideoDurationSeconds, uploadMedia } from '@/lib/client-upload'
import { localizedUploadError } from '@/lib/client-errors'
import { compressImage } from '@/lib/image-compression'
import { UserName } from '@/components/user-name'
import { ReportDialog } from '@/components/report-dialog'
import { countWords } from '@/lib/tags'

export type CommunityProfile = (CurrentUser & { nameStyle?: string | null; customTitle?: string | null }) | PublicProfile

type Locale = 'en' | 'ar'
type UsernameAvailability = { valid: boolean; available?: boolean; reason?: string }

async function fetchUsernameAvailability(url: string): Promise<UsernameAvailability> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json() as UsernameAvailability
  if (!response.ok && response.status !== 400) throw new Error('username_check_failed')
  return result
}

const profileCopy = {
  en: {
    about: 'A little about me', edit: 'Edit profile', save: 'Save changes', cancel: 'Cancel', saving: 'Saving…', postsTab: 'Posts', repostsTab: 'Reposts', repostedBy: 'Reposted by',
    displayName: 'Display name', username: 'Username', bio: 'Bio', location: 'Location', linkedAccounts: 'Linked accounts', avatar: 'Profile photo', banner: 'Profile banner', chooseImage: 'Choose image', removeImage: 'Remove image', imageTooLarge: 'Avatars can be up to 5 MB and banners up to 8 MB.', imageUploadFailed: 'The image could not upload. Please try again.', usernameHint: '1–2 character handles require the Verified badge; regular usernames must be at least 3 characters long.', usernameAvailable: 'Username is available.', usernameChecking: 'Checking username…', usernameCheckFailed: 'Could not check username availability.', shortUsernameNeedsVerified: '1–2 character handles require the Verified badge; regular usernames must be at least 3 characters long.',
    discord: 'Discord', website: 'Website', instagram: 'Instagram', youtube: 'YouTube', github: 'GitHub', twitch: 'Twitch',
    posts: 'News', postsStat: 'Posts', reels: 'Reels', xp: 'XP', badges: 'Community badges', earned: 'Earned', next: 'Next milestone',
    copy: 'Copy profile link', copied: 'Link copied', copyError: 'Could not copy the profile link.', saveError: 'Could not save your profile.', usernameTaken: 'Username is already taken.',
    invalid: 'Use at least 3 characters for a regular username. 1–2 character handles require the Verified badge.', empty: 'No updates have been shared yet.', verified: 'Discord connected', privateVisits: 'Your profile visits', lastSevenDays: 'Last 7 days', noVisits: 'No visits yet',
    showVisits: 'Show profile visits publicly', showVisitsHint: 'Let visitors see the number of member visits.', profileVisits: 'Profile visits', views: 'visits', followers: 'followers', followingCount: 'following', hideLikes: 'Hide my likes from lists', hideLikesHint: 'Your likes will not appear in member lists.', hideReposts: 'Hide my reposts', hideRepostsHint: 'Only you can see your reposts on your profile.', likesTab: 'Likes', message: 'Message', follow: 'Follow', following: 'Following', followBack: 'Follow back', followError: 'Could not update follow status.'
  },
  ar: {
    about: 'نبذة عني', edit: 'تعديل الملف', save: 'حفظ التغييرات', cancel: 'إلغاء', saving: 'جارٍ الحفظ…', postsTab: 'المنشورات', repostsTab: 'إعادات النشر', repostedBy: 'أعاد النشر',
    displayName: 'اسم العرض', username: 'اسم المستخدم', bio: 'نبذة', location: 'الموقع', linkedAccounts: 'الحسابات المرتبطة', avatar: 'الصورة الشخصية', banner: 'غلاف الملف الشخصي', chooseImage: 'اختر صورة', removeImage: 'إزالة الصورة', imageTooLarge: 'يجب ألا يتجاوز حجم الصورة الشخصية ٥ ميغابايت والغلاف ٨ ميغابايت.', imageUploadFailed: 'تعذر رفع الصورة. حاول مرة أخرى.', usernameHint: 'تتطلب أسماء المستخدم من حرف أو حرفين شارة التوثيق؛ ويجب أن يتكون اسم المستخدم العادي من ٣ أحرف على الأقل.', usernameAvailable: 'اسم المستخدم متاح.', usernameChecking: 'جارٍ التحقق من اسم المستخدم…', usernameCheckFailed: 'تعذر التحقق من توفر اسم المستخدم.', shortUsernameNeedsVerified: 'تتطلب أسماء المستخدم من حرف أو حرفين شارة التوثيق؛ ويجب أن يتكون اسم المستخدم العادي من ٣ أحرف على الأقل.',
    discord: 'Discord', website: 'الموقع', instagram: 'Instagram', youtube: 'YouTube', github: 'GitHub', twitch: 'Twitch',
    posts: 'الأخبار', postsStat: 'المنشورات', reels: 'ريلز', xp: 'نقاط الخبرة', badges: 'شارات المجتمع', earned: 'مكتسبة', next: 'الإنجاز التالي',
    copy: 'نسخ رابط الملف', copied: 'تم نسخ الرابط', copyError: 'تعذر نسخ رابط الملف الشخصي.', saveError: 'تعذر حفظ الملف الشخصي.', usernameTaken: 'اسم المستخدم مستخدم بالفعل.',
    invalid: 'يجب أن يتكون اسم المستخدم العادي من ٣ أحرف على الأقل. تتطلب الأسماء من حرف أو حرفين شارة التوثيق.', empty: 'لم تتم مشاركة أي تحديثات بعد.', verified: 'Discord متصل', privateVisits: 'زيارات ملفك', lastSevenDays: 'آخر ٧ أيام', noVisits: 'لا توجد زيارات بعد',
    showVisits: 'إظهار زيارات الملف', showVisitsHint: 'اسمح للزوار برؤية عدد زيارات الأعضاء.', profileVisits: 'زيارات الملف', views: 'زيارة', followers: 'متابع', followingCount: 'يتابع', hideLikes: 'إخفاء إعجاباتي من القوائم', hideLikesHint: 'لن تظهر إعجاباتك في قوائم الأعضاء.', hideReposts: 'إخفاء إعادات النشر', hideRepostsHint: 'ستظهر إعادات النشر لك فقط في ملفك.', likesTab: 'الإعجابات', message: 'مراسلة', follow: 'متابعة', following: 'تتابعه', followBack: 'متابعة متبادلة', followError: 'تعذر تحديث المتابعة.'
  },
} satisfies Record<Locale, Record<string, string>>

const linkFields: ProfileLinkField[] = ['website', 'instagram', 'youtube', 'github', 'twitch']

type ProfileRepost = {
  type: 'news' | 'reel' | 'daily'
  id: string
  createdAt: string
  title?: string
  body?: string
  caption?: string
  coverUrl?: string | null
  videoUrl?: string
  authorId: string
  authorName: string
  authorUsername: string
  authorAvatar: string | null
}

async function fetchProfileReposts(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('reposts_failed')
  return response.json() as Promise<{ reposts: ProfileRepost[] }>
}

type ProfileVisitStats = { total: number; visits: { date: string; count: number }[] }

async function fetchProfileVisits(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('profile_visits_failed')
  return response.json() as Promise<ProfileVisitStats>
}

async function fetchFollowStatus(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('follow_status_failed')
  return response.json() as Promise<{ following: boolean; followsYou: boolean }>
}

async function fetchFollowCounts(url: string): Promise<FollowCounts> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json() as FollowCounts & { reason?: string; error?: string }
  if (!response.ok) throw new Error(result.reason ?? result.error ?? `http_${response.status}`)
  return result
}

function earnedBadges(profile: CommunityProfile, posts: NewsPost[], reels: CommunityReel[], locale: Locale) {
  return [
    { id: 'first-post', label: locale === 'ar' ? 'أول منشور' : 'First note', detail: locale === 'ar' ? 'ش��ركت منشورًا إخباريًا' : 'Shared a news post', earned: posts.length > 0 },
    { id: 'first-reel', label: locale === 'ar' ? 'على الكاميرا' : 'On camera', detail: locale === 'ar' ? 'نشرت ريلز للمجتمع' : 'Published a community Reel', earned: reels.length > 0 },
    { id: 'community-voice', label: locale === 'ar' ? 'صوت المجتمع' : 'Community voice', detail: locale === 'ar' ? 'اكتسبت ١٠٠ نقطة خبرة' : 'Earned 100 XP', earned: profile.xp >= 100 },
    { id: 'community-regular', label: locale === 'ar' ? 'عضو نشط' : 'Community regular', detail: locale === 'ar' ? 'اكتسبت ٥٠٠ نقطة خبرة' : 'Earned 500 XP', earned: profile.xp >= 500 },
  ]
}

export function ProfileSection({ profile, posts, reels, locale, editable, profileVisitCount, onProfileSaved, viewer, onSignIn }: {
  profile: CommunityProfile
  posts: NewsPost[]
  reels: CommunityReel[]
  locale: Locale
  editable?: boolean
  profileVisitCount?: number | null
  onProfileSaved?: (profile: Partial<CurrentUser>) => void
  viewer?: CurrentUser | null
  onSignIn?: () => void
}) {
  const labels = profileCopy[locale]
  const [profileTab, setProfileTab] = useState<'posts' | 'reposts' | 'likes'>('posts')
  const [relationshipDirection, setRelationshipDirection] = useState<'followers' | 'following' | null>(null)
  const { data: repostData } = useSWR<{ reposts: ProfileRepost[] }>(`/api/social/reposts?userId=${encodeURIComponent(profile.id)}`, fetchProfileReposts)
  const { data: likedReelData } = useSWR<{ reels: CommunityReel[] }>(editable ? '/api/reels?liked=true' : null, async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('liked_reels_failed')
    return response.json() as Promise<{ reels: CommunityReel[] }>
  })
  const followKey = !editable && viewer && viewer.id !== profile.id ? `/api/dm/follows/${encodeURIComponent(profile.id)}` : null
  const { data: followData, mutate: mutateFollow } = useSWR<{ following: boolean; followsYou: boolean }>(followKey, fetchFollowStatus)
  const countsUrl = `/api/social/follows?userId=${encodeURIComponent(profile.id)}&countsOnly=true`
  const { data: liveRelationshipCounts, mutate: mutateRelationshipCounts } = useSWR<FollowCounts>(viewer ? countsUrl : null, fetchFollowCounts)
  const { data: visitStats } = useSWR<ProfileVisitStats>(editable ? '/api/profile/visits' : null, fetchProfileVisits)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [moderationBusy, setModerationBusy] = useState(false)
  const [moderationMessage, setModerationMessage] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [moderationMenuOpen, setModerationMenuOpen] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)
  const [moderationMenuTheme, setModerationMenuTheme] = useState<React.CSSProperties>({})
  const [relationshipCounts, setRelationshipCounts] = useState<FollowCounts>(() => ({
    followersCount: profile.followerCount ?? 0,
    followingCount: profile.followingCount ?? 0,
  }))
  const [moderationMenuPosition, setModerationMenuPosition] = useState<{ top: number; inlineStart: number } | null>(null)
  const moderationButtonRef = useRef<HTMLButtonElement>(null)
  const moderationMenuRef = useRef<HTMLDivElement>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [removeBanner, setRemoveBanner] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [debouncedUsername, setDebouncedUsername] = useState('')
  const [values, setValues] = useState(() => ({
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    location: profile.location ?? '',
    socialLinks: { ...profile.socialLinks },
    publicVisitCount: profile.publicVisitCount,
    hideLikes: profile.hideLikes,
    hideReposts: profile.hideReposts,
  }))
  const nextMilestone = [25, 50, 100, 250, 500].find((milestone) => profile.xp < milestone) ?? null
  const previousMilestone = nextMilestone === null ? 500 : [0, 25, 50, 100, 250, 500].filter((milestone) => milestone < nextMilestone).at(-1) ?? 0
  const progress = nextMilestone === null ? 100 : Math.min(100, ((profile.xp - previousMilestone) / (nextMilestone - previousMilestone)) * 100)
  const maxDailyVisits = Math.max(1, ...(visitStats?.visits.map((visit) => visit.count) ?? []))
  useEffect(() => {
    setRelationshipCounts({
      followersCount: profile.followerCount ?? 0,
      followingCount: profile.followingCount ?? 0,
    })
  }, [profile.id, profile.followerCount, profile.followingCount])
  useLayoutEffect(() => {
    if (!moderationMenuOpen || !moderationButtonRef.current) return
    const rect = moderationButtonRef.current.getBoundingClientRect()
    const width = 200
    const rtl = locale === 'ar'
    const themeRoot = moderationButtonRef.current.closest<HTMLElement>('.disloop-shell')
    if (themeRoot) {
      const theme = window.getComputedStyle(themeRoot)
      setModerationMenuTheme({
        '--page': theme.getPropertyValue('--page'),
        '--surface': theme.getPropertyValue('--surface'),
        '--surface-raised': theme.getPropertyValue('--surface-raised'),
        '--surface-hover': theme.getPropertyValue('--surface-hover'),
        '--line': theme.getPropertyValue('--line'),
        '--text': theme.getPropertyValue('--text'),
        '--text-secondary': theme.getPropertyValue('--text-secondary'),
        '--text-muted': theme.getPropertyValue('--text-muted'),
        '--danger': theme.getPropertyValue('--danger'),
        '--shadow': theme.getPropertyValue('--shadow'),
        colorScheme: theme.colorScheme,
        fontFamily: theme.fontFamily,
      } as React.CSSProperties)
    }
    const left = rtl ? Math.min(window.innerWidth - 8 - width, rect.right - width) : Math.max(8, rect.left)
    const clampedLeft = Math.max(8, Math.min(left, window.innerWidth - 8 - width))
    setModerationMenuPosition({
      top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 8 - 112)),
      inlineStart: rtl ? window.innerWidth - clampedLeft - width : clampedLeft,
    })
  }, [locale, moderationMenuOpen])
  useEffect(() => {
    if (!moderationMenuOpen) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && !moderationMenuRef.current?.contains(target) && !moderationButtonRef.current?.contains(target)) setModerationMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setModerationMenuOpen(false)
      moderationButtonRef.current?.focus()
    }
    const focusFirstItem = window.requestAnimationFrame(() => moderationMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.cancelAnimationFrame(focusFirstItem)
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [moderationMenuOpen])
  useEffect(() => {
    if (!editing) {
      setDebouncedUsername('')
      return
    }
    const timeout = window.setTimeout(() => setDebouncedUsername(values.username.trim()), 350)
    return () => window.clearTimeout(timeout)
  }, [editing, values.username])
  const usernameCheckKey = editing && debouncedUsername.length > 0
    ? `/api/profile/username?username=${encodeURIComponent(debouncedUsername)}`
    : null
  const { data: usernameAvailability, isLoading: checkingUsername, error: usernameAvailabilityError } = useSWR<UsernameAvailability>(usernameCheckKey, fetchUsernameAvailability, { dedupingInterval: 750, keepPreviousData: false })
  const usernameStatus = usernameAvailabilityError ? labels.usernameCheckFailed
    : usernameAvailability?.reason === 'verified_required' ? labels.shortUsernameNeedsVerified
      : usernameAvailability?.valid === false ? labels.invalid
        : usernameAvailability?.available === false ? labels.usernameTaken
          : usernameAvailability?.available ? labels.usernameAvailable
            : checkingUsername ? labels.usernameChecking : ''
  const usernameAvailable = Boolean(usernameAvailability?.valid && usernameAvailability.available)

  async function toggleProfileFollow() {
    if (!followKey || !followData) return
    const nextFollowing = !followData.following
    const previousCounts = liveRelationshipCounts ?? relationshipCounts
    const optimisticCounts = { ...previousCounts, followersCount: Math.max(0, previousCounts.followersCount + (nextFollowing ? 1 : -1)) }
    setRelationshipCounts(optimisticCounts)
    let followUpdated = false
    try {
      await mutateRelationshipCounts(optimisticCounts, false)
      await mutateFollow({ ...followData, following: nextFollowing }, false)
      const response = await fetch(followKey, { method: nextFollowing ? 'POST' : 'DELETE' })
      if (!response.ok) throw new Error(labels.followError)
      followUpdated = true
      await mutateFollow({ ...followData, following: nextFollowing }, false)
      const refreshedCounts = await mutateRelationshipCounts()
      if (refreshedCounts) setRelationshipCounts(refreshedCounts)
    } catch (caught) {
      if (!followUpdated) {
        setRelationshipCounts(previousCounts)
        await mutateRelationshipCounts(previousCounts, false)
        await mutateFollow(followData, false)
      }
      throw caught
    }
  }

  async function moderateProfile(action: 'block' | 'unblock') {
    if (!viewer || viewer.id === profile.id) return
    setModerationBusy(true)
    try {
      const response = await fetch(`/api/social/blocks?userId=${encodeURIComponent(profile.id)}`, { method: action === 'block' ? 'POST' : 'DELETE' })
      setModerationMessage(response.ok ? (action === 'block' ? 'Account blocked.' : 'Account unblocked.') : 'Could not update this account.')
    } finally { setModerationBusy(false) }
  }

  function updateRelationshipCounts(counts: FollowCounts) {
    setRelationshipCounts(counts)
    void mutateRelationshipCounts(counts, false)
  }

  function handleModerationMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    if (!items.length) return
    event.preventDefault()
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? items.length - 1
        : event.key === 'ArrowUp' ? (currentIndex <= 0 ? items.length - 1 : currentIndex - 1)
          : (currentIndex + 1) % items.length
    items[nextIndex].focus()
  }

  async function copyProfileLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${encodeURIComponent(profile.username)}`)
      setCopied(true)
      setCopyFailed(false)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopyFailed(true)
    }
  }

  async function uploadProfileImage(file: File, kind: 'avatar' | 'banner') {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('unsupported_file_type')
    const uploadFile = file.type === 'image/gif' ? file : await compressImage(file)
    const result = await uploadMedia({ endpoint: '/api/profile/upload', file: uploadFile, kind, onProgress: setUploadProgress })
    return result.url
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!usernameAvailable) {
      setError(usernameAvailabilityError ? labels.usernameCheckFailed : usernameStatus || labels.usernameTaken)
      return
    }
    setSaving(true)
    setUploadProgress(0)
    try {
      const profileAvatarUrl = avatarFile ? await uploadProfileImage(avatarFile, 'avatar') : removeAvatar ? null : undefined
      const profileBannerUrl = bannerFile ? await uploadProfileImage(bannerFile, 'banner') : removeBanner ? null : undefined
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, ...(profileAvatarUrl !== undefined ? { profileAvatarUrl } : {}), ...(profileBannerUrl !== undefined ? { profileBannerUrl } : {}) }),
      })
      const result = await response.json() as { profile?: Partial<CurrentUser>; error?: string; reason?: string }
      if (!response.ok || !result.profile) {
        const code = result.reason ?? result.error ?? 'save_failed'
        console.error('[profile] save request failed', { status: response.status, message: code })
        setError(result.error === 'username_taken' ? labels.usernameTaken : result.error === 'username_verification_required' ? labels.shortUsernameNeedsVerified : result.error === 'invalid_profile' ? labels.invalid : localizedUploadError(code, locale, labels.saveError))
        return
      }
      onProfileSaved?.(result.profile)
      setAvatarFile(null)
      setBannerFile(null)
      setRemoveAvatar(false)
      setRemoveBanner(false)
      setEditing(false)
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      console.error('[profile] update flow failed', { message: code })
      setError(code === 'image_too_large' ? labels.imageTooLarge : code === 'invalid_image_type' ? labels.invalid : localizedUploadError(code, locale, labels.imageUploadFailed))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="section-view profile-view" aria-labelledby="profile-title">
      <div className="profile-banner" style={profile.profileBannerUrl ? { backgroundImage: `url("${profile.profileBannerUrl}")` } : undefined} />
      <div className="profile-overview">
        {profile.avatarUrl ? <img className="profile-avatar" src={profile.avatarUrl} alt="" /> : <span className="profile-avatar profile-avatar-fallback"><UserRound aria-hidden="true" /></span>}
        <div className="profile-identity"><span className="profile-verified"><BadgeCheck aria-hidden="true" />{labels.verified}</span><h1 id="profile-title"><UserName userId={profile.id} name={profile.displayName} username={profile.username} createdAt={profile.accountCreatedAt} nameStyle={profile.nameStyle} customTitle={profile.customTitle} locale={locale} /></h1></div>
        {editable && !editing && <button className="profile-copy-button" type="button" onClick={() => { setValues({ username: profile.username, displayName: profile.displayName, bio: profile.bio, location: profile.location ?? '', socialLinks: { ...profile.socialLinks }, publicVisitCount: profile.publicVisitCount, hideLikes: profile.hideLikes, hideReposts: profile.hideReposts }); setAvatarFile(null); setBannerFile(null); setRemoveAvatar(false); setRemoveBanner(false); setError(''); setEditing(true) }}><Pencil aria-hidden="true" />{labels.edit}</button>}
        {!editable && <div className="profile-action-group">
          {followKey && followData && <button className="profile-copy-button" type="button" aria-pressed={followData.following} onClick={() => void toggleProfileFollow().catch(() => setError(labels.followError))}><UserRound aria-hidden="true" />{followData.following ? labels.following : followData.followsYou ? labels.followBack : labels.follow}</button>}
          <button className="profile-copy-button" type="button" onClick={() => window.location.assign(`/?section=messages&messageTo=${encodeURIComponent(profile.username)}`)}><MessageCircle aria-hidden="true" />{labels.message}</button>
          <button className="profile-copy-button" type="button" onClick={copyProfileLink}><Link2 aria-hidden="true" />{copied ? labels.copied : labels.copy}</button>
          {viewer && <button ref={moderationButtonRef} className="profile-copy-button profile-more-button" type="button" aria-label={locale === 'ar' ? 'إجراءات الملف الشخصي' : 'Profile actions'} aria-haspopup="menu" aria-expanded={moderationMenuOpen} onClick={() => { setModerationMenuOpen((open) => !open); setModerationMessage('') }} onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setModerationMenuOpen(true) } }}><MoreHorizontal aria-hidden="true" /></button>}
          {moderationMessage && <p className="profile-moderation-status" role="status">{moderationMessage}</p>}
        </div>}
        {moderationMenuOpen && moderationMenuPosition && createPortal(
          <div ref={moderationMenuRef} className="profile-moderation-popover" role="menu" dir={locale === 'ar' ? 'rtl' : 'ltr'} style={{ ...moderationMenuTheme, top: moderationMenuPosition.top, insetInlineStart: moderationMenuPosition.inlineStart }} onKeyDown={handleModerationMenuKeyDown}>
            <button type="button" role="menuitem" disabled={moderationBusy} onClick={() => { setModerationMenuOpen(false); setConfirmBlock(true) }}><Ban aria-hidden="true" />{locale === 'ar' ? 'حظر' : 'Block'}</button>
            <button type="button" role="menuitem" onClick={() => { setModerationMenuOpen(false); setReportOpen(true) }}><Flag aria-hidden="true" />{locale === 'ar' ? 'إبلاغ' : 'Report'}</button>
          </div>,
          document.body,
        )}
      </div>
      {copyFailed && <p className="profile-copy-error" role="status">{labels.copyError}</p>}
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="user" targetId={profile.id} locale={locale} />

      {editing ? (
        <form className="profile-edit-form" onSubmit={saveProfile}>
          <label>{labels.displayName}<input maxLength={30} required value={values.displayName} onChange={(event) => setValues({ ...values, displayName: event.target.value })} /></label>
          <label>{labels.username}<input dir="ltr" maxLength={20} minLength={1} required value={values.username} onChange={(event) => setValues({ ...values, username: event.target.value })} aria-describedby="profile-username-hint profile-username-status" aria-invalid={Boolean(usernameStatus && !usernameAvailable)} /><small id="profile-username-hint">{labels.usernameHint}</small><small id="profile-username-status" className={usernameAvailable ? 'profile-username-status profile-username-available' : 'profile-username-status'} role="status">{usernameStatus}</small></label>
          <div className="profile-media-editors">
            <label>{labels.avatar}{profile.avatarUrl && !removeAvatar && <img className="profile-media-preview profile-media-avatar-preview" src={profile.avatarUrl} alt="" />}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; setAvatarFile(file); setRemoveAvatar(false); event.currentTarget.value = '' }} />{avatarFile && <small dir="ltr">{avatarFile.name}</small>}</label>
            <label>{labels.banner}{profile.profileBannerUrl && !removeBanner && <img className="profile-media-preview profile-media-banner-preview" src={profile.profileBannerUrl} alt="" />}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; setBannerFile(file); setRemoveBanner(false); event.currentTarget.value = '' }} />{bannerFile && <small dir="ltr">{bannerFile.name}</small>}</label>
            <button type="button" className="section-secondary-button" onClick={() => { setAvatarFile(null); setRemoveAvatar(true) }}>{labels.removeImage} · {labels.avatar}</button>
            <button type="button" className="section-secondary-button" onClick={() => { setBannerFile(null); setRemoveBanner(true) }}>{labels.removeImage} · {labels.banner}</button>
          </div>
          {saving && (avatarFile || bannerFile) && <div className="upload-progress"><div><span>{labels.chooseImage}</span><strong>{uploadProgress}%</strong></div><progress value={uploadProgress} max={100} aria-label={labels.chooseImage} /></div>}
          <label>{labels.bio}<MentionTextarea maxLength={180} value={values.bio} onChange={(bio) => setValues({ ...values, bio })} locale={locale} placeholder={labels.bio} rows={3} className="profile-bio-editor" /></label>
          <label>{labels.location}<input maxLength={80} value={values.location} onChange={(event) => setValues({ ...values, location: event.target.value })} /></label>
          <label className="profile-visit-setting">
            <input type="checkbox" checked={values.publicVisitCount} onChange={(event) => setValues({ ...values, publicVisitCount: event.target.checked })} />
            <span><strong>{labels.showVisits}</strong><small>{labels.showVisitsHint}</small></span>
          </label>
          <label className="profile-visit-setting">
            <input type="checkbox" checked={values.hideLikes} onChange={(event) => setValues({ ...values, hideLikes: event.target.checked })} />
            <span><strong>{labels.hideLikes}</strong><small>{labels.hideLikesHint}</small></span>
          </label>
          <label className="profile-visit-setting">
            <input type="checkbox" checked={values.hideReposts} onChange={(event) => setValues({ ...values, hideReposts: event.target.checked })} />
            <span><strong>{labels.hideReposts}</strong><small>{labels.hideRepostsHint}</small></span>
          </label>
          <div className="profile-link-editor"><h2>{labels.linkedAccounts}</h2>{linkFields.map((field) => <label key={field}>{labels[field]}<input type="url" dir="ltr" placeholder="https://" value={values.socialLinks[field] ?? ''} onChange={(event) => setValues({ ...values, socialLinks: { ...values.socialLinks, [field]: event.target.value } })} /></label>)}</div>
          {error && <div className="form-error" role="alert"><p>{error}</p><button type="button" className="section-secondary-button" disabled={saving} onClick={() => document.querySelector<HTMLFormElement>('.profile-edit-form')?.requestSubmit()}>{locale === 'ar' ? 'إعادة المحاولة' : 'Retry'}</button></div>}
          <div className="profile-edit-actions"><button type="button" className="section-secondary-button" onClick={() => { setEditing(false); setError('') }} disabled={saving}><X aria-hidden="true" />{labels.cancel}</button><button type="submit" className="section-primary-button" disabled={saving}>{saving ? labels.saving : labels.save}<Check aria-hidden="true" /></button></div>
        </form>
      ) : (
        <>
          <p className="profile-bio">{profile.bio ? <RichText text={profile.bio} /> : labels.about}</p>
          <div className="profile-follow-stats" aria-label={locale === 'ar' ? 'إحصاءات الملف الشخصي' : 'Profile statistics'}>
            <button type="button" className="profile-stat-item" aria-label={`${posts.length + reels.length} ${labels.postsStat}`} onClick={() => setProfileTab('posts')}><strong>{(posts.length + reels.length).toLocaleString(locale)}</strong><span>{labels.postsStat}</span></button>
            <button type="button" className="profile-stat-item" onClick={() => setRelationshipDirection('followers')}><strong>{(liveRelationshipCounts?.followersCount ?? relationshipCounts.followersCount).toLocaleString(locale)}</strong><span>{labels.followers}</span></button>
            <button type="button" className="profile-stat-item" onClick={() => setRelationshipDirection('following')}><strong>{(liveRelationshipCounts?.followingCount ?? relationshipCounts.followingCount).toLocaleString(locale)}</strong><span>{labels.followingCount}</span></button>
          </div>
          <div className="profile-details">
            <div><span>{labels.discord}</span><strong dir="ltr">@{profile.discordUsername}</strong></div>
            {profile.location && <div><span>{labels.location}</span><strong><MapPin aria-hidden="true" />{profile.location}</strong></div>}
            {linkFields.filter((field) => profile.socialLinks[field]).map((field) => <div key={field}><span>{labels[field]}</span><a href={profile.socialLinks[field]} target="_blank" rel="noreferrer"><Link2 aria-hidden="true" />{new URL(profile.socialLinks[field]!).hostname.replace(/^www\./, '')}<ArrowUpRight aria-hidden="true" /></a></div>)}
          </div>
          {profile.publicVisitCount && profileVisitCount !== undefined && profileVisitCount !== null && <p className="profile-visit-count"><Eye aria-hidden="true" /><strong>{profileVisitCount.toLocaleString(locale === 'ar' ? 'ar' : 'en')}</strong><span>{labels.profileVisits}</span></p>}
          {editable && visitStats && <section className="profile-visits-card" aria-labelledby="profile-visits-title">
            <div className="profile-visits-heading"><h2 id="profile-visits-title">{labels.privateVisits} · {labels.lastSevenDays}</h2><strong>{visitStats.total.toLocaleString(locale === 'ar' ? 'ar' : 'en')}</strong></div>
            {visitStats.visits.some((visit) => visit.count > 0) ? <ol className="profile-visits-chart" aria-label={labels.lastSevenDays}>{visitStats.visits.map((visit) => <li key={visit.date} aria-label={`${new Date(`${visit.date}T00:00:00.000Z`).toLocaleDateString(locale === 'ar' ? 'ar' : 'en', { weekday: 'long', timeZone: 'UTC' })}: ${visit.count}`}><div className="profile-visits-bar"><span style={{ height: `${Math.max(4, (visit.count / maxDailyVisits) * 100)}%` }} /></div><small>{visit.count}</small><span>{new Date(`${visit.date}T00:00:00.000Z`).toLocaleDateString(locale === 'ar' ? 'ar' : 'en', { weekday: 'short', timeZone: 'UTC' })}</span></li>)}</ol> : <p className="profile-visits-empty">{labels.noVisits}</p>}
          </section>}
          <section className="profile-progress" aria-label={labels.xp}>
            <div className="profile-progress-heading"><div><span>{labels.xp}</span><strong>{profile.xp}</strong></div><span>{nextMilestone ? `${labels.next}: ${nextMilestone}` : labels.earned}</span></div>
            <div className="profile-progress-track" role="progressbar" aria-valuemin={previousMilestone} aria-valuemax={nextMilestone ?? 500} aria-valuenow={Math.min(profile.xp, nextMilestone ?? 500)}><span style={{ width: `${progress}%` }} /></div>
          </section>
          <section className="profile-badges" aria-labelledby="profile-badges-title">
            <div className="result-group-heading"><h2 id="profile-badges-title">{labels.badges}</h2></div>
            <BadgeCollection userId={profile.id} locale={locale} editable={editable} />
          </section>
          <section className="profile-posts" aria-labelledby="profile-posts-title">
            <div className="profile-content-tabs" role="tablist" aria-label={locale === 'ar' ? 'محتوى الملف الشخصي' : 'Profile content'}>
              <button type="button" role="tab" aria-selected={profileTab === 'posts'} className={profileTab === 'posts' ? 'profile-content-tab profile-content-tab-active' : 'profile-content-tab'} onClick={() => setProfileTab('posts')}>{labels.postsTab}<span>{posts.length + reels.length}</span></button>
              <button type="button" role="tab" aria-selected={profileTab === 'reposts'} className={profileTab === 'reposts' ? 'profile-content-tab profile-content-tab-active' : 'profile-content-tab'} onClick={() => setProfileTab('reposts')}>{labels.repostsTab}<span>{repostData?.reposts.length ?? 0}</span></button>
              {editable && <button type="button" role="tab" aria-selected={profileTab === 'likes'} className={profileTab === 'likes' ? 'profile-content-tab profile-content-tab-active' : 'profile-content-tab'} onClick={() => setProfileTab('likes')}>{labels.likesTab}<span>{likedReelData?.reels.length ?? 0}</span></button>}
            </div>
            {profileTab === 'posts' ? posts.length || reels.length ? <div className="news-list">
              {posts.map((post) => <article className="search-post" key={post.id}><UserName userId={profile.id} name={profile.displayName} username={profile.username} createdAt={profile.accountCreatedAt} nameStyle={profile.nameStyle} customTitle={profile.customTitle} locale={locale} /><span className="category-pill">{post.category}</span><h3>{post.title}</h3><p><RichText text={post.body} /></p><PostEngagement type="news" contentId={post.id} authorId={profile.id} viewer={viewer ?? null} locale={locale} onSignIn={onSignIn ?? (() => window.location.assign(`/auth/login?returnTo=${encodeURIComponent(`/u/${profile.username}`)}`))} /></article>)}
              {reels.map((reel) => <article className="search-post" key={reel.id}><UserName userId={profile.id} name={profile.displayName} username={profile.username} createdAt={profile.accountCreatedAt} nameStyle={profile.nameStyle} customTitle={profile.customTitle} locale={locale} /><span className="category-pill">{labels.reels}</span><h3>{reel.caption ? <RichText text={reel.caption} /> : labels.reels}</h3><video className="profile-reel-player" controls playsInline preload="metadata" src={reel.videoUrl} aria-label={reel.caption || labels.reels} /><PostEngagement type="reel" contentId={reel.id} authorId={profile.id} viewer={viewer ?? null} locale={locale} onSignIn={onSignIn ?? (() => window.location.assign(`/auth/login?returnTo=${encodeURIComponent(`/u/${profile.username}`)}`))} /></article>)}
            </div> : <div className="section-empty profile-empty"><span className="section-empty-icon"><Video aria-hidden="true" /></span><h2>{labels.empty}</h2></div> : profileTab === 'likes' ? likedReelData?.reels.length ? <div className="news-list">{likedReelData.reels.map((reel) => <article className="search-post" key={reel.id}><h3>{reel.caption ? <RichText text={reel.caption} /> : labels.reels}</h3><video className="profile-reel-player" controls playsInline preload="metadata" src={reel.videoUrl} aria-label={reel.caption || labels.reels} /><PostEngagement type="reel" contentId={reel.id} authorId={reel.authorId} viewer={viewer ?? null} locale={locale} onSignIn={onSignIn ?? (() => window.location.assign('/auth/login'))} /></article>)}</div> : <div className="section-empty profile-empty"><span className="section-empty-icon"><Heart aria-hidden="true" /></span><h2>{labels.empty}</h2></div> : repostData?.reposts.length ? <div className="news-list">{repostData.reposts.map((repost) => <article className="search-post profile-repost-card" key={`${repost.type}-${repost.id}`}><span className="profile-repost-label"><Repeat2 aria-hidden="true" />{labels.repostedBy} @{profile.username}</span><span className="category-pill">{repost.type === 'reel' ? labels.reels : repost.type}</span><h3>{repost.type === 'reel' ? repost.caption || labels.reels : repost.type === 'news' ? repost.title : locale === 'ar' ? 'منشور يومي' : 'Daily post'}</h3>{repost.type !== 'reel' && repost.body && <p><RichText text={repost.body} /></p>}{repost.type === 'reel' && repost.videoUrl && <video className="profile-reel-player" controls playsInline preload="metadata" src={repost.videoUrl} />}<a className="profile-repost-original" href={`/#${repost.type}-${repost.id}`}>{repost.authorName} · @{repost.authorUsername}</a><PostEngagement type={repost.type} contentId={repost.id} authorId={repost.authorId} viewer={viewer ?? null} locale={locale} onSignIn={onSignIn ?? (() => window.location.assign(`/auth/login?returnTo=${encodeURIComponent(`/u/${profile.username}`)}`))} /></article>)}</div> : <div className="section-empty profile-empty"><span className="section-empty-icon"><Repeat2 aria-hidden="true" /></span><h2>{labels.empty}</h2></div>}
            {relationshipDirection && <RelationshipModal
              userId={profile.id}
              viewerId={viewer?.id ?? null}
              initialDirection={relationshipDirection}
              followersCount={liveRelationshipCounts?.followersCount ?? relationshipCounts.followersCount}
              followingCount={liveRelationshipCounts?.followingCount ?? relationshipCounts.followingCount}
              locale={locale}
              onCountsChange={updateRelationshipCounts}
              onClose={() => setRelationshipDirection(null)}
            />}
            {confirmBlock && <ModalPortal backdropClassName="relationship-modal-backdrop" dialogClassName="profile-block-confirm" labelId="profile-block-confirm-title" onClose={() => setConfirmBlock(false)}>
              <h2 id="profile-block-confirm-title">{locale === 'ar' ? `حظر @${profile.username}؟` : `Block @${profile.username}?`}</h2>
              <div className="profile-block-confirm-actions"><button type="button" className="section-secondary-button" onClick={() => setConfirmBlock(false)}>{locale === 'ar' ? 'إلغاء' : 'Cancel'}</button><button type="button" className="profile-block-confirm-button" disabled={moderationBusy} onClick={() => { setConfirmBlock(false); void moderateProfile('block') }}>{locale === 'ar' ? 'حظر' : 'Block'}</button></div>
            </ModalPortal>}
          </section>
        </>
      )}
    </section>
  )
}

const reelCopy = {
  en: { title: 'Reels', description: 'Short videos, shared by the people who make this community.', empty: 'The next good thing starts here.', emptyBody: 'Share a short video with the community.', publish: 'Share a Reel', caption: 'Add a caption', file: 'Choose a video', fileHint: 'MP4 or WebM · up to 40 MB · up to 60 seconds', upload: 'Upload video', publishing: 'Publishing…', like: 'Like Reel', liked: 'Unlike Reel', signIn: 'Log in with Discord to share and react.', join: 'Join the Discord server to publish.', membershipUnavailable: 'Discord membership could not be checked. Please try again.', signInAgain: 'Your session expired. Please log in again.', uploadFailed: 'The video upload failed. Please try again.', invalid: 'Check your caption and try again.', tooManyTags: 'A Reel can include up to 10 hashtags.', tooLarge: 'Choose a video no larger than 40 MB.', tooLong: 'Videos can be up to 60 seconds.', retry: 'Retry', format: 'Choose an MP4 or WebM video.', failed: 'The Reel could not be published. Please try again.' },
  ar: { title: 'ريلز', description: 'مقاطع قصيرة يشاركها أفراد المجتمع.', empty: 'ابدأ مشاركة شيء جميل.', emptyBody: 'شارك مقطعًا قصيرًا مع المجتمع.', publish: 'مشاركة ريل', caption: 'أضف تعليقًا', file: 'اختر مقطعًا', fileHint: 'MP4 أو WebM · حتى 40 ميغابايت · حتى ٦٠ ثانية', upload: 'رفع المقطع', publishing: 'جارٍ النشر…', like: 'إعجاب', liked: 'إلغاء الإع��اب', signIn: 'سجّل الدخول عبر Discord للمشاركة والتفاعل.', join: 'انضم إلى سيرفر Discord للنشر.', membershipUnavailable: 'تعذر التحقق من عضويتك في Discord. حاول مرة أخرى.', signInAgain: 'انتهت جلستك. سجّل الدخول مرة أخرى.', uploadFailed: 'تعذر رفع الفيديو. حاول مرة أخرى.', invalid: 'تحقق من التعليق ثم حاول مرة أخرى.', tooManyTags: 'يمكن أن يحتوي الريل على 10 وسوم كحد أقصى.', tooLarge: 'اختر مقطعًا لا يتجاوز 40 ميغابايت.', tooLong: 'يجب ألا يتجاوز الفيديو ٦٠ ثانية.', retry: 'إعادة المحاولة', format: 'اختر مقطع MP4 أو WebM.', failed: 'تعذر نشر المقطع. حاول مرة أخرى.' },
} satisfies Record<Locale, Record<string, string>>

export function ReelsSection({ locale, viewer, initialReels, onSignIn, onCreateContent, onMembershipRequired, onReelPublished }: {
  locale: Locale
  viewer: CurrentUser | null
  initialReels: CommunityReel[]
  onSignIn: () => void
  onCreateContent: () => Promise<boolean>
  onMembershipRequired: () => void
  onReelPublished: (reel: CommunityReel, xp: number | null) => void
}) {
  const labels = reelCopy[locale]
  const [reels, setReels] = useState(initialReels)
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [progress, setProgress] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [likedReelIds, setLikedReelIds] = useState<Set<string>>(() => new Set())
  const visibleReels = reels.filter((reel) => !likedReelIds.has(reel.id))

  async function openComposer() {
    if (!viewer) return onSignIn()
    if (await onCreateContent()) setComposerOpen(true)
  }

  async function publishReel(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setError('')
    if (!file) return
    if (countWords(caption) > 100) return setError(locale === 'ar' ? 'يجب ألا يتجاوز الوصف ١٠٠ كلمة.' : 'Captions can be up to 100 words.')
    if (!['video/mp4', 'video/webm'].includes(file.type)) return setError(labels.format)
    if (file.size > 40 * 1024 * 1024) return setError(labels.tooLarge)
    let durationSeconds: number
    try {
      durationSeconds = await getVideoDurationSeconds(file)
    } catch {
      return setError(localizedUploadError('invalid_input', locale, labels.invalid))
    }
    if (durationSeconds > 60) return setError(labels.tooLong)
    setPublishing(true)
    let stage: 'upload' | 'publish' = 'upload'
    try {
      const { url: videoUrl } = await uploadMedia({ endpoint: '/api/reels/upload', file, kind: 'reel', durationSeconds, multipart: true, onProgress: setProgress })
      stage = 'publish'
      const response = await fetch('/api/reels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, caption: caption.trim() }),
      })
      const result = await response.json() as { reel?: CommunityReel; xp?: number | null; error?: string; reason?: string }
      if (!response.ok || !result.reel) {
        console.error('[reels] publish request failed', { status: response.status, message: result.reason ?? result.error ?? 'publish_failed' })
        throw new Error(result.reason ?? result.error ?? 'publish_failed')
      }
      setReels((current) => [result.reel!, ...current])
      onReelPublished(result.reel, result.xp ?? null)
      setFile(null)
      setCaption('')
      setProgress(0)
      setComposerOpen(false)
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : ''
      console.error('[reels] publish flow failed', { message: code })
      if (code === 'DISCORD_MEMBERSHIP_REQUIRED') {
        onMembershipRequired()
        setError('')
        return
      }
      setError(code === 'invalid_reel' ? labels.invalid
        : code === 'too_many_tags' ? labels.tooManyTags
        : localizedUploadError(code, locale, stage === 'upload' ? labels.uploadFailed : labels.failed))
    } finally {
      setPublishing(false)
    }
  }

  return (
    <section className="section-view reels-section" aria-labelledby="reels-title">
      <div className="section-heading reels-heading"><div><span className="section-kicker"><Video aria-hidden="true" />{labels.title}</span><h1 id="reels-title">{labels.title}</h1><p>{labels.description}</p></div></div>
      <div className="reel-creation-bar" aria-label={labels.publish}>
        <span>{locale === 'ar' ? 'شارك مقطعًا مع المجتمع' : 'Create and share a video with the community'}</span>
        {viewer
          ? <button className="section-primary-button reel-compose-trigger" type="button" onClick={() => void openComposer()}><Plus aria-hidden="true" />{labels.publish}</button>
          : <button className="section-primary-button reel-compose-trigger" type="button" onClick={onSignIn}>{labels.signIn}<ArrowUpRight aria-hidden="true" /></button>}
      </div>
      {composerOpen && <ModalPortal backdropClassName="social-composer-modal-backdrop" dialogClassName="social-composer-modal reel-composer-modal" labelId="reel-composer-title" onClose={() => { if (!publishing) setComposerOpen(false) }}>
        <div className="social-composer-modal-heading"><h2 id="reel-composer-title">{labels.publish}</h2><button className="icon-button" type="button" disabled={publishing} onClick={() => setComposerOpen(false)} aria-label={locale === 'ar' ? 'إغلاق' : 'Close'}><X aria-hidden="true" /></button></div>
        <form className="reel-composer" onSubmit={publishReel}>
          <label className="reel-caption-field"><span>{labels.caption}</span><MentionTextarea maxLength={500} value={caption} onChange={setCaption} locale={locale} rows={3} placeholder={`${labels.caption} · #community`} className="reel-caption-input" /><small>{countWords(caption)}/100 {locale === 'ar' ? 'كلمة' : 'words'}</small></label>
          <div className="reel-composer-footer"><label className="reel-file-picker"><input type="file" accept="video/mp4,video/webm" onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = '' }} /><Upload aria-hidden="true" /><span>{file?.name ?? labels.file}</span></label><button className="section-primary-button" type="submit" disabled={!file || publishing || countWords(caption) > 100}>{publishing ? labels.publishing : labels.publish}<Plus aria-hidden="true" /></button></div>
          <p className="reel-upload-hint">{labels.fileHint}</p>
          {publishing && <div className="upload-progress"><div><span>{labels.upload}</span><strong>{progress}%</strong></div><progress value={progress} max={100} aria-label={labels.upload} /></div>}
          {error && <div className="form-error" role="alert"><p>{error}</p><button type="button" className="section-secondary-button" disabled={publishing} onClick={() => document.querySelector<HTMLFormElement>('.reel-composer')?.requestSubmit()}>{labels.retry}</button></div>}
        </form>
      </ModalPortal>}
      {visibleReels.length ? <div className="reel-feed" role="region" aria-label={labels.title} tabIndex={0}><div className="reel-list">{visibleReels.map((reel) => <article className="reel-card reel-slide" id={`reel-${reel.id}`} key={reel.id}>
        <video className="reel-video" controls playsInline preload="metadata" src={reel.videoUrl} aria-label={reel.caption || labels.title} />
        <div className="reel-card-content"><div className="reel-author"><span>{reel.authorAvatar ? <img src={reel.authorAvatar} alt="" /> : <UserRound aria-hidden="true" />}</span><a href={`/u/${encodeURIComponent(reel.authorUsername)}`}><UserName userId={reel.authorId} name={reel.authorName} username={reel.authorUsername} createdAt={reel.authorCreatedAt} nameStyle={reel.authorNameStyle} customTitle={reel.authorCustomTitle} locale={locale} /></a></div>
          {reel.caption && <p><RichText text={reel.caption} /></p>}
          {reel.tags.length > 0 && <div className="tag-row">{reel.tags.map((tag) => <a className="post-tag" key={tag} href={`/tags/${encodeURIComponent(tag)}?lang=${locale}`}>#{tag}</a>)}</div>}
        </div>
        <PostEngagement type="reel" contentId={reel.id} authorId={reel.authorId} viewer={viewer} locale={locale} onSignIn={onSignIn} variant="reel" onLikeChange={(liked) => setLikedReelIds((current) => { const next = new Set(current); if (liked) next.add(reel.id); else next.delete(reel.id); return next })} />
      </article>)}</div></div> : <div className="section-empty reels-empty"><span className="section-empty-icon"><Video aria-hidden="true" /></span><h2>{labels.empty}</h2><p>{labels.emptyBody}</p></div>}
    </section>
  )
}

type SearchResults = {
  members: { id: string; username: string; displayName: string; avatarUrl: string | null; nameStyle: string | null; customTitle: string | null }[]
  posts: { id: string; title: string; body: string; tags: string[]; createdAt: string }[]
  dailyPosts: { id: string; body: string; tags: string[]; createdAt: string }[]
  reels: { id: string; caption: string; tags: string[]; videoUrl: string; authorId: string | null; authorName: string | null; authorUsername: string | null; authorCreatedAt: Date | null; authorNameStyle: string | null; authorCustomTitle: string | null; createdAt: string }[]
  hashtags: string[]
}

type TopPost = { type: 'news' | 'reel' | 'daily'; id: string; rank: number; score: number; title: string; body: string; mediaUrl: string | null; createdAt: string; authorId: string | null; authorName: string; authorUsername: string; authorAvatar: string | null; authorNameStyle: string | null; authorCustomTitle: string | null }

async function fetchTopPosts(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('top_posts_unavailable')
  return response.json() as Promise<{ posts: TopPost[] }>
}

const fetchJson = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error('search_failed')
  return response.json() as Promise<SearchResults>
}

export function DatabaseSearchSection({ query, onQueryChange, locale }: { query: string; onQueryChange: (value: string) => void; locale: Locale }) {
  const deferredQuery = useDeferredValue(query.trim())
  const { data, isLoading, error } = useSWR<SearchResults>(deferredQuery ? `/api/search?q=${encodeURIComponent(deferredQuery)}` : null, fetchJson, { keepPreviousData: true })
  const [filter, setFilter] = useState<'all' | 'top' | 'members' | 'news' | 'daily' | 'reels' | 'hashtags'>('all')
  const { data: topData } = useSWR<{ posts: TopPost[] }>(filter === 'top' ? '/api/top' : null, fetchTopPosts, { refreshInterval: 60 * 60 * 1000 })
  const labels = locale === 'ar'
    ? { title: 'اعثر على الأشخاص والقصص', description: 'ابحث في ملفات المجتمع والأخبار واللحظات اليومية والريلز والوسوم.', placeholder: 'ابحث عن أشخاص أو منشورات أو مواضيع', all: 'الكل', top: 'الأبرز', members: 'الأعضاء', news: 'الأخبار', daily: 'لحظات يومية', reels: 'ريلز', hashtags: 'الوسوم', empty: 'لا توجد نتائج مطابقة.', loading: 'جارٍ البحث…' }
    : { title: 'Find your people and stories', description: 'Search community profiles, news, daily moments, Reels, and hashtags.', placeholder: 'Search people, posts, or topics', all: 'All', top: 'Top', members: 'Members', news: 'News', daily: 'Daily moments', reels: 'Reels', hashtags: 'Hashtags', empty: 'No matching results yet.', loading: 'Searching…' }
  const filters = ['all', 'top', 'members', 'news', 'daily', 'reels', 'hashtags'] as const
  const results = data ?? { members: [], posts: [], dailyPosts: [], reels: [], hashtags: [] }
  const visibleCount = (filter === 'top' ? topData?.posts.length ?? 0 : 0) + (filter === 'all' || filter === 'members' ? results.members.length : 0) + (filter === 'all' || filter === 'news' ? results.posts.length : 0) + (filter === 'all' || filter === 'daily' ? results.dailyPosts.length : 0) + (filter === 'all' || filter === 'reels' ? results.reels.length : 0) + (filter === 'all' || filter === 'hashtags' ? results.hashtags.length : 0)
  const hashtagCount = useMemo(() => results.hashtags.length, [results.hashtags])

  return (
    <section className="section-view" aria-labelledby="search-title">
      <div className="section-heading"><span className="section-kicker"><Search aria-hidden="true" />{labels.all}</span><h1 id="search-title">{labels.title}</h1><p>{labels.description}</p></div>
      <label className="section-search"><Search aria-hidden="true" /><input aria-label={labels.placeholder} placeholder={labels.placeholder} value={query} onChange={(event) => onQueryChange(event.target.value)} autoFocus /></label>
      <div className="section-tabs" role="group" aria-label={locale === 'ar' ? 'تصفية البحث' : 'Search filters'}>{filters.map((key) => <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? 'section-tab section-tab-active' : 'section-tab'} onClick={() => setFilter(key)}>{labels[key]}</button>)}</div>
      {filter === 'top' ? topData ? topData.posts.length ? <section className="search-result-group top-results"><div className="result-group-heading"><h2>{labels.top}</h2><span>{topData.posts.length}</span></div><div className="news-list">{topData.posts.map((post) => <article className={`search-post ${post.rank <= 3 ? 'top-post-card' : ''}`} key={`${post.type}-${post.id}`}><span className="top-today-pill">{locale === 'ar' ? `الأعلى اليوم #${post.rank}` : `Top today #${post.rank}`}</span><h3>{post.title || post.body.slice(0, 90)}</h3><p>{post.body.slice(0, 220)}</p><a className="tag-author-link" href={`/u/${encodeURIComponent(post.authorUsername)}`}><UserName userId={post.authorId ?? undefined} name={post.authorName} username={post.authorUsername} nameStyle={post.authorNameStyle} customTitle={post.authorCustomTitle} locale={locale} /></a><a className="profile-repost-original" href={`/#${post.type}-${post.id}`}>{locale === 'ar' ? 'عرض المنشور' : 'View post'}</a></article>)}</div></section> : <div className="section-empty"><span className="section-empty-icon"><Search aria-hidden="true" /></span><h2>{labels.empty}</h2></div> : <p className="search-status" role="status">{labels.loading}</p> : <>
      {isLoading && !data && <p className="search-status" role="status">{labels.loading}</p>}
      {error && <p className="search-status" role="status">{labels.empty}</p>}
      {deferredQuery && data && visibleCount === 0 ? <div className="section-empty"><span className="section-empty-icon"><Search aria-hidden="true" /></span><h2>{labels.empty}</h2></div> : data && visibleCount > 0 && <div className="search-results">
        {(filter === 'all' || filter === 'members') && results.members.length > 0 && <section className="search-result-group"><div className="result-group-heading"><h2>{labels.members}</h2><span>{results.members.length}</span></div><div className="member-result-list">{results.members.map((member) => <a className="member-result" href={`/u/${encodeURIComponent(member.username)}`} key={member.id}>{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : <span className="member-result-fallback"><UserRound aria-hidden="true" /></span>}<UserName userId={member.id} name={member.displayName} username={member.username} nameStyle={member.nameStyle} customTitle={member.customTitle} locale={locale} /><ArrowUpRight aria-hidden="true" /></a>)}</div></section>}
        {(filter === 'all' || filter === 'hashtags') && hashtagCount > 0 && <section className="search-result-group"><div className="result-group-heading"><h2>{labels.hashtags}</h2><span>{hashtagCount}</span></div><div className="search-tags">{results.hashtags.map((tag) => <a key={tag} className="search-tag" href={`/tags/${encodeURIComponent(tag)}?lang=${locale}`}><span>#</span><strong>{tag}</strong></a>)}</div></section>}
        {(filter === 'all' || filter === 'news') && results.posts.length > 0 && <section className="search-result-group"><div className="result-group-heading"><h2>{labels.news}</h2><span>{results.posts.length}</span></div><div className="news-list">{results.posts.map((post) => <article className="search-post" key={post.id}><h3>{post.title}</h3><p>{post.body}</p>{post.tags.map((tag) => <a className="post-tag" key={tag} href={`/tags/${encodeURIComponent(tag)}?lang=${locale}`}>#{tag}</a>)}</article>)}</div></section>}
        {(filter === 'all' || filter === 'daily') && results.dailyPosts.length > 0 && <section className="search-result-group"><div className="result-group-heading"><h2>{labels.daily}</h2><span>{results.dailyPosts.length}</span></div><div className="news-list">{results.dailyPosts.map((post) => <article className="search-post" key={post.id}><p dir="auto"><RichText text={post.body} /></p>{post.tags.map((tag) => <a className="post-tag" key={tag} href={`/tags/${encodeURIComponent(tag)}?lang=${locale}`} dir="ltr">#{tag}</a>)}</article>)}</div></section>}
        {(filter === 'all' || filter === 'reels') && results.reels.length > 0 && <section className="search-result-group"><div className="result-group-heading"><h2>{labels.reels}</h2><span>{results.reels.length}</span></div><div className="reel-list">{results.reels.map((reel) => <article className="reel-card" key={reel.id}><video className="reel-video" controls playsInline preload="metadata" src={reel.videoUrl} aria-label={reel.caption || labels.reels} /><div className="reel-card-content"><h3>{reel.caption || labels.reels}</h3>{reel.authorUsername && <a className="tag-author-link" href={`/u/${encodeURIComponent(reel.authorUsername)}`}>@{reel.authorUsername}</a>}{reel.tags.map((tag) => <a className="post-tag" key={tag} href={`/tags/${encodeURIComponent(tag)}?lang=${locale}`}>#{tag}</a>)}</div></article>)}</div></section>}
      </div>}
      </>}
    </section>
  )
}

export type ModerationItem = { id: string; kind: 'news' | 'reel' | 'daily'; title: string; body: string; authorName: string; createdAt: string; isHidden: boolean }

export function ModerationPanel({ initialItems, locale }: { initialItems: ModerationItem[]; locale: Locale }) {
  const labels = locale === 'ar'
    ? { title: 'إدا��ة محتوى المجتمع', description: 'راجع المنشورات الحديثة وأخفِ المحتوى أو أعد إظهاره.', error: 'تعذر تنفيذ الإجراء. حاول مرة أخرى.', empty: 'لا توجد عناصر للمراجعة', saving: 'جارٍ الحفظ…', hide: 'إخفاء', restore: 'استعادة', daily: 'لحظات يومية', news: 'الأخبار', reels: 'ريلز' }
    : { title: 'Community moderation', description: 'Review recent posts and hide or restore content without deleting it.', error: 'The moderation action could not be completed. Try again.', empty: 'Nothing to review', saving: 'Saving…', hide: 'Hide', restore: 'Restore', daily: 'Daily moment', news: 'News', reels: 'Reel' }
  const [items, setItems] = useState(initialItems)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function toggleVisibility(item: ModerationItem) {
    setWorkingId(item.id)
    setError('')
    try {
      const response = await fetch('/api/moderation', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, kind: item.kind, isHidden: !item.isHidden }) })
      if (!response.ok) throw new Error('moderation_failed')
      setItems((current) => current.map((entry) => entry.id === item.id && entry.kind === item.kind ? { ...entry, isHidden: !entry.isHidden } : entry))
    } catch {
      setError(labels.error)
    } finally {
      setWorkingId(null)
    }
  }

  return <section className="section-view" aria-labelledby="moderation-title"><div className="section-heading"><span className="section-kicker"><ShieldAlert aria-hidden="true" />DISLOOP</span><h1 id="moderation-title">{labels.title}</h1><p>{labels.description}</p></div>{error && <p className="form-error" role="alert">{error}</p>}{items.length ? <div className="moderation-list">{items.map((item) => <article className="moderation-item" key={`${item.kind}-${item.id}`}><div><span className="category-pill">{item.kind === 'daily' ? labels.daily : item.kind === 'news' ? labels.news : labels.reels}</span><strong>{item.title}</strong><p>{item.body}</p><small>{item.authorName} · {new Date(item.createdAt).toLocaleString()}</small></div><button className="section-secondary-button" type="button" onClick={() => toggleVisibility(item)} disabled={workingId === item.id}>{workingId === item.id ? labels.saving : item.isHidden ? labels.restore : labels.hide}</button></article>)}</div> : <div className="section-empty"><span className="section-empty-icon"><Check aria-hidden="true" /></span><h2>{labels.empty}</h2></div>}</section>
}
