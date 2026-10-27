import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from '@/lib/content-security-policy'

describe('Content-Security-Policy header', () => {
  it('allows the Vercel Blob API and Blob storage hosts in connect-src', () => {
    const header = buildContentSecurityPolicy('test-nonce')
    const connectSource = header.split('; ').find((directive) => directive.startsWith('connect-src '))

    expect(connectSource).toBe("connect-src 'self' https://*.vercel-storage.com https://vercel.com")
    expect(header).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
  })

  it('allows eval only in development', () => {
    expect(buildContentSecurityPolicy('test-nonce', true)).toContain(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic' 'unsafe-eval'",
    )
    expect(buildContentSecurityPolicy('test-nonce', false)).toContain(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic'",
    )
    expect(buildContentSecurityPolicy('test-nonce', false)).not.toContain("'unsafe-eval'")
  })
})
