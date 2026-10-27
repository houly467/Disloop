'use client'

import { useState } from 'react'
import { Ban, Flag, HandCoins, MessageSquareWarning, ShieldAlert, Sparkles, UserRoundX, X } from 'lucide-react'
import { ModalPortal } from '@/components/modal-portal'

type Locale = 'en' | 'ar'
type ReportTargetType = 'user' | 'news' | 'daily' | 'reel' | 'comment'
type Category = 'nsfw' | 'trading' | 'scam' | 'harassment' | 'threats' | 'impersonation' | 'spam' | 'other'

const categoryOptions: Record<Locale, { id: Category; label: string; Icon: typeof Flag }[]> = {
  en: [
    { id: 'nsfw', label: 'NSFW', Icon: Sparkles },
    { id: 'trading', label: 'Buying/Selling', Icon: HandCoins },
    { id: 'scam', label: 'Scam/Fraud', Icon: ShieldAlert },
    { id: 'harassment', label: 'Harassment/Abuse', Icon: MessageSquareWarning },
    { id: 'threats', label: 'Hate/Threats', Icon: Ban },
    { id: 'impersonation', label: 'Impersonation', Icon: UserRoundX },
    { id: 'spam', label: 'Spam', Icon: Flag },
    { id: 'other', label: 'Other', Icon: MessageSquareWarning },
  ],
  ar: [
    { id: 'nsfw', label: 'محتوى غير لائق', Icon: Sparkles },
    { id: 'trading', label: 'بيع وشراء', Icon: HandCoins },
    { id: 'scam', label: 'احتيال', Icon: ShieldAlert },
    { id: 'harassment', label: 'مضايقة أو إساءة', Icon: MessageSquareWarning },
    { id: 'threats', label: 'كراهية أو تهديد', Icon: Ban },
    { id: 'impersonation', label: 'انتحال شخصية', Icon: UserRoundX },
    { id: 'spam', label: 'رسائل مزعجة', Icon: Flag },
    { id: 'other', label: 'أخرى', Icon: MessageSquareWarning },
  ],
}

const copy = {
  en: {
    title: 'Report',
    intro: 'Choose a category and tell us what happened.',
    reason: 'Reason',
    reasonPlaceholder: 'Please provide at least 10 characters.',
    submit: 'Submit report',
    submitting: 'Submitting…',
    success: 'Thanks, we will review it.',
    failure: 'We could not submit your report. Please try again.',
    rateLimit: 'You have reached the report limit. Please try again later.',
    cooldown: 'You have already reported this member in the last 24 hours.',
    invalid: 'Choose a category and enter a reason between 10 and 500 characters.',
    close: 'Close',
  },
  ar: {
    title: 'إبلاغ',
    intro: 'اختر فئة وأخبرنا بما حدث.',
    reason: 'السبب',
    reasonPlaceholder: 'يرجى كتابة ١٠ أحرف على الأقل.',
    submit: 'إرسال البلاغ',
    submitting: 'جارٍ الإرسال…',
    success: 'شكرًا، سنراجع البلاغ.',
    failure: 'تعذر إرسال البلاغ. حاول مرة أخرى.',
    rateLimit: 'وصلت إلى حد البلاغات. حاول مرة أخرى لاحقًا.',
    cooldown: 'لقد أبلغت عن هذا العضو خلال آخر ٢٤ ساعة.',
    invalid: 'اختر فئة واكتب سببًا من ١٠ إلى ٥٠٠ حرف.',
    close: 'إغلاق',
  },
} satisfies Record<Locale, Record<string, string>>

export function ReportDialog({ open, onClose, targetType, targetId, locale }: {
  open: boolean
  onClose: () => void
  targetType: ReportTargetType
  targetId: string
  locale: Locale
}) {
  const labels = copy[locale]
  const [category, setCategory] = useState<Category>('other')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || reason.trim().length < 10 || reason.trim().length > 500) {
      setError(labels.invalid)
      return
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, category, reason: reason.trim() }),
      })
      if (!response.ok) {
        const result = await response.json() as { error?: string }
        setError(result.error === 'target_report_cooldown' ? labels.cooldown
          : result.error === 'rate_limited' ? labels.rateLimit
            : result.error === 'invalid_report' ? labels.invalid
              : labels.failure)
        return
      }
      setSuccess(true)
    } catch {
      setError(labels.failure)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <ModalPortal backdropClassName="report-modal-backdrop" dialogClassName="report-modal" labelId="report-dialog-title" onClose={onClose}>
      <header className="report-modal-header">
        <div><h2 id="report-dialog-title">{labels.title}</h2><p>{labels.intro}</p></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={labels.close}><X aria-hidden="true" /></button>
      </header>
      {success ? <div className="report-success" role="status"><ShieldAlert aria-hidden="true" /><p>{labels.success}</p><button className="section-primary-button" type="button" onClick={onClose}>{labels.close}</button></div> : (
        <form className="report-form" onSubmit={(event) => void submit(event)}>
          <fieldset className="report-category-grid">
            <legend className="sr-only">{labels.title}</legend>
            {categoryOptions[locale].map(({ id, label, Icon }) => (
              <label className={`report-category-card${category === id ? ' report-category-selected' : ''}`} key={id}>
                <input type="radio" name="report-category" value={id} checked={category === id} onChange={() => setCategory(id)} />
                <Icon aria-hidden="true" /><span>{label}</span>
              </label>
            ))}
          </fieldset>
          <label className="report-reason-label"><span>{labels.reason}</span>
            <textarea required minLength={10} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={labels.reasonPlaceholder} rows={5} />
            <small aria-live="polite">{reason.length}/500</small>
          </label>
          {error && <p className="report-error" role="alert">{error}</p>}
          <button className="section-primary-button report-submit" type="submit" disabled={busy || reason.trim().length < 10}>{busy ? labels.submitting : labels.submit}<Flag aria-hidden="true" /></button>
        </form>
      )}
    </ModalPortal>
  )
}

export function ReportButton({ targetType, targetId, locale, className }: {
  targetType: ReportTargetType
  targetId: string
  locale: Locale
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className ?? 'report-trigger'} onClick={() => setOpen(true)}>
        <Flag aria-hidden="true" />{locale === 'ar' ? 'إبلاغ' : 'Report'}
      </button>
      <ReportDialog open={open} onClose={() => setOpen(false)} targetType={targetType} targetId={targetId} locale={locale} />
    </>
  )
}
