export function extractTags(text: string) {
  const matches = text.matchAll(/#([\p{L}\p{N}_]{2,30})/gu)
  const tags = new Set<string>()
  for (const match of matches) {
    const normalized = match[1].toLocaleLowerCase('en-US')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
    tags.add(normalized)
    if (tags.size > 10) throw new Error('too_many_tags')
  }
  return [...tags]
}
