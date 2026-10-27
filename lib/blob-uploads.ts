import { randomUUID } from 'node:crypto'
import { del, head } from '@vercel/blob'
import { handleUpload } from '@vercel/blob/client'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { validateUploadedMedia } from '@/lib/media-validation'
import { rateLimitResponse } from '@/lib/rate-limit'
import { redis } from '@/lib/upstash'
import { buildUploadPath, isValidUploadPath, type UploadKind, UPLOAD_CONFIG, uploadContentTypeFromPath } from '@/lib/upload-config'
import { createUploadReservation, UPLOAD_RESERVATION_TTL_SECONDS, validateUploadReservation, type UploadReservation } from '@/lib/upload-reservation'

const uploadRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('blob.prepare-upload'), contentType: z.string().min(1).max(128), sizeBytes: z.number().int().positive(), durationSeconds: z.number().finite().nonnegative().optional() }).strict(),
  z.object({
    type: z.literal('blob.generate-client-token'),
    payload: z.object({
      pathname: z.string().min(1).max(256),
      clientPayload: z.string().max(1024).nullable().optional(),
      multipart: z.boolean(),
    }).passthrough(),
  }).passthrough(),
  z.object({ type: z.literal('blob.upload-completed'), payload: z.unknown() }).passthrough(),
])

const signedPayloadSchema = z.object({ userId: z.uuid(), pathname: z.string().min(1).max(256), kind: z.enum(Object.keys(UPLOAD_CONFIG) as [UploadKind, ...UploadKind[]]) }).strict()
type CompletedUploadBlob = { pathname: string; url: string }

class UploadLimitError extends Error {
  constructor(readonly response: NextResponse) {
    super('rate_limited')
  }
}

class UploadPathError extends Error {
  constructor(readonly pathname: string, readonly expectedPrefix: string) {
    super('invalid_upload_path')
  }
}

function expectedPrefix(kind: UploadKind, userId: string) {
  return `${UPLOAD_CONFIG[kind].folder}/${userId}/`
}

