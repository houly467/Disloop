'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'

type Locale = 'en' | 'ar'
type PreferencesResponse = { preferences: { theme: string; profileLink: string | null }; available: boolean }
type StatsResponse = { last7Days: Record<string, number> | null; last30Days: Record<string, number> | null; available?: boolean }
type VerificationResponse = { requests: { id: string; reason: string; status: string; createdAt: string }[]; available: boolean }

const copy = {
  en: { customize: 'Profile customization', theme: 'Profile theme', link: 'HTTPS song or profile link', save: 'Save preferences', saved: 'Saved', unavailable: 'Apply the database update to enable this feature.', creator: 'Creator stats', seven: 'Last 7 days', thirty: 'Last 30 days', views: 'Profile views', reelViews: 'Reel views', likes: 'Likes', reposts: 'Reposts', followers: 'Follower growth', request: 'Request verification', reason: 'Why should your account be verified? (20–500 characters)', submit: 'Submit request', pending: 'Request pending', noRequests: 'No requests yet.', error: 'Could not save this change.', status: 'Status' },
  ar: { customize: 'تخصيص الملف الشخصي', theme: 'سمة الملف الشخصي', link: 'رابط أغنية أو ملف يبدأ بـ HTTPS', save: 'حفظ التفضيلات', saved: 'تم الحفظ', unavailable: 'طبّق تحديث قاعدة البيانات لتفعيل هذه الميزة.', creator: 'إحصاءات المنشئ', seven: 'آخر ٧ أيام', thirty: 'آخر ٣٠ يومًا', views: 'زيارات الملف', reelViews: 'مشاهدات الريلز', likes: 'الإعجابات', reposts: 'إعادات النشر', followers: 'نمو المتابعين', request: 'طلب التوثيق', reason: 'لماذا ينبغي توثيق حسابك؟ (من ٢٠ إلى ٥٠٠ حرف)', submit: 'إرسال الطلب', pending: 'الطلب قيد الانتظار', noRequests: 'لا توجد طلبات بعد.', error: 'تعذر حفظ التغيير.', status: 'الحالة' },
} satisfies Record<Locale, Record<string, string>>

