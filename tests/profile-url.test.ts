import { describe, expect, it } from 'vitest'
import { getProfileUrl } from '@/lib/profile-url'

describe('profile URLs', () => {
  it('creates a short URL from the current username', () => {
    expect(getProfileUrl('https://disloop.me', '24112829-b56d-482c-af0b-989dcbbde661', 'll'))
      .toBe('https://disloop.me/u/ll')
  })

  it('falls back to the stable ID URL when a username is missing', () => {
    const userId = '24112829-b56d-482c-af0b-989dcbbde661'
    expect(getProfileUrl('https://disloop.me', userId, null))
      .toBe(`https://disloop.me/profile/${userId}`)
    expect(getProfileUrl('https://disloop.me', userId, '  '))
      .toBe(`https://disloop.me/profile/${userId}`)
  })
})
