'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProfileMusicPlayer } from '@/components/profile-music-player'
import { normalizeProfileMusicUrl } from '@/lib/profile-music'

type Locale = 'en' | 'ar'
type MetricKey = 'profileViews' | 'reelViews' | 'likes' | 'reposts' | 'followerGrowth'
type Metrics = Record<MetricKey, number>
type PreferencesResponse = { preferences: { theme: string; profileLink: string | null }; available: boolean }
type StatsResponse = {
  last7Days: Metrics | null
  previous7Days?: Metrics | null
  last30Days: Metrics | null
  previous30Days?: Metrics | null
  available?: boolean
}
type VerificationResponse = { requests: { id: string; reason: string; status: string; createdAt: string }[]; available: boolean }
type VerificationRequest = VerificationResponse['requests'][number]
type Period = '7d' | '30d'

const copy = {
  en: {
    tools: 'Profile tools', customize: 'Profile customization', theme: 'Profile theme',
    link: 'Profile song link', linkHelp: 'Use an HTTPS YouTube, Spotify, SoundCloud, or Apple Music link.',
    save: 'Save preferences', saved: 'Saved', unavailable: 'This feature is temporarily unavailable.',
    creator: 'Creator stats', seven: '7d', thirty: '30d', views: 'Profile views', reelViews: 'Reel views',
    likes: 'Likes', reposts: 'Reposts', followers: 'Follower growth', request: 'Request verification',
    reason: 'Why should your account be verified?', reasonHelp: 'Write between 20 and 500 characters.',
    submit: 'Submit request', noRequests: 'No requests yet.', error: 'Could not save this change.',
    status: 'Status', open: 'Open', approved: 'Approved', rejected: 'Rejected', characterCount: 'characters',
    reviewSoon: 'We will review your request soon.', verified: 'Your account is verified.',
    rejectedAgain: 'Your request was rejected. You can submit a new request.',
    requestAgain: 'Request again',
    openStats: 'Open stats page', emptyStats: 'Your stats will appear here as your community grows.',
    change: 'vs previous period', new: 'New', up: 'Up', down: 'Down', same: 'No change',
    invalidMusic: 'Use a secure link from YouTube, Spotify, SoundCloud, or Apple Music.',
  },
  ar: {
    tools: 'أدوات الملف الشخصي', customize: 'تخصيص الملف الشخصي', theme: 'سمة الملف الشخصي',
    link: 'رابط أغنية الملف الشخصي', linkHelp: 'استخدم رابط HTTPS من YouTube أو Spotify أو SoundCloud أو Apple Music.',
    save: 'حفظ التفضيلات', saved: 'تم الحفظ', unavailable: 'هذه الميزة غير متاحة مؤقتًا.',
    creator: 'إحصاءات المنشئ', seven: '٧ أيام', thirty: '٣٠ يومًا', views: 'زيارات الملف',
    reelViews: 'مشاهدات الريلز', likes: 'الإعجابات', reposts: 'إعادات النشر', followers: 'نمو المتابعين',
    request: 'طلب التوثيق', reason: 'لماذا ينبغي توثيق حسابك؟',
    reasonHelp: 'اكتب ما بين ٢٠ و٥٠٠ حرف.', submit: 'إرسال الطلب', noRequests: 'لا توجد طلبات بعد.',
    error: 'تعذر حفظ التغيير.', status: 'الحالة', open: 'مفتوح', approved: 'مقبول', rejected: 'مرفوض',
    characterCount: 'حرفًا', openStats: 'فتح صفحة الإحصاءات', emptyStats: 'ستظهر إحصاءاتك هنا مع نمو مجتمعك.',
    reviewSoon: 'سنراجع طلبك قريبًا.', verified: 'تم توثيق حسابك.',
    rejectedAgain: 'تم رفض طلبك. يمكنك إرسال طلب جديد.',
    requestAgain: 'إعادة الطلب',
    change: 'مقارنة بالفترة السابقة', new: 'جديد', up: 'ارتفاع', down: 'انخفاض', same: 'لا تغيير',
    invalidMusic: 'استخدم رابطًا آمنًا من YouTube أو Spotify أو SoundCloud أو Apple Music.',
  },
} satisfies Record<Locale, Record<string, string>>

const metricConfig: { key: MetricKey; labelKey: 'views' | 'reelViews' | 'likes' | 'reposts' | 'followers' }[] = [
  { key: 'profileViews', labelKey: 'views' },
  { key: 'reelViews', labelKey: 'reelViews' },
  { key: 'likes', labelKey: 'likes' },
  { key: 'reposts', labelKey: 'reposts' },
  { key: 'followerGrowth', labelKey: 'followers' },
]

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('profile_tool_unavailable')
  return response.json()
}

function Sparkline({ previous, current }: { previous: number; current: number }) {
  const maximum = Math.max(1, previous, current)
  const firstY = 19 - (previous / maximum) * 14
  const lastY = 19 - (current / maximum) * 14
  return <svg className="creator-stat-sparkline" viewBox="0 0 64 24" role="img" aria-label={`${previous} to ${current}`}>
    <polyline points={`3,${firstY} 61,${lastY}`} />
    <circle cx="61" cy={lastY} r="2.5" />
  </svg>
}

