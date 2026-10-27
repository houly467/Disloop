import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCurrentUserResult: vi.fn(),
  checkDiscordMembership: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getCurrentUserResult: mocks.getCurrentUserResult }))
vi.mock('@/lib/discord', () => ({ checkDiscordMembership: mocks.checkDiscordMembership }))

import { requireLoggedInServerMember } from '@/lib/server-member'

describe('same-origin request validation', () => {
  const originalSiteUrl = process.env.SITE_URL

  beforeEach(() => {
    process.env.SITE_URL = 'https://app.example.test'
    mocks.getCurrentUserResult.mockResolvedValue({
      status: 'ok',
      user: { id: 'user-id', discordId: 'discord-id' },
    })
    mocks.checkDiscordMembership.mockResolvedValue(true)
  })

  afterEach(() => {
    if (originalSiteUrl === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = originalSiteUrl
    vi.clearAllMocks()
  })

  it('allows GET requests without an Origin header', async () => {
    const request = new NextRequest('https://app.example.test/api/social/follows?countsOnly=true')
    const result = await requireLoggedInServerMember(request)
    expect(result.ok).toBe(true)
  })

  it('rejects a POST from a foreign origin', async () => {
    const request = new NextRequest('https://preview.example.test/api/dm/follows/user', {
      method: 'POST',
      headers: { origin: 'https://attacker.example.test' },
    })
    const result = await requireLoggedInServerMember(request)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(403)
      await expect(result.response.json()).resolves.toMatchObject({ error: 'invalid_origin' })
    }
  })

  it('accepts a POST from SITE_URL', async () => {
    const request = new NextRequest('https://preview.example.test/api/dm/follows/user', {
      method: 'POST',
      headers: { origin: 'https://app.example.test' },
    })
    const result = await requireLoggedInServerMember(request)
    expect(result.ok).toBe(true)
  })

  it('rejects a state-changing request without an Origin header', async () => {
    const request = new NextRequest('https://app.example.test/api/social/follows?followerId=user', {
      method: 'DELETE',
    })
    const result = await requireLoggedInServerMember(request)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(403)
  })
})
