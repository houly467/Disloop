import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopProfilePreferences } from '@/lib/db/schema'
import { safeApiFailureReason } from '@/lib/api-errors'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { getCurrentUser } from '@/lib/session'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { normalizeProfileMusicUrl } from '@/lib/profile-music'
import { z } from 'zod'

const themes = ['default', 'ocean', 'sunset', 'forest', 'violet'] as const
const profileLinkSchema = z.string().trim().max(2048).nullable().transform((value, context) => {
  if (!value) return null
  const normalized = normalizeProfileMusicUrl(value)
  if (!normalized) {
    context.addIssue({ code: 'custom', message: 'unsupported_music_url' })
    return z.NEVER
  }
  return normalized
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 })
  try {
    const [preferences] = await db.select().from(disloopProfilePreferences).where(eq(disloopProfilePreferences.userId, user.id)).limit(1)
    return NextResponse.json({ preferences: preferences ?? { theme: 'default', profileLink: null }, available: true }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (safeApiFailureReason(error) === 'missing_table') return NextResponse.json({ preferences: { theme: 'default', profileLink: null }, available: false }, { headers: { 'Cache-Control': 'private, no-store' } })
    console.error('[profile-preferences] read failed', { userId: user.id, error })
    return NextResponse.json({ error: 'preferences_unavailable' }, { status: 503 })
  }
}

export async function PUT(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const limited = await rateLimitResponse(`profile-preferences:${access.user.id}`, 20, 3600)
  if (limited) return limited
  const data = await parseJsonBody(request, z.object({ theme: z.enum(themes), profileLink: profileLinkSchema }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_preferences' }, { status: 400 })
  try {
    const [preferences] = await db.insert(disloopProfilePreferences).values({
      userId: access.user.id,
      theme: data.theme,
      profileLink: data.profileLink,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: disloopProfilePreferences.userId,
      set: { theme: data.theme, profileLink: data.profileLink, updatedAt: new Date() },
    }).returning({ theme: disloopProfilePreferences.theme, profileLink: disloopProfilePreferences.profileLink })
    return NextResponse.json({ preferences })
  } catch (error) {
    console.error('[profile-preferences] update failed', { userId: access.user.id, error })
    return NextResponse.json({ error: 'preferences_unavailable' }, { status: 503 })
  }
}
