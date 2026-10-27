import { describe, expect, it } from 'vitest'
import { formatSocialCount } from '@/lib/social-ui'

describe('formatSocialCount', () => {
  it('keeps small counts exact', () => {
    expect(formatSocialCount(12)).toBe('12')
    expect(formatSocialCount(0)).toBe('0')
  })

  it('formats large counts compactly', () => {
    expect(formatSocialCount(1200)).toBe('1.2K')
    expect(formatSocialCount(3_400_000)).toBe('3.4M')
  })
})
