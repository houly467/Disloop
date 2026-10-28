import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFailurePayload, safeApiFailureReason } from '@/lib/api-errors'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('API failure diagnostics', () => {
  it('logs exception details but returns only a safe database reason', () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = Object.assign(new Error('private relation detail'), { code: '42P01' })

    expect(apiFailurePayload('groups_failed', error, 'GET /api/groups')).toEqual({
      error: 'groups_failed',
      reason: 'missing_table',
    })
    expect(logger).toHaveBeenCalledWith('[GET /api/groups]', expect.objectContaining({
      message: 'private relation detail',
      code: '42P01',
      stack: expect.any(String),
    }))
  })

  it('uses a generic reason for unrecognized exception codes', () => {
    expect(safeApiFailureReason(Object.assign(new Error('internal detail'), { code: 'XX000' })))
      .toBe('query_error')
  })

  it('classifies denied and unavailable Blob fetches as storage failures', () => {
    expect(safeApiFailureReason(new Error('Vercel Blob: Failed to fetch blob: 403 Forbidden')))
      .toBe('storage_access_denied')
    expect(safeApiFailureReason(new Error('Vercel Blob: Failed to fetch blob: 503 Service Unavailable')))
      .toBe('storage_unavailable')
  })
})
