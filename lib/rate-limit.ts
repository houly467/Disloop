import { Ratelimit } from '@upstash/ratelimit'
import { NextResponse } from 'next/server'
import { redis } from '@/lib/upstash'

const limiters = new Map<string, Ratelimit>()

export async function rateLimitResponse(key: string, maxHits: number, windowSeconds: number) {
  if (!redis) {
    return NextResponse.json({ error: 'rate_limit_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }

  const limiterKey = `${maxHits}:${windowSeconds}`
  let limiter = limiters.get(limiterKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxHits, `${windowSeconds} s`),
      prefix: `disloop:rate-limit:v2:${limiterKey}`,
    })
    limiters.set(limiterKey, limiter)
  }

  try {
    const result = await limiter.limit(key)
    if (result.success) return null

    const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))
    console.warn('[rate-limit] limit reached', { key, count: maxHits, windowSeconds })
    return NextResponse.json({ error: 'rate_limited', retryAfter }, {
      status: 429,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': String(retryAfter) },
    })
  } catch (error) {
    console.error('[rate-limit] shared store unavailable', { key, windowSeconds, error })
    return NextResponse.json({ error: 'rate_limit_unavailable', reason: 'rate_limit_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
