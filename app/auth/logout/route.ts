import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/session-cookie'
import { isSameOriginRequest } from '@/lib/security'

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 })

  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response, request.nextUrl.protocol === 'https:', request.nextUrl.hostname)
  return response
}
