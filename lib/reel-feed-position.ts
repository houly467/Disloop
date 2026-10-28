export function resetReelFeedPosition(
  feed: Pick<HTMLElement, 'scrollTop' | 'scrollTo'> | null,
  setActiveIndex: (index: number) => void,
) {
  if (feed) {
    feed.scrollTop = 0
    feed.scrollTo({ top: 0, behavior: 'instant' })
  }
  setActiveIndex(0)
}
