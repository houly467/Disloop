'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import useSWR from 'swr'
import {
  ArrowUpRight,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  Compass,
  Globe2,
  Hash,
  ImagePlus,
  Images,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  PenSquare,
  Plus,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
  Sun,
  UserRound,
  Video,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MentionTextarea } from '@/components/mention-textarea'
import type { NewsPost } from '@/lib/news'
import type { CurrentUser } from '@/lib/session'
import type { CommunityReel } from '@/lib/reels'
import { DatabaseSearchSection, ProfileSection, ReelsSection } from '@/components/community-sections'
import { DirectMessagesSection } from '@/components/direct-messages-section'
import { GroupsSection } from '@/components/groups-section'
import { AccountSwitcher } from '@/components/account-switcher'
import { NotificationsSection } from '@/components/notifications-section'
import { PostEngagement } from '@/components/post-engagement'
import { NewAccountBadge } from '@/components/new-account-badge'
import { EquippedBadges } from '@/components/badge-display'
import { RichText } from '@/components/mention-textarea'
import { StoriesSection } from '@/components/stories-section'
import { compressImage } from '@/lib/image-compression'
import { uploadMedia } from '@/lib/client-upload'
import { localizedUploadError } from '@/lib/client-errors'
import { CALM_POST_COLORS, sanitizeCalmColor } from '@/lib/colors'
import { ImageViewer } from '@/components/image-viewer'
import { BRAND_LOGO_URL } from '@/lib/brand-assets'
import { ProfileOnboarding } from '@/components/profile-onboarding'

type Locale = 'en' | 'ar'
type MainSection = 'news' | 'reels' | 'stories' | 'search' | 'profile' | 'messages' | 'groups' | 'notifications'
type Theme = 'dark' | 'light'
type Category = 'all' | 'server' | 'updates' | 'community' | 'events'

type NewsAppProps = {
  initialPosts: NewsPost[]
  initialSession: CurrentUser | null
  initialReels: CommunityReel[]
  initialProfilePosts: NewsPost[]
  initialProfileReels: CommunityReel[]
  initialModerator: boolean
  initialComposerOpen: boolean
  inviteUrl: string | null
  authNotice: string | null
  membershipReturnTo: string | null
}

