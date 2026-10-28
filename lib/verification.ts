export function selectVerificationWebhook(env: Record<string, string | undefined> = process.env) {
  const dedicated = env.REPORT_WEBHOOK_VERIFY?.trim()
  const fallback = env.REPORT_WEBHOOK_OTHER?.trim()
  return dedicated || fallback || null
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
