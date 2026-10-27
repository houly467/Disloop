'use client'

import { ArrowLeft, ArrowRight } from 'lucide-react'

export function BackButton({ locale = 'en', onBack }: { locale?: 'en' | 'ar'; onBack?: () => void }) {
  const isArabic = locale === 'ar'
  return (
    <button
      type="button"
      className="app-back-button"
      aria-label={isArabic ? 'رجوع' : 'Back'}
      onClick={onBack ?? (() => {
        if (window.history.length > 1) window.history.back()
        else window.location.assign('/')
      })}
    >
      {isArabic ? <ArrowRight aria-hidden="true" /> : <ArrowLeft aria-hidden="true" />}
      <span>{isArabic ? 'رجوع' : 'Back'}</span>
    </button>
  )
}
