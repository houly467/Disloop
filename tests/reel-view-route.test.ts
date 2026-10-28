import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  requireMember: vi.fn(),
  areUsersBlocked: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { insert: mocks.insert, select: mocks.select } }))
vi.mock('@/lib/server-member', () => ({ requireLoggedInServerMember: mocks.requireMember }))
vi.mock('@/lib/relationship-access', () => ({ areUsersBlocked: mocks.areUsersBlocked }))

import { POST } from '@/app/api/reels/[reelId]/view/route'

const viewerId = '11111111-1111-4111-8111-111111111111'
const authorId = '22222222-2222-4222-8222-222222222222'
const reelId = '33333333-3333-4333-8333-333333333333'

describe('reel view endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireMember.mockResolvedValue({ ok: true, user: { id: viewerId } })
    const query = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn().mockResolvedValue([{ authorId }]),
    }
    query.from.mockReturnValue(query)
    query.where.mockReturnValue(query)
    mocks.select.mockReturnValue(query)
    mocks.areUsersBlocked.mockResolvedValue(false)
    const insertQuery = {
      values: vi.fn(() => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) })),
    }
    mocks.insert.mockReturnValue(insertQuery)
  })

  it('records an authenticated view without a request rate limit', async () => {
    const response = await POST(
      new NextRequest(`https://app.example.test/api/reels/${reelId}/view`, { method: 'POST' }),
      { params: Promise.resolve({ reelId }) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ recorded: true })
    expect(mocks.insert).toHaveBeenCalledOnce()
  })
})
