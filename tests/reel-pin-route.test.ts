import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireMember: vi.fn(),
  rateLimit: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { transaction: mocks.transaction } }))
vi.mock('@/lib/server-member', () => ({ requireLoggedInServerMember: mocks.requireMember }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitResponse: mocks.rateLimit }))

import { PATCH } from '@/app/api/reels/[id]/pin/route'

const ownerId = '00000000-0000-4000-8000-000000000001'
const otherUserId = '00000000-0000-4000-8000-000000000002'
const reelId = '00000000-0000-4000-8000-000000000003'

function query(rows: unknown[], lockable = false) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => lockable ? builder : Promise.resolve(rows)),
    for: vi.fn(() => Promise.resolve(rows)),
  }
  return builder
}

function setupTransaction({ authorId = ownerId, pinnedCount = 0 }: { authorId?: string; pinnedCount?: number } = {}) {
  let selectIndex = 0
  const updateWhere = vi.fn().mockResolvedValue([])
  const tx = {
    select: vi.fn(() => {
      selectIndex += 1
      if (selectIndex === 1) return query([{ authorId, isPinned: false }], true)
      if (selectIndex === 2) return query([{ id: ownerId }], true)
      return query([{ count: pinnedCount }])
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhere })),
    })),
  }
  mocks.transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx))
  return { tx, updateWhere }
}

function request() {
  return new NextRequest(`https://disloop.test/api/reels/${reelId}/pin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinned: true }),
  })
}

describe('PATCH /api/reels/[id]/pin', () => {
  beforeEach(() => {
    mocks.requireMember.mockResolvedValue({ ok: true, user: { id: ownerId } })
    mocks.rateLimit.mockResolvedValue(null)
    mocks.transaction.mockReset()
  })

  it('lets the reel owner pin a reel when below the three-reel limit', async () => {
    const { updateWhere } = setupTransaction({ pinnedCount: 2 })

    const response = await PATCH(request(), { params: Promise.resolve({ id: reelId }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ pinned: true })
    expect(updateWhere).toHaveBeenCalledOnce()
  })

  it('rejects attempts by a non-owner', async () => {
    setupTransaction({ authorId: otherUserId })

    const response = await PATCH(request(), { params: Promise.resolve({ id: reelId }) })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'reel_pin_permission_required' })
  })

  it('enforces the three-reel pin limit', async () => {
    const { updateWhere } = setupTransaction({ pinnedCount: 3 })

    const response = await PATCH(request(), { params: Promise.resolve({ id: reelId }) })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'reel_pin_limit_reached' })
    expect(updateWhere).not.toHaveBeenCalled()
  })
})
