import { NextRequest, NextResponse } from 'next/server'
import { isUuid } from '@/lib/dm'
import { requireLoggedInServerMember } from '@/lib/server-member'

type RouteProps = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: RouteProps) {
  const access = await requireLoggedInServerMember(request)
  if (!access.ok) return access.response
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid_group' }, { status: 400 })
  return NextResponse.json({ error: 'invite_required' }, { status: 403 })
}