export function StatDashboard({ data, locale, period, compact = false }: { data: StatsResponse | undefined; locale: Locale; period: Period; compact?: boolean }) {
  const text = copy[locale]
  const current = period === '7d' ? data?.last7Days : data?.last30Days
  const previous = period === '7d' ? data?.previous7Days : data?.previous30Days
  if (data?.available === false) return <p className="profile-tool-help">{text.unavailable}</p>
  if (!current) return <p className="creator-stats-empty">{text.emptyStats}</p>

  return <div className={`creator-stat-tiles${compact ? ' creator-stat-tiles-compact' : ''}`}>
    {metricConfig.map(({ key, labelKey }) => {
      const value = current[key] ?? 0
      const prior = previous?.[key] ?? 0
      const difference = value - prior
      const changeLabel = prior === 0 && value > 0
        ? text.new
        : difference === 0
          ? text.same
          : `${difference > 0 ? '+' : ''}${difference} · ${text.change}`
      return <article className="creator-stat-tile" key={key}>
        <div className="creator-stat-tile-heading">
          <span>{text[labelKey]}</span>
          <Sparkline previous={prior} current={value} />
        </div>
        <strong className="creator-stat-value">{value.toLocaleString(locale)}</strong>
        <small className={`creator-stat-change${difference > 0 ? ' is-up' : difference < 0 ? ' is-down' : ''}`}>
          {difference > 0 ? <TrendingUp aria-hidden="true" /> : difference < 0 ? <TrendingDown aria-hidden="true" /> : <Minus aria-hidden="true" />}
          {changeLabel}
        </small>
      </article>
    })}
  </div>
}

function PeriodSwitch({ period, onChange, locale }: { period: Period; onChange: (value: Period) => void; locale: Locale }) {
  const text = copy[locale]
  return <div className="creator-period-switch" role="group" aria-label={locale === 'ar' ? 'الفترة الزمنية' : 'Stats period'}>
    {(['7d', '30d'] as const).map((value) => <Button
      key={value}
      type="button"
      size="sm"
      variant={period === value ? 'secondary' : 'ghost'}
      aria-pressed={period === value}
      onClick={() => onChange(value)}
    >{value === '7d' ? text.seven : text.thirty}</Button>)}
  </div>
}

export function VerificationRequestStatus({ request, locale, onRequestAgain }: {
  request: VerificationRequest
  locale: Locale
  onRequestAgain?: () => void
}) {
  const text = copy[locale]
  const status = request.status === 'approved' ? 'approved' : request.status === 'rejected' ? 'rejected' : 'open'
  const description = status === 'approved' ? text.verified : status === 'rejected' ? text.rejectedAgain : text.reviewSoon
  return <div className="verification-request-status">
    <div className="verification-request-summary">
      <span className={`verification-status-badge is-${status}`}>
        {text[status]}
      </span>
      <time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}</time>
    </div>
    <p className="profile-tool-help">{description}</p>
    {status === 'rejected' && onRequestAgain && <Button type="button" variant="outline" onClick={onRequestAgain}>{text.requestAgain}</Button>}
  </div>
}

