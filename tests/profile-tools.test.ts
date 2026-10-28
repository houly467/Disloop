import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProfileTools, StatDashboard, VerificationRequestStatus } from '@/components/profile-tools'

describe('profile tools layout', () => {
  it('places the verification counter below the textarea and starts with a disabled full-width submit button', () => {
    const markup = renderToStaticMarkup(createElement(ProfileTools, { locale: 'en' }))
    const textareaEnd = markup.indexOf('</textarea>')
    const counter = markup.indexOf('id="verification-reason-count"')
    const submit = markup.indexOf('verification-submit-button')
    const submitButtonStart = markup.lastIndexOf('<button', submit)
    const submitButtonEnd = markup.indexOf('>', submit)

    expect(textareaEnd).toBeGreaterThanOrEqual(0)
    expect(counter).toBeGreaterThan(textareaEnd)
    expect(submit).toBeGreaterThan(counter)
    expect(markup.slice(submitButtonStart, submitButtonEnd)).toContain('disabled=""')
    expect(markup.slice(submitButtonStart - 200, submitButtonEnd)).toContain('verification-form-footer')
  })

  it('renders a compact open-request status without another request action', () => {
    const markup = renderToStaticMarkup(createElement(VerificationRequestStatus, {
      request: { id: 'request-1', reason: 'Reason with enough detail', status: 'open', createdAt: '2026-10-28T00:00:00.000Z' },
      locale: 'en',
    }))
    expect(markup).toContain('Open')
    expect(markup).toContain('We will review your request soon.')
    expect(markup).not.toContain('Request again')
    expect(markup).toContain('<time')
  })

  it('shows the verified state and offers reopening the form for rejected requests', () => {
    const approvedMarkup = renderToStaticMarkup(createElement(VerificationRequestStatus, {
      request: { id: 'request-2', reason: 'Reason', status: 'approved', createdAt: '2026-10-28T00:00:00.000Z' },
      locale: 'en',
    }))
    const rejectedMarkup = renderToStaticMarkup(createElement(VerificationRequestStatus, {
      request: { id: 'request-3', reason: 'Reason', status: 'rejected', createdAt: '2026-10-28T00:00:00.000Z' },
      locale: 'en',
      onRequestAgain: () => undefined,
    }))
    expect(approvedMarkup).toContain('Your account is verified.')
    expect(approvedMarkup).not.toContain('Request again')
    expect(rejectedMarkup).toContain('Your request was rejected. You can submit a new request.')
    expect(rejectedMarkup).toContain('Request again')
  })

  it('keeps full creator-stat labels and provides a full-width stats action', () => {
    const metrics = { profileViews: 12, reelViews: 8, likes: 6, reposts: 3, followerGrowth: 2 }
    const markup = renderToStaticMarkup(createElement(StatDashboard, {
      locale: 'en',
      period: '7d',
      compact: true,
      data: { last7Days: metrics, previous7Days: metrics, last30Days: metrics, previous30Days: metrics },
    }))
    expect(markup).toContain('Profile views')
    expect(markup).toContain('Reel views')
    expect(markup).toContain('Likes')
    expect(markup).toContain('Reposts')
    expect(markup).toContain('Follower growth')
    expect(markup).toContain('creator-stat-tiles-compact')

    const toolsMarkup = renderToStaticMarkup(createElement(ProfileTools, { locale: 'en' }))
    expect(toolsMarkup).toContain('creator-open-stats-button')
  })
})
