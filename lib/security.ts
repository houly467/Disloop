import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'

export function getClientRateLimitKey(request: NextRequest, scope: string) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const clientIp = forwardedFor || request.headers.get('x-real-ip')?.trim() || 'unknown'
  const digest = createHash('sha256').update(clientIp).digest('hex')
  return `${scope}:${digest}`
}

function canonicalSiteHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, '')
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (!origin) return false

  try {
    const parsedOrigin = new URL(origin)
    const target = request.nextUrl
    if (parsedOrigin.origin === target.origin) return true
    if (parsedOrigin.protocol !== 'https:' || target.protocol !== 'https:') return false

    const originHost = canonicalSiteHost(parsedOrigin.hostname)
    const targetHost = canonicalSiteHost(target.hostname)
    const configuredSite = process.env.SITE_URL
    if (!configuredSite) return false
    const siteHost = canonicalSiteHost(new URL(configuredSite.startsWith('http') ? configuredSite : `https://${configuredSite}`).hostname)
    return originHost === targetHost && originHost === siteHost
  } catch {
    return false
  }
}
