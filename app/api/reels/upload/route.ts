import { buildUploadToken, isUploadCompletion } from '@/lib/blob-uploads'
import { NextRequest } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (isUploadCompletion(body)) return buildUploadToken({ request, body, userId: null, kind: 'reel' })

  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  return buildUploadToken({ request, body, userId: access.user.id, kind: 'reel' })
}
