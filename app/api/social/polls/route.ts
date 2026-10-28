import { and, eq, gt, inArray, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopBlocks, disloopNewsPosts, disloopPollVotes, disloopPolls, disloopStories } from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validation'
import { isUuid } from '@/lib/dm'
import { z } from 'zod'
import { calculatePollResults, normalizePollOptions } from '@/lib/social-poll-utils'

const pollInput = z.object({
  contentType: z.enum(['news', 'story']),
  contentId: z.string().refine(isUuid),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(4),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
}).strict()

export async function GET(request: NextRequest) {
  const contentType = request.nextUrl.searchParams.get('contentType')
  const idsValue = request.nextUrl.searchParams.get('ids') ?? ''
  const ids = [...new Set(idsValue.split(',').filter(Boolean))]
  if (!['news', 'story'].includes(contentType ?? '') || ids.length > 50 || ids.some((id) => !isUuid(id))) {
    return NextResponse.json({ polls: [], available: true }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (!ids.length) return NextResponse.json({ polls: [], available: true }, { headers: { 'Cache-Control': 'no-store' } })

  try {
    const viewer = await getCurrentUser()
    const polls = await db.select({
      id: disloopPolls.id,
      contentId: disloopPolls.contentId,
      authorId: disloopPolls.authorId,
      options: disloopPolls.options,
      endsAt: disloopPolls.endsAt,
    }).from(disloopPolls)
      .where(and(eq(disloopPolls.contentType, contentType!), inArray(disloopPolls.contentId, ids)))
    if (!polls.length) return NextResponse.json({ polls: [], available: true }, { headers: { 'Cache-Control': 'no-store' } })

    let visiblePolls = polls
    if (viewer) {
      const authorIds = [...new Set(polls.map((poll) => poll.authorId).filter((id) => id !== viewer.id))]
      if (authorIds.length) {
        const blocked = await db.select({ blockerId: disloopBlocks.blockerId, blockedId: disloopBlocks.blockedId })
          .from(disloopBlocks)
          .where(or(
            and(eq(disloopBlocks.blockerId, viewer.id), inArray(disloopBlocks.blockedId, authorIds)),
            and(inArray(disloopBlocks.blockerId, authorIds), eq(disloopBlocks.blockedId, viewer.id)),
          ))
        const blockedIds = new Set(blocked.flatMap((row) => [row.blockerId, row.blockedId].filter((id) => id !== viewer.id)))
        visiblePolls = polls.filter((poll) => !blockedIds.has(poll.authorId))
      }
    }

    const pollIds = visiblePolls.map((poll) => poll.id)
    const votes = await db.select({ pollId: disloopPollVotes.pollId, optionIndex: disloopPollVotes.optionIndex, userId: disloopPollVotes.userId })
      .from(disloopPollVotes).where(inArray(disloopPollVotes.pollId, pollIds))
    const voteOptions = new Map<string, number[]>()
    const ownVotes = new Map<string, number>()
    for (const vote of votes) {
      const options = voteOptions.get(vote.pollId) ?? []
      options.push(vote.optionIndex)
      voteOptions.set(vote.pollId, options)
      if (viewer?.id && vote.userId === viewer.id) ownVotes.set(vote.pollId, vote.optionIndex)
    }
    return NextResponse.json({
      polls: visiblePolls.map((poll) => {
        const options = Array.isArray(poll.options) ? poll.options : []
        const { optionCounts, totalVotes, percentages } = calculatePollResults(
          options,
          voteOptions.get(poll.id) ?? [],
        )
        return {
          id: poll.id,
          contentId: poll.contentId,
          options,
          endsAt: poll.endsAt?.toISOString() ?? null,
          totalVotes,
          optionCounts,
          percentages,
          hasVoted: ownVotes.has(poll.id),
          ended: Boolean(poll.endsAt && poll.endsAt <= new Date()),
        }
      }),
      available: true,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[social-polls] read failed', { error })
    return NextResponse.json({ polls: [], available: false }, { headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request, { requireDiscordMembership: true })
  if (!access.ok) return access.response
  const user = access.user
  const rateLimit = await rateLimitResponse(`social-poll-create:${user.id}`, 10, 3600)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, pollInput)
  if (!data) return NextResponse.json({ error: 'invalid_poll' }, { status: 400 })

  const options = normalizePollOptions(data.options)
  if (!options) {
    return NextResponse.json({ error: 'invalid_poll' }, { status: 400 })
  }
  const endsAt = data.endsAt ? new Date(data.endsAt) : null
  if (endsAt && endsAt <= new Date()) return NextResponse.json({ error: 'invalid_poll_end_time' }, { status: 400 })

  try {
    let authorId: string | undefined
    if (data.contentType === 'news') {
      const [post] = await db.select({ authorId: disloopNewsPosts.authorId }).from(disloopNewsPosts)
        .where(and(eq(disloopNewsPosts.id, data.contentId), eq(disloopNewsPosts.isHidden, false))).limit(1)
      authorId = post?.authorId
    } else {
      const [story] = await db.select({ authorId: disloopStories.authorId }).from(disloopStories)
        .where(and(eq(disloopStories.id, data.contentId), gt(disloopStories.expiresAt, new Date()))).limit(1)
      authorId = story?.authorId
    }
    if (!authorId) return NextResponse.json({ error: 'content_not_found' }, { status: 404 })
    if (authorId !== user.id && (await db.select({ blockerId: disloopBlocks.blockerId }).from(disloopBlocks)
      .where(or(
        and(eq(disloopBlocks.blockerId, user.id), eq(disloopBlocks.blockedId, authorId)),
        and(eq(disloopBlocks.blockerId, authorId), eq(disloopBlocks.blockedId, user.id)),
      )).limit(1)).length > 0) {
      return NextResponse.json({ error: 'content_unavailable' }, { status: 404 })
    }
    const [poll] = await db.insert(disloopPolls).values({
      contentType: data.contentType,
      contentId: data.contentId,
      authorId,
      options,
      endsAt,
    }).onConflictDoNothing().returning({ id: disloopPolls.id })
    if (!poll) return NextResponse.json({ error: 'poll_exists' }, { status: 409 })
    return NextResponse.json({ poll: { id: poll.id, contentId: data.contentId, options, endsAt: endsAt?.toISOString() ?? null } }, { status: 201 })
  } catch (error) {
    console.error('[social-polls] create failed', { userId: user.id, contentType: data.contentType, contentId: data.contentId, error })
    return NextResponse.json({ error: 'poll_unavailable' }, { status: 503 })
  }
}
