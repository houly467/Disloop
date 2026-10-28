import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UserName } from '@/components/user-name'
import { isNewAccount } from '@/lib/new-account'

describe('UserName', () => {
  it('renders the requested style and sanitized title alongside the user identity', () => {
    const markup = renderToStaticMarkup(
      <UserName userId="user-id" name="Avery" username="avery" isNewAccount nameStyle="rainbow" customTitle="Founder" locale="en" />,
    )
    expect(markup).toContain('user-name-rainbow')
    expect(markup).toContain('user-name-title')
    expect(markup).toContain('Founder')
    expect(markup).toContain('@avery')
    expect(markup).toContain('New account')
  })

  it('falls back to a plain name for unsupported style values', () => {
    const markup = renderToStaticMarkup(<UserName name="Avery" nameStyle="unknown" />)
    expect(markup).not.toContain('user-name-rainbow')
    expect(markup).not.toContain('user-name-gold')
    expect(markup).toContain('Avery')
  })

  it('uses the server-calculated flag instead of calculating age during rendering', () => {
    const newMarkup = renderToStaticMarkup(<UserName name="Avery" isNewAccount />)
    const existingMarkup = renderToStaticMarkup(<UserName name="Avery" isNewAccount={false} />)
    expect(newMarkup).toContain('New account')
    expect(existingMarkup).not.toContain('New account')
  })

  it('renders compact account names, metadata, and the new-account badge as separate rows', () => {
    const markup = renderToStaticMarkup(
      <UserName userId="user-id" name="Avery" username="avery" isNewAccount compact />,
    )
    expect(markup).toContain('user-name-wrap-compact')
    expect(markup).toContain('user-name-meta')
    expect(markup).toContain('@avery')
    expect(markup).toContain('New account')
    expect(markup.indexOf('user-name-meta')).toBeLessThan(markup.indexOf('New account'))
  })

  it('shows accounts younger than 72 hours and hides them at the exact boundary', () => {
    const now = Date.parse('2026-10-28T12:00:00Z')
    expect(isNewAccount(new Date(now - (71 * 60 + 59) * 60 * 1000), now)).toBe(true)
    expect(isNewAccount(new Date(now - 72 * 60 * 60 * 1000), now)).toBe(false)
  })

  it('hides the badge for missing, invalid, and future creation times', () => {
    expect(isNewAccount(null)).toBe(false)
    expect(isNewAccount(undefined)).toBe(false)
    expect(isNewAccount('not-a-date')).toBe(false)
    expect(isNewAccount('2026-10-29T00:00:00Z', Date.parse('2026-10-28T00:00:00Z'))).toBe(false)
  })
})
