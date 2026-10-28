function validVerificationWebhook(value: string | undefined) {
  const candidate = value?.trim()
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'https:' || url.hostname !== 'discord.com' || !/^\/api\/webhooks\/\d+\/[^/]+\/?$/.test(url.pathname)) return null
    return url.toString()
  } catch {
    return null
  }
}

export function getVerificationWebhooks(env: Record<string, string | undefined> = process.env) {
  return [...new Set([
    validVerificationWebhook(env.REPORT_WEBHOOK_VERIFY),
    validVerificationWebhook(env.REPORT_WEBHOOK_OTHER),
  ].filter((value): value is string => value !== null))]
}

export function selectVerificationWebhook(env: Record<string, string | undefined> = process.env) {
  return getVerificationWebhooks(env)[0] ?? null
}

export async function deliverVerificationWebhook(
  webhook: string,
  payload: unknown,
  requestId: string,
  send: typeof fetch = fetch,
) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await send(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      console.info('[verification] webhook response', { status: response.status, attempt, requestId })
      if (response.ok) return true
    } catch {
      console.info('[verification] webhook response', { status: 0, attempt, requestId })
    }
  }
  return false
}

export function sanitizeVerificationReason(value: string) {
  return value
    .replace(/@(?:everyone|here)\b/gi, '')
    .replace(/<@!?[\d]{17,20}>|<@&[\d]{17,20}>|<#\d{17,20}>/g, '')
    .replace(/https?:\/\/\S+|www\.\S+/gi, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 500)
}

export function isHttpsProfileLink(value: string | null) {
  if (!value) return true
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
