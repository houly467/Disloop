import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  rateLimit: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  limit: vi.fn(),
  returning: vi.fn(),
}))

vi.mock('@/lib/server-member', () => ({ requireLoggedInServerMember: mocks.requireMember }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitResponse: mocks.rateLimit }))
vi.mock('@/lib/db', () => ({ db: { select: mocks.select, insert: mocks.insert } }))

import { POST } from '@/app/api/reports/route'

const reporterId = '00000000-0000-4000-8000-000000000001'
const requestBody = {
  targetType: 'user',
  targetId: '00000000-0000-4000-8000-000000000002',
  category: 'spam',
  reason: 'This account is posting repeated unsolicited messages.',
}

describe('POST /api/reports', () => {
  beforeEach(() => {
    vi.stubEnv('REPORT_WEBHOOK_SPAM', '')
    vi.stubEnv('REPORT_WEBHOOK_OTHER', '')
    mocks.requireMember.mockResolvedValue({ ok: true, user: { id: reporterId } })
    mocks.rateLimit.mockResolvedValue(null)
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: mocks.limit,
    })
    mocks.limit.mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('rejects invalid report fields before rate limiting or database access', async () => {
    const request = new NextRequest('https://app.example.test/api/reports', {
      method: 'POST',
      body: JSON.stringify({ ...requestBody, category: 'invalid' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(mocks.rateLimit).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('enforces the five-report hourly user limit', async () => {
    mocks.rateLimit.mockResolvedValue(NextResponse.json({ error: 'rate_limited' }, { status: 429 }))
    const request = new NextRequest('https://app.example.test/api/reports', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(429)
    expect(mocks.rateLimit).toHaveBeenCalledWith(`reports:${reporterId}`, 5, 3600)
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('blocks self-reports after resolving the target from the database', async () => {
    mocks.limit.mockResolvedValueOnce([{ id: reporterId, authorId: reporterId, username: 'reporter' }])
    const request = new NextRequest('https://app.example.test/api/reports', {
      method: 'POST',
      body: JSON.stringify({ ...requestBody, targetId: reporterId }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'self_report' })
  })

  it('rejects target IDs that do not resolve to an existing account', async () => {
    const request = new NextRequest('https://app.example.test/api/reports', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'target_not_found' })
  })

  it('saves a report, uses the Other webhook fallback, and never returns webhook data', async () => {
    const fakeWebhook = 'https://example.test/fake-webhook'
    vi.stubEnv('REPORT_WEBHOOK_OTHER', fakeWebhook)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    mocks.limit
      .mockResolvedValueOnce([{ id: requestBody.targetId, authorId: requestBody.targetId, username: 'target' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ username: 'reporter' }])
    mocks.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: mocks.returning }),
    })
    mocks.returning.mockResolvedValue([{ id: 'report-id', createdAt: new Date('2026-10-28T00:00:00Z') }])

    const request = new NextRequest('https://app.example.test/api/reports', {
      method: 'POST',
      body: JSON.stringify({ ...requestBody, reason: 'Please review @everyone <@12345678901234567> for repeated spam.' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    const responseText = await response.text()
    expect(response.status).toBe(200)
    expect(responseText).not.toContain(fakeWebhook)
    expect(responseText).toContain('report-id')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(fakeWebhook)
    const webhookBody = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(webhookBody.allowed_mentions).toEqual({ parse: [] })
    expect(JSON.stringify(webhookBody)).not.toContain('@everyone')
    expect(JSON.stringify(webhookBody)).toContain(reporterId)
  })
})
