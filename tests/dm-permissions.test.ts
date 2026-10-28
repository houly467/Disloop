import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireMember: vi.fn(),
  rateLimit: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  update: vi.fn(),
  notifyMentions: vi.fn(),
}))

vi.mock('@/lib/server-member', () => ({ requireLoggedInServerMember: mocks.requireMember }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitResponse: mocks.rateLimit }))
vi.mock('@/lib/db', () => ({ db: { select: mocks.select, insert: mocks.insert, update: mocks.update } }))
vi.mock('@/lib/social', () => ({ notifyMentions: mocks.notifyMentions }))
vi.mock('@/lib/chat', () => ({
  getMessageReactionSummaries: vi.fn(),
  isAllowedChatMediaUrl: vi.fn(),
}))

import { POST as createConversation } from '@/app/api/dm/conversations/route'
import { POST as sendMessage } from '@/app/api/dm/conversations/[id]/messages/route'
import { getDirectConversationPeerId } from '@/lib/dm'

const senderId = '11111111-1111-4111-8111-111111111111'
const recipientId = '22222222-2222-4222-8222-222222222222'
const conversationId = '33333333-3333-4333-8333-333333333333'

describe('direct message permissions', () => {
  beforeEach(() => {
    mocks.requireMember.mockResolvedValue({ ok: true, user: { id: senderId } })
    mocks.rateLimit.mockResolvedValue(null)
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: mocks.limit,
    })
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({
      onConflictDoNothing: mocks.onConflictDoNothing,
      returning: mocks.returning,
    })
    mocks.onConflictDoNothing.mockResolvedValue(undefined)
    mocks.returning.mockResolvedValue([{
      id: '44444444-4444-4444-8444-444444444444',
      senderId,
      body: 'Hello',
      mediaUrl: null,
      mediaType: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }])
    mocks.update.mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    })
    mocks.notifyMentions.mockResolvedValue(undefined)
  })

  afterEach(() => vi.clearAllMocks())

  it('creates a conversation with an existing user without requiring mutual follows', async () => {
    mocks.limit
      .mockResolvedValueOnce([{ id: recipientId }])
      .mockResolvedValueOnce([{ id: conversationId }])
    const request = new NextRequest('https://app.example.test/api/dm/conversations', {
      method: 'POST',
      body: JSON.stringify({ recipientId }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await createConversation(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ conversationId })
  })

  it('sends a message in an existing conversation without requiring mutual follows', async () => {
    mocks.limit.mockResolvedValueOnce([{ id: conversationId, userA: senderId, userB: recipientId }])
    const request = new NextRequest(`https://app.example.test/api/dm/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body: 'Hello' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await sendMessage(request, { params: Promise.resolve({ id: conversationId }) })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({ message: { body: 'Hello', senderId } })
  })

  it('allows only the two conversation participants to resolve a peer', () => {
    const conversation = { userA: senderId, userB: recipientId }

    expect(getDirectConversationPeerId(conversation, senderId)).toBe(recipientId)
    expect(getDirectConversationPeerId(conversation, recipientId)).toBe(senderId)
    expect(getDirectConversationPeerId(conversation, '55555555-5555-4555-8555-555555555555')).toBeNull()
  })
})
