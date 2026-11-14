/** Shared types for the `/app` marketplace surface. */

import type { Coupon, Currency } from '@/types'

export type MarketplaceTab = 'accounts' | 'vpn'

/** Minimal payload emitted when a customer taps "Purchase". */
export interface PurchaseTarget {
  id: string
  title: string
}

/** Priced outcome of a confirmed purchase, including any applied coupon. */
export interface PurchaseSummary {
  subtotal: number
  discount: number
  total: number
  currency: Currency
  coupon?: Coupon
}