export function ProfileTools({ locale }: { locale: Locale }) {
  const text = copy[locale]
  const { data: preferences, mutate: mutatePreferences } = useSWR<PreferencesResponse>('/api/profile/preferences', async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('preferences_unavailable')
    return response.json()
  })
  const { data: stats } = useSWR<StatsResponse>('/api/profile/creator-stats', async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('stats_unavailable')
    return response.json()
  })
  const { data: verification, mutate: mutateVerification } = useSWR<VerificationResponse>('/api/verification-requests', async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('verification_unavailable')
    return response.json()
  })
  const [theme, setTheme] = useState('default')
  const [profileLink, setProfileLink] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!preferences?.preferences) return
    setTheme(preferences.preferences.theme)
    setProfileLink(preferences.preferences.profileLink ?? '')
  }, [preferences?.preferences])

  useEffect(() => {
    document.querySelector('.profile-view')?.setAttribute('data-profile-theme', theme)
  }, [theme])

  async function savePreferences() {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/profile/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme, profileLink: profileLink.trim() || null }) })
      if (!response.ok) throw new Error('save_failed')
      await mutatePreferences()
      document.querySelector('.profile-view')?.setAttribute('data-profile-theme', theme)
      setMessage(text.saved)
    } catch { setMessage(text.error) } finally { setBusy(false) }
  }

  async function submitVerification() {
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch('/api/verification-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'submit_failed')
      setReason('')
      await mutateVerification()
      setMessage(text.saved)
    } catch { setMessage(text.error) } finally { setBusy(false) }
  }

  const statGroups = [
    { label: text.seven, values: stats?.last7Days },
    { label: text.thirty, values: stats?.last30Days },
  ]
  const metricLabels = [
    { key: 'profileViews', label: text.views },
    { key: 'reelViews', label: text.reelViews },
    { key: 'likes', label: text.likes },
    { key: 'reposts', label: text.reposts },
    { key: 'followerGrowth', label: text.followers },
  ]
  return <div className="profile-tools" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <section className="profile-tool-card">
      <h2>{text.customize}</h2>
      {preferences?.available === false ? <p>{text.unavailable}</p> : <>
        <label>{text.theme}<select value={theme} onChange={(event) => setTheme(event.target.value)}><option value="default">Default</option><option value="ocean">Ocean</option><option value="sunset">Sunset</option><option value="forest">Forest</option><option value="violet">Violet</option></select></label>
        <label>{text.link}<input type="url" inputMode="url" value={profileLink} onChange={(event) => setProfileLink(event.target.value)} placeholder="https://" /></label>
        <button type="button" disabled={busy} onClick={() => void savePreferences()}>{text.save}</button>
      </>}
    </section>
    <section className="profile-tool-card">
      <h2>{text.creator}</h2>
      <a className="creator-stats-link" href="/?section=creator-stats">{locale === 'ar' ? 'فتح صفحة الإحصاءات' : 'Open stats page'}</a>
      {statGroups.some((group) => group.values) ? <div className="creator-stats-grid">{statGroups.filter((group): group is { label: string; values: Record<string, number> } => Boolean(group.values)).map(({ label, values }) => {
        const maximum = Math.max(1, ...metricLabels.map(({ key }) => values[key] ?? 0))
        return <div key={label}><strong>{label}</strong>{metricLabels.map(({ key, label: metric }) => <span className="creator-stat" key={key}>{metric}: {values[key] ?? 0}<progress value={values[key] ?? 0} max={maximum} /></span>)}</div>
      })}</div> : stats?.available === false ? <p>{text.unavailable}</p> : null}
    </section>
    <section className="profile-tool-card">
      <h2>{text.request}</h2>
      {verification?.available === false ? <p>{text.unavailable}</p> : <>
        {(verification?.requests ?? []).map((request) => <p key={request.id}>{text.status}: {request.status === 'open' ? text.pending : request.status}</p>)}
        {!verification?.requests.some((request) => request.status === 'open') && <><textarea maxLength={500} minLength={20} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={text.reason} /><button type="button" disabled={busy || reason.trim().length < 20} onClick={() => void submitVerification()}>{text.submit}</button></>}
        {!verification?.requests.length && <p>{text.noRequests}</p>}
      </>}
    </section>
    {message && <p role="status">{message}</p>}
  </div>
}

export function CreatorStatsPage({ locale }: { locale: Locale }) {
  const text = copy[locale]
  const { data } = useSWR<StatsResponse>('/api/profile/creator-stats', async (url: string) => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new Error('stats_unavailable')
    return response.json()
  })
  const metrics = [
    { key: 'profileViews', label: text.views },
    { key: 'reelViews', label: text.reelViews },
    { key: 'likes', label: text.likes },
    { key: 'reposts', label: text.reposts },
    { key: 'followerGrowth', label: text.followers },
  ]
  const groups = [
    { label: text.seven, values: data?.last7Days },
    { label: text.thirty, values: data?.last30Days },
  ]
  return <section className="creator-stats-page section-view" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    <h1>{text.creator}</h1>
    {data?.available === false ? <p>{text.unavailable}</p> : <div className="creator-stats-grid">{groups.filter((group): group is { label: string; values: Record<string, number> } => Boolean(group.values)).map(({ label, values }) => {
      const maximum = Math.max(1, ...metrics.map(({ key }) => values[key] ?? 0))
      return <section className="profile-tool-card" key={label}><h2>{label}</h2>{metrics.map(({ key, label: metric }) => <span className="creator-stat" key={key}>{metric}: {values[key] ?? 0}<progress value={values[key] ?? 0} max={maximum} /></span>)}</section>
    })}</div>}
  </section>
}
