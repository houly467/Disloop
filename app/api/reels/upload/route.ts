import { buildUploadToken, isUploadCompletion } from '@/lib/blob-uploads'
import { NextRequest } from 'next/server'
import { requireLoggedInServerMember } from '@/lib/server-member'

export async function POST(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind') === 'reelThumbnail' ? 'reelThumbnail' : 'reel'
  const body = await request.json().catch(() => null)
  if (isUploadCompletion(body)) return buildUploadToken({ request, body, userId: null, kind })

  const access = await requireLoggedInServerMember(request, { requireDiscordMembership: true })
  if (!access.ok) return access.response
  return buildUploadToken({ request, body, userId: access.user.id, kind })
}
