import { BlobNotFoundError, head } from '@vercel/blob'
import { getPrivateMediaPathname, isPublicBlobUrl } from '@/lib/private-media'
import { redis } from '@/lib/upstash'
import { validateUploadReservation } from '@/lib/upload-reservation'
import { isValidUploadPath } from '@/lib/upload-config'

export async function reelMediaExists(videoUrl: string) {
  const privatePathname = getPrivateMediaPathname(videoUrl)
  const blobReference = privatePathname ?? (isPublicBlobUrl(videoUrl) ? videoUrl : null)
  if (!blobReference) return false

  try {
    await head(blobReference)
    return true
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false
    throw error
  }
}

export async function isReelUploadConfirmed(videoUrl: string, userId: string) {
  const pathname = getPrivateMediaPathname(videoUrl)
  if (pathname) {
    if (!pathname.startsWith(`reels/${userId}/`) || !redis) return false
    const completion = await redis.get<unknown>(`disloop:upload:complete:${pathname}`)
    if (!validateUploadReservation(completion, {
      userId,
      kind: 'reel',
      pathname,
      ignoreExpiry: true,
    }).ok) return false
  }

  return reelMediaExists(videoUrl)
}

export async function isReelThumbnailConfirmed(pathname: string, userId: string) {
  if (!isValidUploadPath(pathname, 'reelThumbnail', userId) || !redis) return false
  const completion = await redis.get<unknown>(`disloop:upload:complete:${pathname}`)
  if (!validateUploadReservation(completion, {
    userId,
    kind: 'reelThumbnail',
    pathname,
    ignoreExpiry: true,
  }).ok) return false
  try {
    await head(pathname)
    return true
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false
    throw error
  }
}

export async function filterReelsWithExistingMedia<T extends { videoUrl: string }>(reels: T[]) {
  const availability = await Promise.all(reels.map((reel) => reelMediaExists(reel.videoUrl)))
  return reels.filter((_, index) => availability[index])
}
