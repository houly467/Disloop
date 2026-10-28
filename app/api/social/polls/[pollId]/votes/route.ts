import { and, eq, or } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopBlocks, disloopPollVotes, disloopPolls } from '@/lib/db/schema'
import { isUuid } from '@/lib/dm'
import { rateLimitResponse } from '@/lib/rate-limit'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { parseJsonBody } from '@/lib/validation'
import { z } from 'zod'
import { calculatePollResults } from '@/lib/social-poll-utils'

type RouteContext = { params: Promise<{ pollId: string }> }

export async function POST(request: NextRequest, { params }: RouteContext) {
  const access = await requireLoggedInServerMember(request, { requireDiscordMembership: true })
  if (!access.ok) return access.response
  const user = access.user
  const { pollId } = await params
  if (!isUuid(pollId)) return NextResponse.json({ error: 'invalid_poll' }, { status: 400 })
  const rateLimit = await rateLimitResponse(`social-poll-vote:${user.id}`, 30, 3600)
  if (rateLimit) return rateLimit
  const data = await parseJsonBody(request, z.object({ optionIndex: z.number().int().min(0).max(3) }).strict())
  if (!data) return NextResponse.json({ error: 'invalid_vote' }, { status: 400 })

  try {
    const [poll] = await db.select({
      id: disloopPolls.id,
      authorId: disloopPolls.authorId,
      options: disloopPolls.options,
      endsAt: disloopPolls.endsAt,
    }).from(disloopPolls).where(eq(disloopPolls.id, pollId)).limit(1)
    if (!poll) return NextResponse.json({ error: 'poll_not_found' }, { status: 404 })
    if (poll.authorId !== user.id) {
      const [blocked] = await db.select({ blockerId: disloopBlocks.blockerId }).from(disloopBlocks)
        .where(or(
          and(eq(disloopBlocks.blockerId, user.id), eq(disloopBlocks.blockedId, poll.authorId)),
          and(eq(disloopBlocks.blockerId, poll.authorId), eq(disloopBlocks.blockedId, user.id)),
        )).limit(1)
      if (blocked) return NextResponse.json({ error: 'poll_not_found' }, { status: 404 })
    }
    if (data.optionIndex >= poll.options.length) return NextResponse.json({ error: 'invalid_vote' }, { status: 400 })
    if (poll.endsAt && poll.endsAt <= new Date()) return NextResponse.json({ error: 'poll_ended' }, { status: 409 })
    const [vote] = await db.insert(disloopPollVotes)
      .values({ pollId, userId: user.id, optionIndex: data.optionIndex })
      .onConflictDoNothing()
      .returning({ pollId: disloopPollVotes.pollId })
    if (!vote) return NextResponse.json({ error: 'already_voted' }, { status: 409 })

    const votes = await db.select({ optionIndex: disloopPollVotes.optionIndex })
      .from(disloopPollVotes).where(eq(disloopPollVotes.pollId, pollId))
    const { optionCounts, totalVotes, percentages } = calculatePollResults(poll.options, votes.map((entry) => entry.optionIndex))
    return NextResponse.json({
      poll: {
        id: poll.id,
        options: poll.options,
        endsAt: poll.endsAt?.toISOString() ?? null,
        totalVotes,
        optionCounts,
        percentages,
        hasVoted: true,
        ended: false,
      },
    })
  } catch (error) {
    console.error('[social-polls] vote failed', { userId: user.id, pollId, error })
    return NextResponse.json({ error: 'poll_unavailable' }, { status: 503 })
  }
}
