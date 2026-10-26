import { buildUploadToken, isUploadCompletion } from '@/lib/blob-uploads'
import { NextRequest, NextResponse } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'
import { resolveUploadKind } from '@/lib/upload-config'

export async function POST(request: NextRequest) {
  const kind = resolveUploadKind(request.nextUrl.searchParams.get('kind'), ['dm', 'group'], 'dm')
  if (!kind) return NextResponse.json({ error: 'invalid_input', reason: 'invalid_input' }, { status: 400 })
  const body = await request.json().catch(() => null)
  if (isUploadCompletion(body)) return buildUploadToken({ request, body, userId: null, kind })

  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  return buildUploadToken({ request, body, userId: access.user.id, kind })
}
