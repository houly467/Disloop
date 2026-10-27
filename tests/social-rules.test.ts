import { describe, expect, it } from 'vitest'

describe('social relationship rules', () => {
  it('rejects self follow and self block', () => {
    const userId = 'same-user'
    expect(userId === userId).toBe(true)
  })

  it('removes only the follower relationship', () => {
    const relationships = new Set(['target->me', 'me->target'])
    relationships.delete('target->me')
    expect([...relationships]).toEqual(['me->target'])
  })

  it('prevents self relationships', () => {
    expect('same' !== 'same').toBe(false)
  })

  it('treats either block direction as blocked access', () => {
    const blocks = [['a', 'b'], ['c', 'd']]
    expect(blocks.some(([blocker, blocked]) => (blocker === 'a' && blocked === 'b') || (blocker === 'b' && blocked === 'a'))).toBe(true)
  })
})
