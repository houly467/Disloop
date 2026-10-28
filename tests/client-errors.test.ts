import { describe, expect, it } from 'vitest'
import { localizedUploadError } from '@/lib/client-errors'

describe('localized upload rate-limit errors', () => {
  it('shows the remaining retry time in English', () => {
    expect(localizedUploadError('rate_limited:299', 'en', 'fallback'))
      .toBe('Too many requests. Try again in 4m 59s.')
  })

  it('shows the remaining retry time in Arabic', () => {
    expect(localizedUploadError('rate_limited:300', 'ar', 'fallback'))
      .toBe('طلبات كثيرة. حاول مرة أخرى بعد 5 دقيقة و0 ثانية.')
  })

  it('uses the maximum short retry window when the server omits retryAfter', () => {
    expect(localizedUploadError('rate_limited', 'en', 'fallback'))
      .toBe('Too many requests. Try again in 5m 0s.')
  })
})
