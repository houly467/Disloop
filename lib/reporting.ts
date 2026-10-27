import { z } from 'zod'

export const reportCategories = [
  'nsfw',
  'trading',
  'scam',
  'harassment',
  'threats',
  'impersonation',
  'spam',
  'other',
] as const

export const reportTargetTypes = ['user', 'news', 'daily', 'reel', 'comment'] as const
export const REPORTS_PER_HOUR = 5
export const REPORT_TARGET_COOLDOWN_MS = 24 * 60 * 60 * 1000

const reportRequestSchema = z.object({
  targetType: z.enum(reportTargetTypes),
  targetId: z.uuid(),
  category: z.enum(reportCategories),
  reason: z.string().trim().min(10).max(500),
}).strict()

const categoryLabels: Record<(typeof reportCategories)[number], string> = {
  nsfw: 'NSFW',
  trading: 'Buying/Selling',
  scam: 'Scam/Fraud',
  harassment: 'Harassment/Abuse',
  threats: 'Hate/Threats',
  impersonation: 'Impersonation',
  spam: 'Spam',
  other: 'Other',
}

const webhookEnvNames: Record<(typeof reportCategories)[number], string> = {
  nsfw: 'REPORT_WEBHOOK_NSFW',
  trading: 'REPORT_WEBHOOK_TRADING',
  scam: 'REPORT_WEBHOOK_SCAM',
  harassment: 'REPORT_WEBHOOK_HARASSMENT',
  threats: 'REPORT_WEBHOOK_THREATS',
  impersonation: 'REPORT_WEBHOOK_IMPERSONATION',
  spam: 'REPORT_WEBHOOK_SPAM',
  other: 'REPORT_WEBHOOK_OTHER',
}

export type ReportRequest = z.infer<typeof reportRequestSchema>

export function parseReportRequest(value: unknown): ReportRequest | null {
  const parsed = reportRequestSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function sanitizeReportReason(reason: string) {
  return reason
    .replace(/@(?:everyone|here)\b/gi, '[mention removed]')
    .replace(/<@!?[\d]{17,20}>|<@&\d{17,20}>|<#\d{17,20}>/g, '[mention removed]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 1000)
}

export function selectReportWebhook(
  category: (typeof reportCategories)[number],
  env: Record<string, string | undefined> = process.env,
) {
  const categoryWebhook = env[webhookEnvNames[category]]?.trim()
  const fallbackWebhook = env.REPORT_WEBHOOK_OTHER?.trim()
  return categoryWebhook || fallbackWebhook || null
}

export function reportCategoryLabel(category: (typeof reportCategories)[number]) {
  return categoryLabels[category]
}

export function reportCooldownSince(now: Date) {
  return new Date(now.getTime() - REPORT_TARGET_COOLDOWN_MS)
}

export function buildReportWebhookPayload(report: {
  id: string
  category: (typeof reportCategories)[number]
  reason: string
  createdAt: Date
  reportedUsername: string
  reportedUserId: string
  profileUrl: string
  reporterUsername: string
  reporterId: string
  contentUrl?: string | null
}) {
  const fields = [
    { name: 'Reported user', value: `@${report.reportedUsername} (ID: ${report.reportedUserId})\n${report.profileUrl}`.slice(0, 1024), inline: false },
    { name: 'Reason', value: sanitizeReportReason(report.reason) || '(empty)', inline: false },
    { name: 'Reporter (moderators only)', value: `@${report.reporterUsername} (ID: ${report.reporterId})`.slice(0, 1024), inline: false },
    ...(report.contentUrl ? [{ name: 'Content', value: report.contentUrl.slice(0, 1024), inline: false }] : []),
    { name: 'Report ID', value: report.id, inline: true },
    { name: 'Submitted', value: report.createdAt.toISOString(), inline: true },
  ]
  return {
    embeds: [{
      title: `Report: ${categoryLabels[report.category]}`.slice(0, 256),
      description: sanitizeReportReason(report.reason).slice(0, 4096),
      fields,
      timestamp: report.createdAt.toISOString(),
    }],
    allowed_mentions: { parse: [] },
  }
}

export async function sendReportWebhook(
  url: string,
  payload: ReturnType<typeof buildReportWebhookPayload>,
  onAttempt?: (attempt: number, status: number | null) => void,
) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      })
      onAttempt?.(attempt, response.status)
      if (response.ok) return true
    } catch {
      onAttempt?.(attempt, null)
    }
  }
  return false
}