function invalidPathResponse(kind: UploadKind, userId: string, pathname: string) {
  const prefix = expectedPrefix(kind, userId)
  console.error('[uploads] invalid_upload_path', { kind, expected_prefix: prefix, received_pathname: pathname })
  return NextResponse.json({ error: 'invalid_upload_path', expected_prefix: prefix, received_pathname: pathname }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
}

async function validateAndConsumeReservation({ blob, userId, kind }: {
  blob: CompletedUploadBlob
  userId: string
  kind: UploadKind
}) {
  const config = UPLOAD_CONFIG[kind]
  const redisClient = redis
  const reservationKey = `disloop:upload:${blob.pathname}`
  const completionKey = `disloop:upload:complete:${blob.pathname}`
  const lockKey = `disloop:upload:complete-lock:${blob.pathname}`

  try {
    if (!redisClient) throw new Error('upload_reservation_unavailable')
    if (!isValidUploadPath(blob.pathname, kind, userId)) throw new UploadPathError(blob.pathname, expectedPrefix(kind, userId))

    const completedReservation = await redisClient.get<unknown>(completionKey)
    if (validateUploadReservation(completedReservation, { userId, kind, pathname: blob.pathname, ignoreExpiry: true }).ok) return

    const metadata = await head(blob.url)
    const rawReservation = await redisClient.get<unknown>(reservationKey)
    const validation = validateUploadReservation(rawReservation, {
      userId,
      kind,
      pathname: blob.pathname,
      actualContentType: metadata.contentType,
      actualSizeBytes: metadata.size,
    })
    if (!validation.ok) {
      console.error('[uploads] completion_reservation_invalid', { kind, reason: validation.reason })
      throw new Error(validation.reason)
    }
    const reservation = validation.reservation

    const lockResult = await redisClient.set(lockKey, '1', { nx: true, ex: 120 })
    if (lockResult !== 'OK') {
      const alreadyCompleted = await redisClient.get<unknown>(completionKey)
      if (validateUploadReservation(alreadyCompleted, { userId, kind, pathname: blob.pathname, ignoreExpiry: true }).ok) return
      throw new Error('upload_completion_in_progress')
    }

    if (metadata.pathname !== blob.pathname
      || metadata.contentType !== reservation.contentType
      || !config.allowedContentTypes.includes(metadata.contentType as never)
      || metadata.size <= 0
      || metadata.size > config.maximumSizeInBytes) {
      throw new Error(metadata.size > config.maximumSizeInBytes ? 'file_too_large' : 'invalid_upload_metadata')
    }

    await validateUploadedMedia({
      pathname: blob.pathname,
      contentType: reservation.contentType,
      maximumSizeInBytes: config.maximumSizeInBytes,
      maximumDurationSeconds: 'maximumDurationSeconds' in config ? config.maximumDurationSeconds : undefined,
    })

    if ('dailyLimit' in config && config.dailyLimit) {
      const quotaResponse = await rateLimitResponse(`upload-completed:${kind}:${userId}`, config.dailyLimit, 86_400)
      if (quotaResponse) throw new UploadLimitError(quotaResponse)
    }

    await redisClient.set(completionKey, reservation, { ex: 86_400 })
    await redisClient.del(reservationKey)
  } catch (error) {
    if (redisClient) await redisClient.del(lockKey).catch(() => undefined)
    await del(blob.url).catch(() => undefined)
    throw error
  } finally {
    if (redisClient) await redisClient.del(lockKey).catch(() => undefined)
  }
}

export async function buildUploadToken({ request, body, userId, kind }: {
  request: NextRequest
  body: unknown
  userId: string | null
  kind: UploadKind
}) {
  const config = UPLOAD_CONFIG[kind]
  const parsed = uploadRequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', reason: 'invalid_input' }, { status: 400 })
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[uploads] storage_unavailable: BLOB_READ_WRITE_TOKEN is not configured')
    return NextResponse.json({ error: 'storage_unavailable', reason: 'storage_unavailable' }, { status: 503 })
  }

  if (parsed.data.type === 'blob.upload-completed') {
    try {
      const result = await handleUpload({
        request,
        body: body as Parameters<typeof handleUpload>[0]['body'],
        onBeforeGenerateToken: async () => { throw new Error('unexpected_token_request') },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          let tokenValue: unknown = null
          try { tokenValue = JSON.parse(tokenPayload ?? 'null') } catch { /* invalid token payload */ }
          const payload = signedPayloadSchema.safeParse(tokenValue)
          if (!payload.success || payload.data.kind !== kind || payload.data.pathname !== blob.pathname || !isValidUploadPath(blob.pathname, kind, payload.data.userId)) {
            throw new UploadPathError(blob.pathname, expectedPrefix(kind, payload.success ? payload.data.userId : 'unknown'))
          }
          await validateAndConsumeReservation({ blob, userId: payload.data.userId, kind })
        },
      })
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      if (error instanceof UploadLimitError) return error.response
      if (error instanceof UploadPathError) return invalidPathResponse(kind, error.expectedPrefix.split('/')[1] ?? 'unknown', error.pathname)
      console.error('[uploads] upload_callback_failed', error)
      return NextResponse.json({ error: 'upload_failed', reason: error instanceof Error ? error.message : 'upload_failed' }, { status: 400 })
    }
  }

  if (!userId || !z.uuid().safeParse(userId).success) return NextResponse.json({ error: 'not_logged_in', reason: 'not_logged_in' }, { status: 401 })

  if (parsed.data.type === 'blob.prepare-upload') {
    if (!config.allowedContentTypes.includes(parsed.data.contentType as never)) return NextResponse.json({ error: 'unsupported_file_type', reason: 'unsupported_file_type' }, { status: 400 })
    if (parsed.data.sizeBytes > config.maximumSizeInBytes) return NextResponse.json({ error: 'file_too_large', reason: 'file_too_large' }, { status: 400 })
    const maxDuration = 'maximumDurationSeconds' in config ? config.maximumDurationSeconds : undefined
    if (maxDuration !== undefined
      ? parsed.data.durationSeconds === undefined || parsed.data.durationSeconds > maxDuration
      : parsed.data.durationSeconds !== undefined) {
      return NextResponse.json({ error: 'invalid_input', reason: 'invalid_input' }, { status: 400 })
    }
    if (!redis) return NextResponse.json({ error: 'upload_unavailable', reason: 'upload_unavailable' }, { status: 503 })

    const tokenLimit = await rateLimitResponse(`upload-token:${userId}`, 30, 600)
    if (tokenLimit) return tokenLimit

    const pathname = buildUploadPath(kind, userId, randomUUID(), parsed.data.contentType)
    const reservation = createUploadReservation({
      userId,
      kind,
      pathname,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.sizeBytes,
    })
    try {
      await redis.set(`disloop:upload:${pathname}`, reservation, { ex: UPLOAD_RESERVATION_TTL_SECONDS })
    } catch (error) {
      console.error('[uploads] reservation_write_failed', error)
      return NextResponse.json({ error: 'upload_unavailable', reason: 'upload_unavailable' }, { status: 503 })
    }
    return NextResponse.json({ pathname }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const pathname = parsed.data.payload.pathname
  if (!isValidUploadPath(pathname, kind, userId)) return invalidPathResponse(kind, userId, pathname)
  if (!redis) return NextResponse.json({ error: 'upload_unavailable', reason: 'upload_unavailable' }, { status: 503 })

  try {
    const reservationKey = `disloop:upload:${pathname}`
    let rawReservation = await redis.get<unknown>(reservationKey)
    let validation = validateUploadReservation(rawReservation, { userId, kind, pathname })
    if (!validation.ok && validation.reason === 'reservation_not_found') {
      const contentType = uploadContentTypeFromPath(pathname, kind)
      if (!contentType) return invalidPathResponse(kind, userId, pathname)

      const recoveredReservation = createUploadReservation({ userId, kind, pathname, contentType, sizeBytes: null })
      const created = await redis.set(reservationKey, recoveredReservation, { nx: true, ex: UPLOAD_RESERVATION_TTL_SECONDS })
      rawReservation = created === 'OK' ? recoveredReservation : await redis.get<unknown>(reservationKey)
      validation = validateUploadReservation(rawReservation, { userId, kind, pathname })
      if (created === 'OK') {
        console.warn('[uploads] missing_reservation_recovered', { kind, userId, pathname })
      }
    }

    if (!validation.ok) {
      console.error('[uploads] upload_reservation_invalid', { kind, reason: validation.reason })
      return NextResponse.json({ error: 'upload_reservation_invalid', reason: validation.reason }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
    }
    const reservation: UploadReservation = validation.reservation

    const tokenLimit = await rateLimitResponse(`upload-token:${userId}`, 30, 600)
    if (tokenLimit) return tokenLimit

    const result = await handleUpload({
      request,
      body: body as Parameters<typeof handleUpload>[0]['body'],
      onBeforeGenerateToken: async (requestedPath) => {
        if (requestedPath !== pathname || !isValidUploadPath(requestedPath, kind, userId)) throw new UploadPathError(requestedPath, expectedPrefix(kind, userId))
        return {
          allowedContentTypes: [...config.allowedContentTypes],
          maximumSizeInBytes: config.maximumSizeInBytes,
          validUntil: Date.now() + 10 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ userId, pathname, kind }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let tokenValue: unknown = null
        try { tokenValue = JSON.parse(tokenPayload ?? 'null') } catch { /* invalid token payload */ }
        const payload = signedPayloadSchema.safeParse(tokenValue)
        if (!payload.success || payload.data.userId !== userId || payload.data.kind !== kind || payload.data.pathname !== blob.pathname) {
          throw new UploadPathError(blob.pathname, expectedPrefix(kind, userId))
        }
        await validateAndConsumeReservation({ blob, userId, kind })
      },
    })
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof UploadLimitError) return error.response
    if (error instanceof UploadPathError) return invalidPathResponse(kind, userId, error.pathname)
    console.error('[uploads] upload_failed', error)
    return NextResponse.json({ error: 'upload_unavailable', reason: 'upload_unavailable' }, { status: 503 })
  }
}

export function isUploadCompletion(body: unknown) {
  return Boolean(body && typeof body === 'object' && 'type' in body && body.type === 'blob.upload-completed')
}
