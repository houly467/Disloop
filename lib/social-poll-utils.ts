export function normalizePollOptions(options: readonly string[]) {
  if (options.length < 2 || options.length > 4) return null
  const normalized = options.map((option) => option.replace(/[\u0000-\u001f\u007f]/g, '').trim())
  if (normalized.some((option) => !option || option.length > 80)) return null
  if (new Set(normalized.map((option) => option.toLocaleLowerCase())).size !== normalized.length) return null
  return normalized
}

export function calculatePollResults(options: readonly string[], votes: readonly number[]) {
  const optionCounts = options.map((_, index) => votes.filter((optionIndex) => optionIndex === index).length)
  const totalVotes = optionCounts.reduce((sum, count) => sum + count, 0)
  return {
    totalVotes,
    optionCounts,
    percentages: optionCounts.map((count) => totalVotes ? Math.round((count / totalVotes) * 100) : 0),
  }
}
