import { describe, expect, it } from 'vitest'
import { getDatabaseConnectionString } from '@/lib/db/connection-url'

describe('getDatabaseConnectionString', () => {
  it('uses DATABASE_URL outside Preview', () => {
    expect(getDatabaseConnectionString({
      VERCEL_ENV: 'production',
      DATABASE_URL: 'postgres://production/db',
      PREVIEW_DATABASE_URL: 'postgres://preview/db',
    })).toBe('postgres://production/db')
  })

  it('uses PREVIEW_DATABASE_URL and ignores other Neon URLs in Preview', () => {
    expect(getDatabaseConnectionString({
      VERCEL_ENV: 'preview',
      PREVIEW_DATABASE_URL: 'postgres://preview@preview.example/db',
      DATABASE_URL: 'postgres://production@production.example/db',
      DATABASE_URL_UNPOOLED: 'postgres://other@other.example/db',
      POSTGRES_URL: 'postgres://other@other.example/db',
      PGHOST: 'other.example',
    })).toBe('postgres://preview@preview.example/db')
  })

  it('fails closed when the Preview URL is missing', () => {
    expect(() => getDatabaseConnectionString({
      VERCEL_ENV: 'preview',
      DATABASE_URL: 'postgres://production@production.example/db',
    })).toThrow('PREVIEW_DATABASE_URL is required in Preview')
  })

  it('fails closed when Preview and Production hostnames match', () => {
    expect(() => getDatabaseConnectionString({
      VERCEL_ENV: 'preview',
      PREVIEW_DATABASE_URL: 'postgres://preview-user@neon.example/preview',
      DATABASE_URL: 'postgres://production-user@neon.example/production',
    })).toThrow('hostname matches DATABASE_URL')
  })

  it('fails closed when the Production hostname cannot be checked', () => {
    expect(() => getDatabaseConnectionString({
      VERCEL_ENV: 'preview',
      PREVIEW_DATABASE_URL: 'postgres://preview@preview.example/db',
    })).toThrow('DATABASE_URL is required in Preview to verify database isolation')
  })

  it('preserves the unpooled Production URL for Drizzle tooling', () => {
    expect(getDatabaseConnectionString({
      VERCEL_ENV: 'production',
      DATABASE_URL: 'postgres://production/db',
      DATABASE_URL_UNPOOLED: 'postgres://unpooled/db',
    }, { unpooled: true })).toBe('postgres://unpooled/db')
  })
})