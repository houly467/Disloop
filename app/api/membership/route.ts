import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { checkDiscordMembership } from '@/lib/discord'
import { db } from '@/lib/db'
import { disloopUsers } from '@/lib/db/schema'
import { createSessionToken, getCurrentUserResult, setSessionCookie } from '@/lib/session'
import { isSameOriginRequest } from '@/lib/security'
import { memberErrorResponse } from '@/lib/server-member'

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return memberErrorResponse('invalid_origin', 403)

  const session = await getCurrentUserResult()
  if (session.status === 'unavailable') return memberErrorResponse('session_unavailable', 503, session.error)
  if (session.status !== 'ok') return memberErrorResponse(session.status, session.status === 'banned' ? 403 : 401)

  let isMember: boolean
  try {
    isMember = await checkDiscordMembership(session.user.discordId)
  } catch (error) {
    return memberErrorResponse('discord_unavailable', 503, error)
  }

  try {
    await db.update(disloopUsers)
      .set({ isMember, updatedAt: new Date() })
      .where(eq(disloopUsers.id, session.user.id))
  } catch (error) {
    return memberErrorResponse('session_unavailable', 503, error)
  }

  const response = NextResponse.json({ isMember })
  setSessionCookie(response, await createSessionToken(session.user.id), request.nextUrl.protocol === 'https:', request.nextUrl.hostname)
  return response
}
