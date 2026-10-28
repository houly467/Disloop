import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  execute: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock('@vercel/blob', () => ({ get: mocks.get }))
vi.mock('@/lib/db', () => ({ db: { execute: mocks.execute } }))
vi.mock('@/lib/session', () => ({ getCurrentUser: mocks.getCurrentUser }))

import { GET } from '@/app/api/media/route'

const mediaPaths = [
  ['profile image', 'profile/bfdcb529-03ea-48a6-8a2d-82fbd5eb1afa/6c4a42a9-41ef-452f-8cb5-e00063604589.jpg', 'image/jpeg'],
  ['Reels video', 'reels/bfdcb529-03ea-48a6-8a2d-82fbd5eb1afa/92204b9e-4468-47ed-8355-cef398c47f9f.mp4', 'video/mp4'],
] as const

describe('GET /api/media', () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockResolvedValue(null)
    mocks.execute.mockResolvedValue({ rows: [{ allowed: true }] })
    mocks.get.mockResolvedValue({
      statusCode: 200,
      blob: { contentType: 'image/jpeg', etag: '"media-etag"' },
      headers: new Headers({ 'accept-ranges': 'bytes', 'content-length': '1' }),
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]))
          controller.close()
        },
      }),
    })
  })

  afterEach(() => vi.clearAllMocks())

  it.each(mediaPaths)('authorizes and serves a %s from private storage', async (_label, pathname, contentType) => {
    mocks.get.mockResolvedValueOnce({
      statusCode: 200,
      blob: { contentType, etag: '"media-etag"' },
      headers: new Headers({ 'accept-ranges': 'bytes', 'content-length': '1' }),
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1]))
          controller.close()
        },
      }),
    })
    const request = new NextRequest(`https://disloop.me/api/media?pathname=${encodeURIComponent(pathname)}`)

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(contentType)
    expect(mocks.execute).toHaveBeenCalledOnce()
    expect(mocks.get).toHaveBeenCalledWith(pathname, { access: 'private' })
  })

  it('logs the actual Blob error and reports a storage-specific reason', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('Vercel Blob: Failed to fetch blob: 403 Forbidden')
    mocks.get.mockRejectedValueOnce(error)
    const request = new NextRequest(`https://disloop.me/api/media?pathname=${encodeURIComponent(mediaPaths[0][1])}`)

    const response = await GET(request)

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'media_unavailable',
      reason: 'storage_access_denied',
    })
    expect(logger).toHaveBeenCalledWith('[GET /api/media:blob_fetch]', expect.objectContaining({
      message: error.message,
      code: null,
      stack: expect.any(String),
    }))
  })
})
