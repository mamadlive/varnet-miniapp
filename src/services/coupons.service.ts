import { formatCurrency } from '@/lib/format'
import { couponDiscount, isCouponExhausted, isCouponExpired } from '@/lib/pricing'
import { sleep } from '@/lib/utils'
import { useAdminStore } from '@/store/adminStore'
import type { Coupon } from '@/types'

export interface CouponValidation {
  coupon: Coupon
  discount: number
  total: number
}

/**
 * Validate a customer-entered code against the admin store.
 *
 * The store doubles as the mock backend here, so codes created or disabled in
 * `/admin/coupons` take effect in the Mini App checkout immediately.
 */
export async function validateCoupon(code: string, subtotal: number): Promise<CouponValidation> {
  await sleep(320)

  const normalized = code.trim().toUpperCase()
  if (!normalized) throw new Error('کد تخفیف را وارد کنید.')

  const coupon = useAdminStore
    .getState()
    .coupons.find((item) => item.code.trim().toUpperCase() === normalized)

  if (!coupon) throw new Error('این کد تخفیف وجود ندارد.')
  if (!coupon.active) throw new Error('این کد تخفیف غیرفعال شده است.')
  if (isCouponExpired(coupon)) throw new Error('این کد تخفیف منقضی شده است.')
  if (isCouponExhausted(coupon)) throw new Error('ظرفیت استفاده از این کد تکمیل شده است.')

  if (coupon.minSubtotal !== undefined && subtotal < coupon.minSubtotal) {
    throw new Error(`این کد برای خریدهای بالای ${formatCurrency(coupon.minSubtotal)} فعال است.`)
  }

  const discount = couponDiscount(coupon, subtotal)
  if (discount <= 0) throw new Error('این کد برای این سفارش تخفیفی ندارد.')

  return { coupon, discount, total: Math.max(subtotal - discount, 0) }
}
