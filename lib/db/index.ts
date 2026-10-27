import 'server-only'
import { attachDatabasePool } from '@vercel/functions'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
const poolConnectionString = connectionString
  ? (() => {
      const url = new URL(connectionString)
      const sslMode = url.searchParams.get('sslmode')?.toLowerCase()
      if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
        url.searchParams.set('sslmode', 'verify-full')
      }
      return url.toString()
    })()
  : undefined

const pool = new Pool({
  connectionString: poolConnectionString,
  max: 5,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
})

attachDatabasePool(pool)

export const db = drizzle(pool, { schema })
