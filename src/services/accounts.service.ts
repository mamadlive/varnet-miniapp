import { applyProfitMargin } from '@/lib/pricing'
import { localizeProviderProduct } from '@/lib/providerMapper'
import { apiGetProxy } from '@/services/apiClient'
import { endpoints } from '@/services/endpoints'
import { useAdminStore } from '@/store/adminStore'
import type { AccountProduct, PaginationQuery, ProductCategory } from '@/types'

export interface AccountProductQuery extends PaginationQuery {
  category?: ProductCategory | 'all'
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
  }
}

export interface AccountCatalogSyncResult {
  products: AccountProduct[]
  skipped: number
  fetchedAt: string
}

/** Provider base price → customer price, according to the admin margin. */
function withProfitMargin(product: AccountProduct): AccountProduct {
  // Localizing here as well covers catalogues persisted before the mapper
  // existed; the mapper is idempotent for already-Persian fixtures.
  const localized = localizeProviderProduct(product)
  const margin = useAdminStore.getState().margins[product.id]
  if (!margin || margin.value <= 0) return localized

  return {
    ...localized,
    basePrice: localized.price,
    price: applyProfitMargin(localized.price, margin),
    oldPrice:
      localized.oldPrice !== undefined
        ? applyProfitMargin(localized.oldPrice, margin)
        : undefined,
  }
}

async function fetchProviderCatalog(): Promise<{
  products: AccountProduct[]
  skipped: number
  fetchedAt: string
}> {
  const payload = await apiGetProxy<ProviderCatalogEnvelope>(endpoints.provider.products)

  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error(payload?.message || 'پاسخ کاتالوگ ارائه‌دهنده نامعتبر بود.')
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
  useAdminStore.getState().setProducts(products)
  return { products, skipped, fetchedAt }
}

export async function listAccountProducts(
  query: AccountProductQuery = {},
): Promise<AccountProduct[]> {
  const { category = 'all', search } = query

  return useAdminStore
    .getState()
    .products.filter((product) => {
      if (category !== 'all' && product.category !== category) return false
      if (search) {
        const haystack = `${product.title} ${product.subtitle ?? ''}`.toLowerCase()
        if (!haystack.includes(search.toLowerCase())) return false
      }
      return true
    })
    .map(withProfitMargin)
}

export async function getAccountProduct(id: string): Promise<AccountProduct | null> {
  const product = useAdminStore.getState().products.find((item) => item.id === id)
  return product ? withProfitMargin(product) : null
}
