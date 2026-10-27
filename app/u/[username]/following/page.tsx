import { notFound } from 'next/navigation'
import { RelationshipList } from '@/components/relationship-list'
import { getPublicUserByUsername } from '@/lib/users'
export default async function FollowingPage({ params }: { params: Promise<{ username: string }> }) { const user = await getPublicUserByUsername((await params).username); if (!user) notFound(); return <main className="disloop-shell"><RelationshipList userId={user.id} direction="following" /></main> }
