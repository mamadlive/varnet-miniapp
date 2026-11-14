const DAY_MS = 86_400_000

export const PLAN_EXPIRY_WARNING =
  'بسته شما رو به اتمام است، لطفاً جهت جلوگیری از قطعی، تمدید کنید.'

export function daysRemaining(expiresAt: string): number {
  const timestamp = new Date(expiresAt).getTime()
  if (Number.isNaN(timestamp)) return 0
  return Math.max(0, Math.ceil((timestamp - Date.now()) / DAY_MS))
}
