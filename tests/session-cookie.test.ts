import { describe, expect, it } from 'vitest'
import { NextResponse } from 'next/server'
import { clearSessionCookie, setSessionCookie } from '@/lib/session-cookie'

describe('session cookie domain cleanup', () => {
  it('clears both domain-scoped and host-only cookies on logout', () => {
    const response = NextResponse.json({ ok: true })
    clearSessionCookie(response, true, 'disloop.me')

    expect(response.headers.getSetCookie()).toEqual([
      'disloop.session=; Path=/; Max-Age=0; Domain=.disloop.me; Secure; HttpOnly; SameSite=lax',
      'disloop.session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax',
    ])
  })

  it('removes a stale host-only cookie when setting the domain-scoped session', () => {
    const response = NextResponse.json({ ok: true })
    setSessionCookie(response, 'session-token', true, 'www.disloop.me')

    const setCookies = response.headers.getSetCookie()
    expect(setCookies).toHaveLength(2)
    expect(setCookies[0]).toContain('disloop.session=session-token;')
    expect(setCookies[0]).toContain('Domain=.disloop.me')
    expect(setCookies[1]).toContain('disloop.session=; Path=/; Max-Age=0')
    expect(setCookies[1]).not.toContain('Domain=')
  })

  it('clears only the host cookie on hosts without a shared cookie domain', () => {
    const response = NextResponse.json({ ok: true })
    clearSessionCookie(response, true, 'localhost')

    expect(response.headers.getSetCookie()).toHaveLength(1)
    expect(response.headers.getSetCookie()[0]).not.toContain('Domain=')
  })
})
