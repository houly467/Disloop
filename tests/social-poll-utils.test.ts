import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { calculatePollResults, normalizePollOptions } from '@/lib/social-poll-utils'
import { PollCard } from '@/components/social-poll'

describe('social poll helpers', () => {
  it('accepts two to four distinct, non-empty options', () => {
    expect(normalizePollOptions(['  One  ', 'Two\u0000'])).toEqual(['One', 'Two'])
    expect(normalizePollOptions(['One', 'one'])).toBeNull()
    expect(normalizePollOptions(['Only one'])).toBeNull()
    expect(normalizePollOptions(['A', 'B', 'C', 'D', 'E'])).toBeNull()
    expect(normalizePollOptions(['A', ' '.repeat(2)])).toBeNull()
    expect(normalizePollOptions(['A', 'B'.repeat(81)])).toBeNull()
  })

  it('calculates aggregate counts and percentages without exposing voter data', () => {
    const result = calculatePollResults(['Yes', 'No', 'Maybe'], [0, 0, 1])
    expect(result).toEqual({ totalVotes: 3, optionCounts: [2, 1, 0], percentages: [67, 33, 0] })
    expect(calculatePollResults(['Yes', 'No'], [])).toEqual({
      totalVotes: 0,
      optionCounts: [0, 0],
      percentages: [0, 0],
    })
    expect(result).not.toHaveProperty('voters')
    expect(result).not.toHaveProperty('userIds')
  })

  it('renders aggregate poll results accessibly', () => {
    const markup = renderToStaticMarkup(createElement(PollCard, {
      locale: 'en',
      onVote: () => undefined,
      poll: {
        id: 'poll',
        contentId: 'post',
        options: ['First choice', 'Second choice'],
        endsAt: null,
        totalVotes: 4,
        optionCounts: [3, 1],
        percentages: [75, 25],
        hasVoted: true,
        ended: false,
      },
    }))
    expect(markup).toContain('aria-label="Poll"')
    expect(markup).toContain('First choice')
    expect(markup).toContain('75%')
    expect(markup).toContain('4 votes')
  })
})
