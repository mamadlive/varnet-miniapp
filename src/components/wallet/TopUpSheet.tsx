import { useMemo, useState } from 'react'
import { Check, Copy, CreditCard, Plus, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCardNumber, formatCount, formatCurrency, currencyLabel } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAdminStore } from '@/store/adminStore'
import type { Currency } from '@/types'

const PRESET_AMOUNTS = [100_000, 250_000, 500_000, 1_000_000] as const
const MIN_AMOUNT = 10_000
const MAX_AMOUNT = 10_000_000
const DEFAULT_PRESET = 250_000

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
  /** Called with a validated positive amount; resolves once the wallet updated. */
  onConfirm: (amount: number) => Promise<void> | void
  currency?: Currency
  loading?: boolean
}

/**
 * Bottom sheet for the demo wallet top-up: quick presets plus a custom amount.
 * Real payment providers (Stars / crypto / card) plug into the same `onConfirm`.
 */
export function TopUpSheet({
  open,
  onClose,
  onConfirm,
  currency = 'IRT',
  loading = false,
}: TopUpSheetProps) {
  const [preset, setPreset] = useState<number | null>(DEFAULT_PRESET)
  const [custom, setCustom] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<'card' | 'holder' | null>(null)
  const { haptic } = useTelegram()
  const bankDetails = useAdminStore((state) => state.bankDetails)

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

  const customValue = useMemo(() => {
    const trimmed = custom.trim()
    if (trimmed === '') return null
    const parsed = Number.parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }, [custom])

  const amount = customValue ?? preset
  const hasCustom = custom.trim() !== ''
  const customInvalid =
    hasCustom && (customValue === null || customValue < MIN_AMOUNT || customValue > MAX_AMOUNT)
  const valid = amount !== null && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT
  const busy = submitting || loading

  const reset = () => {
    setPreset(DEFAULT_PRESET)
    setCustom('')
    setSubmitting(false)
    setError(null)
    setCopiedField(null)
  }

  const handlePreset = (value: number) => {
    haptic()
    setPreset(value)
    setCustom('')
    setError(null)
  }

  const handleConfirm = async () => {
    if (!valid || amount === null || busy) return
    haptic('medium')
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm(amount)
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
            disabled={!valid}
            onClick={handleConfirm}
            leftIcon={<Plus className="size-4" />}
          >
            {valid && amount !== null
              ? `${fa.wallet.topUp} ${formatCurrency(amount, currency)}`
              : fa.wallet.topUp}
          </Button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-tg-hint">
            حالت نمایشی — تا وقتی داده‌های آزمایشی فعال است، پرداخت واقعی انجام نمی‌شود.
          </p>
          {error ? (
            <p className="mt-1 text-center text-[11px] font-medium text-tg-destructive">{error}</p>
          ) : null}
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[13px] font-medium text-tg-hint">مبلغ</p>
          <div className="grid grid-cols-4 gap-2">
            {PRESET_AMOUNTS.map((value) => {
              const active = !hasCustom && preset === value
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  aria-label={`افزایش موجودی به مبلغ ${formatCurrency(value, currency)}`}
                  onClick={() => handlePreset(value)}
                  className={cn(
                    'h-12 rounded-xl border text-[13px] font-semibold tabular-nums transition-colors duration-150',
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

        <Input
          label="مبلغ دلخواه"
          type="number"
          inputMode="numeric"
          min={MIN_AMOUNT}
          max={MAX_AMOUNT}
          step="1000"
          placeholder="مثلاً 200000"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          error={
            customInvalid
              ? `مبلغی بین ${formatCurrency(MIN_AMOUNT, currency)} و ${formatCurrency(MAX_AMOUNT, currency)} وارد کنید.`
              : undefined
          }
          trailing={
            <span className="shrink-0 text-[12px] font-medium text-tg-hint">{currencyLabel(currency)}</span>
          }
        />

        <div className="rounded-2xl border border-dashed border-brand-500/40 bg-brand-500/[0.06] p-3.5">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-tg-text">
            <CreditCard className="size-4 text-brand-600" aria-hidden />
            کارت به کارت (دستی)
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-tg-hint">
            پیش از فعال شدن درگاه خودکار، مبلغ را به کارت زیر واریز کنید و تصویر رسید را از بخش
            «پشتیبانی» برای ما بفرستید.
          </p>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-tg-bg px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] text-tg-hint">شماره کارت</p>
                <p
                  dir="ltr"
                  className="bidi-ltr mt-0.5 truncate text-[13px] font-semibold tabular-nums text-tg-text"
                >
                  {formatCardNumber(bankDetails.cardNumber)}
                </p>
              </div>
              <CopyButton
                copied={copiedField === 'card'}
                onClick={() => void copyValue(bankDetails.cardNumber, 'card')}
              />
            </div>

            <div className="flex items-center justify-between gap-2 rounded-xl bg-tg-bg px-3 py-2">
              <div className="min-w-0">
                <p className="text-[10px] text-tg-hint">نام صاحب حساب</p>
                <p className="mt-0.5 truncate text-[13px] font-semibold text-tg-text">
                  {bankDetails.accountHolder}
                </p>
              </div>
              <CopyButton
                copied={copiedField === 'holder'}
                onClick={() => void copyValue(bankDetails.accountHolder, 'holder')}
              />
            </div>

            {bankDetails.bankName ? (
              <p className="px-1 text-[11px] text-tg-hint">بانک: {bankDetails.bankName}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-tg-secondary-bg p-3 text-[12px] leading-relaxed text-tg-hint">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
          <p>
            در حالت نمایشی، مبلغ فوراً به موجودی اضافه می‌شود. نسخه نهایی از تلگرام استارز، USDT
            (TRC20) و درگاه کارت بانکی پشتیبانی می‌کند.
          </p>
        </div>
      </div>
    </Sheet>
  )
}
