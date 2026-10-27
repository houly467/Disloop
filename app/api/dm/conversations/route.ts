import { apiFailurePayload } from '@/lib/api-errors'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopDmConversations, disloopDmMessages, disloopFollows, disloopUserFlair, disloopUsers } from '@/lib/db/schema'
import { isMutualFollow } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/session'
import { rateLimitResponse } from '@/lib/rate-limit'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const conversations = await db
      .select()
      .from(disloopDmConversations)
      .where(or(eq(disloopDmConversations.userA, user.id), eq(disloopDmConversations.userB, user.id)))
      .orderBy(desc(disloopDmConversations.lastMessageAt))
      .limit(50)

    if (!conversations.length) return NextResponse.json({ conversations: [] }, { headers: { 'Cache-Control': 'private, no-store' } })

    const allPeerIds = conversations.map((conversation) => conversation.userA === user.id ? conversation.userB : conversation.userA)
    const followEdges = await db.select({ followerId: disloopFollows.followerId, followedId: disloopFollows.followedId })
      .from(disloopFollows)
      .where(or(
        and(eq(disloopFollows.followedId, user.id), inArray(disloopFollows.followerId, allPeerIds)),
        and(eq(disloopFollows.followerId, user.id), inArray(disloopFollows.followedId, allPeerIds)),
      ))
    const edgeKeys = new Set(followEdges.map((edge) => `${edge.followerId}:${edge.followedId}`))
    const allowed = conversations.flatMap((conversation) => {
      const peerId = conversation.userA === user.id ? conversation.userB : conversation.userA
      return edgeKeys.has(`${user.id}:${peerId}`) && edgeKeys.has(`${peerId}:${user.id}`) ? [{ conversation, peerId }] : []
    })
    if (!allowed.length) return NextResponse.json({ conversations: [] }, { headers: { 'Cache-Control': 'private, no-store' } })

    const peerIds = allowed.map((item) => item.peerId)
    const conversationIds = allowed.map((item) => item.conversation.id)
    const [peers, messages] = await Promise.all([
      db.select({ id: disloopUsers.id, username: disloopUsers.usernameDisplay, displayName: disloopUsers.displayName, avatarUrl: disloopUsers.avatarUrl, accountCreatedAt: disloopUsers.createdAt, nameStyle: disloopUserFlair.nameStyle, customTitle: disloopUserFlair.customTitle })
        .from(disloopUsers)
        .leftJoin(disloopUserFlair, eq(disloopUserFlair.userId, disloopUsers.id))
        .where(and(inArray(disloopUsers.id, peerIds), eq(disloopUsers.isSeed, false))),
      db.select({ conversationId: disloopDmMessages.conversationId, body: disloopDmMessages.body, senderId: disloopDmMessages.senderId, createdAt: disloopDmMessages.createdAt })
        .from(disloopDmMessages)
        .where(inArray(disloopDmMessages.conversationId, conversationIds))
        .orderBy(desc(disloopDmMessages.createdAt)),
    ])
    const peerById = new Map(peers.map((peer) => [peer.id, peer]))
    const latestByConversation = new Map<string, (typeof messages)[number]>()
    for (const message of messages) {
      if (!latestByConversation.has(message.conversationId)) latestByConversation.set(message.conversationId, message)
    }

    const result = allowed.flatMap(({ conversation, peerId }) => {
      const peer = peerById.get(peerId)
      if (!peer) return []
      const lastMessage = latestByConversation.get(conversation.id)
      return [{
        id: conversation.id,
        peer: { ...peer, accountCreatedAt: peer.accountCreatedAt.toISOString() },
        lastMessage: lastMessage ? { body: lastMessage.body, senderId: lastMessage.senderId, createdAt: lastMessage.createdAt } : null,
        lastMessageAt: conversation.lastMessageAt,
      }]
    })

    return NextResponse.json({ conversations: result }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('conversations_failed', error, 'GET /api/dm/conversations'), { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`conversations:${user.id}`, 20, 3600)
  if (rateLimit) return rateLimit

  const data = await parseJsonBody(request, z.object({ recipientId: z.uuid() }).strict())
  if (!data || data.recipientId === user.id) return NextResponse.json({ error: 'invalid_user' }, { status: 400 })
  const recipientId = data.recipientId

  try {
    const [recipient] = await db.select({ id: disloopUsers.id })
      .from(disloopUsers)
      .where(and(eq(disloopUsers.id, recipientId), eq(disloopUsers.isSeed, false)))
      .limit(1)
    if (!recipient) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    if (!(await isMutualFollow(user.id, recipientId))) return NextResponse.json({ error: 'mutual_follow_required' }, { status: 403 })

    const [userA, userB] = [user.id, recipientId].sort()
    await db.insert(disloopDmConversations)
      .values({ userA, userB })
      .onConflictDoNothing({ target: [disloopDmConversations.userA, disloopDmConversations.userB] })
    const [conversation] = await db.select({ id: disloopDmConversations.id })
      .from(disloopDmConversations)
      .where(and(eq(disloopDmConversations.userA, userA), eq(disloopDmConversations.userB, userB)))
      .limit(1)
    if (!conversation) {
    console.error('[POST /api/dm/conversations] conversation not found after insert')
    return NextResponse.json({ error: 'conversation_failed', reason: 'conversation_missing_after_create' }, { status: 500 })
  }
    return NextResponse.json({ conversationId: conversation.id })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('conversation_failed', error, 'POST /api/dm/conversations'), { status: 500 })
  }
}
