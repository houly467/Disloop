import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { buildContentSecurityPolicy } from '@/lib/content-security-policy'

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(randomUUID()).toString('base64')
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', contentSecurityPolicy)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (request.nextUrl.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000')
  }

  return response
}
