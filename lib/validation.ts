import type { NextRequest } from 'next/server'
import { z } from 'zod'

export async function parseJsonBody<T extends z.ZodType>(request: NextRequest, schema: T): Promise<z.output<T> | null> {
  const raw = await request.json().catch(() => undefined)
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function parseQuery<T extends z.ZodType>(request: NextRequest, schema: T): z.output<T> | null {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()))
  return parsed.success ? parsed.data : null
}

export const uuidSchema = z.uuid()
export const socialContentTypeSchema = z.enum(['news', 'reel', 'daily'])
export const socialActionSchema = z.object({
  type: socialContentTypeSchema,
  contentId: uuidSchema,
}).strict()
