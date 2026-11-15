import {
  applyProfitMargin,
  autoMarginForUsd,
  hasMargin,
  type ProfitMargin,
} from '@/lib/pricing'
import { localizeProviderProduct } from '@/lib/providerMapper'
import { apiGetProxy } from '@/services/apiClient'
import { endpoints } from '@/services/endpoints'
import { useAdminStore } from '@/store/adminStore'
import type { AccountProduct, PaginationQuery, ProductCategory } from '@/types'

export interface AccountProductQuery extends PaginationQuery {
  category?: ProductCategory | 'all'
  /** Admin catalogue views include storefront-hidden products. */
  includeHidden?: boolean
}

/**
 * Premium accounts come from a third-party provider that requires an API key.
 * The browser never calls that provider directly: `/api/provider/products` is
 * a Cloudflare Pages Function that holds `ACCOUNTS_PROVIDER_API_KEY` server-side
 * and returns a normalized catalogue in Toman.
 */

/** Envelope returned by `functions/api/provider/products.ts`. */
export interface ProviderCatalogEnvelope {
  success: boolean
  data: AccountProduct[]
  message?: string
  meta?: {
    count?: number
    skipped?: number
    fetchedAt?: string
    /** Toman per USDT as resolved from `USDT_RATE_TOMAN` on the server. */
    usdtRate?: number
  }
}

export interface AccountCatalogSyncResult {
  products: AccountProduct[]
  skipped: number
  fetchedAt: string
}

/** Mirrors the proxy default so the tier ladder works before the first sync. */
const FALLBACK_USDT_RATE_TOMAN = 70_000

/** Admin rate → server-reported rate → built-in default. */
function effectiveUsdtRate(): number {
  const { usdtRateToman, serverUsdtRateToman } = useAdminStore.getState()
  if (usdtRateToman > 0) return usdtRateToman
  if (serverUsdtRateToman > 0) return serverUsdtRateToman
  return FALLBACK_USDT_RATE_TOMAN
}

/**
 * The proxy already converted `price` with the server rate; when the admin
 * overrides the rate we redo the conversion from the raw upstream amount.
 */
function basePriceInToman(product: AccountProduct, rate: number): number {
  if (product.providerPrice !== undefined && product.providerCurrency === 'USDT') {
    return Math.round(product.providerPrice * rate)
  }
  return product.price
}

function usdPriceOf(product: AccountProduct, baseToman: number, rate: number): number {
  if (product.providerPrice !== undefined && product.providerCurrency === 'USDT') {
    return product.providerPrice
  }
  return baseToman / rate
}

/**
 * Resolves the margin for a product: an explicit admin override wins, otherwise
 * the automatic USDT tier ladder applies.
 */
function marginForProduct(product: AccountProduct, usdPrice: number): ProfitMargin {
  const override = useAdminStore.getState().margins[product.id]
  return hasMargin(override) ? override : autoMarginForUsd(usdPrice)
}

/** Localizes, reprices and decorates a product for display. */
function withPricing(product: AccountProduct): AccountProduct {
  // Localizing here as well covers catalogues persisted before the mapper
  // existed; the mapper is idempotent for already-Persian fixtures.
  const localized = localizeProviderProduct(product)
  const rate = effectiveUsdtRate()
  const basePrice = basePriceInToman(localized, rate)
  const usdPrice = usdPriceOf(localized, basePrice, rate)
  const margin = marginForProduct(localized, usdPrice)
  const serverConverted = localized.providerPrice === undefined || localized.providerCurrency !== 'USDT'

  const oldPrice = serverConverted
    ? localized.oldPrice
    : localized.providerOldPrice !== undefined
      ? Math.round(localized.providerOldPrice * rate)
      : undefined

  return {
    ...localized,
    basePrice,
    usdPrice,
    price: applyProfitMargin(basePrice, margin),
    oldPrice: oldPrice !== undefined ? applyProfitMargin(oldPrice, margin) : undefined,
    adminNote: useAdminStore.getState().productNotes[product.id],
  }
}

async function fetchProviderCatalog(): Promise<AccountCatalogSyncResult> {
  const payload = await apiGetProxy<ProviderCatalogEnvelope>(endpoints.provider.products)

  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error(payload?.message || 'پاسخ کاتالوگ ارائه‌دهنده نامعتبر بود.')
  }

  if (payload.meta?.usdtRate) {
    useAdminStore.getState().setServerUsdtRateToman(payload.meta.usdtRate)
  }

  return {
    products: payload.data.map(localizeProviderProduct),
    skipped: payload.meta?.skipped ?? 0,
    fetchedAt: payload.meta?.fetchedAt ?? new Date().toISOString(),
  }
}

/**
 * Pull the latest catalogue through the secure proxy and publish it to the
 * shared admin store — the Mini App reads the same store on its next render.
 *
 * Proxy failures propagate untouched: the admin UI must show the real cause
 * (`PROVIDER_KEY_MISSING`, `PROVIDER_UNAVAILABLE`, …) instead of masking it
 * with fixture data.
 */
export async function syncAccountProducts(): Promise<AccountCatalogSyncResult> {
  const { products, skipped, fetchedAt } = await fetchProviderCatalog()
  const { deletedProductIds, setProducts } = useAdminStore.getState()
  // A product the admin deleted must stay deleted across provider re-syncs.
  const kept = products.filter((product) => !deletedProductIds.includes(product.id))
  setProducts(kept)
  return { products: kept, skipped, fetchedAt }
}

export async function listAccountProducts(
  query: AccountProductQuery = {},
): Promise<AccountProduct[]> {
  const { category = 'all', search, includeHidden = false } = query
  const { products, hiddenProductIds, deletedProductIds } = useAdminStore.getState()

  return products
    .filter((product) => {
      if (deletedProductIds.includes(product.id)) return false
      if (!includeHidden && hiddenProductIds.includes(product.id)) return false
      if (category !== 'all' && product.category !== category) return false
      if (search) {
        const haystack = `${product.title} ${product.subtitle ?? ''}`.toLowerCase()
        if (!haystack.includes(search.toLowerCase())) return false
      }
      return true
    })
    .map(withPricing)
}

export async function getAccountProduct(id: string): Promise<AccountProduct | null> {
  const { products, deletedProductIds } = useAdminStore.getState()
  if (deletedProductIds.includes(id)) return null
  const product = products.find((item) => item.id === id)
  return product ? withPricing(product) : null
}
