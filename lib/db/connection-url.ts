type DatabaseEnvironment = NodeJS.ProcessEnv

function hostname(value: string, variableName: string) {
  try {
    const url = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error()
    return url.hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL connection URL`)
  }
}

export function getDatabaseConnectionString(
  environment: DatabaseEnvironment = process.env,
  options: { unpooled?: boolean } = {},
) {
  if (environment.VERCEL_ENV === 'preview') {
    const previewUrl = environment.PREVIEW_DATABASE_URL
    if (!previewUrl) {
      throw new Error('PREVIEW_DATABASE_URL is required in Preview; refusing to connect to another database')
    }
    const productionUrl = environment.DATABASE_URL
    if (!productionUrl) {
      throw new Error('DATABASE_URL is required in Preview to verify database isolation; refusing to connect')
    }
    if (hostname(previewUrl, 'PREVIEW_DATABASE_URL') === hostname(productionUrl, 'DATABASE_URL')) {
      throw new Error('PREVIEW_DATABASE_URL hostname matches DATABASE_URL; refusing to connect in Preview')
    }
    return previewUrl
  }

  const connectionString = options.unpooled
    ? environment.DATABASE_URL_UNPOOLED ?? environment.DATABASE_URL
    : environment.DATABASE_URL
  if (!connectionString) {
    throw new Error(options.unpooled
      ? 'DATABASE_URL_UNPOOLED or DATABASE_URL is required'
      : 'DATABASE_URL is required')
  }
  return connectionString
}