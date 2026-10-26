import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ error: 'group_invites_disabled' }, { status: 410 })
}
