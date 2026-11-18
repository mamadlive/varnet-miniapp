import { PRODUCT_CATEGORIES } from '../../../../src/lib/productCategories'
import type { ProductCategory } from '../../../../src/types'
import { authenticateAdmin, failure, jsonResponse, type PagesContext } from '../_shared'

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
      return failure(400, 'OVERRIDE_BAD_REQUEST', 'ساختار درخواست نامعتبر است.')
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return failure(400, 'OVERRIDE_BAD_REQUEST', 'ساختار درخواست نامعتبر است.')
    }

    const { productId, faDescription, customCategory, isFeatured, isBestseller } = body as Record<string, unknown>
    if (typeof productId !== 'string' || productId.trim() === '') {
      return failure(400, 'OVERRIDE_INVALID_PRODUCT_ID', 'شناسه محصول نامعتبر است.')
    }
    if (faDescription !== null && typeof faDescription !== 'string') {
      return failure(400, 'OVERRIDE_INVALID_DESCRIPTION', 'توضیحات محصول نامعتبر است.')
    }
    if (customCategory !== null && (
      typeof customCategory !== 'string' || !PRODUCT_CATEGORIES.includes(customCategory as ProductCategory)
    )) {
      return failure(400, 'OVERRIDE_INVALID_CATEGORY', 'دسته‌بندی محصول نامعتبر است.')
    }
    if (typeof isFeatured !== 'boolean' || typeof isBestseller !== 'boolean') {
      return failure(400, 'OVERRIDE_INVALID_FLAGS', 'وضعیت ویژه یا پرفروش بودن محصول نامعتبر است.')
    }

    const db = context.env.DB!
    try {
      const product = await db.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first<{ id: string }>()
      if (!product) return failure(404, 'OVERRIDE_PRODUCT_NOT_FOUND', 'محصول مورد نظر یافت نشد.')
    } catch {
      return failure(503, 'OVERRIDE_PRODUCT_READ_FAILED', 'بررسی محصول در پایگاه‌داده ناموفق بود.')
    }

    try {
      const result = await db.prepare(
        `INSERT INTO product_overrides (product_id, fa_description, custom_category, is_featured, is_bestseller)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
           fa_description = excluded.fa_description,
           custom_category = excluded.custom_category,
           is_featured = excluded.is_featured,
           is_bestseller = excluded.is_bestseller`,
      ).bind(productId, faDescription, customCategory, Number(isFeatured), Number(isBestseller)).run()
      if (!result.success) {
        return failure(503, 'OVERRIDE_SAVE_FAILED', 'ذخیره تنظیمات محصول ناموفق بود.')
      }
    } catch {
      return failure(503, 'OVERRIDE_SAVE_FAILED', 'ذخیره تنظیمات محصول ناموفق بود.')
    }

    return jsonResponse({
      success: true,
      data: { productId, faDescription, customCategory, isFeatured, isBestseller },
    })
  } catch {
    return failure(500, 'OVERRIDE_FAILED', 'عملیات تنظیم محصول ناموفق بود.')
  }
}
