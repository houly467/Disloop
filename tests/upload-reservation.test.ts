import { describe, expect, it } from 'vitest'
import { buildUploadPath } from '@/lib/upload-config'
import { createUploadReservation, validateUploadReservation } from '@/lib/upload-reservation'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333'
const PATHNAME = buildUploadPath('news', USER_ID, '22222222-2222-4222-8222-222222222222', 'image/png')
const NOW = 1_800_000_000_000

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    kind: 'news',
    pathname: PATHNAME,
    contentType: 'image/png',
    sizeBytes: 1024,
    expiresAt: NOW + 60_000,
    ...overrides,
  }
}

function validate(value: unknown, overrides: Record<string, unknown> = {}) {
  return validateUploadReservation(value, {
    userId: USER_ID,
    kind: 'news',
    pathname: PATHNAME,
    now: NOW,
    ...overrides,
  })
}

describe('upload reservation validation', () => {
  it('accepts both the decoded Redis object and its legacy JSON string representation', () => {
    expect(validate(reservation()).ok).toBe(true)
    expect(validate(JSON.stringify(reservation())).ok).toBe(true)
  })

  it('accepts active reservations written with the prior three-field shape', () => {
    const legacyReservation = { userId: USER_ID, kind: 'news', contentType: 'image/png' }
    expect(validate(legacyReservation).ok).toBe(true)
    expect(validate(JSON.stringify(legacyReservation)).ok).toBe(true)
  })

  it('uses the same complete shape for prepared and recovered reservations', () => {
    const prepared = createUploadReservation({
      userId: USER_ID,
      kind: 'news',
      pathname: PATHNAME,
      contentType: 'image/png',
      sizeBytes: 1024,
      now: NOW,
    })
    const recovered = createUploadReservation({
      userId: USER_ID,
      kind: 'news',
      pathname: PATHNAME,
      contentType: 'image/png',
      sizeBytes: null,
      now: NOW,
    })

    expect(Object.keys(recovered).sort()).toEqual(Object.keys(prepared).sort())
    expect(recovered).toMatchObject({
      userId: USER_ID,
      kind: 'news',
      pathname: PATHNAME,
      contentType: 'image/png',
      sizeBytes: null,
      expiresAt: NOW + 15 * 60 * 1000,
    })
    expect(validate(recovered).ok).toBe(true)
  })

  const failureCases: Array<[string, unknown, string]> = [
    ['missing', null, 'reservation_not_found'],
    ['invalid JSON', '{', 'reservation_invalid_json'],
    ['invalid shape', { ...reservation(), unexpected: true }, 'reservation_invalid_shape'],
    ['expired', reservation({ expiresAt: NOW }), 'expired'],
    ['wrong user', reservation({ userId: OTHER_USER_ID }), 'user_mismatch'],
    ['wrong kind', reservation({ kind: 'daily' }), 'kind_mismatch'],
    ['wrong path', reservation({ pathname: 'news/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg' }), 'pathname_mismatch'],
    ['unsupported content type', reservation({ contentType: 'image/gif' }), 'content_type_mismatch'],
    ['extension mismatch', reservation({ contentType: 'image/jpeg' }), 'extension_mismatch'],
    ['oversized reservation', reservation({ sizeBytes: 10 * 1024 * 1024 + 1 }), 'size_exceeded'],
  ]

  it.each(failureCases)('returns %s reason', (_label, value, reason) => {
    const result = validate(value)
    expect(result).toEqual({ ok: false, reason })
  })

  it('returns content_type_mismatch when the uploaded blob type differs', () => {
    expect(validate(reservation(), { actualContentType: 'image/jpeg' })).toEqual({ ok: false, reason: 'content_type_mismatch' })
  })

  it('returns size_mismatch when the uploaded blob size differs or exceeds the limit', () => {
    expect(validate(reservation(), { actualSizeBytes: 2048 })).toEqual({ ok: false, reason: 'size_mismatch' })
    expect(validate(reservation({ sizeBytes: null }), { actualSizeBytes: 10 * 1024 * 1024 + 1 })).toEqual({ ok: false, reason: 'size_mismatch' })
  })

  it('enforces the direct-message 10 MiB reservation limit', () => {
    const dmPath = buildUploadPath('dm', USER_ID, '22222222-2222-4222-8222-222222222222', 'image/png')
    const dmReservation = createUploadReservation({
      userId: USER_ID,
      kind: 'dm',
      pathname: dmPath,
      contentType: 'image/png',
      sizeBytes: 10 * 1024 * 1024,
      now: NOW,
    })
    const validateDm = (value: unknown) => validateUploadReservation(value, {
      userId: USER_ID,
      kind: 'dm',
      pathname: dmPath,
      now: NOW,
    })

    expect(validateDm(dmReservation).ok).toBe(true)
    expect(validateDm({ ...dmReservation, sizeBytes: 10 * 1024 * 1024 + 1 })).toEqual({ ok: false, reason: 'size_exceeded' })
  })
})
