import { describe, expect, it } from 'vitest'
import { buildUploadPath, isValidUploadPath, uploadContentTypeFromPath, UPLOAD_CONFIG } from '@/lib/upload-config'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const UPLOAD_ID = '22222222-2222-4222-8222-222222222222'

 describe('shared upload path configuration', () => {
  it('builds and validates paths from the configured kind, authenticated owner, and MIME type', () => {
    const pathname = buildUploadPath('reel', USER_ID, UPLOAD_ID, 'video/mp4')

    expect(pathname).toBe(`reels/${USER_ID}/${UPLOAD_ID}.mp4`)
    expect(isValidUploadPath(pathname, 'reel', USER_ID)).toBe(true)
    expect(isValidUploadPath(pathname, 'reel', '33333333-3333-4333-8333-333333333333')).toBe(false)
    expect(isValidUploadPath(pathname, 'daily', USER_ID)).toBe(false)
  })

  it('rejects extensions outside the kind allowlist and malformed identifiers', () => {
    expect(() => buildUploadPath('news', USER_ID, UPLOAD_ID, 'image/gif')).toThrow('unsupported_file_type')
    expect(() => buildUploadPath('news', 'not-a-user-id', UPLOAD_ID, 'image/png')).toThrow('invalid_upload_path')
    expect(isValidUploadPath(`news/${USER_ID}/${UPLOAD_ID}.gif`, 'news', USER_ID)).toBe(false)
  })

  it('accepts the reported upload paths and recovers their content types from allowed extensions', () => {
    const cases = [
      ['reel', 'reels/47d4a7dc-d380-4540-9983-2d6ad3a75477/846b99a0-4d53-42db-a7f2-cb2fecb83f3d.mp4', 'video/mp4'],
      ['story', 'daily/47d4a7dc-d380-4540-9983-2d6ad3a75477/162c3ce2-4062-42ae-a5ff-185921fc944e.jpg', 'image/jpeg'],
      ['news', 'news/47d4a7dc-d380-4540-9983-2d6ad3a75477/11ec57ec-f974-47c3-a542-c25a1f7f6af2.png', 'image/png'],
    ] as const

    for (const [kind, pathname, contentType] of cases) {
      expect(isValidUploadPath(pathname, kind, '47d4a7dc-d380-4540-9983-2d6ad3a75477')).toBe(true)
      expect(uploadContentTypeFromPath(pathname, kind)).toBe(contentType)
    }
  })

  it('keeps per-kind media limits explicit in the shared configuration', () => {
    expect(UPLOAD_CONFIG.reel.maximumSizeInBytes).toBe(40 * 1024 * 1024)
    expect(UPLOAD_CONFIG.reel.maximumDurationSeconds).toBe(60)
    expect('dailyLimit' in UPLOAD_CONFIG.reel).toBe(false)
    expect(UPLOAD_CONFIG.story.dailyLimit).toBe(20)
    expect(UPLOAD_CONFIG.daily.dailyLimit).toBe(10)
    expect(UPLOAD_CONFIG.avatar.maximumSizeInBytes).toBe(5 * 1024 * 1024)
    expect(UPLOAD_CONFIG.banner.maximumSizeInBytes).toBe(8 * 1024 * 1024)
  })

  it('allows common image types for direct messages and caps images at 10 MiB', () => {
    expect(UPLOAD_CONFIG.dm.allowedContentTypes).toEqual(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
    expect(UPLOAD_CONFIG.dm.maximumSizeInBytes).toBe(10 * 1024 * 1024)
    for (const [contentType, extension] of [['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp'], ['image/gif', 'gif']]) {
      expect(buildUploadPath('dm', USER_ID, UPLOAD_ID, contentType)).toBe(`chat-media/${USER_ID}/${UPLOAD_ID}.${extension}`)
    }
    expect(() => buildUploadPath('dm', USER_ID, UPLOAD_ID, 'image/svg+xml')).toThrow('unsupported_file_type')
  })
})
