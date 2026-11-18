import {
  applyProfitMargin,
  autoMarginForUsd,
  hasMargin,
  type ProfitMargin,
} from '@/lib/pricing'
import { ApiError, apiGetProxy, apiPostProxy, isApiError } from '@/services/apiClient'
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

/** Envelope returned by `functions/api/products.ts`. */
export interface ProviderCatalogEnvelope {
  success: boolean
  data?: AccountProduct[]
  message?: string
  code?: string
  meta?: {
    count?: number
    /** USDT→Toman rate used by the last sync (stored in D1 `sync_meta`). */
    usdtRate?: number
    /** Automatic margin ladder stored in D1 `settings` (`margin_tiers`). */
    marginTiers?: Array<{ upToUsd: number | null; percent: number }>
    fetchedAt?: string
  }
}

/** Envelope returned by `functions/api/sync.ts`. */
export interface ProviderSyncEnvelope {
  success: boolean
  data?: {
    products?: AccountProduct[]
    synced?: number
    skipped?: number
    /** D1 `batch()` round-trips the server needed for this sync. */
    batches?: number
    syncedAt?: string
    usdtRate?: number
  }
  meta?: {
    count?: number
    skipped?: number
    fetchedAt?: string
    /** Toman per USDT as resolved from `USDT_RATE_TOMAN` on the server. */
    usdtRate?: number
  }
  message?: string
  code?: string
  error?: {
    name?: unknown
    message?: unknown
    cause?: unknown
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
  const { margins, marginTiers } = useAdminStore.getState()
  const override = margins[product.id]
  return hasMargin(override) ? override : autoMarginForUsd(usdPrice, marginTiers)
}

function withPricing(product: AccountProduct): AccountProduct {
  const rate = effectiveUsdtRate()
  const basePrice = basePriceInToman(product, rate)
  const usdPrice = usdPriceOf(product, basePrice, rate)
  const margin = marginForProduct(product, usdPrice)
  const serverConverted = product.providerPrice === undefined || product.providerCurrency !== 'USDT'

  const oldPrice = serverConverted
    ? product.oldPrice
    : product.providerOldPrice !== undefined
      ? Math.round(product.providerOldPrice * rate)
      : undefined

  return {
    ...product,
    basePrice,
    usdPrice,
    price: applyProfitMargin(basePrice, margin),
    oldPrice: oldPrice !== undefined ? applyProfitMargin(oldPrice, margin) : undefined,
    adminNote: useAdminStore.getState().productNotes[product.id],
  }
}

/** Flatten the server's nested `error.cause` chain into one readable string. */
function flattenSyncCause(value: unknown, depth = 0): string | null {
  if (value === undefined || value === null || depth > 3) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const own = [record.name, record.message]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(': ')
    const nested = flattenSyncCause(record.cause, depth + 1)
    return [own || null, nested].filter(Boolean).join(' → ') || null
  }
  return null
}

/**
 * Append the server's cause chain to HTTP errors so the admin panel shows
 * whether the failure came from the upstream firewall or from D1.
 */
function describeSyncFailure(error: unknown): Error {
  if (!isApiError(error)) {
    return error instanceof Error ? error : new Error('همگام‌سازی محصولات ممکن نشد.')
  }
  const detail = (error.details as { error?: { cause?: unknown } } | undefined)?.error
  const cause = flattenSyncCause(detail?.cause)
  if (!cause || error.message.includes(cause)) return error
  return new ApiError(`${error.message} — ${cause}`, {
    status: error.status,
    code: error.code,
    details: error.details,
  })
}

/** Read the shared D1 catalogue and its admin-authored overrides. */
async function fetchCatalogueFromServer(): Promise<AccountProduct[]> {
  const payload = await apiGetProxy<ProviderCatalogEnvelope>(endpoints.provider.catalogue)

  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new ApiError(payload?.message || 'پاسخ کاتالوگ محصولات نامعتبر بود.', {
      code: payload?.code,
      details: payload,
    })
  }

  if (payload.meta?.usdtRate) {
    useAdminStore.getState().setServerUsdtRateToman(payload.meta.usdtRate)
  }
  if (Array.isArray(payload.meta?.marginTiers) && payload.meta.marginTiers.length > 0) {
    useAdminStore.getState().setMarginTiers(payload.meta.marginTiers)
  }

  return payload.data
}

/**
 * Persist the latest catalogue to D1 (`POST /api/sync`).
 *
 * Server failures propagate with their technical cause (`SYNC_UPSTREAM_TIMEOUT`,
 * `SYNC_DB_WRITE_FAILED`, …) instead of being masked with fixture data.
 */
export async function syncAccountProducts(): Promise<AccountCatalogSyncResult> {
  let payload: ProviderSyncEnvelope
  try {
    payload = await apiPostProxy<ProviderSyncEnvelope>(endpoints.provider.sync, {})
  } catch (error) {
    throw describeSyncFailure(error)
  }

  const data = payload?.data
  if (!payload || payload.success !== true || !Array.isArray(data?.products)) {
    const technical = flattenSyncCause(payload?.error?.cause)
    const base = payload?.message || 'پاسخ همگام‌سازی محصولات نامعتبر بود.'
    throw new ApiError(technical ? `${base} — ${technical}` : base, {
      code: payload?.code,
      details: payload,
    })
  }

  const rate = data.usdtRate ?? payload.meta?.usdtRate
  if (rate) useAdminStore.getState().setServerUsdtRateToman(rate)

  return {
    products: data.products,
    skipped: data.skipped ?? payload.meta?.skipped ?? 0,
    fetchedAt: data.syncedAt ?? payload.meta?.fetchedAt ?? new Date().toISOString(),
  }
}

export async function listAccountProducts(
  query: AccountProductQuery = {},
): Promise<AccountProduct[]> {
  const serverProducts = await fetchCatalogueFromServer()
  useAdminStore.getState().setProducts(serverProducts)

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
