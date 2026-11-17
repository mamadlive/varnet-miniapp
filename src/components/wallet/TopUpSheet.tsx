import { useEffect, useState } from 'react'
import { Check, Copy, CreditCard, Landmark, Plus, Sparkles, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCardNumber, formatCount, formatCurrency, currencyLabel } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { fetchBankDetails, submitWalletReceipt } from '@/services/payments.service'
import { useAuthStore } from '@/store/authStore'
import type { BankAccountDetails, Currency } from '@/types'

const PRESET_AMOUNTS = [100_000, 250_000, 500_000] as const
const MIN_AMOUNT = 10_000
const MAX_AMOUNT = 10_000_000

type TopUpMethod = 'instant' | 'card'

function CopyButton({ copied, onClick }: { copied: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[10.5px] font-semibold transition-colors',
        copied
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
          : 'border-tg-separator bg-tg-secondary-bg text-tg-text',
      )}
    >
      {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
      {copied ? 'کپی شد' : 'کپی'}
    </button>
  )
}

export interface TopUpSheetProps {
  open: boolean
  onClose: () => void
  /** Demo-only instant top-up; real card claims are submitted from this sheet. */
  onConfirm: (amount: number) => Promise<void> | void
  currency?: Currency
  loading?: boolean
}

/**
 * Wallet top-up sheet with two payment channels:
 * - card-to-card (default in production): registers a PENDING receipt that an
 *   admin approves before the balance changes,
 * - instant demo credit while the Mini App runs on fixture data.
 * The online gateway option is visible but disabled until it ships.
 */
