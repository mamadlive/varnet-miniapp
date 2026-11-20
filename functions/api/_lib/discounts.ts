import type { D1Database } from './userAuth'

/** D1 row, with integer amounts in Toman. */
export interface DiscountCodeRow {
  id: string
  code: string
  type: 'percent' | 'fixed'
  value: number
  min_subtotal: number | null
  max_discount: number | null
  usage_limit: number | null
  used_count: number
  is_active: number
  expires_at: string | null
  description: string | null
}

export interface DiscountCoupon {
  id: string
  code: string
  type: 'percent' | 'fixed'
  value: number
  minSubtotal?: number
  maxDiscount?: number
  usageLimit?: number
  usedCount: number
  active: boolean
  expiresAt?: string
  description?: string
}

export type DiscountValidation =
  | { ok: true; coupon: DiscountCoupon; discount: number; total: number }
  | { ok: false; status: number; code: string; message: string }

export function toDiscountCoupon(row: DiscountCodeRow): DiscountCoupon {
  return {
    id: row.id, code: row.code, type: row.type, value: row.value,
    minSubtotal: row.min_subtotal ?? undefined, maxDiscount: row.max_discount ?? undefined,
    usageLimit: row.usage_limit ?? undefined, usedCount: row.used_count,
    active: row.is_active === 1, expiresAt: row.expires_at ?? undefined,
    description: row.description ?? undefined,
  }
}

/** Read the current row; SQLite's NOCASE collation makes lookup case-insensitive. */
export async function findDiscountCode(db: D1Database, code: string): Promise<DiscountCodeRow | null> {
  return db.prepare('SELECT * FROM discount_codes WHERE code = ? COLLATE NOCASE')
    .bind(code.trim()).first<DiscountCodeRow>()
}

/** Validate a row at a given time. This does not reserve or redeem a usage. */
export function evaluateDiscount(row: DiscountCodeRow | null, subtotal: number, now = Date.now()): DiscountValidation {
  const reject = (code: string, message: string): DiscountValidation => ({ ok: false, status: 400, code, message })
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) return reject('COUPON_INVALID_SUBTOTAL', 'مبلغ سفارش نامعتبر است.')
  if (!row) return reject('COUPON_NOT_FOUND', 'این کد تخفیف وجود ندارد.')
  if (row.is_active !== 1) return reject('COUPON_INACTIVE', 'این کد تخفیف غیرفعال شده است.')
  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime()
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return reject('COUPON_EXPIRED', 'این کد تخفیف منقضی شده است.')
  }
  if (row.usage_limit !== null && row.used_count >= row.usage_limit) return reject('COUPON_EXHAUSTED', 'ظرفیت استفاده از این کد تکمیل شده است.')
  if (row.min_subtotal !== null && subtotal < row.min_subtotal) {
    return reject('COUPON_MIN_SUBTOTAL', `این کد برای خریدهای بالای ${new Intl.NumberFormat('fa-IR').format(row.min_subtotal)} تومان فعال است.`)
  }
  const raw = row.type === 'percent' ? subtotal * row.value / 100 : Math.min(row.value, subtotal)
  const capped = row.max_discount !== null ? Math.min(raw, row.max_discount) : raw
  const discount = Math.max(0, Math.min(Math.round(capped / 1000) * 1000, subtotal))
  if (discount <= 0) return reject('COUPON_NO_DISCOUNT', 'این کد برای این سفارش تخفیفی ندارد.')
  return { ok: true, coupon: toDiscountCoupon(row), discount, total: Math.max(subtotal - discount, 0) }
}

/** Fetch and validate; checkout must separately perform an atomic conditional redemption. */
export async function validateDiscountCode(db: D1Database, code: string, subtotal: number, now = Date.now()): Promise<DiscountValidation> {
  if (!code.trim()) return { ok: false, status: 400, code: 'COUPON_REQUIRED', message: 'کد تخفیف را وارد کنید.' }
  return evaluateDiscount(await findDiscountCode(db, code), subtotal, now)
}