const copy = {
  en: {
    tagline: 'A little closer, every day.',
    news: 'News', reels: 'Reels', stories: 'Stories', search: 'Search', profile: 'Profile', messages: 'Messages', groups: 'Groups', notifications: 'Notifications',
    language: 'العربية', themeDark: 'Switch to light theme', themeLight: 'Switch to dark theme',
    signIn: 'Log in with Discord', signOut: 'Sign out', create: 'Write a post',
    eyebrow: 'THE COMMUNITY, IN THE LOOP',
    headline: 'A place for what’s happening.',
    subhead: 'News, small moments, and the people who make this community.',
    filterAll: 'Everything', server: 'Server', updates: 'Updates', community: 'Community', events: 'Events',
    pinned: 'Pinned', from: 'from', noPosts: 'A quiet start, full of possibility.',
    noPostsBody: 'When something is worth sharing, it belongs here.',
    startPost: 'Write the first post', featured: 'Worth a closer look',
    explore: 'Take your time. The good stuff is here when you are.',
    membersOnly: 'A community space, together.',
    membersOnlyBody: 'Join our Discord server to publish and take part in the conversation.',
    openDiscord: 'Join the Discord', verify: 'I’ve joined — check again', checking: 'Checking…',
    verified: 'You’re in. Welcome to the community.', verifyFailed: 'We couldn’t verify that yet. Try again in a moment.',
    signInFirst: 'Log in to your Discord account to share with the community.',
    noNotifications: 'You’re all caught up.', savedPost: 'Post saved for this session.', unsavedPost: 'Post removed from saved items.', viewCover: 'Open cover image', closeImage: 'Close image viewer',
    postTitle: 'Share an update', postDescription: 'A good note, a useful update, or something the community should know.',
    titleLabel: 'Title', titlePlaceholder: 'Give your post a clear title',
    bodyLabel: 'What’s happening?', bodyPlaceholder: 'Add a little context for everyone…',
    categoryLabel: 'Category', coverLabel: 'Cover image', addCover: 'Add a cover', changeCover: 'Change image', accentColor: 'Post border color', customColor: 'Custom color', repliesFromFollowing: 'Only people I follow can reply',
    coverHint: 'JPG, PNG, or WebP · up to 10 MB', publish: 'Publish post', publishing: 'Publishing…', retry: 'Retry',
    cancel: 'Cancel', unsaved: 'You have an unfinished post. Discard it?',
    required: 'Add a title and a little context before publishing.',
    tooManyTags: 'A post can include up to 10 hashtags.', tooManyMentions: 'A post can mention up to 5 people.', fileType: 'Choose a JPG, PNG, or WebP image.',
    fileSize: 'Cover images can be up to 10 MB.', uploadFailed: 'The image could not upload. Please try again.',
    publishFailed: 'The post could not be published. Please try again.',
    membershipRequired: 'Join the Discord server before publishing.',
    toast: 'Your post is in the loop.', latest: 'Latest',
    serverNote: 'A calmer corner of the internet', serverNoteBody: 'No rush. Just the things people here care about.',
    hashtags: 'In the conversation',     loginError: 'Discord sign-in did not finish. Please try again.',
    authConfigError: 'Discord sign-in is not ready. Set SESSION_SECRET to a random value with at least 32 characters and check the Discord OAuth settings.',
    stateError: 'That sign-in link expired. Please start again.',
    emptySearch: 'Nothing found in these posts.', searchPlaceholder: 'Search this feed',
    comments: 'Comments',   sample: 'Community team', demo: 'Sample',

  },
  ar: {
    tagline: 'أقرب لبعض، كل يوم.',
    news: 'الأخبار', reels: 'ريلز', stories: 'القصص', search: 'بحث', profile: 'الملف الشخصي', messages: 'الرسائل', groups: 'المجموعات', notifications: 'الإشعارات',
    language: 'English', themeDark: 'التبديل إلى المظهر الفاتح', themeLight: 'التبديل إلى المظهر الداكن',
    signIn: 'تسجيل الدخول عبر Discord', signOut: 'تسجيل الخروج', create: 'اكتب منشورًا',
    eyebrow: 'مجتمعنا، لحظة بلحظة',
    headline: 'مساحة لكل ما يحدث.',
    subhead: 'أخبار ولحظات صغيرة وأشخاص يصنعون هذا المجتمع.',
    filterAll: 'الكل', server: 'السيرفر', updates: 'تحديثات', community: 'المجتمع', events: 'فعاليات',
    pinned: 'مثبّت', from: 'بواسطة', noPosts: 'بداية هادئة مليئة بالاحتمالات.',
    noPostsBody: 'كل ما يستحق المشاركة مكانه هنا.',
    startPost: 'اكتب أول منشور', featured: 'يستحق التوقف عنده',
    explore: 'خذ وقتك. الأشياء الجميلة هنا وقتما تحب.',
    membersOnly: 'مساحة تجمعنا.',
    membersOnlyBody: 'انضم إلى سيرفر Discord للنشر والمشاركة في الحوار.',
    openDiscord: 'انضم إلى Discord', verify: 'انضممت — تحقق الآن', checking: 'جارٍ التحقق…',
    verified: 'أصبحت معنا. أهلًا بك في المجتمع.', verifyFailed: 'تعذر التحقق الآن. جرّب مرة أخرى بعد قليل.',
    signInFirst: 'سجّل الدخول إلى Discord للمشاركة مع المجتمع.',
    noNotifications: 'لا توجد إشعارات جديدة.', savedPost: 'تم حفظ المنشور لهذه الجلسة.', unsavedPost: 'تمت إزالة المنشور من المحفوظات.', viewCover: 'عرض صورة الغلاف', closeImage: 'إغلاق عارض الصور',
    postTitle: 'شارك تحديثًا', postDescription: 'معلومة مفيدة أو تحديث أو شيء يستحق أن يعرف�� المجتمع.',
    titleLabel: 'العنوان', titlePlaceholder: 'اكتب عنوانًا واضحًا لمنشو��ك',
    bodyLabel: 'ما الذي يحدث؟', bodyPlaceholder: 'أضف بعض التفاصيل للجميع…',
    categoryLabel: 'التصنيف', coverLabel: 'صورة الغلاف', addCover: 'أضف غلافًا', changeCover: 'تغيير الصورة', accentColor: 'لون إطار المنشور', customColor: 'لون مخصص', repliesFromFollowing: 'السماح بالرد للأشخاص الذين أتابعهم فقط',
    coverHint: 'JPG أو PNG أو WebP · حتى 10 ميغابايت', publish: 'نشر المنشور', publishing: 'جارٍ النشر…', retry: 'إعادة المحاولة',
    cancel: 'إلغاء', unsaved: 'لديك منشور غير مكتمل. هل تريد حذفه؟',
    required: 'أضف ����نوانًا وبعض التفاصيل قبل النشر.',
    tooManyTags: 'يمكن إضافة 10 وسوم كحد أقصى.', tooManyMentions: 'يمكن الإشارة ��لى 5 أشخاص كحد أقصى.', fileType: 'اختر صورة بصيغة JPG أو PNG أو WebP.',
    fileSize: 'يجب ألا يتجاوز حجم الغلاف 10 ميغابايت.', uploadFailed: 'تعذر رفع الصورة. حاول مرة أخرى.',
    publishFailed: 'تعذر نشر المنشور. حاول مرة أخرى.',
    membershipRequired: 'انضم إلى سيرفر Discord قبل النشر.',
    toast: 'تم نشر منشورك في المجتمع.', latest: 'الأحدث',
    serverNote: 'زاوية هادئة على الإنترنت', serverNoteBody: 'على راحتك. هنا ما يهم أفراد المجتمع.',
    hashtags: 'مواضيع متداولة',     loginError: 'لم يكتمل تسجيل الدخول عبر Discord. حاول مرة أخرى.',
    authConfigError: 'تسجيل الدخول عبر Discord غير جاهز. اجعل SESSION_SECRET عشوائيًا بطول 32 حرفًا على الأقل وتحقق من إعدادات OAuth.',
    stateError: 'انتهت صلاحية رابط الدخول. ابدأ من جديد.',
    emptySearch: 'لم نعثر على شيء في هذه المنشورات.', searchPlaceholder: 'ابحث في الأخبار',
    comments: 'تعليقات', sample: 'فريق المجتمع', demo: 'تجريبي',
  },
} satisfies Record<Locale, Record<string, string>>

