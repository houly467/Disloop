import { defineConfig } from 'drizzle-kit'
import { getDatabaseConnectionString } from './lib/db/connection-url'

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: getDatabaseConnectionString(process.env, { unpooled: true }),
  },
  strict: true,
  verbose: true,
})
