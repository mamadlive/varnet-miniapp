import { ApiError, apiGetProxy, apiPostProxy } from '@/services/apiClient'
import { getAdminSessionToken } from '@/services/adminAuth.service'
import { getTelegramInitData } from '@/services/telegram'
import type { Coupon } from '@/types'

export interface CouponValidation {
  coupon: Coupon
  discount: number
  total: number
}

type CouponInput = Omit<Coupon, 'id' | 'usedCount'>
interface Envelope<T> { success?: boolean; data?: T; message?: string; code?: string }

function headers(admin = false): Record<string, string> {
  const result: Record<string, string> = {}
  const initData = getTelegramInitData()
  if (initData) result['X-Telegram-Init-Data'] = initData
  const token = admin ? getAdminSessionToken() : null
  if (token) result.Authorization = `Bearer ${token}`
  return result
}

function unwrap<T>(payload: Envelope<T>): T {
  if (!payload || payload.success !== true || payload.data === undefined) {
    throw new ApiError(payload?.message || 'پاسخ سرور نامعتبر بود.', { code: payload?.code })
  }
  return payload.data
}

/** Preview only: the purchase endpoint must revalidate and redeem atomically. */
export async function validateCoupon(code: string, subtotal: number): Promise<CouponValidation> {
  return unwrap(await apiPostProxy<Envelope<CouponValidation>>('/api/coupon', { code, subtotal }, { headers: headers() }))
}

export async function listCoupons(): Promise<Coupon[]> {
  const data = unwrap(await apiGetProxy<Envelope<Coupon[]>>('/api/admin/coupons', { headers: headers(true) }))
  if (!Array.isArray(data)) throw new ApiError('فهرست کدهای تخفیف نامعتبر است.')
  return data
}

export async function saveCoupon(input: CouponInput, id?: string): Promise<Coupon> {
  return unwrap(await apiPostProxy<Envelope<Coupon>>('/api/admin/coupons', {
    action: id ? 'update' : 'create', id, ...input,
  }, { headers: headers(true) }))
}

export async function setCouponActive(id: string, active: boolean): Promise<Coupon> {
  return unwrap(await apiPostProxy<Envelope<Coupon>>('/api/admin/coupons', { action: 'toggle', id, active }, { headers: headers(true) }))
}

export async function deleteCoupon(id: string): Promise<void> {
  unwrap(await apiPostProxy<Envelope<{ id: string }>>('/api/admin/coupons', { action: 'delete', id }, { headers: headers(true) }))
}
