import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UserName } from '@/components/user-name'

describe('UserName', () => {
  it('renders the requested style and sanitized title alongside the user identity', () => {
    const markup = renderToStaticMarkup(
      <UserName userId="user-id" name="Avery" username="avery" nameStyle="rainbow" customTitle="Founder" locale="en" />,
    )
    expect(markup).toContain('user-name-rainbow')
    expect(markup).toContain('user-name-title')
    expect(markup).toContain('Founder')
    expect(markup).toContain('@avery')
  })

  it('falls back to a plain name for unsupported style values', () => {
    const markup = renderToStaticMarkup(<UserName name="Avery" nameStyle="unknown" />)
    expect(markup).not.toContain('user-name-rainbow')
    expect(markup).not.toContain('user-name-gold')
    expect(markup).toContain('Avery')
  })
})
