'use client'

import { upload } from '@vercel/blob/client'
import { isValidUploadPath, type UploadKind, UPLOAD_CONFIG } from '@/lib/upload-config'
import { privateMediaUrl } from '@/lib/private-media'

export async function getVideoDurationSeconds(file: File): Promise<number> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => {
        const duration = video.duration
        video.src = ''
        if (!Number.isFinite(duration) || duration <= 0) reject(new Error('invalid_input'))
        else resolve(duration)
      }
      video.onerror = () => reject(new Error('invalid_input'))
      video.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function uploadEndpoint(endpoint: string, kind: UploadKind) {
  const url = new URL(endpoint, window.location.origin)
  url.searchParams.set('kind', kind)
  return `${url.pathname}${url.search}`
}

export async function requestUploadPath(endpoint: string, file: File, kind: UploadKind, durationSeconds?: number) {
  const config = UPLOAD_CONFIG[kind]
  if (!config.allowedContentTypes.includes(file.type as never)) throw new Error('unsupported_file_type')
  if (file.size <= 0 || file.size > config.maximumSizeInBytes) throw new Error('file_too_large')
  if ('maximumDurationSeconds' in config) {
    if (durationSeconds === undefined || durationSeconds > config.maximumDurationSeconds) throw new Error('invalid_input')
  } else if (durationSeconds !== undefined) {
    throw new Error('invalid_input')
  }

  const response = await fetch(uploadEndpoint(endpoint, kind), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'blob.prepare-upload', contentType: file.type, sizeBytes: file.size, ...(durationSeconds !== undefined ? { durationSeconds } : {}) }),
  })
  const result = await response.json() as { pathname?: unknown; error?: string; reason?: string; retryAfter?: unknown }
  if (!response.ok || typeof result.pathname !== 'string' || !isValidUploadPath(result.pathname, kind)) {
    const reason = result.reason ?? result.error ?? 'upload_path_failed'
    const retryAfter = Number(result.retryAfter)
    console.error('[upload] token request failed', { status: response.status, reason, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null, receivedPathname: result.pathname ?? null })
    if (response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0) throw new Error(`rate_limited:${Math.ceil(retryAfter)}`)
    throw new Error(reason)
  }
  return result.pathname
}

export async function uploadMedia({ endpoint, file, kind, durationSeconds, onProgress, multipart }: {
  endpoint: string
  file: File
  kind: UploadKind
  durationSeconds?: number
  onProgress?: (percentage: number) => void
  multipart?: boolean
}) {
  const pathname = await requestUploadPath(endpoint, file, kind, durationSeconds)
  try {
    await upload(pathname, file, {
      access: 'private',
      handleUploadUrl: uploadEndpoint(endpoint, kind),
      contentType: file.type,
      multipart,
      onUploadProgress: ({ percentage }) => onProgress?.(Math.round(percentage)),
    })
    return { pathname, url: privateMediaUrl(pathname) }
  } catch (error) {
    const value = error && typeof error === 'object' ? error as { message?: unknown; status?: unknown; statusCode?: unknown; retryAfter?: unknown } : null
    const reason = typeof value?.message === 'string' ? value.message : 'upload_failed'
    const status = value?.status ?? value?.statusCode ?? null
    const retryAfter = Number(value?.retryAfter)
    console.error('[upload] upload failed', { status, reason, retryAfter: Number.isFinite(retryAfter) ? retryAfter : null, kind, pathname })
    if (status === 429) throw new Error(`rate_limited:${Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 300}`)
    throw new Error(reason)
  }
}
