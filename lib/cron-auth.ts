import { timingSafeEqual } from 'node:crypto'

export function verifyCronAuthorization(header: string | null) {
  const secret = process.env.CRON_SECRET
  if (!secret || secret.length < 32) return 'not-configured' as const
  if (!header) return 'unauthorized' as const

  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(header)
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return 'unauthorized' as const

  return null
}
