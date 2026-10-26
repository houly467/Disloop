import { NextRequest, NextResponse } from 'next/server'
import { searchCommunity } from '@/lib/search'
import { getClientRateLimitKey } from '@/lib/security'
import { rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  const rateLimit = await rateLimitResponse(getClientRateLimitKey(request, 'community-search'), 60, 60)
  if (rateLimit) return rateLimit

  const query = request.nextUrl.searchParams.get('q') ?? ''
  if (query.length > 100) return NextResponse.json({ error: 'query_too_long' }, { status: 400 })
  const results = await searchCommunity(query)
  return NextResponse.json(results, { headers: { 'Cache-Control': 'private, no-store' } })
}
