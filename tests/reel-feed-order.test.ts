import { describe, expect, it } from 'vitest'
import { shuffleReels } from '@/lib/reel-feed-order'

describe('shuffleReels', () => {
  it('returns a new array containing every reel once', () => {
    const reels = ['one', 'two', 'three', 'four']
    const shuffled = shuffleReels(reels, () => 0.5)

    expect(shuffled).not.toBe(reels)
    expect(shuffled).toHaveLength(reels.length)
    expect([...shuffled].sort()).toEqual([...reels].sort())
  })

  it('uses the supplied random source to create a different order', () => {
    expect(shuffleReels(['one', 'two', 'three'], () => 0)).toEqual(['two', 'three', 'one'])
  })
})
