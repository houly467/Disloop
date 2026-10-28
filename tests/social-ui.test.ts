import { describe, expect, it } from 'vitest'
import { formatSocialCount } from '@/lib/social-ui'
import { countWords } from '@/lib/tags'
import { buildUploadPath, isValidUploadPath, UPLOAD_CONFIG } from '@/lib/upload-config'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const UPLOAD_ID = '22222222-2222-4222-8222-222222222222'

describe('formatSocialCount', () => {
  it('keeps small counts exact', () => {
    expect(formatSocialCount(12)).toBe('12')
    expect(formatSocialCount(0)).toBe('0')
  })

  describe('social media UI rules', () => {
    it('counts multilingual caption words and enforces the 100-word boundary', () => {
      expect(countWords('hello, @friend — welcome! مرحبًا 123')).toBe(5)
      const hundredWords = Array.from({ length: 100 }, (_, index) => `word${index}`).join(' ')
      expect(countWords(hundredWords)).toBe(100)
      expect(countWords(`${hundredWords} extra`)).toBe(101)
    })

    it('allows short video uploads for stories without enabling them for daily posts', () => {
      const storyPath = buildUploadPath('story', USER_ID, UPLOAD_ID, 'video/mp4')

      expect(UPLOAD_CONFIG.story.allowedContentTypes).toContain('video/mp4')
      expect(UPLOAD_CONFIG.story.maximumDurationSeconds).toBe(60)
      expect(isValidUploadPath(storyPath, 'story', USER_ID)).toBe(true)
      expect(isValidUploadPath(storyPath, 'daily', USER_ID)).toBe(false)
    })
  })

  it('formats large counts compactly', () => {
    expect(formatSocialCount(1200)).toBe('1.2K')
    expect(formatSocialCount(3_400_000)).toBe('3.4M')
  })
})
