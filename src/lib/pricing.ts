import type { Coupon, DiscountType } from '@/types'
import { formatCount } from '@/lib/format'

/** Admin-defined markup applied on top of the provider's base price. */
export interface ProfitMargin {
  type: DiscountType
  /** Percent markup or a fixed Toman amount. */
  value: number
}

export const ZERO_MARGIN: ProfitMargin = { type: 'percent', value: 0 }

/** Toman prices are displayed rounded to the nearest ۱٬۰۰۰. */
function roundToman(amount: number): number {
  return Math.round(amount / 1000) * 1000
}

export function hasMargin(margin: ProfitMargin | undefined): margin is ProfitMargin {
  return Boolean(margin && margin.value > 0)
}

export function applyProfitMargin(basePrice: number, margin?: ProfitMargin): number {
  if (!hasMargin(margin)) return basePrice
  const raw =
    margin.type === 'percent' ? basePrice * (1 + margin.value / 100) : basePrice + margin.value
  return roundToman(raw)
}

export function profitAmount(basePrice: number, margin?: ProfitMargin): number {
  return applyProfitMargin(basePrice, margin) - basePrice
}

/**
 * Automatic margin ladder keyed by the provider's USDT base price.
 * The requested $3–$4 and $6–$7 gaps use the midpoint of their neighbours.
 */
export interface AutoMarginTier {
  /** Exclusive upper bound in USDT; `null` means "and above". */
  upToUsd: number | null
  percent: number
}

export const AUTO_MARGIN_TIERS: AutoMarginTier[] = [
  { upToUsd: 1, percent: 70 },
  { upToUsd: 2, percent: 60 },
  { upToUsd: 3, percent: 50 },
  { upToUsd: 4, percent: 45 },
  { upToUsd: 5, percent: 40 },
  { upToUsd: 6, percent: 30 },
  { upToUsd: 7, percent: 25 },
  { upToUsd: 8, percent: 20 },
  { upToUsd: null, percent: 15 },
]

/**
 * Margin percent for a USDT price; non-positive input falls into the top tier.
 * `tiers` is the admin-configured ladder loaded from D1 (`margin_tiers`).
 */
export function autoMarginPercentForUsd(
  usdPrice: number,
  tiers: AutoMarginTier[] = AUTO_MARGIN_TIERS,
): number {
  const ladder = tiers.length > 0 ? tiers : AUTO_MARGIN_TIERS
  const price = Number.isFinite(usdPrice) && usdPrice > 0 ? usdPrice : 0
  const tier = ladder.find((entry) => entry.upToUsd === null || price < entry.upToUsd)
  return tier?.percent ?? ladder[ladder.length - 1]!.percent
}

export function autoMarginForUsd(
  usdPrice: number,
  tiers: AutoMarginTier[] = AUTO_MARGIN_TIERS,
): ProfitMargin {
  return { type: 'percent', value: autoMarginPercentForUsd(usdPrice, tiers) }
}

export function isCouponExpired(coupon: Coupon): boolean {
  if (!coupon.expiresAt) return false
  const expiresAt = new Date(coupon.expiresAt).getTime()
  return !Number.isNaN(expiresAt) && expiresAt < Date.now()
}

export function isCouponExhausted(coupon: Coupon): boolean {
  return coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit
}

/** Discount in Toman for a coupon, clamped to the subtotal. */
export function couponDiscount(coupon: Coupon, subtotal: number): number {
  const raw =
    coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : Math.min(coupon.value, subtotal)
  const capped = coupon.maxDiscount !== undefined ? Math.min(raw, coupon.maxDiscount) : raw
  return Math.max(0, Math.min(roundToman(capped), subtotal))
}

/** Human-readable coupon value, e.g. «۲۰٪» or «۵۰,۰۰۰ تومان». */
export function describeCouponValue(
  coupon: Pick<Coupon, 'type' | 'value'>,
  formatFixed: (amount: number) => string,
): string {
  return coupon.type === 'percent' ? `${formatCount(coupon.value)}٪` : formatFixed(coupon.value)
}
