export const DAILY_BONUS_XP_CAP = 20

export function getDailyBonusXpGrant(points: number, earnedToday: number) {
  if (!Number.isInteger(points) || points <= 0 || !Number.isInteger(earnedToday) || earnedToday < 0) return 0
  return Math.min(points, Math.max(0, DAILY_BONUS_XP_CAP - earnedToday))
}
