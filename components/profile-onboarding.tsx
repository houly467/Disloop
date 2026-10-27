'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import type { CurrentUser } from '@/lib/session'

type UsernameCheck = { valid: boolean; available?: boolean; reason?: string; verifiedRequired?: boolean }

type OnboardingProfile = Pick<CurrentUser, 'username' | 'displayName' | 'dateOfBirth' | 'bio' | 'location' | 'socialLinks' | 'publicVisitCount' | 'hideLikes'>

const copy = {
  en: {
    kicker: 'ONE QUICK STEP', title: 'Make this profile yours', body: 'Add your name, a username, and your date of birth to finish setting up your Disloop profile.', name: 'Full name', username: 'Username', birthDate: 'Date of birth', birthDateHint: 'Your date of birth stays private.', usernameHint: '1–2 character handles require the Verified badge; regular usernames must be at least 3 characters long.', checking: 'Checking availability…', available: 'Username is available.', taken: 'Username is already taken.', invalid: 'Use 3–20 valid characters. 1–2 character handles require the Verified badge; regular usernames must be at least 3 characters long.', shortNeedsVerified: '1–2 character handles require the Verified badge; regular usernames must be at least 3 characters long.', checkFailed: 'Could not check username availability.', save: 'Save and continue', saving: 'Saving…', switchLanguage: 'العربية', saveError: 'Could not complete your profile. Please try again.', usernameTaken: 'Username is already taken.', invalidProfile: 'Check your name, username, and date of birth.',
  },
  ar: {
    kicker: 'خطوة أخيرة', title: 'أكمل ملفك الشخصي', body: 'أضف اسمك واسم المستخدم وتاريخ الميلاد لإكمال إعداد ملفك في Disloop.', name: 'الاسم الكامل', username: 'اسم المستخدم', birthDate: 'تاريخ الميلاد', birthDateHint: 'سيبقى تاريخ ميلادك خاصًا.', usernameHint: 'تتطلب أسماء المستخدم من حرف أو حرفين شارة التوثيق؛ ويجب أن يتكون اسم المستخدم العادي من ٣ أحرف على الأقل.', checking: 'جارٍ التحقق من التوفر…', available: 'اسم المستخدم متاح.', taken: 'اسم المستخدم مستخدم بالفعل.', invalid: 'استخدم من ٣ إلى ٢٠ حرفًا صالحًا. تتطلب أسماء المستخدم من حرف أو حرفين شارة التوثيق؛ ويجب أن يتكون اسم المستخدم العادي من ٣ أحرف على الأقل.', shortNeedsVerified: 'تتطلب أسماء المستخدم من حرف أو حرفين شارة التوثيق؛ ويجب أن يتكون اسم المستخدم العادي من ٣ أحرف على الأقل.', checkFailed: 'تعذر التحقق من توفر اسم المستخدم.', save: 'حفظ ومتابعة', saving: 'جارٍ الحفظ…', switchLanguage: 'English', saveError: 'تعذر إكمال ملفك. حاول مرة أخرى.', usernameTaken: 'اسم المستخدم مستخدم بالفعل.', invalidProfile: 'تحقق من الاسم واسم المستخدم وتاريخ الميلاد.',
  },
} as const

async function fetchUsernameCheck(url: string): Promise<UsernameCheck> {
  const response = await fetch(url, { cache: 'no-store' })
  const result = await response.json() as UsernameCheck
  if (!response.ok && response.status !== 400) throw new Error('username_check_failed')
  return result
}

export function ProfileOnboarding({ profile, locale, onComplete, onToggleLocale }: {
  profile: OnboardingProfile
  locale: 'en' | 'ar'
  onComplete: (profile: Partial<CurrentUser>) => void
  onToggleLocale: () => void
}) {
  const labels = copy[locale]
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null)
  const [username, setUsername] = useState(profile.username)
  const [displayName, setDisplayName] = useState(profile.displayName)
  const [dateOfBirth, setDateOfBirth] = useState(profile.dateOfBirth ?? '')
  const [debouncedUsername, setDebouncedUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!dialog || dialog.open) return
    dialog.showModal()
  }, [dialog])

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedUsername(username.trim()), 350)
    return () => window.clearTimeout(timeout)
  }, [username])

  const checkKey = debouncedUsername.length >= 1
    ? `/api/profile/username?username=${encodeURIComponent(debouncedUsername)}`
    : null
  const { data: usernameCheck, isLoading: checkingUsername, error: usernameCheckError } = useSWR<UsernameCheck>(checkKey, fetchUsernameCheck, { dedupingInterval: 750, keepPreviousData: false })
  const usernameMessage = usernameCheckError ? labels.checkFailed
      : usernameCheck?.reason === 'verified_required' ? labels.shortNeedsVerified
        : usernameCheck?.valid === false ? labels.invalid
          : usernameCheck?.available === false ? labels.taken
            : usernameCheck?.available ? labels.available
              : checkingUsername ? labels.checking : ''
  const usernameAvailable = Boolean(usernameCheck?.valid && usernameCheck.available)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!usernameAvailable) return
    setSaving(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          displayName,
          dateOfBirth,
          bio: profile.bio,
          location: profile.location ?? '',
          socialLinks: profile.socialLinks,
          publicVisitCount: profile.publicVisitCount,
          hideLikes: profile.hideLikes,
        }),
      })
      const result = await response.json() as { profile?: Partial<CurrentUser>; error?: string }
      if (!response.ok || !result.profile) {
        setError(result.error === 'username_taken' ? labels.usernameTaken : result.error === 'username_verification_required' ? labels.shortNeedsVerified : result.error === 'invalid_profile' ? labels.invalidProfile : labels.saveError)
        return
      }
      onComplete(result.profile)
      dialog?.close()
    } catch {
      setError(labels.saveError)
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog dir={locale === 'ar' ? 'rtl' : 'ltr'} ref={setDialog} className="profile-onboarding-dialog" aria-labelledby="profile-onboarding-title" onCancel={(event) => event.preventDefault()}>
      <form className="profile-onboarding-form" onSubmit={submit}>
        <div className="profile-onboarding-heading"><div className="profile-onboarding-topline"><span>{labels.kicker}</span><button type="button" onClick={onToggleLocale}>{labels.switchLanguage}</button></div><h2 id="profile-onboarding-title">{labels.title}</h2><p>{labels.body}</p></div>
        <label>{labels.name}<input autoFocus required maxLength={30} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label>{labels.username}<input dir="ltr" autoComplete="username" required minLength={1} maxLength={20} value={username} onChange={(event) => setUsername(event.target.value)} aria-describedby="onboarding-username-hint onboarding-username-status" aria-invalid={Boolean(usernameMessage && !usernameAvailable)} /><small id="onboarding-username-hint">{labels.usernameHint}</small><span id="onboarding-username-status" className={usernameAvailable ? 'onboarding-username-status onboarding-username-available' : 'onboarding-username-status'} role="status">{usernameMessage}</span></label>
        <label>{labels.birthDate}<input type="date" required max={today} value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} /><small>{labels.birthDateHint}</small></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="section-primary-button" type="submit" disabled={saving || !displayName.trim() || !dateOfBirth || !usernameAvailable}>{saving ? labels.saving : labels.save}</button>
      </form>
    </dialog>
  )
}
