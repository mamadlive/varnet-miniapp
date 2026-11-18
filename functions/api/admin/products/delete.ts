import { authenticateAdmin, failure, jsonResponse, type PagesContext } from '../_shared'

const MAX_PRODUCT_IDS = 100

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) {
      return failure(auth.status, 'ADMIN_AUTH_FAILED', 'دسترسی به عملیات مدیریتی امکان‌پذیر نیست.')
    }

    let body: unknown
    try {
      body = await context.request.json()
    } catch {
      return failure(400, 'PRODUCT_DELETE_BAD_REQUEST', 'ساختار درخواست نامعتبر است.')
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return failure(400, 'PRODUCT_DELETE_BAD_REQUEST', 'ساختار درخواست نامعتبر است.')
    }

    const { productIds } = body as Record<string, unknown>
    if (!Array.isArray(productIds) || productIds.length === 0 || productIds.length > MAX_PRODUCT_IDS ||
        productIds.some((id) => typeof id !== 'string' || id.trim() === '' || id !== id.trim())) {
      return failure(400, 'PRODUCT_DELETE_INVALID_IDS', 'فهرست شناسه‌های محصول نامعتبر است.')
    }
    const ids = [...new Set(productIds as string[])]
    const db = context.env.DB!

    try {
      const placeholders = ids.map(() => '?').join(', ')
      const result = await db.prepare(`SELECT id FROM products WHERE id IN (${placeholders})`)
        .bind(...ids).all<{ id: string }>()
      if (result.results.length !== ids.length) {
        return failure(404, 'PRODUCT_DELETE_NOT_FOUND', 'یک یا چند محصول مورد نظر یافت نشد.')
      }
    } catch {
      return failure(503, 'PRODUCT_DELETE_READ_FAILED', 'بررسی محصولات در پایگاه‌داده ناموفق بود.')
    }

    try {
      const statements = ids.map((id) => db.prepare(
        `INSERT INTO product_overrides (product_id, is_deleted) VALUES (?, 1)
         ON CONFLICT(product_id) DO UPDATE SET is_deleted = 1`,
      ).bind(id))
      const results = await db.batch(statements)
      if (results.length !== statements.length || results.some((result) => !result.success)) {
        return failure(503, 'PRODUCT_DELETE_SAVE_FAILED', 'حذف محصولات در پایگاه‌داده ناموفق بود.')
      }
    } catch {
      return failure(503, 'PRODUCT_DELETE_SAVE_FAILED', 'حذف محصولات در پایگاه‌داده ناموفق بود.')
    }

    return jsonResponse({ success: true, data: { productIds: ids } })
  } catch {
    return failure(500, 'PRODUCT_DELETE_FAILED', 'عملیات حذف محصول ناموفق بود.')
  }
}