export function ProfileTools({ locale }: { locale: Locale }) {
  const text = copy[locale]
  const { data: preferences, mutate: mutatePreferences } = useSWR<PreferencesResponse>('/api/profile/preferences', fetchJson)
  const { data: stats } = useSWR<StatsResponse>('/api/profile/creator-stats', fetchJson)
  const { data: verification, mutate: mutateVerification } = useSWR<VerificationResponse>('/api/verification-requests', fetchJson)
  const [theme, setTheme] = useState('default')
  const [profileLink, setProfileLink] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [period, setPeriod] = useState<Period>('7d')
  const [requestAgain, setRequestAgain] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(true)
  const reasonRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!preferences?.preferences) return
    setTheme(preferences.preferences.theme)
    setProfileLink(preferences.preferences.profileLink ? normalizeProfileMusicUrl(preferences.preferences.profileLink) ?? '' : '')
  }, [preferences?.preferences])

  useEffect(() => {
    document.querySelector('.profile-view')?.setAttribute('data-profile-theme', theme)
  }, [theme])

  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setToolsOpen(false)
  }, [])

  useEffect(() => {
    const textarea = reasonRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [reason])

  async function savePreferences() {
    setBusy(true)
    setMessage('')
    setErrorMessage('')
    try {
      const response = await fetch('/api/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, profileLink: profileLink.trim() || null }),
      })
      if (!response.ok) {
        if (response.status === 400) throw new Error('invalid_music')
        throw new Error('save_failed')
      }
      const result = await response.json() as PreferencesResponse
      await mutatePreferences(result, false)
      document.querySelector('.profile-view')?.setAttribute('data-profile-theme', theme)
      setMessage(text.saved)
    } catch (error) {
      setErrorMessage(error instanceof Error && error.message === 'invalid_music' ? text.invalidMusic : text.error)
    } finally {
      setBusy(false)
    }
  }

  async function submitVerification() {
    setBusy(true)
    setMessage('')
    setErrorMessage('')
    try {
      const response = await fetch('/api/verification-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) throw new Error('submit_failed')
      setReason('')
      setRequestAgain(false)
      await mutateVerification()
      setMessage(text.saved)
    } catch {
      setErrorMessage(text.error)
    } finally {
      setBusy(false)
    }
  }

  async function removeMusic() {
    setBusy(true)
    setErrorMessage('')
    try {
      const response = await fetch('/api/profile/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme, profileLink: null }),
      })
      if (!response.ok) throw new Error('remove_music_failed')
      const result = await response.json() as PreferencesResponse
      setProfileLink('')
      await mutatePreferences(result, false)
      setMessage(text.saved)
    } catch {
      setErrorMessage(text.error)
    } finally {
      setBusy(false)
    }
  }

  const requests = verification?.requests ?? []
  const activeRequest = requests.find((request) => request.status === 'open') ?? requests[0]
  const hasOpenRequest = requests.some((request) => request.status === 'open')
  const hasSubmittedRequest = activeRequest && activeRequest.status !== 'rejected'

  return <>
    {preferences?.preferences.profileLink && <ProfileMusicPlayer
      url={preferences.preferences.profileLink}
      locale={locale}
      onRemove={() => void removeMusic()}
    />}
    <details className="profile-tools-disclosure" open={toolsOpen} onToggle={(event) => setToolsOpen(event.currentTarget.open)}>
    <summary>{text.tools}</summary>
    <div className="profile-tools" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <section className="profile-tool-card">
        <h2>{text.customize}</h2>
        {preferences?.available === false ? <p className="profile-tool-help">{text.unavailable}</p> : <>
          <label htmlFor="profile-theme-select">{text.theme}
            <select id="profile-theme-select" value={theme} onChange={(event) => setTheme(event.target.value)}>
              <option value="default">Default</option><option value="ocean">Ocean</option><option value="sunset">Sunset</option><option value="forest">Forest</option><option value="violet">Violet</option>
            </select>
          </label>
          <label htmlFor="profile-music-url">{text.link}
            <input id="profile-music-url" type="url" inputMode="url" value={profileLink} onChange={(event) => setProfileLink(event.target.value)} placeholder="https://" dir="ltr" />
            <small className="profile-tool-help">{text.linkHelp}</small>
          </label>
          <Button type="button" variant="default" disabled={busy} onClick={() => void savePreferences()}>{text.save}</Button>
        </>}
      </section>

      <section className="profile-tool-card">
        <h2>{text.creator}</h2>
        <PeriodSwitch period={period} onChange={setPeriod} locale={locale} />
        <StatDashboard data={stats} locale={locale} period={period} compact />
        <Button className="creator-open-stats-button" type="button" variant="outline" onClick={() => window.location.assign('/?section=creator-stats')}>{text.openStats}</Button>
      </section>

      <section className="profile-tool-card">
        <h2>{text.request}</h2>
        {verification?.available === false ? <p className="profile-tool-help">{text.unavailable}</p> : <>
          {activeRequest && !requestAgain && <VerificationRequestStatus
            request={activeRequest}
            locale={locale}
            onRequestAgain={activeRequest.status === 'rejected' && !hasOpenRequest ? () => setRequestAgain(true) : undefined}
          />}
          {!hasOpenRequest && (!hasSubmittedRequest || requestAgain) && <form className="verification-request-form" onSubmit={(event) => { event.preventDefault(); void submitVerification() }}>
            <label htmlFor="verification-reason">{text.reason}
              <textarea
                id="verification-reason"
                ref={reasonRef}
                maxLength={500}
                minLength={20}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby="verification-reason-help verification-reason-count"
              />
              <small id="verification-reason-help" className="profile-tool-help">{text.reasonHelp}</small>
            </label>
            <div className="verification-form-footer">
              <small id="verification-reason-count" aria-live="polite">{reason.length}/500 {text.characterCount}</small>
              <Button className="verification-submit-button" type="submit" variant="default" disabled={busy || reason.trim().length < 20}>{text.submit}</Button>
            </div>
          </form>}
          {!requests.length && <p className="profile-tool-help">{text.noRequests}</p>}
        </>}
      </section>
    </div>
    {(message || errorMessage) && <p className={errorMessage ? 'profile-tools-message is-error' : 'profile-tools-message'} role={errorMessage ? 'alert' : 'status'}>{errorMessage || message}</p>}
    </details>
  </>
}

export function CreatorStatsPage({ locale }: { locale: Locale }) {
  const text = copy[locale]
  const { data } = useSWR<StatsResponse>('/api/profile/creator-stats', fetchJson)
  const [period, setPeriod] = useState<Period>('7d')
  return <section className="creator-stats-page section-view" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <div className="section-heading"><h1>{text.creator}</h1></div>
    <PeriodSwitch period={period} onChange={setPeriod} locale={locale} />
    <StatDashboard data={data} locale={locale} period={period} />
  </section>
}
