export const SESSION_COOKIE = 'disloop.session'

export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7

type SessionCookieResponse = {
  cookies: {
    set: (name: string, value: string, options: Record<string, unknown>) => void
  }
  headers: {
    append: (name: string, value: string) => void
  }
}

export function sessionCookieDomain(hostname: string | undefined) {
  const host = hostname?.toLowerCase().replace(/\.$/, '')
  if (host === 'disloop.me' || host === 'www.disloop.me') return '.disloop.me'
  return undefined
}

function appendHostOnlySessionCookieExpiration(response: SessionCookieResponse, secure: boolean) {
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly${secure ? '; Secure' : ''}; SameSite=Lax`,
  )
}

export function setSessionCookie(response: SessionCookieResponse, token: string, secure: boolean, hostname?: string) {
  const domain = sessionCookieDomain(hostname)
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    ...(domain ? { domain } : {}),
    maxAge: SESSION_DURATION_SECONDS,
  })

  if (domain) appendHostOnlySessionCookieExpiration(response, secure)
}

export function clearSessionCookie(response: SessionCookieResponse, secure: boolean, hostname?: string) {
  const domain = sessionCookieDomain(hostname)
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    ...(domain ? { domain } : {}),
    maxAge: 0,
  })

  if (domain) appendHostOnlySessionCookieExpiration(response, secure)
}
