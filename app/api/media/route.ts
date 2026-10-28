import { get } from '@vercel/blob'
import { apiFailurePayload } from '@/lib/api-errors'
import { NextRequest, NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  disloopDailyPosts,
  disloopDmConversations,
  disloopDmMessages,
  disloopGroupMembers,
  disloopGroupMessages,
  disloopNewsPosts,
  disloopReels,
  disloopStories,
  disloopUsers,
} from '@/lib/db/schema'
import { getCurrentUser } from '@/lib/session'
import { isPrivateMediaPath, privateMediaUrl } from '@/lib/private-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const pathnames = request.nextUrl.searchParams.getAll('pathname')
  const pathname = pathnames[0]
  if (request.nextUrl.searchParams.size !== 1 || pathnames.length !== 1 || !pathname || !isPrivateMediaPath(pathname)) {
    return NextResponse.json({ error: 'media_not_found' }, { status: 404 })
  }

  const user = await getCurrentUser()
  const mediaUrl = privateMediaUrl(pathname)
  const memberContentAccess = user ? sql`
    OR EXISTS (
      SELECT 1 FROM ${disloopGroupMessages}
      INNER JOIN ${disloopGroupMembers} ON ${disloopGroupMembers.groupId} = ${disloopGroupMessages.groupId}
      WHERE ${disloopGroupMessages.mediaUrl} = ${mediaUrl}
        AND ${disloopGroupMembers.userId} = ${user.id}
    )
    OR EXISTS (
      SELECT 1 FROM ${disloopDmMessages}
      INNER JOIN ${disloopDmConversations} ON ${disloopDmConversations.id} = ${disloopDmMessages.conversationId}
      WHERE ${disloopDmMessages.mediaUrl} = ${mediaUrl}
        AND (${disloopDmConversations.userA} = ${user.id} OR ${disloopDmConversations.userB} = ${user.id})
    )
  ` : sql``

  let failureStage = 'authorization_query'
  try {
    const access = await db.execute(sql<{ allowed: boolean }>`
      SELECT (
        EXISTS (SELECT 1 FROM ${disloopNewsPosts} WHERE ${disloopNewsPosts.coverUrl} = ${mediaUrl} AND ${disloopNewsPosts.isHidden} = false)
        OR EXISTS (SELECT 1 FROM ${disloopReels} WHERE ${disloopReels.videoUrl} = ${mediaUrl} AND ${disloopReels.isHidden} = false)
        OR EXISTS (SELECT 1 FROM ${disloopStories} WHERE ${disloopStories.mediaUrl} = ${mediaUrl} AND ${disloopStories.expiresAt} > now())
        OR EXISTS (SELECT 1 FROM ${disloopDailyPosts} WHERE ${disloopDailyPosts.mediaUrl} = ${mediaUrl} AND ${disloopDailyPosts.isHidden} = false)
        OR EXISTS (SELECT 1 FROM ${disloopUsers} WHERE ${disloopUsers.profileAvatarUrl} = ${mediaUrl} OR ${disloopUsers.profileBannerUrl} = ${mediaUrl})
        ${memberContentAccess}
      ) AS allowed
    `)
    if (!access.rows[0]?.allowed) return NextResponse.json({ error: 'media_not_found' }, { status: 404 })

    failureStage = 'blob_fetch'
    const range = request.headers.get('range')
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/i.test(range)) {
      return new NextResponse(null, { status: 416, headers: { 'Accept-Ranges': 'bytes' } })
    }
    const etag = request.headers.get('if-none-match')
    const blob = await get(pathname, {
      access: 'private',
      ...(etag ? { ifNoneMatch: etag } : {}),
      ...(range ? { headers: { range } } : {}),
    })
    if (!blob) return NextResponse.json({ error: 'media_not_found' }, { status: 404 })

    const headers = new Headers({
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': blob.headers.get('accept-ranges') ?? 'bytes',
    })
    if (blob.statusCode === 304) {
      if (blob.blob.etag) headers.set('ETag', blob.blob.etag)
      return new NextResponse(null, { status: 304, headers })
    }

    headers.set('Content-Type', blob.blob.contentType)
    headers.set('Content-Disposition', 'inline')
    if (blob.blob.etag) headers.set('ETag', blob.blob.etag)
    const contentLength = blob.headers.get('content-length')
    if (contentLength) headers.set('Content-Length', contentLength)
    const contentRange = blob.headers.get('content-range')
    const status = contentRange ? 206 : 200
    if (contentRange) headers.set('Content-Range', contentRange)
    const lastModified = blob.headers.get('last-modified')
    if (lastModified) headers.set('Last-Modified', lastModified)

    return new NextResponse(blob.stream, { status, headers })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('media_unavailable', error, `GET /api/media:${failureStage}`), { status: 502 })
  }
}