const categoryKeys: Category[] = ['all', 'server', 'updates', 'community', 'events']

function relativeTime(value: string, locale: Locale) {
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  const formatter = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar' : 'en', { numeric: 'auto' })
  if (minutes < 60) return formatter.format(-minutes, 'minute')
  if (minutes < 1_440) return formatter.format(-Math.floor(minutes / 60), 'hour')
  return formatter.format(-Math.floor(minutes / 1_440), 'day')
}

function sanitizeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null
  return value
}

export function NewsApp({
  initialPosts,
  initialSession,
  initialReels,
  initialProfilePosts,
  initialProfileReels,
  initialModerator,
  initialComposerOpen,
  inviteUrl,
  authNotice,
  membershipReturnTo,
}: NewsAppProps) {
  const [locale, setLocale] = useState<Locale>('en')
  const [theme, setTheme] = useState<Theme>('dark')
  const [posts, setPosts] = useState(initialPosts)
  const [reels, setReels] = useState(initialReels)
  const [profilePosts, setProfilePosts] = useState(initialProfilePosts)
  const [profileReels, setProfileReels] = useState(initialProfileReels)
  const [currentUser, setCurrentUser] = useState(initialSession)
  const [activeSection, setActiveSection] = useState<MainSection>('news')
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(() => new Set())
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(
    authNotice === 'failed' ? 'loginError' : authNotice === 'state-error' ? 'stateError' : authNotice === 'configuration-error' ? 'authConfigError' : null,
  )
  const [userIsMember, setUserIsMember] = useState(initialSession?.isMember ?? false)
  const [checkingMembership, setCheckingMembership] = useState(false)
  const [composerOpen, setComposerOpen] = useState(initialComposerOpen && Boolean(initialSession?.isMember && initialSession.dateOfBirth))
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('community')
  const [accentColor, setAccentColor] = useState<string>(CALM_POST_COLORS[0])
  const [repliesFromFollowing, setRepliesFromFollowing] = useState(false)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [showToast, setShowToast] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const t = copy[locale] as Record<string, string>
  const isArabic = locale === 'ar'
  const loginHref = '/auth/login?returnTo=%2F%3Fcompose%3Dnews'
  const pendingReturn = sanitizeReturnTo(membershipReturnTo)
  const { data: notificationSummary } = useSWR<{ unreadCount: number }>(currentUser ? '/api/notifications?summary=1' : null, async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('notifications_failed')
    return response.json()
  }, { refreshInterval: 15000 })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (composerOpen && !dialog.open) dialog.showModal()
    if (!composerOpen && dialog.open) dialog.close()
  }, [composerOpen])

  useEffect(() => {
    if (!coverPreview?.startsWith('blob:')) return
    return () => URL.revokeObjectURL(coverPreview)
  }, [coverPreview])

  const visiblePosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return posts.filter((post) => {
      const matchesCategory = category === 'all' || post.category === category
      const matchesQuery = !normalizedQuery || `${post.title} ${post.body} ${post.tags.map((tag) => `#${tag}`).join(' ')}`.toLocaleLowerCase().includes(normalizedQuery)
      return matchesCategory && matchesQuery
    })
  }, [category, posts, query])

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const post of posts) {
      for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    for (const reel of reels) {
      for (const tag of reel.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [posts, reels])

  function showMessage(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 3_500)
  }

  function toggleSavedPost(postId: string) {
    const isSaved = savedPostIds.has(postId)
    setSavedPostIds((current) => {
      const next = new Set(current)
      if (isSaved) next.delete(postId)
      else next.add(postId)
      return next
    })
    showMessage(isSaved ? 'unsavedPost' : 'savedPost')
  }

  function openComposer() {
    if (!currentUser) {
      window.location.assign(loginHref)
      return
    }
    if (!userIsMember) {
      showMessage('membershipRequired')
      return
    }
    setFormError(null)
    setComposerOpen(true)
  }

  function closeComposer() {
    const hasChanges = Boolean(title.trim() || body.trim() || coverFile || repliesFromFollowing || accentColor !== CALM_POST_COLORS[0])
    if (hasChanges && !publishing && !window.confirm(t.unsaved)) return
    setComposerOpen(false)
  }

  async function verifyMembership() {
    setCheckingMembership(true)
    try {
      const response = await fetch('/api/membership', { method: 'POST' })
      const result = (await response.json()) as { isMember?: boolean }
      if (!response.ok || !result.isMember) {
        showMessage('verifyFailed')
        return
      }
      setUserIsMember(true)
      setCurrentUser((user) => user ? { ...user, isMember: true } : user)
      showMessage('verified')
      if (pendingReturn?.includes('compose=news')) setComposerOpen(true)
    } catch {
      showMessage('verifyFailed')
    } finally {
      setCheckingMembership(false)
    }
  }

  function selectCover(file: File | null) {
    setFormError(null)
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('fileType')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError('fileSize')
      return
    }
    setCoverFile(file)
    setCoverPreview(URL.createObjectURL(file))
  }

  async function uploadCover(file: File) {
    const result = await uploadMedia({ endpoint: '/api/upload', file, kind: 'news', onProgress: setUploadProgress })
    return result.url
  }

  async function publishPost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim() || !body.trim()) {
      setFormError('required')
      return
    }

    setPublishing(true)
    setUploadProgress(0)
    setFormError(null)
    try {
      const uploadFile = coverFile?.type === 'image/gif' ? coverFile : coverFile ? await compressImage(coverFile) : null
      const coverUrl = uploadFile ? await uploadCover(uploadFile) : null
      const response = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), category: selectedCategory, coverUrl, accentColor, repliesFromFollowing }),
      })
      const result = (await response.json()) as { post?: NewsPost; xp?: number | null; error?: string; reason?: string }
      if (!response.ok || !result.post) {
        console.error('[news] publish request failed', { status: response.status, message: result.reason ?? result.error ?? 'publishFailed' })
        if (result.error === 'too_many_tags') throw new Error('tooManyTags')
        if (result.error === 'invalid_post') throw new Error('tooManyMentions')
        throw new Error(result.reason ?? result.error ?? 'publishFailed')
      }

      setPosts((current) => [result.post!, ...current])
      setProfilePosts((current) => [result.post!, ...current])
      if (result.xp !== null && result.xp !== undefined) setCurrentUser((user) => user ? { ...user, xp: result.xp! } : user)
      setTitle('')
      setBody('')
      setAccentColor(CALM_POST_COLORS[0])
      setRepliesFromFollowing(false)
      setCoverFile(null)
      setCoverPreview(null)
      setComposerOpen(false)
      setShowToast(true)
      window.setTimeout(() => setShowToast(false), 3_500)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'publishFailed'
      console.error('[news] publishing flow failed', { message })
      setFormError(message)
    } finally {
      setPublishing(false)
      setUploadProgress(0)
    }
  }

  async function signOut() {
    await fetch('/auth/logout', { method: 'POST' })
    window.location.assign('/')
  }

  const navigation: { section: MainSection; label: string; icon: typeof Compass }[] = [
    { section: 'news', label: t.news, icon: Compass },
    { section: 'reels', label: t.reels, icon: Video },
    { section: 'stories', label: t.stories, icon: Images },
    { section: 'search', label: t.search, icon: Search },
    { section: 'messages', label: t.messages, icon: MessageCircle },
    { section: 'groups', label: t.groups, icon: UsersRound },
    { section: 'notifications', label: t.notifications, icon: Bell },
    { section: 'profile', label: t.profile, icon: UserRound },
  ]
  const activeSectionLabel = navigation.find(({ section }) => section === activeSection)?.label ?? t.news
  const filterLabel: Record<Category, string> = {
    all: t.filterAll,
    server: t.server,
    updates: t.updates,
    community: t.community,
    events: t.events,
  }

  return (
    <div className="disloop-shell" data-theme={theme} dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="app-frame">
        <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`} aria-label={isArabic ? 'التنقل الرئيسي' : 'Main navigation'}>
          <a className="brand-lockup" href="/" aria-label="Disloop home">
            <span className="brand-mark" aria-hidden="true"><img src={BRAND_LOGO_URL} alt="" /></span>
            <span className="brand-copy"><strong>disloop</strong><small>{t.tagline}</small></span>
          </a>

          <div className="server-switcher">
            <span className="server-avatar"><img src={BRAND_LOGO_URL} alt="" /></span>
            <span className="server-switcher-copy"><strong>Disloop</strong><small>{isArabic ? 'مجتمع Discord' : 'Discord community'}</small></span>
            <ChevronDown aria-hidden="true" />
          </div>

          {currentUser && <AccountSwitcher user={currentUser} locale={locale} />}

          <div className="sidebar-section-label">{isArabic ? 'مساحتك' : 'YOUR SPACE'}</div>
          <nav className="primary-nav">
            {navigation.map(({ section, label, icon: Icon }) => {
              const isActive = activeSection === section
              return (
                <button
                  className={`nav-item ${isActive ? 'nav-item-active' : ''}`}
                  key={section}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setActiveSection(section)
                    setMobileMenuOpen(false)
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                  {isActive && <span className="nav-current-dot" aria-hidden="true" />}
                </button>
              )
            })}
          </nav>

          <div className="sidebar-spacer" />
              <div className="sidebar-note">
                <div className="note-icon"><ShieldCheck aria-hidden="true" /></div>
                <strong>{t.serverNote}</strong>
                <p>{t.serverNoteBody}</p>
              </div>
              {initialModerator && <a className="moderation-shortcut" href={`/moderation?lang=${locale}`}><ShieldAlert aria-hidden="true" />{isArabic ? 'إدارة المحتوى' : 'Moderation queue'}<ArrowUpRight aria-hidden="true" /></a>}

          <div className="sidebar-footer">
            {currentUser ? (
              <div className="sidebar-user">
                {currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt="" /> : <span className="avatar-fallback"><UserRound aria-hidden="true" /></span>}
                <span className="sidebar-user-copy"><strong>{currentUser.displayName}{currentUser.isStaffRole && <span className="staff-role-chip">{currentUser.isStaffRole}</span>}</strong><small>@{currentUser.username}</small></span>
                <button className="icon-button small-icon-button" type="button" onClick={signOut} aria-label={t.signOut}><LogOut aria-hidden="true" /></button>
              </div>
            ) : (
              <a className="sidebar-login" href={loginHref}><LogIn aria-hidden="true" /><span>{t.signIn}</span><ArrowUpRight aria-hidden="true" /></a>
            )}
          </div>
        </aside>

        <div className="mobile-topbar">
          <button className="icon-button" type="button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label={isArabic ? 'فتح القائمة' : 'Open menu'}>
            {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
          <a className="mobile-brand" href="/" aria-label="Disloop home"><img src={BRAND_LOGO_URL} alt="" /><span>disloop</span></a>
          <button className="icon-button mobile-theme-toggle" type="button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? t.themeDark : t.themeLight}>
            {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
          <button className="mobile-avatar" type="button" onClick={() => currentUser ? setActiveSection('profile') : window.location.assign(loginHref)} aria-label={currentUser ? t.profile : t.signIn}>
            {currentUser?.avatarUrl ? <img src={currentUser.avatarUrl} alt="" /> : <UserRound aria-hidden="true" />}
          </button>
        </div>

        <main className="main-column">
          <header className="topbar">
            <div className="breadcrumbs"><span>{isArabic ? 'مجتمع' : 'Community'}</span><span className="breadcrumb-divider">/</span><strong>{activeSectionLabel}</strong></div>
            <div className="topbar-actions">
              <label className="feed-search">
                <Search aria-hidden="true" />
                <input aria-label={t.searchPlaceholder} placeholder={t.searchPlaceholder} value={query} onFocus={() => setActiveSection('search')} onChange={(event) => setQuery(event.target.value)} />
                <kbd>/</kbd>
              </label>
              <span className="topbar-divider" />
              <button className="utility-button" type="button" onClick={() => setLocale((value) => value === 'en' ? 'ar' : 'en')} aria-label={isArabic ? 'Switch to English' : 'Switch to Arabic'}>
                <Globe2 aria-hidden="true" /><span>{t.language}</span>
              </button>
              <button className="icon-button theme-toggle" type="button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? t.themeDark : t.themeLight} title={theme === 'dark' ? t.themeDark : t.themeLight}>
                {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              </button>
              <button className="icon-button notification-button" type="button" aria-label={`${t.notifications}${notificationSummary?.unreadCount ? ` · ${notificationSummary.unreadCount}` : ''}`} onClick={() => setActiveSection('notifications')}>
                <Bell aria-hidden="true" />{Boolean(notificationSummary?.unreadCount) && <span className="notification-count">{notificationSummary?.unreadCount}</span>}
              </button>
              {currentUser ? (
                <button className="topbar-avatar" type="button" onClick={() => setActiveSection('profile')} aria-label={t.profile} title={t.profile}>
                  {currentUser.avatarUrl ? <img src={currentUser.avatarUrl} alt="" /> : <UserRound aria-hidden="true" />}
                </button>
              ) : (
                <a className="topbar-login" href={loginHref}><LogIn aria-hidden="true" /><span>{t.signIn}</span></a>
              )}
            </div>
          </header>

          {notice && !showToast && (
            <div className={`inline-notice ${notice === 'verified' ? 'notice-success' : ''}`} role="status">
              {notice === 'verified' ? <Check aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
              <span>{t[notice] ?? notice}</span>
              <button type="button" className="notice-dismiss" onClick={() => setNotice(null)} aria-label={isArabic ? 'إغلاق' : 'Dismiss'}><X aria-hidden="true" /></button>
            </div>
          )}

          <div className="feed-layout">
            {activeSection === 'news' ? (
            <section className="feed-column" aria-labelledby="feed-title">
              <div className="feed-heading">
                <div className="feed-kicker"><span className="kicker-line" />{t.eyebrow}</div>
                <h1 id="feed-title">{t.headline}</h1>
                <p>{t.subhead}</p>
              </div>

              {currentUser && !userIsMember && (
                <section className="membership-card" aria-labelledby="membership-title">
                  <div className="membership-icon"><ShieldCheck aria-hidden="true" /></div>
                  <div className="membership-copy">
                    <h2 id="membership-title">{t.membersOnly}</h2>
                    <p>{t.membersOnlyBody}</p>
                  </div>
                  <div className="membership-actions">
                    {inviteUrl && <a className="invite-button" href={inviteUrl} target="_blank" rel="noreferrer">{t.openDiscord}<ArrowUpRight aria-hidden="true" /></a>}
                    <Button type="button" variant="outline" onClick={verifyMembership} disabled={checkingMembership}>
                      {checkingMembership ? <><Clock3 data-icon="inline-start" />{t.checking}</> : <><Check data-icon="inline-start" />{t.verify}</>}
                    </Button>
                  </div>
                </section>
              )}

              <div className="feed-toolbar">
                <div className="category-tabs" role="group" aria-label={isArabic ? 'تصفية الأخبار' : 'Filter news'}>
                  {categoryKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={category === key}
                      className={`category-tab ${category === key ? 'category-tab-active' : ''}`}
                      onClick={() => setCategory(key)}
                    >
                      {filterLabel[key]}
                    </button>
                  ))}
                </div>
                <span className="sort-button">
                  <Clock3 aria-hidden="true" /><span>{t.latest}</span><ChevronDown aria-hidden="true" />
                </span>
              </div>

              <div className="news-list" aria-live="polite">
                {visiblePosts.length ? visiblePosts.map((post, index) => (
                  <article className={`news-card ${post.pinned ? 'news-card-pinned' : ''} ${post.accentColor ? 'news-card-accented' : ''}`} style={post.accentColor ? { '--post-accent': sanitizeCalmColor(post.accentColor) ?? 'transparent' } as CSSProperties : undefined} id={`news-${post.id}`} key={post.id}>
                    {post.coverUrl ? (
                      <div className="news-cover-wrap">
                        <ImageViewer src={post.coverUrl} alt={post.title} label={t.viewCover} closeLabel={t.closeImage} className="news-cover" />
                        {post.pinned && <span className="cover-label"><Bookmark aria-hidden="true" />{t.pinned}</span>}
                        <button className={`cover-menu icon-button ${savedPostIds.has(post.id) ? 'cover-menu-saved' : ''}`} type="button" aria-label={isArabic ? savedPostIds.has(post.id) ? 'إزالة من ا��محفوظات' : 'حفظ المنشور' : savedPostIds.has(post.id) ? 'Remove saved post' : 'Save post'} onClick={() => toggleSavedPost(post.id)}>{savedPostIds.has(post.id) ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}</button>
                      </div>
                    ) : (
                      <div className={`news-cover-fallback fallback-${post.category}`} aria-label={isArabic ? 'لون غلاف هادئ' : 'Calm color cover'}>
                        <span className="fallback-mark">d<span>.</span></span>
                        {post.pinned && <span className="fallback-pinned"><Bookmark aria-hidden="true" />{t.pinned}</span>}
                        <button className={`cover-menu icon-button ${savedPostIds.has(post.id) ? 'cover-menu-saved' : ''}`} type="button" aria-label={isArabic ? savedPostIds.has(post.id) ? 'إزالة من المحفوظات' : 'حفظ المنشور' : savedPostIds.has(post.id) ? 'Remove saved post' : 'Save post'} onClick={() => toggleSavedPost(post.id)}>{savedPostIds.has(post.id) ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}</button>
                      </div>
                    )}
                    <div className="news-card-content">
                      <div className="post-meta-row">
                        <span className={`category-pill category-${post.category}`}>{t[post.category] ?? post.category}</span>
                        {post.isSeed && <span className="sample-pill">{t.demo}</span>}
                        <span className="meta-dot" aria-hidden="true">·</span>
                        <time dateTime={post.createdAt}>{relativeTime(post.createdAt, locale)}</time>
                      </div>
                      <h2>{post.title}</h2>
                      <p className="post-excerpt"><RichText text={post.body} /></p>
                      {post.tags.length > 0 && <div className="tag-row">{post.tags.map((tag) => <a className="post-tag" key={tag} href={`/tags/${encodeURIComponent(tag)}?lang=${locale}`}>#{tag}</a>)}</div>}
                      <div className="post-footer">
                        <div className="author-row">
                          {post.authorAvatar ? <img src={post.authorAvatar} alt="" /> : <span className="author-fallback">{post.authorName.charAt(0)}</span>}
                          {post.authorName === 'Disloop Community' ? <span className="post-author-link"><strong>{t.sample}</strong><small>@{post.authorUsername}</small></span> : <a className="post-author-link" href={`/u/${encodeURIComponent(post.authorUsername)}`}><strong>{post.authorName}<NewAccountBadge createdAt={post.authorCreatedAt} locale={locale} /></strong><small dir="ltr">@{post.authorUsername}</small><EquippedBadges userId={post.authorId} locale={locale} /></a>}
                        </div>
                      </div>
                    </div>
                    <PostEngagement type="news" contentId={post.id} authorId={post.authorId} viewer={currentUser ? { ...currentUser, isMember: userIsMember } : null} locale={locale} onSignIn={() => window.location.assign(loginHref)} />
                  </article>
                )) : (
                  <div className="empty-state">
                    <span className="empty-icon"><Search aria-hidden="true" /></span>
                    <h2>{query ? t.emptySearch : t.noPosts}</h2>
                    <p>{query ? t.explore : t.noPostsBody}</p>
                    {!query && <Button type="button" onClick={openComposer}><PenSquare data-icon="inline-start" />{t.startPost}</Button>}
                  </div>
                )}
              </div>
            </section>
            ) : (
              <div className="feed-column">
                {activeSection === 'reels' && <ReelsSection locale={locale} viewer={currentUser ? { ...currentUser, isMember: userIsMember } : null} initialReels={reels} inviteUrl={inviteUrl} onSignIn={() => window.location.assign(loginHref)} onReelPublished={(reel, xp) => { setReels((current) => [reel, ...current]); setProfileReels((current) => [reel, ...current]); if (xp !== null) setCurrentUser((user) => user ? { ...user, xp } : user) }}
 />}
                {activeSection === 'stories' && <StoriesSection viewer={currentUser ? { ...currentUser, isMember: userIsMember } : null} locale={locale} onSignIn={() => window.location.assign(loginHref)} />}
                {activeSection === 'search' && <DatabaseSearchSection query={query} onQueryChange={setQuery} locale={locale} />}
                {activeSection === 'messages' && <DirectMessagesSection viewer={currentUser ? { ...currentUser, isMember: userIsMember } : null} locale={locale} onSignIn={() => window.location.assign(loginHref)} />}
                {activeSection === 'groups' && <GroupsSection viewer={currentUser ? { ...currentUser, isMember: userIsMember } : null} locale={locale} onSignIn={() => window.location.assign(loginHref)} onMembershipVerified={() => { setUserIsMember(true); setCurrentUser((user) => user ? { ...user, isMember: true } : user) }} />}
                {activeSection === 'notifications' && <NotificationsSection viewer={currentUser ? { ...currentUser, isMember: userIsMember } : null} locale={locale} onSignIn={() => window.location.assign(loginHref)} />}
                {activeSection === 'profile' && currentUser && <ProfileSection profile={{ ...currentUser, isMember: userIsMember }} posts={profilePosts} reels={profileReels} locale={locale} editable onProfileSaved={(updated) => setCurrentUser((user) => user ? { ...user, ...updated } : user)} />}
                {activeSection === 'profile' && !currentUser && <section className="section-view"><div className="section-heading"><span className="section-kicker"><UserRound aria-hidden="true" />{t.profile}</span><h1>{isArabic ? 'ابدأ ملفك بتسجيل الدخول عبر Discord' : 'Your profile starts with Discord'}</h1><p>{isArabic ? 'سجّل الدخول لعرض هويتك ومنشوراتك في المجتمع.' : 'Sign in to see your community identity and posts.'}</p></div><button className="section-primary-button" type="button" onClick={() => window.location.assign(loginHref)}>{t.signIn}<ArrowUpRight aria-hidden="true" /></button></section>}
              </div>
            )}

            <aside className="right-rail" aria-label={isArabic ? 'معلومات المجتمع' : 'Community details'}>
              <div className="rail-title-row"><h2>{t.featured}</h2><button className="icon-button small-icon-button" type="button" onClick={() => setActiveSection('search')} aria-label={isArabic ? 'البحث عن مواضيع' : 'Search topics'}><Search aria-hidden="true" /></button></div>
              <p className="rail-intro">{t.explore}</p>
              <div className="rail-divider" />
              <div className="rail-card-heading"><span className="rail-heading-icon"><Hash aria-hidden="true" /></span><h3>{t.hashtags}</h3></div>
              <div className="trending-list">
                {tagCounts.length ? tagCounts.map(([tag, count]) => (
                  <button className="trending-item" key={tag} type="button" onClick={() => { setQuery(`#${tag}`); setActiveSection('search') }}>
                    <span><strong>#{tag}</strong><small>{count} {isArabic ? 'منشورات' : count === 1 ? 'post' : 'posts'}</small></span><ArrowUpRight aria-hidden="true" />
                  </button>
                )) : <p className="rail-empty">{isArabic ? 'ستظهر الوسوم هنا.' : 'Topics will show up here.'}</p>}
              </div>
              <div className="rail-divider" />
              <div className="rail-shortcuts" aria-label={isArabic ? 'استكشف المجتمع' : 'Explore the community'}>
                <h3>{isArabic ? 'استكشف المجتمع' : 'Explore the community'}</h3>
                {navigation.filter(({ section }) => section !== 'news').map(({ section, label, icon: Icon }) => <button type="button" key={section} onClick={() => setActiveSection(section)}><Icon aria-hidden="true" /><span>{label}</span><ArrowUpRight aria-hidden="true" /></button>)}
              </div>
              <div className="rail-footer"><span>DISLOOP · 2026</span><span>{isArabic ? 'مجتمعنا' : 'Made for the community'}</span></div>
            </aside>
          </div>
        </main>
      </div>

      <nav className="mobile-bottom-nav" aria-label={isArabic ? 'التنقل' : 'Navigation'}>
        {navigation.map(({ section, label, icon: Icon }) => {
          const isActive = activeSection === section
          return <button className={isActive ? 'mobile-nav-active' : ''} key={section} type="button" aria-current={isActive ? 'page' : undefined} onClick={() => setActiveSection(section)}><Icon aria-hidden="true" /><span>{label}</span></button>
        })}
      </nav>

      {activeSection === 'news' && <Button className="floating-create" type="button" onClick={openComposer} aria-label={t.create}>
        <Plus data-icon="inline-start" /><span>{t.create}</span>
      </Button>}

      {currentUser && !currentUser.dateOfBirth && <ProfileOnboarding profile={currentUser} locale={locale} onToggleLocale={() => setLocale((value) => value === 'en' ? 'ar' : 'en')} onComplete={(updated) => { setCurrentUser((user) => user ? { ...user, ...updated } : user); if (initialComposerOpen && currentUser.isMember) setComposerOpen(true) }} />}

      {showToast && <div className="toast-message" role="status"><Check aria-hidden="true" />{t.toast}</div>}

      <dialog
        ref={dialogRef}
        className="composer-dialog"
        aria-labelledby="composer-title"
        onCancel={(event) => { event.preventDefault(); closeComposer() }}
        onClose={() => setComposerOpen(false)}
        onClick={(event) => { if (event.target === event.currentTarget) closeComposer() }}
      >
        <form className="composer-form" onSubmit={publishPost}>
          <div className="composer-header">
            <div><span className="composer-kicker">DISLOOP · NEWS</span><h2 id="composer-title">{t.postTitle}</h2><p>{t.postDescription}</p></div>
            <button className="icon-button" type="button" onClick={closeComposer} aria-label={isArabic ? 'إغلاق' : 'Close'}><X aria-hidden="true" /></button>
          </div>

          <label className="composer-field"><span>{t.titleLabel}</span><Input maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t.titlePlaceholder} required /></label>
          <label className="composer-field"><span>{t.bodyLabel}</span><MentionTextarea maxLength={10_000} rows={5} value={body} onChange={setBody} locale={locale} placeholder={t.bodyPlaceholder} required className="composer-body-input" /></label>
          <label className="composer-field"><span>{t.categoryLabel}</span>
            <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              <option value="server">{t.server}</option><option value="updates">{t.updates}</option><option value="community">{t.community}</option><option value="events">{t.events}</option>
            </select>
          </label>

          <div className="composer-field">
            <span>{t.coverLabel}</span>
            <label className={`cover-picker ${coverPreview ? 'cover-picker-has-image' : ''}`}>
              {coverPreview ? <img src={coverPreview} alt={isArabic ? 'معا��نة صورة الغلاف' : 'Cover preview'} /> : <span className="cover-picker-placeholder"><ImagePlus aria-hidden="true" /><strong>{t.addCover}</strong><small>{t.coverHint}</small></span>}
              {coverPreview && <span className="cover-change-label"><ImagePlus aria-hidden="true" />{t.changeCover}</span>}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectCover(event.target.files?.[0] ?? null)} aria-label={t.addCover} />
            </label>
          </div>

          {publishing && coverFile && <div className="upload-progress" aria-live="polite"><div><span>{isArabic ? 'جارٍ رفع الغلاف' : 'Uploading cover'}</span><strong>{uploadProgress}%</strong></div><progress value={uploadProgress} max="100" /></div>}
          {formError && <div className="form-error" role="alert"><p>{t[formError] ?? localizedUploadError(formError, locale, t.publishFailed)}</p><Button type="button" variant="outline" disabled={publishing} onClick={() => dialogRef.current?.querySelector('form')?.requestSubmit()}>{t.retry}</Button></div>}
          <div className="composer-footer">
            <span className="composer-member-note"><ShieldCheck aria-hidden="true" />{isArabic ? 'لأعضاء السيرفر' : 'For server members'}</span>
            <div><Button type="button" variant="ghost" onClick={closeComposer} disabled={publishing}>{t.cancel}</Button><Button type="submit" disabled={publishing}>{publishing ? <><Clock3 data-icon="inline-start" />{t.publishing}</> : <><Send data-icon="inline-start" />{t.publish}</>}</Button></div>
          </div>
        </form>
      </dialog>
    </div>
  )
}
