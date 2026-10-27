import { apiFailurePayload } from '@/lib/api-errors'
import { eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { publishDiscordEmbed } from '@/lib/discord-community'
import { awardXp } from '@/lib/gamification'
import { extractTags } from '@/lib/tags'
import { db } from '@/lib/db'
import { disloopNewsPosts, disloopUsers } from '@/lib/db/schema'
import { getNewsPostById } from '@/lib/news'
import { getCurrentUser } from '@/lib/session'
import { isSameOriginRequest } from '@/lib/security'
import { findMentionUsernames, notifyMentions } from '@/lib/social'
import { sanitizeCalmColor } from '@/lib/colors'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { rateLimitResponse } from '@/lib/rate-limit'
import { isPrivateMediaUrlForUser, isPublicBlobUrl } from '@/lib/private-media'

const CATEGORIES = new Set(['server', 'updates', 'community', 'events'])

function isAllowedCoverUrl(value: string, userId: string) {
  return isPrivateMediaUrlForUser(value, 'news', userId) || isPublicBlobUrl(value)
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`publish:${user.id}`, 10, 3600)
  if (rateLimit) return rateLimit
  await db.update(disloopUsers).set({ isMember: true, updatedAt: new Date() }).where(eq(disloopUsers.id, user.id))

  const data = await parseJsonBody(request, z.object({
    title: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(10_000),
    category: z.enum(['server', 'updates', 'community', 'events']),
    coverUrl: z.string().max(2048).nullable().optional(),
    accentColor: z.string().max(32).nullable().optional(),
    repliesFromFollowing: z.boolean().optional(),
  }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_post' }, { status: 400 })
  const title = data.title
  const body = data.body
  const category = data.category
  const coverUrl = data.coverUrl ?? null
  const accentColor = data.accentColor ? sanitizeCalmColor(data.accentColor) : null
  const repliesFromFollowing = data.repliesFromFollowing ?? false

  if (!title || title.length > 160 || !body || body.length > 10_000 || !CATEGORIES.has(category) || findMentionUsernames(`${title}\n${body}`).length > 5) {
    return NextResponse.json({ error: 'invalid_post' }, { status: 400 })
  }
  if (coverUrl && !isAllowedCoverUrl(coverUrl, user.id)) {
    return NextResponse.json({ error: 'invalid_cover' }, { status: 400 })
  }

  let tags: string[]
  try {
    tags = extractTags(`${title}\n${body}`)
  } catch {
    return NextResponse.json({ error: 'too_many_tags' }, { status: 400 })
  }

  try {
    const [created] = await db
      .insert(disloopNewsPosts)
      .values({ authorId: user.id, title, body, category, coverUrl, accentColor, repliesFromFollowing, tags })
      .returning({ id: disloopNewsPosts.id })
    const post = await getNewsPostById(created.id)
    await notifyMentions(`${title}\n${body}`, user.id, 'news', created.id).catch(() => undefined)
    const [xp] = await Promise.all([
      awardXp(user.id, 10, 'news_published', `news:${created.id}`).catch(() => null),
      publishDiscordEmbed({ title, description: body, url: `${process.env.SITE_URL ?? request.nextUrl.origin}/`, category, tags }).catch(() => undefined),
    ])
    return NextResponse.json({ post, xp }, { status: 201 })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('publish_failed', error, 'POST /api/news'), { status: 500 })
  }
}
