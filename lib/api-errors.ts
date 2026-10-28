const SAFE_DATABASE_REASONS: Record<string, string> = {
  '23502': 'query_error',
  '23503': 'query_error',
  '23505': 'query_error',
  '22P02': 'query_error',
  '28P01': 'db_connection',
  '3D000': 'db_connection',
  '42P01': 'missing_table',
  '42703': 'missing_column',
}

function getErrorDetails(error: unknown) {
  const value = error && typeof error === 'object' ? error as {
    message?: unknown
    code?: unknown
    detail?: unknown
    stack?: unknown
    cause?: { code?: unknown }
  } : null
  const cause = value?.cause && typeof value.cause === 'object'
    ? value.cause as { message?: unknown; code?: unknown; detail?: unknown; stack?: unknown }
    : null
  const code = typeof value?.code === 'string'
    ? value.code
    : typeof cause?.code === 'string'
      ? cause.code
      : null

  return {
    message: typeof value?.message === 'string' ? value.message : String(error),
    code,
    detail: typeof value?.detail === 'string' ? value.detail : typeof cause?.detail === 'string' ? cause.detail : null,
    stack: typeof value?.stack === 'string' ? value.stack : null,
    cause: cause ? {
      message: typeof cause.message === 'string' ? cause.message : null,
      code: typeof cause.code === 'string' ? cause.code : null,
      detail: typeof cause.detail === 'string' ? cause.detail : null,
      stack: typeof cause.stack === 'string' ? cause.stack : null,
    } : null,
  }
}

export function safeApiFailureReason(error: unknown) {
  const { code, message } = getErrorDetails(error)
  if (/^Vercel Blob: Failed to fetch blob: 403\b/.test(message)) return 'storage_access_denied'
  if (/^Vercel Blob: Failed to fetch blob: 5\d\d\b/.test(message)) return 'storage_unavailable'
  if (!code) return 'query_error'
  if (code.startsWith('08') || ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'].includes(code)) return 'db_connection'
  return SAFE_DATABASE_REASONS[code] ?? 'query_error'
}

export function logApiException(context: string, error: unknown) {
  console.error(`[${context}]`, getErrorDetails(error))
}

export function apiFailurePayload(errorCode: string, error: unknown, context: string) {
  logApiException(context, error)
  return { error: errorCode, reason: safeApiFailureReason(error) }
}
