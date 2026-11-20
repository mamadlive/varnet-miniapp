import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CreditCard,
  Landmark,
  ShieldCheck,
  TicketPercent,
  Wallet,
  X,
} from 'lucide-react'
import { BrandLogo } from '@/components/marketplace/BrandLogo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCardNumber, formatCurrency } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { isApiError } from '@/services/apiClient'
import { validateCoupon } from '@/services/coupons.service'
import type { CouponValidation } from '@/services/coupons.service'
import { fetchBankDetails } from '@/services/payments.service'
import { purchaseProduct } from '@/services/purchase.service'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import type { AccountProduct, BankAccountDetails, Currency, OrderKind, PaymentMethod } from '@/types'
import type { PurchaseSummary, PurchaseTarget } from '@/components/marketplace/types'

/** Artwork source for the summary tile (account products). */
export type PurchaseLogo = Pick<AccountProduct, 'title' | 'logoUrl' | 'emoji' | 'gradient'>

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
  /** Account product whose real brand logo heads the summary row. */
  logo?: PurchaseLogo
  /** Lucide icon used for the summary tile when there is no product logo (VPN plans). */
  icon?: LucideIcon
  /** Catalogue the purchase belongs to; stored on the order row. */
  kind?: OrderKind
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
 * - applies a discount code and recalculates the payable Toman amount,
 * - only «تایید و پرداخت» debits the wallet and records the order in D1.
 *
 * The signed Telegram session is the only identity proof required: there is no
 * phone/KYC gate before payment.
 */
