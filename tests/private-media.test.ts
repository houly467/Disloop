import { describe, expect, it } from 'vitest'
import { getPrivateMediaPathname, isPrivateMediaUrlForUser, privateMediaUrl } from '@/lib/private-media'

const USER_ID = 'f2eaf95c-1346-4c01-b595-cfdd67599f60'
const FILE_ID = '7e2031c9-2f78-4b76-913e-59fcd0dbf2b5'

describe('private media URLs', () => {
  it('creates canonical same-origin URLs for valid upload paths', () => {
    const pathname = `daily/${USER_ID}/${FILE_ID}.webp`
    const url = privateMediaUrl(pathname)

    expect(url).toBe(`/api/media?pathname=${encodeURIComponent(pathname)}`)
    expect(getPrivateMediaPathname(url)).toBe(pathname)
    expect(isPrivateMediaUrlForUser(url, 'daily', USER_ID)).toBe(true)
  })

  it('accepts profile image paths only for the owning profile folder', () => {
    const url = privateMediaUrl(`profile/${USER_ID}/${FILE_ID}.webp`)

    expect(isPrivateMediaUrlForUser(url, 'profile', USER_ID)).toBe(true)
    expect(isPrivateMediaUrlForUser(url, 'profile', '7eb74d5f-66e9-4e19-baa5-f893a1b84e50')).toBe(false)
  })

  it('rejects another owner, another folder, external URLs, and malformed paths', () => {
    const url = privateMediaUrl(`chat-media/${USER_ID}/${FILE_ID}.png`)

    expect(isPrivateMediaUrlForUser(url, 'chat-media', '7eb74d5f-66e9-4e19-baa5-f893a1b84e50')).toBe(false)
    expect(isPrivateMediaUrlForUser(url, 'daily', USER_ID)).toBe(false)
    expect(getPrivateMediaPathname(`https://example.com${url}`)).toBeNull()
    expect(getPrivateMediaPathname('/api/media?pathname=../../secrets')).toBeNull()
    expect(getPrivateMediaPathname(`${url}&extra=1`)).toBeNull()
  })
})
