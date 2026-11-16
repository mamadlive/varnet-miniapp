/**
 * Cloudflare Pages Function — GET /api/products
 *
 * The Mini App catalogue, served from D1. `/api/sync` persists products that
 * already passed through `localizeProviderProduct`; this endpoint runs the
 * mapper once more on the way out so rows stored before the dictionary existed
 * (or before a mapper update) still arrive with Persian copy, brand emojis and
 * gradients. The pass is idempotent: it reuses the stored brand key, title and
 * emoji instead of re-deriving them from scratch.
 *
 * Response matches the provider envelope the client already understands:
 *   { success: true, data: AccountProduct[], meta: { count, usdtRate, … } }
 *
 * `logoUrl` is never persisted: the mapper re-derives it from the brand on every
 * read, so the D1 schema stays unchanged and a dictionary logo update applies
 * without a migration or re-sync.
 *
 * Bindings: `DB` (D1). No auth — the catalogue is public, like the storefront.
 */

import { localizeProviderProduct } from '../../src/lib/providerMapper'
import type { AccountProduct, ProductCategory } from '../../src/types'

interface D1Result<T> {
  results?: T[]
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  all<T>(): Promise<D1Result<T>>
  first<T>(): Promise<T | null>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
}

interface ProductsEnv {
  DB?: D1Database
}

interface PagesContext {
  request: Request
  env: ProductsEnv
}

interface ProductRow {
  id: string
  title: string
  subtitle: string | null
  category: string | null
  price: number
  old_price: number | null
  provider_price: number | null
  provider_old_price: number | null
  provider_currency: string | null
  currency: string | null
  stock: number | null
  rating: number | null
  review_count: number | null
  badge: string | null
  delivery_time: string | null
  description: string | null
  features: string | null
  gradient: string | null
  emoji: string | null
  brand_key: string | null
  provider_description: string | null
}

class ProductsError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ProductsError'
    this.code = code
  }
}

const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  'streaming',
  'ai',
  'gaming',
  'design',
  'social',
  'other',
]

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS })
}

function describeCause(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name : undefined
    const message = typeof record.message === 'string' ? record.message : undefined
    if (name || message) {
      const nested = depth < 3 ? describeCause(record.cause, depth + 1) : undefined
      return {
        ...(name ? { name } : {}),
        ...(message ? { message } : {}),
        ...(nested !== undefined ? { cause: nested } : {}),
      }
    }
    if (depth >= 3) return String(value)
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function failureResponse(error: unknown): Response {
  const err =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error))
  return jsonResponse(
    {
      success: false,
      code: error instanceof ProductsError ? error.code : 'PRODUCTS_UNEXPECTED',
      message: err.message,
      error: { name: err.name, message: err.message, cause: describeCause(err.cause) ?? null },
    },
    500,
  )
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseFeatures(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return undefined
    const items = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    return items.length > 0 ? items : undefined
  } catch {
    return undefined
  }
}

function toCategory(raw: string | null): ProductCategory {
  return PRODUCT_CATEGORIES.includes(raw as ProductCategory)
    ? (raw as ProductCategory)
    : 'other'
}

/** D1 row → AccountProduct, then one idempotent dictionary pass. */
function toProduct(row: ProductRow): AccountProduct {
  return localizeProviderProduct({
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    category: toCategory(row.category),
    price: finiteNumber(row.price) ?? 0,
    oldPrice: finiteNumber(row.old_price),
    providerPrice: finiteNumber(row.provider_price),
    providerOldPrice: finiteNumber(row.provider_old_price),
    providerCurrency: row.provider_currency ?? undefined,
    currency: 'IRT',
    stock: Math.max(0, Math.trunc(finiteNumber(row.stock) ?? 0)),
    rating: finiteNumber(row.rating),
    reviewCount: finiteNumber(row.review_count),
    badge: row.badge ?? undefined,
    deliveryTime: row.delivery_time ?? undefined,
    description: row.description ?? undefined,
    providerDescription: row.provider_description ?? undefined,
    features: parseFeatures(row.features),
    gradient: row.gradient ?? undefined,
    emoji: row.emoji ?? undefined,
    brandKey: row.brand_key ?? undefined,
  })
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  try {
    const db = context.env.DB
    if (!db) {
      throw new ProductsError(
        'PRODUCTS_DB_NOT_CONFIGURED',
        'اتصال پایگاه‌داده D1 (binding «DB») در محیط سرور تنظیم نشده است.',
      )
    }

    let rows: ProductRow[]
    try {
      const result = await db
        .prepare('SELECT * FROM products ORDER BY title COLLATE NOCASE')
        .all<ProductRow>()
      rows = Array.isArray(result.results) ? result.results : []
    } catch (cause) {
      throw new ProductsError('PRODUCTS_READ_FAILED', 'خواندن کاتالوگ از D1 ناموفق بود.', {
        cause,
      })
    }

    let usdtRate: number | undefined
    try {
      const rateRow = await db
        .prepare("SELECT value FROM sync_meta WHERE key = 'usdt_rate'")
        .bind()
        .first<{ value: string }>()
      const parsed = Number(rateRow?.value)
      if (Number.isFinite(parsed) && parsed > 0) usdtRate = parsed
    } catch {
      // The rate is advisory; a missing meta table must not hide the catalogue.
    }

    const products = rows.map(toProduct)

    return jsonResponse({
      success: true,
      data: products,
      meta: {
        count: products.length,
        fetchedAt: new Date().toISOString(),
        ...(usdtRate !== undefined ? { usdtRate } : {}),
      },
    })
  } catch (error) {
    return failureResponse(error)
  }
}
