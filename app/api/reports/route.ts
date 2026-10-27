import { and, desc, eq, gte } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  disloopComments,
  disloopDailyPosts,
  disloopNewsPosts,
  disloopReports,
  disloopReels,
  disloopUsers,
} from '@/lib/db/schema'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { rateLimitResponse } from '@/lib/rate-limit'
import { buildReportWebhookPayload, parseReportRequest, reportCooldownSince, REPORTS_PER_HOUR, selectReportWebhook, sendReportWebhook } from '@/lib/reporting'

type ReportTarget = {
  id: string
  authorId: string
  username: string
  contentUrl: string | null
}

function contentUrl(origin: string, type: 'news' | 'daily' | 'reel', id: string) {
  const section = type === 'reel' ? 'reels' : 'news'
  return `${origin}/?section=${section}#${type}-${id}`
}

async function resolveTarget(targetType: string, targetId: string, origin: string): Promise<ReportTarget | null> {
  if (targetType === 'user') {
    const [target] = await db.select({
      id: disloopUsers.id,
      authorId: disloopUsers.id,
      username: disloopUsers.usernameDisplay,
    }).from(disloopUsers)
      .where(and(eq(disloopUsers.id, targetId), eq(disloopUsers.isSeed, false)))
      .limit(1)
    return target ? { ...target, contentUrl: null } : null
  }

  if (targetType === 'comment') {
    const [comment] = await db.select({
      id: disloopComments.id,
      authorId: disloopComments.authorId,
      contentType: disloopComments.contentType,
      contentId: disloopComments.contentId,
    }).from(disloopComments)
      .where(and(eq(disloopComments.id, targetId), eq(disloopComments.isHidden, false)))
      .limit(1)
    if (!comment || !['news', 'daily', 'reel'].includes(comment.contentType)) return null
    const [author] = await db.select({ username: disloopUsers.usernameDisplay })
      .from(disloopUsers).where(and(eq(disloopUsers.id, comment.authorId), eq(disloopUsers.isSeed, false))).limit(1)
    if (!author) return null
    return {
      id: comment.id,
      authorId: comment.authorId,
      username: author.username,
      contentUrl: contentUrl(origin, comment.contentType as 'news' | 'daily' | 'reel', comment.contentId),
    }
  }

  if (targetType === 'news') {
    const [target] = await db.select({ id: disloopNewsPosts.id, authorId: disloopNewsPosts.authorId })
      .from(disloopNewsPosts).where(and(eq(disloopNewsPosts.id, targetId), eq(disloopNewsPosts.isHidden, false))).limit(1)
    if (!target) return null
    const [author] = await db.select({ username: disloopUsers.usernameDisplay })
      .from(disloopUsers).where(and(eq(disloopUsers.id, target.authorId), eq(disloopUsers.isSeed, false))).limit(1)
    return author ? { ...target, username: author.username, contentUrl: contentUrl(origin, 'news', target.id) } : null
  }

  if (targetType === 'daily') {
    const [target] = await db.select({ id: disloopDailyPosts.id, authorId: disloopDailyPosts.authorId })
      .from(disloopDailyPosts).where(and(eq(disloopDailyPosts.id, targetId), eq(disloopDailyPosts.isHidden, false))).limit(1)
    if (!target) return null
    const [author] = await db.select({ username: disloopUsers.usernameDisplay })
      .from(disloopUsers).where(and(eq(disloopUsers.id, target.authorId), eq(disloopUsers.isSeed, false))).limit(1)
    return author ? { ...target, username: author.username, contentUrl: contentUrl(origin, 'daily', target.id) } : null
  }

  if (targetType === 'reel') {
    const [target] = await db.select({ id: disloopReels.id, authorId: disloopReels.authorId })
      .from(disloopReels).where(and(eq(disloopReels.id, targetId), eq(disloopReels.isHidden, false))).limit(1)
    if (!target) return null
    const [author] = await db.select({ username: disloopUsers.usernameDisplay })
      .from(disloopUsers).where(and(eq(disloopUsers.id, target.authorId), eq(disloopUsers.isSeed, false))).limit(1)
    return author ? { ...target, username: author.username, contentUrl: contentUrl(origin, 'reel', target.id) } : null
  }

  return null
}

export async function POST(request: NextRequest) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response

  const input = parseReportRequest(await request.json().catch(() => undefined))
  if (!input) return NextResponse.json({ error: 'invalid_report' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })

  const userLimit = await rateLimitResponse(`reports:${access.user.id}`, REPORTS_PER_HOUR, 3600)
  if (userLimit) return userLimit

  try {
    const now = new Date()
    const target = await resolveTarget(input.targetType, input.targetId, request.nextUrl.origin)
    if (!target) return NextResponse.json({ error: 'target_not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    if (target.authorId === access.user.id) return NextResponse.json({ error: 'self_report' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })

    const [recentReport] = await db.select({ id: disloopReports.id })
      .from(disloopReports)
      .where(and(
        eq(disloopReports.reporterId, access.user.id),
        eq(disloopReports.targetUserId, target.authorId),
        gte(disloopReports.createdAt, reportCooldownSince(now)),
      ))
      .orderBy(desc(disloopReports.createdAt))
      .limit(1)
    if (recentReport) {
      return NextResponse.json({ error: 'target_report_cooldown' }, { status: 429, headers: { 'Cache-Control': 'no-store' } })
    }

    const [reporter] = await db.select({ username: disloopUsers.usernameDisplay })
      .from(disloopUsers).where(eq(disloopUsers.id, access.user.id)).limit(1)
    if (!reporter) return NextResponse.json({ error: 'reporter_not_found' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

    const [saved] = await db.insert(disloopReports).values({
      reporterId: access.user.id,
      targetUserId: target.authorId,
      targetType: input.targetType,
      targetId: input.targetId,
      category: input.category,
      reason: input.reason,
    }).returning({ id: disloopReports.id, createdAt: disloopReports.createdAt })
    if (!saved) throw new Error('report_insert_failed')

    const siteOrigin = process.env.SITE_URL ? new URL(process.env.SITE_URL).origin : request.nextUrl.origin
    const webhook = selectReportWebhook(input.category)
    if (!webhook) {
      console.warn('[reports] saved report without a configured webhook', { reportId: saved.id, category: input.category })
    } else {
      const payload = buildReportWebhookPayload({
        id: saved.id,
        category: input.category,
        reason: input.reason,
        createdAt: saved.createdAt,
        reportedUsername: target.username,
        reportedUserId: target.authorId,
        profileUrl: `${siteOrigin}/u/${encodeURIComponent(target.username)}`,
        reporterUsername: reporter.username,
        reporterId: access.user.id,
        contentUrl: target.contentUrl,
      })
      if (!(await sendReportWebhook(webhook, payload))) {
        console.warn('[reports] webhook delivery failed after retry', { reportId: saved.id, category: input.category })
      }
    }

    return NextResponse.json({ ok: true, reportId: saved.id }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error('[reports] report submission failed')
    return NextResponse.json({ error: 'report_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
