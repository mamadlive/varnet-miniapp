import { authenticateUser, type UserContext } from './_lib/userAuth'
import { validateDiscountCode } from './_lib/discounts'
import { failure, jsonResponse } from './admin/_shared'

/** Validation is a preview only; purchase must revalidate and redeem atomically. */
export async function onRequestPost({ request, env }: UserContext): Promise<Response> {
  try {
    const auth = await authenticateUser(request, env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)
    if (!env.DB) return failure(500, 'DB_NOT_CONFIGURED', 'اتصال پایگاه‌داده تنظیم نشده است.')
    const text = await request.text()
    if (text.length > 4096) return failure(413, 'COUPON_INVALID_BODY', 'درخواست بیش از حد بزرگ است.')
    let body: { code?: unknown; subtotal?: unknown }
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      body = parsed as typeof body
    } catch {
      return failure(400, 'COUPON_INVALID_BODY', 'درخواست نامعتبر است.')
    }
    if (typeof body.code !== 'string' || body.code.length > 64) return failure(400, 'COUPON_INVALID_CODE', 'کد تخفیف نامعتبر است.')
    if (typeof body.subtotal !== 'number' || !Number.isSafeInteger(body.subtotal) || body.subtotal < 0) return failure(400, 'COUPON_INVALID_SUBTOTAL', 'مبلغ سفارش نامعتبر است.')
    const result = await validateDiscountCode(env.DB, body.code, body.subtotal)
    if (!result.ok) return failure(result.status, result.code, result.message)
    return jsonResponse({ success: true, data: { coupon: result.coupon, discount: result.discount, total: result.total } })
  } catch {
    return failure(503, 'COUPON_DB_UNAVAILABLE', 'بررسی کد تخفیف انجام نشد. دوباره تلاش کنید.')
  }
}