export function PurchaseConfirmSheet({
  open,
  target,
  price,
  currency = 'IRT',
  description,
  logo,
  icon: Icon,
  kind = 'account',
  onConfirm,
  onCancel,
  className,
}: PurchaseConfirmSheetProps) {
  const { haptic, notify } = useTelegram()
  const couponInputId = useId()

  const [couponState, setCouponState] = useState<CouponState | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<{ message: string; code?: string } | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('wallet')
  const [reference, setReference] = useState('')
  const [bank, setBank] = useState<BankAccountDetails | null>(null)
  const [bankLoading, setBankLoading] = useState(false)
  const [bankError, setBankError] = useState<string | null>(null)

  const isOpen = open && target !== null

  useEffect(() => {
    if (!isOpen) return
    setMethod('wallet')
    setReference('')
    setSubmitError(null)
  }, [isOpen, target?.id])

  useEffect(() => {
    if (!isOpen || method !== 'card') return
    let cancelled = false
    setBankLoading(true)
    setBankError(null)
    fetchBankDetails()
      .then((details) => {
        if (cancelled) return
        setBank(details)
        if (!details.cardNumber || !details.accountHolder) {
          setBankError('اطلاعات کارت هنوز توسط پشتیبانی تنظیم نشده است.')
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setBankError(cause instanceof Error ? cause.message : 'دریافت اطلاعات کارت انجام نشد.')
        }
      })
      .finally(() => {
        if (!cancelled) setBankLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, method])
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
    setSubmitError(null)
    updateCoupon(EMPTY_COUPON)
  }

  const handleConfirm = async () => {
    if (!target || submitting) return

    const trimmedReference = reference.trim()
    if (method === 'card' && trimmedReference.length < 4) {
      setSubmitError({ message: 'شماره پیگیری واریز را کامل وارد کنید.' })
      haptic('heavy')
      return
    }
    if (method === 'card' && bankError) {
      setSubmitError({ message: bankError })
      return
    }

    setSubmitError(null)
    setSubmitting(true)

    try {
      const receipt = await purchaseProduct({
        productId: target.id,
        title: target.title,
        kind,
        subtotal: price,
        discount,
        total,
        currency,
        couponCode: coupon.applied?.coupon.code,
        paymentMethod: method,
        receiptReference: method === 'card' ? trimmedReference : undefined,
      })

      if (method === 'wallet') {
        // D1 is the source of truth for the wallet — mirror the post-debit balance.
        useWalletStore.getState().setBalance(receipt.balance)
        useAuthStore.getState().setWalletBalance(receipt.balance)
      }

      haptic('medium')
      notify('success')
      onConfirm(target, {
        subtotal: price,
        discount,
        total,
        currency,
        coupon: coupon.applied?.coupon,
        paymentMethod: method,
        pending: method === 'card',
      })
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'COUPON_INVALID') {
        updateCoupon({ applied: null, error: cause.message })
      }
      setSubmitError({
        message: cause instanceof Error ? cause.message : 'پرداخت انجام نشد. دوباره تلاش کنید.',
        code: isApiError(cause) ? cause.code : undefined,
      })
      haptic('heavy')
      notify('error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    if (submitting) return
    setSubmitError(null)
    onCancel()
  }

  return (
    <Sheet
        open={isOpen}
        onClose={handleCancel}
        title={fa.marketplace.purchaseConfirmTitle}
        description={fa.marketplace.purchaseNote}
        className={cn('max-h-[90dvh] overflow-y-auto', className)}
        footer={
          <div className="flex flex-col gap-2">
            {submitError ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 p-3"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium leading-relaxed text-red-600 dark:text-red-400">
                    {submitError.message}
                  </p>
                  {submitError.code ? (
                    <p className="mt-0.5 text-[10.5px] text-tg-hint">
                      کد خطا: <span className="bidi-ltr">{submitError.code}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            <Button
              fullWidth
              size="lg"
              loading={submitting}
              disabled={price <= 0 || (method === 'card' && (total === 0 || bankError !== null))}
              onClick={handleConfirm}
              leftIcon={
                method === 'card' ? (
                  <CreditCard className="size-4" aria-hidden />
                ) : (
                  <Wallet className="size-4" aria-hidden />
                )
              }
            >
              {submitting
                ? 'در حال ثبت…'
                : method === 'card'
                  ? 'ثبت سفارش و ارسال فیش'
                  : fa.common.confirmAndPay}
            </Button>
            <Button
              fullWidth
              size="md"
              variant="secondary"
              disabled={submitting}
              onClick={handleCancel}
            >
              {fa.common.cancel}
            </Button>
          </div>
        }
      >
        {target ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-tg-separator bg-tg-secondary-bg/60 p-3">
              {logo ? (
                <BrandLogo
                  product={logo}
                  size="lg"
                  className={cn(
                    'bg-gradient-to-br text-white shadow-sm shadow-brand-500/25 ring-1 ring-white/25',
                    logo.gradient ?? 'from-brand-500 to-brand-700',
                  )}
                />
              ) : (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-500/25 ring-1 ring-white/25">
                  {Icon ? (
                    <Icon className="size-5" aria-hidden />
                  ) : (
                    <ShieldCheck className="size-5" aria-hidden />
                  )}
                </span>
              )}

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
                  onChange={(event) => {
                    setSubmitError(null)
                    updateCoupon({ code: event.target.value, applied: null, error: null })
                  }}
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

            <div className="space-y-2">
              <p className="text-[13px] font-medium text-tg-hint">روش پرداخت</p>
              <div className="grid gap-2">
                <button
                  type="button"
                  aria-pressed={method === 'wallet'}
                  onClick={() => {
                    if (method === 'wallet') return
                    haptic('light')
                    setMethod('wallet')
                    setSubmitError(null)
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border p-3 text-start transition-colors',
                    method === 'wallet'
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-tg-separator bg-tg-bg hover:bg-tg-secondary-bg',
                  )}
                >
                  <Wallet
                    className={cn('size-5 shrink-0', method === 'wallet' ? 'text-brand-600' : 'text-tg-hint')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-tg-text">پرداخت آنی از کیف پول</span>
                    <span className="block text-[11px] text-tg-hint">کسر مستقیم مبلغ از موجودی کیف پول</span>
                  </span>
                </button>

                <button
                  type="button"
                  aria-pressed={method === 'card'}
                  onClick={() => {
                    if (method === 'card') return
                    haptic('light')
                    setMethod('card')
                    setSubmitError(null)
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border p-3 text-start transition-colors',
                    method === 'card'
                      ? 'border-brand-500 bg-brand-500/10'
                      : 'border-tg-separator bg-tg-bg hover:bg-tg-secondary-bg',
                  )}
                >
                  <CreditCard
                    className={cn('size-5 shrink-0', method === 'card' ? 'text-brand-600' : 'text-tg-hint')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-tg-text">کارت به کارت</span>
                    <span className="block text-[11px] text-tg-hint">واریز به کارت و ثبت شماره پیگیری</span>
                  </span>
                </button>

                <div className="flex items-center gap-3 rounded-2xl border border-dashed border-tg-separator bg-tg-secondary-bg/40 p-3 opacity-60">
                  <Landmark className="size-5 shrink-0 text-tg-hint" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-tg-text">
                      درگاه پرداخت آنلاین <span className="text-[10.5px] font-medium text-tg-hint">(به زودی)</span>
                    </span>
                    <span className="block text-[11px] text-tg-hint">پرداخت خودکار با کارت بانکی</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-tg-secondary-bg px-2 py-0.5 text-[10px] text-tg-hint">
                    غیرفعال
                  </span>
                </div>
              </div>
            </div>

            {method === 'card' && total === 0 ? (
              <p className="text-[12px] text-tg-hint">برای سفارش رایگان، روش کیف پول را انتخاب کنید.</p>
            ) : method === 'card' ? (
              <div className="space-y-2.5 rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/[0.06] p-3.5">
                <p className="text-[12.5px] font-semibold text-tg-text">کارت مقصد واریز</p>
                {bankLoading ? (
                  <p className="text-[11.5px] text-tg-hint">در حال دریافت اطلاعات کارت…</p>
                ) : bankError ? (
                  <p className="text-[11.5px] font-medium text-tg-destructive">{bankError}</p>
                ) : bank ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-tg-bg px-3 py-2">
                      <span className="text-[10.5px] text-tg-hint">شماره کارت</span>
                      <span dir="ltr" className="bidi-ltr text-[13px] font-semibold tabular-nums text-tg-text">
                        {formatCardNumber(bank.cardNumber)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-tg-bg px-3 py-2">
                      <span className="text-[10.5px] text-tg-hint">نام صاحب حساب</span>
                      <span className="text-[13px] font-semibold text-tg-text">{bank.accountHolder}</span>
                    </div>
                    {bank.bankName ? (
                      <p className="px-1 text-[11px] text-tg-hint">بانک: {bank.bankName}</p>
                    ) : null}
                  </div>
                ) : null}

                <Input
                  value={reference}
                  onChange={(event) => {
                    setReference(event.target.value)
                    setSubmitError(null)
                  }}
                  label="شماره پیگیری / کد رهگیری واریز"
                  placeholder="مثلاً 123456789"
                  className="bidi-ltr text-[13px]"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-[11px] leading-relaxed text-tg-hint">
                  ابتدا مبلغ <bdi>{totalLabel}</bdi> را به کارت بالا واریز کنید، سپس شماره پیگیری را
                  ثبت کنید. سفارش پس از تایید فیش توسط ادمین تکمیل می‌شود.
                </p>
              </div>
            ) : null}

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
  )
}
