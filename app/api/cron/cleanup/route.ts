import { del, list } from '@vercel/blob'
import { apiFailurePayload } from '@/lib/api-errors'
import { asc, inArray, lt, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { disloopStories } from '@/lib/db/schema'
import { verifyCronAuthorization } from '@/lib/cron-auth'
import { getPrivateMediaPathname, isPrivateMediaPath, isPublicBlobUrl } from '@/lib/private-media'
import { awardTopMakers } from '@/lib/top-ranking'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CLEANUP_BATCH_SIZE = 250
const ORPHAN_SCAN_PAGE_SIZE = 500
const ORPHAN_SCAN_MAX_PAGES = 5
const ORPHAN_DELETE_LIMIT = 100
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000
const MEDIA_DELETE_CONCURRENCY = 10

async function getReferencedMediaPaths() {
  const result = await db.execute(sql`
    SELECT media_reference FROM (
      SELECT avatar_url AS media_reference FROM public.disloop_users WHERE avatar_url IS NOT NULL
      UNION ALL SELECT profile_avatar_url FROM public.disloop_users WHERE profile_avatar_url IS NOT NULL
      UNION ALL SELECT profile_banner_url FROM public.disloop_users WHERE profile_banner_url IS NOT NULL
      UNION ALL SELECT cover_url FROM public.disloop_news_posts WHERE cover_url IS NOT NULL
      UNION ALL SELECT video_url FROM public.disloop_reels WHERE video_url IS NOT NULL
      UNION ALL SELECT media_url FROM public.disloop_stories WHERE media_url IS NOT NULL
      UNION ALL SELECT media_url FROM public.disloop_daily_posts WHERE media_url IS NOT NULL
      UNION ALL SELECT media_url FROM public.disloop_dm_messages WHERE media_url IS NOT NULL
      UNION ALL SELECT media_url FROM public.disloop_group_messages WHERE media_url IS NOT NULL
    ) stored_media
  `)

  return new Set((result.rows as Array<{ media_reference: unknown }>).flatMap(({ media_reference }) => {
    if (typeof media_reference !== 'string') return []
    const pathname = getPrivateMediaPathname(media_reference)
    return pathname ? [pathname] : []
  }))
}

async function deleteOrphanedMedia(referencedPaths: Set<string>) {
  const olderThan = Date.now() - ORPHAN_AGE_MS
  let cursor: string | undefined
  let scanned = 0
  let deleted = 0
  let failed = 0
  let pages = 0
  let hasMore = false

  while (pages < ORPHAN_SCAN_MAX_PAGES && deleted < ORPHAN_DELETE_LIMIT) {
    const page = await list({ limit: ORPHAN_SCAN_PAGE_SIZE, ...(cursor ? { cursor } : {}) })
    pages += 1
    scanned += page.blobs.length

    const orphaned = page.blobs.filter((blob) =>
      isPrivateMediaPath(blob.pathname)
      && blob.uploadedAt.getTime() < olderThan
      && !referencedPaths.has(blob.pathname),
    ).slice(0, ORPHAN_DELETE_LIMIT - deleted)

    for (let start = 0; start < orphaned.length; start += MEDIA_DELETE_CONCURRENCY) {
      const batch = orphaned.slice(start, start + MEDIA_DELETE_CONCURRENCY)
      const results = await Promise.allSettled(batch.map((blob) => del(blob.pathname, { ifMatch: blob.etag })))
      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') deleted += 1
        else {
          failed += 1
          console.error('[cleanup] orphan_media_delete_failed', { pathname: batch[index].pathname, error: result.reason })
        }
      }
    }

    cursor = page.cursor
    hasMore = page.hasMore
    if (!page.hasMore || !cursor || deleted >= ORPHAN_DELETE_LIMIT) break
  }

  return { deleted, failed, scanned, hasMore }
}

export async function GET(request: NextRequest) {
  const authorization = verifyCronAuthorization(request.headers.get('authorization'))
  if (authorization === 'not-configured') return NextResponse.json({ error: 'cleanup_not_configured' }, { status: 503 })
  if (authorization) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    await db.execute(awardTopMakers)

    const expiredStories = await db.select({ id: disloopStories.id, mediaUrl: disloopStories.mediaUrl })
      .from(disloopStories)
      .where(lt(disloopStories.expiresAt, new Date()))
      .orderBy(asc(disloopStories.expiresAt))
      .limit(CLEANUP_BATCH_SIZE)
    const blobResults = await Promise.allSettled(expiredStories.map(async (story) => {
      if (story.mediaUrl) {
        const privatePathname = getPrivateMediaPathname(story.mediaUrl)
        if (privatePathname?.startsWith('daily/')) await del(privatePathname)
        else if (isPublicBlobUrl(story.mediaUrl)) await del(story.mediaUrl)
      }
      return story.id
    }))
    const deletedIds = blobResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    if (deletedIds.length) await db.delete(disloopStories).where(inArray(disloopStories.id, deletedIds))

    const referencedPaths = await getReferencedMediaPaths()
    const orphanedMedia = await deleteOrphanedMedia(referencedPaths)

    return NextResponse.json({
      deletedStories: deletedIds.length,
      failedStoryMediaDeletes: blobResults.length - deletedIds.length,
      hasMoreExpiredStories: expiredStories.length === CLEANUP_BATCH_SIZE,
      deletedOrphanedMedia: orphanedMedia.deleted,
      failedOrphanedMediaDeletes: orphanedMedia.failed,
      scannedBlobs: orphanedMedia.scanned,
      hasMoreOrphanedMedia: orphanedMedia.hasMore,
    })
  } catch (error) {
    return NextResponse.json(apiFailurePayload('cleanup_failed', error, '/api/cron/cleanup'), { status: 500 })
  }
}
