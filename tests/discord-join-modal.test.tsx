import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DiscordJoinModal } from '@/components/discord-join-modal'

vi.mock('@/components/modal-portal', () => ({
  ModalPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('DiscordJoinModal', () => {
  it('explains the content-creation gate and links directly to the invite', () => {
    const markup = renderToStaticMarkup(
      <DiscordJoinModal open inviteUrl="https://discord.gg/example" locale="en" onClose={() => undefined} />,
    )
    expect(markup).toContain('Join Our Discord So you can post reels, news, story')
    expect(markup).toContain('href="https://discord.gg/example"')
    expect(markup).toContain('Join Disloop Discord')
  })

  it('does not render when closed', () => {
    const markup = renderToStaticMarkup(
      <DiscordJoinModal open={false} inviteUrl="https://discord.gg/example" locale="en" onClose={() => undefined} />,
    )
    expect(markup).toBe('')
  })
})
