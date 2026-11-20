import { authenticateAdmin, failure, jsonResponse, type PagesContext } from './_shared'
import { toDiscountCoupon, type DiscountCodeRow } from '../_lib/discounts'

interface CouponInput {
  code: string
  type: 'percent' | 'fixed'
  value: number
  minSubtotal: number | null
  maxDiscount: number | null
  usageLimit: number | null
  active: boolean
  expiresAt: string | null
  description: string | null
}

function parseCoupon(body: Record<string, unknown>): CouponInput | null {
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const type = body.type
  const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
  const optional = (value: unknown, min: number): boolean => value == null || integer(value, min)
  if (!/^[A-Z0-9_-]{3,24}$/.test(code) || (type !== 'percent' && type !== 'fixed') ||
      !integer(body.value, 1, type === 'percent' ? 100 : 10_000_000) ||
      !optional(body.minSubtotal, 0) || !optional(body.maxDiscount, 0) ||
      !optional(body.usageLimit, 1) || typeof body.active !== 'boolean') return null
  if (body.expiresAt != null && (typeof body.expiresAt !== 'string' || !body.expiresAt.trim() || !Number.isFinite(Date.parse(body.expiresAt)))) return null
  if (body.description != null && (typeof body.description !== 'string' || body.description.trim().length > 80)) return null
  return {
    code, type, value: body.value, minSubtotal: (body.minSubtotal as number | null | undefined) ?? null,
    maxDiscount: (body.maxDiscount as number | null | undefined) ?? null,
    usageLimit: (body.usageLimit as number | null | undefined) ?? null, active: body.active,
    expiresAt: body.expiresAt == null ? null : new Date(body.expiresAt as string).toISOString(),
    description: typeof body.description === 'string' ? body.description.trim() || null : null,
  }
}

export async function onRequestGet({ request, env }: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(request, env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)
    const rows = await env.DB!.prepare('SELECT * FROM discount_codes ORDER BY code').all<DiscountCodeRow>()
    return jsonResponse({ success: true, data: rows.results.map(toDiscountCoupon) })
  } catch {
    return failure(503, 'COUPON_DB_UNAVAILABLE', 'دریافت کدهای تخفیف انجام نشد.')
  }
}

/** action=create|update|toggle|delete. Updates never replace used_count. */
export async function onRequestPost({ request, env }: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(request, env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)
    const text = await request.text()
    if (text.length > 4096) return failure(413, 'COUPON_INVALID_BODY', 'درخواست بیش از حد بزرگ است.')
    let body: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      body = parsed as Record<string, unknown>
    } catch {
      return failure(400, 'COUPON_INVALID_BODY', 'درخواست نامعتبر است.')
    }
    const action = body.action
    if (!['create', 'update', 'toggle', 'delete'].includes(action as string)) return failure(400, 'COUPON_INVALID_ACTION', 'عملیات نامعتبر است.')
    const id = action === 'create' ? crypto.randomUUID() : body.id
    if (typeof id !== 'string' || !id.trim() || id.length > 100) return failure(400, 'COUPON_INVALID_ID', 'شناسه کد نامعتبر است.')
    const db = env.DB!
    if (action === 'delete' || action === 'toggle') {
      if (action === 'toggle' && typeof body.active !== 'boolean') return failure(400, 'COUPON_INVALID_INPUT', 'وضعیت نامعتبر است.')
      const result = action === 'delete'
        ? await db.prepare('DELETE FROM discount_codes WHERE id = ?').bind(id).run()
        : await db.prepare('UPDATE discount_codes SET is_active = ? WHERE id = ?').bind(body.active ? 1 : 0, id).run()
      if (!result.success) throw new Error('D1 write failed')
      if (!result.meta?.changes) return failure(404, 'COUPON_NOT_FOUND', 'کد تخفیف پیدا نشد.')
      if (action === 'delete') return jsonResponse({ success: true, data: { id } })
    } else {
      const coupon = parseCoupon(body)
      if (!coupon) return failure(400, 'COUPON_INVALID_INPUT', 'اطلاعات کد تخفیف نامعتبر است.')
      const values = [coupon.code, coupon.type, coupon.value, coupon.minSubtotal, coupon.maxDiscount,
        coupon.usageLimit, coupon.active ? 1 : 0, coupon.expiresAt, coupon.description]
      try {
        const result = action === 'create'
          ? await db.prepare('INSERT INTO discount_codes (code, type, value, min_subtotal, max_discount, usage_limit, is_active, expires_at, description, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(...values, id).run()
          : await db.prepare('UPDATE discount_codes SET code = ?, type = ?, value = ?, min_subtotal = ?, max_discount = ?, usage_limit = ?, is_active = ?, expires_at = ?, description = ? WHERE id = ?').bind(...values, id).run()
        if (!result.success) throw new Error('D1 write failed')
        if (!result.meta?.changes) return failure(404, 'COUPON_NOT_FOUND', 'کد تخفیف پیدا نشد.')
      } catch (error) {
        if (error instanceof Error && /unique constraint failed.*discount_codes\.code/i.test(error.message)) return failure(409, 'COUPON_DUPLICATE', 'این کد قبلاً ساخته شده است.')
        throw error
      }
    }
    const row = await db.prepare('SELECT * FROM discount_codes WHERE id = ?').bind(id).first<DiscountCodeRow>()
    if (!row) return failure(404, 'COUPON_NOT_FOUND', 'کد تخفیف پیدا نشد.')
    return jsonResponse({ success: true, data: toDiscountCoupon(row) }, action === 'create' ? 201 : 200)
  } catch {
    return failure(503, 'COUPON_DB_UNAVAILABLE', 'ذخیره کد تخفیف انجام نشد. دوباره تلاش کنید.')
  }
}
