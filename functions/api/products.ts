import type { AccountProduct, ProductCategory } from '../../src/types'

interface D1Result<T> {
  success?: boolean
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
  provider_title: string | null
  subtitle: string | null
  category: ProductCategory | null
  price: number
  old_price: number | null
  provider_price: number | null
  provider_old_price: number | null
  provider_currency: string | null
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
  logo_url: string | null
  override_product_id: string | null
  fa_description: string | null
  custom_category: ProductCategory | null
  is_featured: number | null
  is_bestseller: number | null
}

class ProductsError extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ProductsError'
    this.code = code
  }
}

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

function toProduct(row: ProductRow): AccountProduct {
  return {
    id: row.id,
    title: row.title,
    providerTitle: row.provider_title ?? row.title,
    subtitle: row.subtitle ?? undefined,
    category: row.custom_category ?? row.category ?? 'other',
    customCategory: row.custom_category ?? undefined,
    faDescription: row.fa_description ?? undefined,
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
    description: row.fa_description ?? row.description ?? undefined,
    providerDescription: row.provider_description ?? undefined,
    features: parseFeatures(row.features),
    gradient: row.gradient ?? undefined,
    emoji: row.emoji ?? undefined,
    brandKey: row.brand_key ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    ...(row.override_product_id !== null
      ? { isFeatured: row.is_featured === 1, isBestseller: row.is_bestseller === 1 }
      : {}),
  }
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
        .prepare(`SELECT products.id, products.title, products.provider_title, products.subtitle,
                         products.category, products.price, products.old_price,
                         products.provider_price, products.provider_old_price, products.provider_currency,
                         products.stock, products.rating, products.review_count, products.badge,
                         products.delivery_time, products.description, products.provider_description,
                         products.features, products.gradient, products.emoji, products.brand_key,
                         products.logo_url, product_overrides.product_id AS override_product_id,
                         product_overrides.fa_description, product_overrides.custom_category,
                         product_overrides.is_featured, product_overrides.is_bestseller
                  FROM products
                  LEFT JOIN product_overrides ON product_overrides.product_id = products.id
                  WHERE COALESCE(product_overrides.is_deleted, 0) = 0
                  ORDER BY products.title COLLATE NOCASE`)
        .all<ProductRow>()
      if (result.success === false || !Array.isArray(result.results)) {
        throw new Error('D1 did not return catalogue results')
      }
      rows = result.results
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

    let marginTiers: Array<{ upToUsd: number | null; percent: number }> | undefined
    try {
      const tiersRow = await db
        .prepare("SELECT value FROM settings WHERE key = 'margin_tiers'")
        .bind()
        .first<{ value: string }>()
      const parsed: unknown = tiersRow?.value ? JSON.parse(tiersRow.value) : undefined
      if (Array.isArray(parsed)) {
        marginTiers = parsed as Array<{ upToUsd: number | null; percent: number }>
      }
    } catch {
      // The ladder is advisory; clients fall back to the built-in tiers.
    }

    const products = rows.map(toProduct)

    return jsonResponse({
      success: true,
      data: products,
      meta: {
        count: products.length,
        fetchedAt: new Date().toISOString(),
        ...(usdtRate !== undefined ? { usdtRate } : {}),
        ...(marginTiers ? { marginTiers } : {}),
      },
    })
  } catch (error) {
    return failureResponse(error)
  }
}
