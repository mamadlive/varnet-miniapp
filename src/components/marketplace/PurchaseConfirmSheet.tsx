import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { ShieldAlert, ShieldCheck, TicketPercent, Wallet, X } from 'lucide-react'
import { VerificationSheet } from '@/components/miniapp/VerificationSheet'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCurrency } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { validateCoupon } from '@/services/coupons.service'
import type { CouponValidation } from '@/services/coupons.service'
import { useAuthStore } from '@/store/authStore'
import type { Currency } from '@/types'
import type { PurchaseSummary, PurchaseTarget } from '@/components/marketplace/types'

interface CouponState {
  /** Coupon state is scoped to one product so a new sheet opens clean. */
  productId: string
  code: string
  applied: CouponValidation | null
  error: string | null
  checking: boolean
}

const EMPTY_COUPON: Omit<CouponState, 'productId'> = {
  code: '',
  applied: null,
  error: null,
  checking: false,
}

export interface PurchaseConfirmSheetProps {
  /** Controls visibility; the sheet only renders when `open` is true and a target exists. */
  open: boolean
  /** Product being purchased — `null` renders an empty (closed) sheet. */
  target: PurchaseTarget | null
  /** Numeric amount charged before any coupon discount. */
  price: number
  currency?: Currency
  /** Optional product subtitle shown under the title in the summary row. */
  description?: string
  /** Emoji used for the product artwork summary tile (account products). */
  emoji?: string
  /** Lucide icon used for the summary tile when there is no emoji (VPN plans). */
  icon?: LucideIcon
  /** Called with the priced result after the purchase is logged and confirmed. */
  onConfirm: (target: PurchaseTarget, summary: PurchaseSummary) => void
  /** Called on «انصراف», backdrop click, X or Escape. Never logs anything. */
  onCancel: () => void
  className?: string
}

/**
 * Telegram-styled bottom sheet that gates a purchase behind an explicit
 * confirmation step.
 *
 * Responsibilities:
 * - requires phone verification before the first purchase (KYC gate),
 * - applies a discount code and recalculates the payable Toman amount,
 * - only «تایید و پرداخت» records the purchase (console, until checkout lands).
 */
