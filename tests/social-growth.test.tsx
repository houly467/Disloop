import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { canManageCloseFriend } from '@/lib/close-friend-rules'
import { deliverVerificationWebhook, getVerificationWebhooks, isHttpsProfileLink, sanitizeVerificationReason, selectVerificationWebhook } from '@/lib/verification'
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
    const primary = 'https://discord.com/api/webhooks/12345678901234567/primary-token'
    const fallback = 'https://discord.com/api/webhooks/12345678901234567/fallback-token'
    expect(selectVerificationWebhook({ REPORT_WEBHOOK_VERIFY: ` ${primary} `, REPORT_WEBHOOK_OTHER: fallback }))
      .toBe(primary)
    expect(selectVerificationWebhook({ REPORT_WEBHOOK_VERIFY: 'https://example.com/fake', REPORT_WEBHOOK_OTHER: fallback })).toBe(fallback)
    expect(getVerificationWebhooks({ REPORT_WEBHOOK_VERIFY: 'https://example.com/fake', REPORT_WEBHOOK_OTHER: fallback })).toEqual([fallback])
    expect(selectVerificationWebhook({})).toBeNull()
  })

  it('retries verification delivery once and reports only status, attempt, and request id', async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 204 })
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    try {
      await expect(deliverVerificationWebhook(
        'https://discord.com/api/webhooks/12345678901234567/secret-token',
        { content: 'webhook test' },
        'request-123',
        send as unknown as typeof fetch,
      )).resolves.toBe(true)
      expect(send).toHaveBeenCalledTimes(2)
      expect(log.mock.calls).toEqual([
        ['[verification] webhook response', { status: 500, attempt: 1, requestId: 'request-123' }],
        ['[verification] webhook response', { status: 204, attempt: 2, requestId: 'request-123' }],
      ])
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret-token')
    } finally {
      log.mockRestore()
    }
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
