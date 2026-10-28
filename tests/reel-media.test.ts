import { beforeEach, describe, expect, it, vi } from 'vitest'

const headMock = vi.hoisted(() => vi.fn())
const redisGetMock = vi.hoisted(() => vi.fn())

vi.mock('@vercel/blob', () => ({
  BlobNotFoundError: class BlobNotFoundError extends Error {},
  head: headMock,
}))

vi.mock('@/lib/upstash', () => ({
  redis: { get: redisGetMock },
}))

import { BlobNotFoundError } from '@vercel/blob'
import { privateMediaUrl } from '@/lib/private-media'
import { filterReelsWithExistingMedia, isReelUploadConfirmed, reelMediaExists } from '@/lib/reel-media'

const userId = 'bfdcb529-03ea-48a6-8a2d-82fbd5eb1afa'
const pathname = `reels/${userId}/608a527f-3db0-48b7-be2a-30082851b011.mp4`
const videoUrl = privateMediaUrl(pathname)

describe('reel media verification', () => {
  beforeEach(() => {
    headMock.mockReset()
    redisGetMock.mockReset()
  })

  it('accepts existing private media', async () => {
    headMock.mockResolvedValue({})

    await expect(reelMediaExists(videoUrl)).resolves.toBe(true)
    expect(headMock).toHaveBeenCalledWith(pathname)
  })

  it('treats a missing Blob object as unavailable media', async () => {
    headMock.mockRejectedValue(new BlobNotFoundError())

    await expect(reelMediaExists(videoUrl)).resolves.toBe(false)
  })

  it('does not confirm a private reel upload without its completion marker', async () => {
    redisGetMock.mockResolvedValue(null)

    await expect(isReelUploadConfirmed(videoUrl, userId)).resolves.toBe(false)
    expect(headMock).not.toHaveBeenCalled()
  })

  it('requires both a valid completion marker and an existing Blob object', async () => {
    redisGetMock.mockResolvedValue({
      userId,
      kind: 'reel',
      pathname,
      contentType: 'video/mp4',
      sizeBytes: 1024,
      expiresAt: Date.now() - 1000,
    })
    headMock.mockResolvedValue({})

    await expect(isReelUploadConfirmed(videoUrl, userId)).resolves.toBe(true)
    expect(headMock).toHaveBeenCalledWith(pathname)
  })

  it('filters missing reel media while preserving available reels', async () => {
    headMock.mockImplementation((reference: string) => {
      if (reference === pathname) return Promise.reject(new BlobNotFoundError())
      return Promise.resolve({})
    })

    await expect(filterReelsWithExistingMedia([
      { id: 'missing', videoUrl },
      { id: 'available', videoUrl: 'https://store.public.blob.vercel-storage.com/reels/clip.mp4' },
    ])).resolves.toEqual([
      { id: 'available', videoUrl: 'https://store.public.blob.vercel-storage.com/reels/clip.mp4' },
    ])
  })
})