export function PurchaseConfirmSheet({
  open,
  target,
  price,
  currency = 'IRT',
  description,
  emoji,
  icon: Icon,
  onConfirm,
  onCancel,
  className,
}: PurchaseConfirmSheetProps) {
  const { haptic, notify } = useTelegram()
  const user = useAuthStore((state) => state.user)
  const verified = user?.verified === true
  const couponInputId = useId()

  const [couponState, setCouponState] = useState<CouponState | null>(null)
  const [verificationOpen, setVerificationOpen] = useState(false)

  const isOpen = open && target !== null
  const coupon =
    target && couponState?.productId === target.id ? couponState : { productId: '', ...EMPTY_COUPON }

  const updateCoupon = (patch: Partial<Omit<CouponState, 'productId'>>) => {
    if (!target) return
    setCouponState((prev) => ({
      ...(prev && prev.productId === target.id ? prev : { productId: target.id, ...EMPTY_COUPON }),
      ...patch,
    }))
  }

  const discount = coupon.applied?.discount ?? 0
  const total = Math.max(price - discount, 0)
  const subtotalLabel = formatCurrency(price, currency)
  const totalLabel = formatCurrency(total, currency)

  const handleApplyCoupon = async () => {
    if (!target || !coupon.code.trim() || coupon.checking) return
    const productId = target.id
    updateCoupon({ checking: true, error: null })
    try {
      const result = await validateCoupon(coupon.code, price)
      setCouponState((prev) => ({
        ...(prev ?? { productId, ...EMPTY_COUPON }),
        productId,
        applied: result,
        code: result.coupon.code,
        error: null,
        checking: false,
      }))
      haptic('light')
    } catch (cause) {
      updateCoupon({
        applied: null,
        error: cause instanceof Error ? cause.message : 'کد تخفیف معتبر نیست. دوباره بررسی کنید.',
        checking: false,
      })
    }
  }

  const removeCoupon = () => {
    haptic('light')
    updateCoupon(EMPTY_COUPON)
  }

  const handleConfirm = () => {
    if (!target || !verified) return
    // TODO(checkout): VPN plans → `provisionVpn()`; digital accounts → the
    // third-party provider proxy once it exists.
    console.log('[VarNet] Purchase clicked — product ID:', target.id, {
      subtotal: price,
      discount,
      total,
      coupon: coupon.applied?.coupon.code,
    })
    haptic('medium')
    notify('success')
    onConfirm(target, {
      subtotal: price,
      discount,
      total,
      currency,
      coupon: coupon.applied?.coupon,
    })
  }

  const handleCancel = () => {
    setVerificationOpen(false)
    onCancel()
  }

  return (
    <>
      <Sheet
        open={isOpen}
        onClose={handleCancel}
        title={fa.marketplace.purchaseConfirmTitle}
        description={fa.marketplace.purchaseNote}
        className={cn('max-h-[90dvh] overflow-y-auto', className)}
        footer={
          <div className="flex flex-col gap-2">
            {verified ? (
              <>
                <Button
                  fullWidth
                  size="lg"
                  onClick={handleConfirm}
                  leftIcon={<Wallet className="size-4" aria-hidden />}
                >
                  {fa.common.confirmAndPay}
                </Button>
                <Button fullWidth size="md" variant="secondary" onClick={handleCancel}>
                  {fa.common.cancel}
                </Button>
              </>
            ) : (
              <>
                <Button
                  fullWidth
                  size="lg"
                  onClick={() => setVerificationOpen(true)}
                  leftIcon={<ShieldCheck className="size-4" aria-hidden />}
                >
                  تأیید هویت برای خرید
                </Button>
                <Button fullWidth size="md" variant="secondary" onClick={handleCancel}>
                  {fa.common.cancel}
                </Button>
              </>
            )}
          </div>
        }
      >
        {target ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-tg-separator bg-tg-secondary-bg/60 p-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[22px] leading-none text-white shadow-sm shadow-brand-500/25 ring-1 ring-white/25">
                {emoji ? (
                  <span aria-hidden>{emoji}</span>
                ) : Icon ? (
                  <Icon className="size-5" aria-hidden />
                ) : (
                  <ShieldCheck className="size-5" aria-hidden />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-tg-text">{target.title}</p>
                {description ? (
                  <p className="mt-0.5 truncate text-[11px] text-tg-hint">{description}</p>
                ) : null}
                <p className="mt-1 text-[14px] font-bold tabular-nums text-tg-text">
                  <bdi>{subtotalLabel}</bdi>
                </p>
              </div>
            </div>

            {!verified ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
                  <ShieldAlert className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-tg-text">
                    برای اولین خرید، احراز هویت لازم است
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-tg-hint">
                    شماره تلفن خود را با تلگرام تأیید کنید تا پرداخت از کیف پول فعال شود.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label
                htmlFor={couponInputId}
                className="block text-[13px] font-medium text-tg-hint"
              >
                کد تخفیف دارید؟
              </label>
              <div className="flex items-start gap-2">
                <Input
                  id={couponInputId}
                  value={coupon.code}
                  onChange={(event) =>
                    updateCoupon({ code: event.target.value, applied: null, error: null })
                  }
                  placeholder="مثلاً VARNET20"
                  spellCheck={false}
                  autoCapitalize="characters"
                  autoComplete="off"
                  disabled={coupon.applied !== null}
                  className="bidi-ltr text-[13px] uppercase"
                  wrapperClassName="flex-1"
                  error={coupon.error ?? undefined}
                />
                {coupon.applied ? (
                  <Button
                    variant="secondary"
                    size="md"
                    className="shrink-0"
                    onClick={removeCoupon}
                    leftIcon={<X className="size-4" aria-hidden />}
                  >
                    حذف
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="md"
                    className="shrink-0"
                    loading={coupon.checking}
                    disabled={!coupon.code.trim()}
                    onClick={handleApplyCoupon}
                  >
                    اعمال
                  </Button>
                )}
              </div>

              {coupon.applied ? (
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-600">
                  <TicketPercent className="size-3.5 shrink-0" aria-hidden />
                  کد <span className="bidi-ltr">{coupon.applied.coupon.code}</span> اعمال شد.
                </p>
              ) : null}
            </div>

            <div className="space-y-2 rounded-2xl border border-tg-separator bg-tg-bg p-3 text-[12.5px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-tg-hint">مبلغ محصول</span>
                <span className="font-medium tabular-nums text-tg-text">
                  <bdi>{subtotalLabel}</bdi>
                </span>
              </div>
              {discount > 0 ? (
                <div className="flex items-center justify-between gap-3 text-emerald-600">
                  <span>تخفیف</span>
                  <span className="font-medium tabular-nums">
                    <bdi>− {formatCurrency(discount, currency)}</bdi>
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-tg-separator pt-2">
                <span className="font-semibold text-tg-text">مبلغ قابل پرداخت</span>
                <span className="text-[14px] font-bold tabular-nums text-tg-text">
                  <bdi>{totalLabel}</bdi>
                </span>
              </div>
            </div>

            <p className="text-[13px] leading-relaxed text-tg-hint">
              {fa.marketplace.purchaseConfirm(target.title, totalLabel)}
            </p>

            <p className="text-center text-[11px] leading-relaxed text-tg-hint">
              با تایید پرداخت،{' '}
              <Link
                to="/app/terms"
                className="font-medium text-brand-600 underline-offset-2 hover:underline"
              >
                قوانین و شرایط
              </Link>{' '}
              را می‌پذیرید.
            </p>
          </div>
        ) : null}
      </Sheet>

      <VerificationSheet open={verificationOpen} onClose={() => setVerificationOpen(false)} />
    </>
  )
}
