import { describe, expect, it, vi } from 'vitest'
import {
  buildReportWebhookPayload,
  parseReportRequest,
  reportCooldownSince,
  REPORTS_PER_HOUR,
  REPORT_TARGET_COOLDOWN_MS,
  sanitizeReportReason,
  selectReportWebhook,
  sendReportWebhook,
} from '@/lib/reporting'

describe('report helpers', () => {
  it('validates categories, targets, and a 10–500 character reason', () => {
    expect(parseReportRequest({
      targetType: 'user',
      targetId: '00000000-0000-4000-8000-000000000001',
      category: 'scam',
      reason: 'This account is impersonating someone.',
    })).toMatchObject({ category: 'scam', targetType: 'user' })
    expect(parseReportRequest({ targetType: 'user', targetId: 'bad', category: 'scam', reason: 'short' })).toBeNull()
    expect(parseReportRequest({
      targetType: 'user',
      targetId: '00000000-0000-4000-8000-000000000001',
      category: 'unknown',
      reason: 'This reason is long enough.',
    })).toBeNull()
    expect(parseReportRequest({
      targetType: 'user',
      targetId: '00000000-0000-4000-8000-000000000001',
      category: 'spam',
      reason: 'x'.repeat(501),
    })).toBeNull()
  })

  it('enforces a five-per-hour limit and one-report-per-target cooldown window', () => {
    expect(REPORTS_PER_HOUR).toBe(5)
    const now = new Date('2026-10-28T00:00:00Z')
    expect(REPORT_TARGET_COOLDOWN_MS).toBe(24 * 60 * 60 * 1000)
    expect(reportCooldownSince(now)).toEqual(new Date('2026-10-27T00:00:00Z'))
  })

  it('removes Discord mention syntax and everyone/here ping tokens from reasons', () => {
    expect(sanitizeReportReason('Please review @everyone <@12345678901234567> and @here <@&12345678901234567>.'))
      .toBe('Please review [mention removed] [mention removed] and [mention removed] [mention removed].')
  })

  it('falls back to the Other webhook when a category webhook is missing', () => {
    const fallback = 'https://example.test/other-webhook'
    expect(selectReportWebhook('scam', { REPORT_WEBHOOK_OTHER: fallback })).toBe(fallback)
    expect(selectReportWebhook('scam', { REPORT_WEBHOOK_SCAM: 'https://example.test/scam-webhook', REPORT_WEBHOOK_OTHER: fallback }))
      .toBe('https://example.test/scam-webhook')
    expect(selectReportWebhook('scam', {})).toBeNull()
    expect(selectReportWebhook('scam', { REPORT_WEBHOOK_SCAM: '  https://example.test/scam-webhook \r\n' }))
      .toBe('https://example.test/scam-webhook')
  })

  it('keeps reporter details in the moderator webhook payload and disables mentions', () => {
    const payload = buildReportWebhookPayload({
      id: 'report-id',
      category: 'nsfw',
      reason: '@everyone explicit mention <@12345678901234567>',
      createdAt: new Date('2026-10-28T00:00:00Z'),
      reportedUsername: 'target',
      reportedUserId: 'target-id',
      profileUrl: 'https://example.test/u/target',
      reporterUsername: 'reporter',
      reporterId: 'reporter-id',
      contentUrl: 'https://example.test/?section=reels#reel-content',
    })
    expect(payload.allowed_mentions).toEqual({ parse: [] })
    expect(JSON.stringify(payload)).not.toContain('@everyone')
    expect(JSON.stringify(payload)).toContain('Reporter (moderators only)')
    expect(JSON.stringify(payload)).toContain('reporter-id')
  })

  it('retries one webhook failure and never returns webhook data', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const payload = buildReportWebhookPayload({
        id: 'report-id', category: 'other', reason: 'A report reason that is long enough.',
        createdAt: new Date('2026-10-28T00:00:00Z'), reportedUsername: 'target',
        reportedUserId: 'target-id', profileUrl: 'https://example.test/u/target',
        reporterUsername: 'reporter', reporterId: 'reporter-id',
      })
      await expect(sendReportWebhook('https://example.test/fake-webhook', payload)).resolves.toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(payload)).not.toContain('fake-webhook')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('reports status and attempt without returning or logging the webhook URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const onAttempt = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(sendReportWebhook(' https://example.test/fake-webhook ', {
        embeds: [],
        allowed_mentions: { parse: [] },
      }, onAttempt)).resolves.toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock.mock.calls[0][0]).toBe('https://example.test/fake-webhook')
      expect(onAttempt.mock.calls).toEqual([[1, 404], [2, 404]])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
