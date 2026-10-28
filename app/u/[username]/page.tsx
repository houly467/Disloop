import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { ProfileSection } from '@/components/community-sections'
import { getPublicUserByUsername } from '@/lib/users'
import { getCurrentUser } from '@/lib/session'
import { getProfileVisitCount, recordProfileVisit } from '@/lib/profile-visits'
import { areUsersBlocked } from '@/lib/relationship-access'
import { BackButton } from '@/components/back-button'

type ProfilePageProps = {
  params: Promise<{ username: string }>
}

async function loadProfile(username: string) {
  return getPublicUserByUsername(username)
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { username } = await params
  const profile = await loadProfile(username)
  if (!profile) return { title: 'Profile not found — Disloop' }

  const title = `${profile.displayName} (@${profile.username}) — Disloop`
  return {
    title,
    description: `See ${profile.displayName}'s Disloop community profile.`,
    alternates: { canonical: `/u/${encodeURIComponent(profile.username)}` },
    openGraph: {
      title,
      description: `See ${profile.displayName}'s Disloop community profile.`,
      type: 'profile',
      ...(profile.avatarUrl ? { images: [profile.avatarUrl] } : {}),
    },
  }
}

export default async function PublicProfilePage({ params }: ProfilePageProps) {
  const { username } = await params
  const profile = await loadProfile(username)
  if (!profile) notFound()
  if (profile.username.toLowerCase() !== username.toLowerCase()) {
    redirect(`/u/${encodeURIComponent(profile.username)}`)
  }

  const viewer = await getCurrentUser()
  if (viewer && viewer.id !== profile.id && await areUsersBlocked(viewer.id, profile.id)) {
    return <main className="disloop-shell public-profile-page"><BackButton /><section className="section-view section-empty" aria-labelledby="profile-unavailable"><h1 id="profile-unavailable">Profile unavailable</h1><p>This profile is unavailable because one of you has blocked the other account.</p></section></main>
  }
  let profileVisitCount: number | null = null
  if (viewer && viewer.id !== profile.id) {
    await recordProfileVisit(profile.id, viewer.id).catch(() => undefined)
  }
  if (profile.publicVisitCount) {
    profileVisitCount = await getProfileVisitCount(profile.id).catch(() => null)
  }
  return (
    <main className="disloop-shell public-profile-page">
      <BackButton />
      <ProfileSection profile={profile} locale="en" profileVisitCount={profileVisitCount} viewer={viewer} permanentPath={`/u/${encodeURIComponent(profile.username)}`} />
    </main>
  )
}
