import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'

export function getClientRateLimitKey(request: NextRequest, scope: string) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const clientIp = forwardedFor || request.headers.get('x-real-ip')?.trim() || 'unknown'
  const digest = createHash('sha256').update(clientIp).digest('hex')
  return `${scope}:${digest}`
}

export function isSameOriginRequest(request: NextRequest) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) return true

  const origin = request.headers.get('origin')
  if (!origin) return false

  try {
    const parsedOrigin = new URL(origin)
    const configuredSite = process.env.SITE_URL?.trim()
    const siteOrigin = configuredSite
      ? new URL(configuredSite.startsWith('http') ? configuredSite : `https://${configuredSite}`).origin
      : null
    const allowedOrigins = [request.nextUrl.origin, siteOrigin].filter((value): value is string => Boolean(value))
    return allowedOrigins.some((allowedOrigin) => parsedOrigin.origin === allowedOrigin)
  } catch {
    return false
  }
}
