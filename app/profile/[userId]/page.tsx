import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProfileSection } from '@/components/community-sections'
import { isUuid } from '@/lib/dm'
import { getCurrentUser } from '@/lib/session'
import { getProfileVisitCount, recordProfileVisit } from '@/lib/profile-visits'
import { areUsersBlocked } from '@/lib/relationship-access'
import { getPublicUserById } from '@/lib/users'
import { BackButton } from '@/components/back-button'

type ProfilePageProps = {
  params: Promise<{ userId: string }>
}

async function loadProfile(userId: string) {
  if (!isUuid(userId)) return null
  return getPublicUserById(userId)
}

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { userId } = await params
  const profile = await loadProfile(userId)
  if (!profile) return { title: 'Profile not found — Disloop' }

  const title = `${profile.displayName} (@${profile.username}) — Disloop`
  const description = `See ${profile.displayName}'s Disloop community profile.`
  return {
    title,
    description,
    alternates: { canonical: `/profile/${profile.id}` },
    openGraph: {
      title,
      description,
      type: 'profile',
      ...(profile.avatarUrl ? { images: [profile.avatarUrl] } : {}),
    },
  }
}

export default async function PermanentProfilePage({ params }: ProfilePageProps) {
  const { userId } = await params
  const profile = await loadProfile(userId)
  if (!profile) notFound()

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
  const permanentPath = `/profile/${profile.id}`
  return (
    <main className="disloop-shell public-profile-page">
      <BackButton />
      <ProfileSection
        profile={profile}
        locale="en"
        profileVisitCount={profileVisitCount}
        viewer={viewer}
        permanentPath={permanentPath}
      />
    </main>
  )
}
