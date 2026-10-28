import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getCurrentUser: vi.fn(),
  requireMember: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { select: mocks.select } }))
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock('@/lib/server-member', () => ({ requireLoggedInServerMember: mocks.requireMember }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitResponse: mocks.rateLimit }))

import { GET, POST } from '@/app/api/social/polls/route'
import { POST as updateBookmark } from '@/app/api/social/bookmarks/route'
import { POST as updatePin } from '@/app/api/profile/pin/route'

const pollId = '00000000-0000-4000-8000-000000000001'
const contentId = '00000000-0000-4000-8000-000000000002'
const userId = '00000000-0000-4000-8000-000000000003'

function selectRows(rows: unknown[] | Error) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows)),
  }
  return builder
}

describe('/api/social/polls', () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue(null)
    mocks.requireMember.mockResolvedValue({ ok: true, user: { id: userId } })
    mocks.rateLimit.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns aggregate results without exposing voter identities', async () => {
    mocks.select
      .mockReturnValueOnce(selectRows([{ id: pollId, contentId, authorId: userId, options: ['A', 'B'], endsAt: null }]))
      .mockReturnValueOnce(selectRows([
        { pollId, optionIndex: 0, userId },
        { pollId, optionIndex: 1, userId: '00000000-0000-4000-8000-000000000004' },
      ]))
    const request = new NextRequest(`https://disloop.test/api/social/polls?contentType=news&ids=${contentId}`)
    const response = await GET(request)
    const result = await response.json()
    expect(response.status).toBe(200)
    expect(result.polls[0]).toMatchObject({
      id: pollId,
      contentId,
      totalVotes: 2,
      optionCounts: [1, 1],
      percentages: [50, 50],
    })
    expect(JSON.stringify(result)).not.toContain('userId')
    expect(JSON.stringify(result)).not.toContain('"voters"')
  })

  it('degrades to an empty poll response before the migration is applied', async () => {
    mocks.select.mockReturnValueOnce(selectRows(Object.assign(new Error('missing table'), { code: '42P01' })))
    const request = new NextRequest(`https://disloop.test/api/social/polls?contentType=story&ids=${contentId}`)
    const response = await GET(request)
    await expect(response.json()).resolves.toEqual({ polls: [], available: false })
    expect(response.status).toBe(200)
  })

  it('requires the existing authenticated same-origin write guard before creating polls', async () => {
    mocks.requireMember.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'invalid_origin' }, { status: 403 }),
    })
    const request = new NextRequest('https://disloop.test/api/social/polls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: 'news', contentId, options: ['A', 'B'] }),
    })
    const response = await POST(request)
    expect(response.status).toBe(403)
    expect(mocks.rateLimit).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('applies the same server-session write guard to bookmarks and profile pins', async () => {
    mocks.requireMember.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'not_logged_in' }, { status: 401 }),
    })
    const bookmarkRequest = new NextRequest('https://disloop.test/api/social/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentType: 'news', contentId, saved: true }),
    })
    const pinRequest = new NextRequest('https://disloop.test/api/profile/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId: contentId }),
    })
    expect((await updateBookmark(bookmarkRequest)).status).toBe(401)
    expect((await updatePin(pinRequest)).status).toBe(401)
    expect(mocks.rateLimit).not.toHaveBeenCalled()
    expect(mocks.select).not.toHaveBeenCalled()
  })
})
