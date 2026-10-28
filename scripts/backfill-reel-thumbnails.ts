import { BlobNotFoundError, get, put } from '@vercel/blob'
import { and, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as schema from '../lib/db/schema'
import { disloopReels } from '../lib/db/schema'
import { getDatabaseConnectionString } from '../lib/db/connection-url'
import { getPrivateMediaPathname, isPublicBlobUrl } from '../lib/private-media'

const MAX_VIDEO_BYTES = 40 * 1024 * 1024
const MAX_THUMBNAIL_BYTES = 250 * 1024
const apply = process.argv.includes('--apply')
const help = process.argv.includes('--help') || process.argv.includes('-h')
const connectionString = getDatabaseConnectionString()
const blobToken = process.env.BLOB_READ_WRITE_TOKEN

if (help) {
  console.log('Usage: pnpm exec tsx scripts/backfill-reel-thumbnails.ts [--apply]')
  console.log('Default mode reports visible reels missing thumbnails; --apply generates and attaches them.')
  process.exit(0)
}

if (apply && !blobToken) throw new Error('BLOB_READ_WRITE_TOKEN is required with --apply')

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 })
const db = drizzle(pool, { schema })

async function readLimited(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_VIDEO_BYTES) {
        await reader.cancel()
        throw new Error('source_video_size_invalid')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total)
}

async function downloadVideo(videoUrl: string, destination: string) {
  const pathname = getPrivateMediaPathname(videoUrl)
  let bytes: Buffer
  if (pathname) {
    let blob
    try {
      blob = await get(pathname, { access: 'private', useCache: false })
    } catch (error) {
      if (error instanceof BlobNotFoundError) throw new Error('source_video_missing')
      throw error
    }
    if (!blob || blob.statusCode !== 200 || !blob.stream) throw new Error('source_video_unavailable')
    bytes = await readLimited(blob.stream)
  } else if (isPublicBlobUrl(videoUrl)) {
    const response = await fetch(videoUrl, { redirect: 'error' })
    if (response.status === 404) throw new Error('source_video_missing')
    if (!response.ok) throw new Error(`source_video_http_${response.status}`)
    if (!response.body) throw new Error('source_video_unavailable')
    bytes = await readLimited(response.body)
  } else {
    throw new Error('unsupported_source_video_url')
  }
  if (!bytes.byteLength) throw new Error('source_video_size_invalid')
  await writeFile(destination, bytes)
}

function extractThumbnail(videoPath: string, thumbnailPath: string) {
  return new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-ss', '1', '-i', videoPath, '-frames:v', '1',
      '-vf', 'scale=480:854:force_original_aspect_ratio=decrease',
      '-c:v', 'libwebp', '-quality', '60', '-compression_level', '6',
      thumbnailPath,
    ], { stdio: 'ignore' })
    ffmpeg.once('error', reject)
    ffmpeg.once('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg_exit_${code}`)))
  })
}

async function run() {
  const missing = await db.select({
    id: disloopReels.id,
    authorId: disloopReels.authorId,
    videoUrl: disloopReels.videoUrl,
  }).from(disloopReels).where(and(isNull(disloopReels.coverPath), eq(disloopReels.isHidden, false)))

  console.log(`${missing.length} visible reel(s) have no thumbnail.`)
  if (!apply) {
    console.log('Dry run only. Add --apply to generate and attach thumbnails.')
    return
  }

  let generated = 0
  let skipped = 0
  for (const reel of missing) {
    const workDir = await mkdtemp(join(tmpdir(), 'disloop-reel-thumb-'))
    try {
      const videoPath = join(workDir, 'source-video')
      const thumbnailPath = join(workDir, 'thumbnail.webp')
      try {
        await downloadVideo(reel.videoUrl, videoPath)
      } catch (error) {
        if (error instanceof Error && error.message === 'source_video_missing') {
          skipped += 1
          console.warn(`Skipped reel ${reel.id}: source video is missing.`)
          continue
        }
        throw error
      }

      await extractThumbnail(videoPath, thumbnailPath)
      const thumbnail = await readFile(thumbnailPath)
      if (!thumbnail.length || thumbnail.length > MAX_THUMBNAIL_BYTES) {
        skipped += 1
        console.warn(`Skipped reel ${reel.id}: generated thumbnail exceeds the size limit.`)
        continue
      }

      const pathname = `reel-thumbnails/${reel.authorId}/${randomUUID()}.webp`
      await put(pathname, thumbnail, {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'image/webp',
        token: blobToken,
      })
      const updated = await db.update(disloopReels)
        .set({ coverPath: pathname, updatedAt: new Date() })
        .where(and(eq(disloopReels.id, reel.id), isNull(disloopReels.coverPath)))
        .returning({ id: disloopReels.id })
      if (updated.length) generated += 1
      else console.warn(`Thumbnail uploaded but not attached to reel ${reel.id}; it was updated concurrently.`)
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  }

  console.log(`Backfill complete: ${generated} generated, ${skipped} skipped.`)
}

async function main() {
  try {
    await run()
  } catch (error) {
    console.error('Reel thumbnail backfill failed.', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

void main()
