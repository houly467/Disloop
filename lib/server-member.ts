import { NextResponse, type NextRequest } from 'next/server'
import { checkDiscordMembership } from '@/lib/discord'
import { isSameOriginRequest } from '@/lib/security'
import { getCurrentUserResult, type CurrentUser } from '@/lib/session'

type MemberFailureCode = 'invalid_origin' | 'not_logged_in' | 'DISCORD_MEMBERSHIP_REQUIRED' | 'banned' | 'discord_unavailable' | 'session_unavailable' | 'invalid_input'

export type ServerMemberResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; response: NextResponse }

export function memberErrorResponse(code: MemberFailureCode, status: number, error?: unknown) {
  if (error !== undefined) console.error(`[api-auth] ${code}`, error)
  else console.warn(`[api-auth] ${code}`)
  return NextResponse.json({ error: code, reason: code }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function requireLoggedInServerMember(
  request: NextRequest,
  options: { requireDiscordMembership?: boolean } = {},
): Promise<ServerMemberResult> {
  if (!isSameOriginRequest(request)) {
    return { ok: false, response: memberErrorResponse('invalid_origin', 403) }
  }

  const session = await getCurrentUserResult()
  if (session.status === 'unavailable') {
    return { ok: false, response: memberErrorResponse('session_unavailable', 503, session.error) }
  }
  if (session.status !== 'ok') {
    const code = session.status
    return { ok: false, response: memberErrorResponse(code, code === 'banned' ? 403 : 401) }
  }

  if (options.requireDiscordMembership) {
    try {
      if (!(await checkDiscordMembership(session.user.discordId))) {
        return { ok: false, response: memberErrorResponse('DISCORD_MEMBERSHIP_REQUIRED', 403) }
      }
    } catch (error) {
      return { ok: false, response: memberErrorResponse('discord_unavailable', 503, error) }
    }
  }

  return { ok: true, user: session.user }
}
