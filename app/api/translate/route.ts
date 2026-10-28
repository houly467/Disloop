import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'

const requestSchema = z.object({ text: z.string().trim().min(1).max(5000) }).strict()

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const limit = await rateLimitResponse(`translate:${access.user.id}`, 30, 3600)
  if (limit) return limit
  const data = await parseJsonBody(request, requestSchema)
  if (!data) return NextResponse.json({ error: 'invalid_text' }, { status: 400 })
  const source = /[\u0600-\u06ff]/u.test(data.text) ? 'ar' : 'en'
  const target = source === 'ar' ? 'en' : 'ar'
  const query = new URLSearchParams({ q: data.text, langpair: `${source}|${target}` })
  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?${query}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`translation_upstream_${response.status}`)
    const result = await response.json() as { responseData?: { translatedText?: unknown }; responseStatus?: number }
    const translatedText = result.responseData?.translatedText
    if (result.responseStatus !== 200 || typeof translatedText !== 'string' || !translatedText.trim()) {
      throw new Error('translation_unavailable')
    }
    return NextResponse.json({ translatedText, target }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[translate] translation request failed', { userId: access.user.id, error })
    return NextResponse.json({ error: 'translation_unavailable' }, { status: 503 })
  }
}
