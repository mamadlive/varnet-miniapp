/**
 * Server-authoritative pricing for `/api/purchase`.
 *
 * The storefront (`src/lib/pricing.ts` + `withPricing()` in
 * `src/services/accounts.service.ts`) converts the provider's USDT price with
 * `sync_meta.usdt_rate`, then applies the tiered margin ladder from
 * `settings.margin_tiers`. This module mirrors that math from D1 so the amount
 * charged never comes from the request body.
 */

import type { D1Database } from './userAuth'
import { DEFAULT_MARGIN_TIERS, parseMarginTiers, type MarginTier } from '../admin/_shared'

export interface PricingContext {
  /** Toman per USDT recorded by the last catalogue sync. */
  usdtRate: number | null
  tiers: MarginTier[]
}

export interface AccountPriceRow {
  title: string
  price: number
  provider_price: number | null
  provider_currency: string | null
}

/** Toman prices are displayed rounded to the nearest ۱٬۰۰۰. */
export function roundToman(amount: number): number {
  return Math.round(amount / 1000) * 1000
}

/** Same tier selection as `autoMarginPercentForUsd` in `src/lib/pricing.ts`. */
export function marginPercentForUsd(usdPrice: number, tiers: MarginTier[]): number {
  const ladder = tiers.length > 0 ? tiers : DEFAULT_MARGIN_TIERS
  const price = Number.isFinite(usdPrice) && usdPrice > 0 ? usdPrice : 0
  const tier = ladder.find((entry) => entry.upToUsd === null || price < entry.upToUsd)
  return tier?.percent ?? ladder[ladder.length - 1]!.percent
}

/** Load the rate and margin ladder; missing rows fall back to the built-in defaults. */
export async function loadPricingContext(db: D1Database): Promise<PricingContext> {
  const rateRow = await db
    .prepare("SELECT value FROM sync_meta WHERE key = 'usdt_rate'")
    .bind()
    .first<{ value: string }>()
  const usdtRate = rateRow ? Number(rateRow.value) : null
  if (usdtRate !== null && (!Number.isFinite(usdtRate) || usdtRate <= 0)) {
    throw new Error('Invalid USDT rate')
  }

  const tiersRow = await db
    .prepare("SELECT value FROM settings WHERE key = 'margin_tiers'")
    .bind()
    .first<{ value: string }>()
  const tiers = tiersRow ? parseMarginTiers(JSON.parse(tiersRow.value)) : DEFAULT_MARGIN_TIERS
  if (!tiers) throw new Error('Invalid margin tiers')

  return { usdtRate, tiers }
}

/**
 * Final account-product price in Toman, or `0` when the row cannot be priced.
 * Mirrors `basePriceInToman` + `marginForProduct` + `applyProfitMargin`.
 */
export function accountSubtotal(row: AccountPriceRow, context: PricingContext): number {
  const rate = context.usdtRate !== null && context.usdtRate > 0 ? context.usdtRate : 0
  const providerUsd =
    row.provider_currency === 'USDT' && row.provider_price !== null ? Number(row.provider_price) : null

  const base =
    providerUsd !== null && rate > 0 ? Math.round(providerUsd * rate) : Number(row.price)
  if (!Number.isFinite(base) || base <= 0) return 0

  const usd = providerUsd !== null && providerUsd > 0 ? providerUsd : rate > 0 ? base / rate : 0
  return roundToman(base * (1 + marginPercentForUsd(usd, context.tiers) / 100))
}
