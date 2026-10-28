export const UPLOAD_CONFIG = {
  reel: {
    folder: 'reels',
    allowedContentTypes: ['video/mp4', 'video/webm'],
    maximumSizeInBytes: 40 * 1024 * 1024,
    maximumDurationSeconds: 60,
  },
  reelThumbnail: {
    folder: 'reel-thumbnails',
    allowedContentTypes: ['image/webp'],
    maximumSizeInBytes: 250 * 1024,
  },
  story: {
    folder: 'daily',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm'],
    maximumSizeInBytes: 40 * 1024 * 1024,
    maximumDurationSeconds: 60,
    dailyLimit: 20,
  },
  daily: {
    folder: 'daily',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maximumSizeInBytes: 10 * 1024 * 1024,
    dailyLimit: 10,
  },
  news: {
    folder: 'news',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maximumSizeInBytes: 10 * 1024 * 1024,
    dailyLimit: 10,
  },
  avatar: {
    folder: 'profile',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maximumSizeInBytes: 5 * 1024 * 1024,
  },
  banner: {
    folder: 'profile',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maximumSizeInBytes: 8 * 1024 * 1024,
  },
  dm: {
    folder: 'chat-media',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maximumSizeInBytes: 10 * 1024 * 1024,
    dailyLimit: 30,
  },
  group: {
    folder: 'chat-media',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maximumSizeInBytes: 5 * 1024 * 1024,
    dailyLimit: 30,
  },
} as const

export type UploadKind = keyof typeof UPLOAD_CONFIG

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'

export function uploadPathPrefix(kind: UploadKind, userId: string) {
  return `${UPLOAD_CONFIG[kind].folder}/${userId}/`
}

export function buildUploadPath(kind: UploadKind, userId: string, uploadId: string, contentType: string) {
  const config = UPLOAD_CONFIG[kind]
  const extension = MIME_EXTENSION[contentType]
  if (!extension || !config.allowedContentTypes.includes(contentType as never)) throw new Error('unsupported_file_type')
  if (!new RegExp(`^${UUID_PATTERN}$`, 'i').test(userId) || !new RegExp(`^${UUID_PATTERN}$`, 'i').test(uploadId)) {
    throw new Error('invalid_upload_path')
  }
  return `${config.folder}/${userId}/${uploadId}.${extension}`
}

export function isValidUploadPath(pathname: string, kind: UploadKind, userId?: string) {
  const config = UPLOAD_CONFIG[kind]
  const extensions = config.allowedContentTypes.map((contentType) => MIME_EXTENSION[contentType]).filter(Boolean)
  if (userId && !new RegExp(`^${UUID_PATTERN}$`, 'i').test(userId)) return false
  const ownerPattern = userId ?? UUID_PATTERN
  const pathPattern = new RegExp(`^${config.folder}/${ownerPattern}/${UUID_PATTERN}\\.(${extensions.join('|')})$`, 'i')
  return pathPattern.test(pathname)
}

export function uploadContentTypeFromPath(pathname: string, kind: UploadKind) {
  const extension = pathname.slice(pathname.lastIndexOf('.') + 1).toLowerCase()
  return UPLOAD_CONFIG[kind].allowedContentTypes.find((contentType) => MIME_EXTENSION[contentType] === extension) ?? null
}

export function isUploadKind(value: string | null): value is UploadKind {
  return value !== null && Object.hasOwn(UPLOAD_CONFIG, value)
}

export function resolveUploadKind(value: string | null, allowedKinds: readonly UploadKind[], fallback: UploadKind): UploadKind | null {
  if (value === null) return fallback
  return allowedKinds.includes(value as UploadKind) ? value as UploadKind : null
}
