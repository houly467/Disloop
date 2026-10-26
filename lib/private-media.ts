const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PRIVATE_MEDIA_PATH_PATTERN = new RegExp(`^(?:daily|reels|chat-media|news|profile)/${UUID_PATTERN}/${UUID_PATTERN}\\.(?:jpg|png|webp|gif|mp4|webm)$`, 'i')

export type PrivateMediaFolder = 'daily' | 'reels' | 'chat-media' | 'news' | 'profile'

export function privateMediaUrl(pathname: string) {
  return `/api/media?pathname=${encodeURIComponent(pathname)}`
}

export function isPrivateMediaPath(pathname: string) {
  return PRIVATE_MEDIA_PATH_PATTERN.test(pathname)
}

export function getPrivateMediaPathname(value: string) {
  try {
    const url = new URL(value, 'https://media.disloop.invalid')
    if (url.origin !== 'https://media.disloop.invalid' || url.pathname !== '/api/media' || url.hash || url.searchParams.size !== 1) return null
    const pathnames = url.searchParams.getAll('pathname')
    return pathnames.length === 1 && isPrivateMediaPath(pathnames[0]) ? pathnames[0] : null
  } catch {
    return null
  }
}

export function isPrivateMediaUrlForUser(value: string, folder: PrivateMediaFolder, userId: string) {
  return getPrivateMediaPathname(value)?.startsWith(`${folder}/${userId}/`) ?? false
}

export function isPublicBlobUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com')
  } catch {
    return false
  }
}

export function isPublicBlobUrlForUser(value: string, folder: PrivateMediaFolder, userId: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.hostname.endsWith('.public.blob.vercel-storage.com')
      && url.pathname.startsWith(`/${folder}/${userId}/`)
  } catch {
    return false
  }
}
