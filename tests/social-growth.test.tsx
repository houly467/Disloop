import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { canManageCloseFriend } from '@/lib/close-friend-rules'
import { isHttpsProfileLink, sanitizeVerificationReason, selectVerificationWebhook } from '@/lib/verification'
import { TranslateText } from '@/components/translate-text'
import { getDailyBonusXpGrant } from '@/lib/growth-rewards'

describe('social growth safety rules', () => {
  it('only lets a user manage a distinct, related, unblocked close friend', () => {
    expect(canManageCloseFriend('owner', 'friend', true, false)).toBe(true)
    expect(canManageCloseFriend('owner', 'owner', true, false)).toBe(false)
    expect(canManageCloseFriend('owner', 'friend', false, false)).toBe(false)
    expect(canManageCloseFriend('owner', 'friend', true, true)).toBe(false)
  })

  it('removes mentions, links, and control characters from verification reasons', () => {
    expect(sanitizeVerificationReason('I am @everyone <@12345678901234567> https://example.com trusted\u0007 member'))
      .toBe('I am trusted member')
  })

  it('uses the dedicated verification webhook before the fallback without exposing it', () => {
    expect(selectVerificationWebhook({ REPORT_WEBHOOK_VERIFY: 'https://verify.invalid', REPORT_WEBHOOK_OTHER: 'https://other.invalid' }))
      .toBe('https://verify.invalid')
    expect(selectVerificationWebhook({ REPORT_WEBHOOK_OTHER: 'https://other.invalid' })).toBe('https://other.invalid')
    expect(selectVerificationWebhook({})).toBeNull()
  })

  it('accepts only optional HTTPS profile links', () => {
    expect(isHttpsProfileLink(null)).toBe(true)
    expect(isHttpsProfileLink('https://example.com/song')).toBe(true)
    expect(isHttpsProfileLink('http://example.com')).toBe(false)
    expect(isHttpsProfileLink('javascript:alert(1)')).toBe(false)
    expect(isHttpsProfileLink('not a url')).toBe(false)
  })

  it('caps challenge and invite bonus rewards together per day', () => {
    expect(getDailyBonusXpGrant(20, 0)).toBe(20)
    expect(getDailyBonusXpGrant(10, 15)).toBe(5)
    expect(getDailyBonusXpGrant(20, 20)).toBe(0)
    expect(getDailyBonusXpGrant(-1, 0)).toBe(0)
  })

  it('renders the translation control with localized accessible text', () => {
    const markup = renderToStaticMarkup(<TranslateText text="Hello" locale="en" />)
    expect(markup).toContain('<button')
    expect(markup).toContain('Translate')
    expect(markup).toContain('aria-hidden="true"')
  })
})
