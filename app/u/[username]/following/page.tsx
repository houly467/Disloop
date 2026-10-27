import { notFound } from 'next/navigation'
import { RelationshipList } from '@/components/relationship-list'
import { getPublicUserByUsername } from '@/lib/users'
import { BackButton } from '@/components/back-button'
export default async function FollowingPage({ params }: { params: Promise<{ username: string }> }) { const user = await getPublicUserByUsername((await params).username); if (!user) notFound(); return <main className="disloop-shell public-profile-page"><BackButton /><RelationshipList userId={user.id} direction="following" /></main> }
