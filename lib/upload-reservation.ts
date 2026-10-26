import { z } from 'zod'
import { isValidUploadPath, type UploadKind, UPLOAD_CONFIG, uploadContentTypeFromPath } from '@/lib/upload-config'

export const UPLOAD_RESERVATION_TTL_SECONDS = 15 * 60

const uploadReservationSchema = z.object({
  userId: z.uuid(),
  kind: z.enum(Object.keys(UPLOAD_CONFIG) as [UploadKind, ...UploadKind[]]),
  pathname: z.string().min(1).max(256),
  contentType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().nullable(),
  expiresAt: z.number().int().positive(),
}).strict()

const legacyReservationSchema = z.object({
  userId: z.uuid(),
  kind: z.enum(Object.keys(UPLOAD_CONFIG) as [UploadKind, ...UploadKind[]]),
  contentType: z.string().min(1).max(128),
}).strict()

export type UploadReservation = z.infer<typeof uploadReservationSchema>

type ReservationExpectation = {
  userId: string
  kind: UploadKind
  pathname: string
  now?: number
  ignoreExpiry?: boolean
  actualContentType?: string
  actualSizeBytes?: number
}

type ReservationValidation =
  | { ok: true; reservation: UploadReservation }
  | { ok: false; reason: string }

export function createUploadReservation({ userId, kind, pathname, contentType, sizeBytes, now = Date.now() }: {
  userId: string
  kind: UploadKind
  pathname: string
  contentType: string
  sizeBytes: number | null
  now?: number
}): UploadReservation {
  return {
    userId,
    kind,
    pathname,
    contentType,
    sizeBytes,
    expiresAt: now + UPLOAD_RESERVATION_TTL_SECONDS * 1000,
  }
}

function decodeReservation(value: unknown, expected: ReservationExpectation): { success: true; data: UploadReservation } | { success: false; reason: string } {
  if (value === null || value === undefined) return { success: false, reason: 'reservation_not_found' }

  let decoded = value
  if (typeof value === 'string') {
    try {
      decoded = JSON.parse(value)
    } catch {
      return { success: false, reason: 'reservation_invalid_json' }
    }
  }

  const parsed = uploadReservationSchema.safeParse(decoded)
  if (parsed.success) return { success: true, data: parsed.data }

  const legacy = legacyReservationSchema.safeParse(decoded)
  if (!legacy.success) return { success: false, reason: 'reservation_invalid_shape' }
  return {
    success: true,
    data: {
      ...legacy.data,
      pathname: expected.pathname,
      sizeBytes: null,
      expiresAt: (expected.now ?? Date.now()) + UPLOAD_RESERVATION_TTL_SECONDS * 1000,
    },
  }
}

export function validateUploadReservation(value: unknown, expected: ReservationExpectation): ReservationValidation {
  const decoded = decodeReservation(value, expected)
  if (!decoded.success) return { ok: false, reason: decoded.reason }

  const reservation = decoded.data
  const config = UPLOAD_CONFIG[expected.kind]
  if (!expected.ignoreExpiry && reservation.expiresAt <= (expected.now ?? Date.now())) return { ok: false, reason: 'expired' }
  if (reservation.userId !== expected.userId) return { ok: false, reason: 'user_mismatch' }
  if (reservation.kind !== expected.kind) return { ok: false, reason: 'kind_mismatch' }
  if (reservation.pathname !== expected.pathname) return { ok: false, reason: 'pathname_mismatch' }
  if (!config.allowedContentTypes.includes(reservation.contentType as never)) return { ok: false, reason: 'content_type_mismatch' }
  if (uploadContentTypeFromPath(reservation.pathname, reservation.kind) !== reservation.contentType) {
    return { ok: false, reason: 'extension_mismatch' }
  }
  if (!isValidUploadPath(reservation.pathname, reservation.kind, reservation.userId)) return { ok: false, reason: 'invalid_upload_path' }
  if (reservation.sizeBytes !== null && reservation.sizeBytes > config.maximumSizeInBytes) {
    return { ok: false, reason: 'size_exceeded' }
  }
  if (expected.actualSizeBytes !== undefined && reservation.sizeBytes !== null && reservation.sizeBytes !== expected.actualSizeBytes) {
    return { ok: false, reason: 'size_mismatch' }
  }
  if (expected.actualContentType !== undefined && reservation.contentType !== expected.actualContentType) {
    return { ok: false, reason: 'content_type_mismatch' }
  }
  if (expected.actualSizeBytes !== undefined
    && (expected.actualSizeBytes <= 0 || expected.actualSizeBytes > config.maximumSizeInBytes)) {
    return { ok: false, reason: 'size_mismatch' }
  }

  return { ok: true, reservation }
}