export function TopUpSheet({
  open,
  onClose,
  onConfirm,
  currency = 'IRT',
  loading = false,
}: TopUpSheetProps) {
  const [amountInput, setAmountInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<'card' | 'holder' | null>(null)
  const [method, setMethod] = useState<TopUpMethod>('card')
  const [reference, setReference] = useState('')
  const [bank, setBank] = useState<BankAccountDetails | null>(null)
  const [bankLoading, setBankLoading] = useState(false)
  const [bankError, setBankError] = useState<string | null>(null)
  const { haptic, notify } = useTelegram()
  const isDemo = useAuthStore((state) => state.isDemo)

  useEffect(() => {
    if (!open) return
    setMethod(isDemo ? 'instant' : 'card')
    setReference('')
    setError(null)
  }, [open, isDemo])

  useEffect(() => {
    if (!open) return
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
  }, [open])

  const copyValue = async (value: string, field: 'card' | 'holder') => {
    try {
      await navigator.clipboard.writeText(value)
      haptic()
      setCopiedField(field)
      window.setTimeout(() => setCopiedField((current) => (current === field ? null : current)), 1800)
    } catch {
      // Clipboard access can be blocked inside the Telegram webview; the value stays readable.
    }
  }

  const parsedAmount = Number(amountInput.trim())
  const amount =
    amountInput.trim() !== '' && Number.isInteger(parsedAmount) ? parsedAmount : null
  const amountInvalid =
    amountInput.trim() !== '' &&
    (amount === null || amount < MIN_AMOUNT || amount > MAX_AMOUNT)
  const valid = amount !== null && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT
  const busy = submitting || loading

  const reset = () => {
    setAmountInput('')
    setSubmitting(false)
    setError(null)
    setCopiedField(null)
    setReference('')
  }

  const selectAmount = (value: number) => {
    haptic()
    setAmountInput(String(value))
    setError(null)
  }

  const handleConfirm = async () => {
    if (!valid || amount === null || busy) return

    if (method === 'card') {
      if (bankError) {
        setError(bankError)
        return
      }
      if (reference.trim().length < 4) {
        setError('شماره پیگیری واریز را کامل وارد کنید.')
        return
      }
    }

    haptic('medium')
    setSubmitting(true)
    setError(null)

    try {
      if (method === 'instant') {
        if (!isDemo) {
          setError('شارژ آنی فقط در حالت نمایشی فعال است؛ از کارت به کارت استفاده کنید.')
          return
        }
        await onConfirm(amount)
      } else {
        await submitWalletReceipt({ amount, reference: reference.trim() })
        notify('success')
        reset()
        onClose()
        return
      }
      reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'افزایش موجودی انجام نشد. دوباره تلاش کنید.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (busy) return
    reset()
    onClose()
  }

  const confirmLabel =
    method === 'card'
      ? 'ثبت فیش واریز'
      : `${fa.wallet.topUp}${amount !== null ? ` ${formatCurrency(amount, currency)}` : ''}`

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={fa.wallet.topUp}
      description="برای خرید اکانت و پلن‌های آی‌پی ثابت، کیف پول را شارژ کنید."
      footer={
        <>
          <Button
            fullWidth
            size="lg"
            loading={busy}
            disabled={!valid || (method === 'card' && bankError !== null)}
            onClick={handleConfirm}
            leftIcon={
              method === 'card' ? <CreditCard className="size-4" /> : <Plus className="size-4" />
            }
          >
            {confirmLabel}
          </Button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-tg-hint">
            {method === 'card'
              ? 'پس از تایید فیش توسط ادمین، موجودی کیف پول شما به‌روزرسانی می‌شود.'
              : 'حالت نمایشی — تا وقتی داده‌های آزمایشی فعال است، پرداخت واقعی انجام نمی‌شود.'}
          </p>
          {error ? (
            <p className="mt-1 text-center text-[11px] font-medium text-tg-destructive">{error}</p>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-tg-hint">روش پرداخت</p>

          <button
            type="button"
            aria-pressed={method === 'card'}
            onClick={() => {
              haptic('light')
              setMethod('card')
              setError(null)
            }}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition-colors',
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

          {isDemo ? (
            <button
              type="button"
              aria-pressed={method === 'instant'}
              onClick={() => {
                haptic('light')
                setMethod('instant')
                setError(null)
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition-colors',
                method === 'instant'
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-tg-separator bg-tg-bg hover:bg-tg-secondary-bg',
              )}
            >
              <Wallet
                className={cn('size-5 shrink-0', method === 'instant' ? 'text-brand-600' : 'text-tg-hint')}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-tg-text">
                  پرداخت آنی از کیف پول (نمایشی)
                </span>
                <span className="block text-[11px] text-tg-hint">افزایش فوری موجودی در حالت آزمایشی</span>
              </span>
            </button>
          ) : null}

          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-tg-separator bg-tg-secondary-bg/40 p-3 opacity-60">
            <Landmark className="size-5 shrink-0 text-tg-hint" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-tg-text">
                درگاه پرداخت آنلاین{' '}
                <span className="text-[10.5px] font-medium text-tg-hint">(به زودی)</span>
              </span>
              <span className="block text-[11px] text-tg-hint">شارژ خودکار با کارت بانکی</span>
            </span>
            <span className="shrink-0 rounded-md bg-tg-secondary-bg px-2 py-0.5 text-[10px] text-tg-hint">
              غیرفعال
            </span>
          </div>
        </div>

        {method === 'card' ? (
          <div className="rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/[0.06] p-3.5">
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-tg-text">
              <CreditCard className="size-4 text-brand-600" aria-hidden />
              کارت مقصد واریز
            </p>

            {bankLoading ? (
              <p className="mt-2 text-[11.5px] text-tg-hint">در حال دریافت اطلاعات کارت…</p>
            ) : bankError ? (
              <p className="mt-2 text-[11.5px] font-medium text-tg-destructive">{bankError}</p>
            ) : bank ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-xl bg-tg-bg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-tg-hint">شماره کارت</p>
                    <p
                      dir="ltr"
                      className="bidi-ltr mt-0.5 truncate text-[13px] font-semibold tabular-nums text-tg-text"
                    >
                      {formatCardNumber(bank.cardNumber)}
                    </p>
                  </div>
                  <CopyButton
                    copied={copiedField === 'card'}
                    onClick={() => void copyValue(bank.cardNumber, 'card')}
                  />
                </div>

                <div className="flex items-center justify-between gap-2 rounded-xl bg-tg-bg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-tg-hint">نام صاحب حساب</p>
                    <p className="mt-0.5 truncate text-[13px] font-semibold text-tg-text">
                      {bank.accountHolder}
                    </p>
                  </div>
                  <CopyButton
                    copied={copiedField === 'holder'}
                    onClick={() => void copyValue(bank.accountHolder, 'holder')}
                  />
                </div>

                {bank.bankName ? (
                  <p className="px-1 text-[11px] text-tg-hint">بانک: {bank.bankName}</p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3">
              <Input
                label="شماره پیگیری / کد رهگیری واریز"
                placeholder="مثلاً 123456789"
                value={reference}
                onChange={(event) => {
                  setReference(event.target.value)
                  setError(null)
                }}
                className="bidi-ltr text-[13px]"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl bg-tg-secondary-bg p-3 text-[12px] leading-relaxed text-tg-hint">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
            <p>در حالت نمایشی، مبلغ فوراً به موجودی اضافه می‌شود.</p>
          </div>
        )}

        <div className="space-y-2.5 rounded-2xl border border-brand-500/30 bg-brand-500/[0.05] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] font-semibold text-tg-text">مبلغ شارژ</p>
            {valid && amount !== null ? (
              <span className="text-[11px] font-medium tabular-nums text-brand-600">
                {formatCurrency(amount, currency)}
              </span>
            ) : null}
          </div>
          <Input
            label="مبلغ شارژ (تومان)"
            type="number"
            inputMode="numeric"
            min={MIN_AMOUNT}
            max={MAX_AMOUNT}
            step="1000"
            required
            placeholder="مبلغ دقیق واریزی، مثلاً 250000"
            value={amountInput}
            onChange={(event) => {
              setAmountInput(event.target.value)
              setError(null)
            }}
            error={
              amountInvalid
                ? `مبلغی بین ${formatCurrency(MIN_AMOUNT, currency)} و ${formatCurrency(MAX_AMOUNT, currency)} وارد کنید.`
                : undefined
            }
            hint={
              amountInvalid
                ? undefined
                : 'همان مبلغی که به کارت مقصد واریز می‌کنید را دقیق وارد کنید.'
            }
            trailing={
              <span className="shrink-0 text-[12px] font-medium text-tg-hint">
                {currencyLabel(currency)}
              </span>
            }
          />

          <div className="grid grid-cols-3 gap-2">
            {PRESET_AMOUNTS.map((value) => {
              const active = amount === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  aria-label={`انتخاب مبلغ ${formatCurrency(value, currency)}`}
                  onClick={() => selectAmount(value)}
                  className={cn(
                    'h-11 rounded-xl border text-[13px] font-semibold tabular-nums transition-colors duration-150',
                    active
                      ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                      : 'border-tg-separator bg-tg-bg text-tg-text hover:bg-tg-secondary-bg',
                  )}
                >
                  <span className="block leading-tight">{formatCount(value)}</span>
                  <span className="block text-[10px] font-medium leading-tight opacity-70">
                    {currencyLabel(currency)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
