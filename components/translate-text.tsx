'use client'

import { useState } from 'react'
import { Languages } from 'lucide-react'

export function TranslateText({ text, locale }: { text: string; locale: 'en' | 'ar' }) {
  const [translated, setTranslated] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function translate() {
    if (busy) return
    if (translated) {
      setTranslated('')
      setError(false)
      return
    }
    setBusy(true)
    setError(false)
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const result = await response.json() as { translatedText?: string }
      if (!response.ok || !result.translatedText) throw new Error('translation_failed')
      setTranslated(result.translatedText)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return <div className="translation-control">
    <button type="button" className="translation-button" onClick={() => void translate()} disabled={busy}>
      <Languages aria-hidden="true" />{busy ? (locale === 'ar' ? 'جارٍ الترجمة…' : 'Translating…') : translated ? (locale === 'ar' ? 'إظهار الأصل' : 'Show original') : (locale === 'ar' ? 'ترجمة' : 'Translate')}
    </button>
    {error && <span role="status">{locale === 'ar' ? 'الترجمة غير متاحة الآن.' : 'Translation is unavailable right now.'}</span>}
    {translated && <p className="translated-text" dir="auto">{translated}</p>}
  </div>
}
