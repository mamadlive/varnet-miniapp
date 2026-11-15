import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  CheckCircle2,
  Coins,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Save,
  Server,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  Wallet,
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import {
  formatCardNumber,
  formatCount,
  formatCurrency,
  formatDateTime,
  maskSecret,
  normalizeCardNumber,
} from '@/lib/format'
import { AUTO_MARGIN_TIERS } from '@/lib/pricing'
import { useAdminStore } from '@/store/adminStore'
import type { ProviderKeyId } from '@/store/adminStore'

interface ProviderDefinition {
  id: ProviderKeyId
  title: string
  description: string
  envVar: string
  placeholder: string
  icon: LucideIcon
}

const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'accounts',
    title: 'ارائه‌دهنده اکانت‌های دیجیتال',
    description: 'کاتالوگ و تحویل خودکار اکانت‌ها از طریق پروکسی کلادفلر خوانده می‌شود.',
    envVar: 'ACCOUNTS_PROVIDER_API_KEY',
    placeholder: 'sk_accounts_…',
    icon: ShoppingBag,
  },
  {
    id: 'wallet',
    title: 'درگاه کیف پول و پرداخت',
    description: 'واریز، برداشت و تأیید تراکنش‌های کیف پول در سمت سرور انجام می‌شود.',
    envVar: 'PAYMENTS_PROVIDER_API_KEY',
    placeholder: 'sk_pay_…',
    icon: Wallet,
  },
  {
    id: 'vpn',
    title: 'کلید API سرور RADIUS',
    description: 'دسترسی به مسیرهای /v1 برای ساخت، تعلیق و تمدید سرویس آی‌پی ثابت.',
    envVar: 'RADIUS_API_KEY',
    placeholder: 'radius_live_…',
    icon: Server,
  },
]

const MIN_KEY_LENGTH = 8

function ProviderKeyCard({ provider }: { provider: ProviderDefinition }) {
  const credential = useAdminStore((state) => state.providerKeys[provider.id])
  const saveProviderKey = useAdminStore((state) => state.saveProviderKey)
  const clearProviderKey = useAdminStore((state) => state.clearProviderKey)

  const [value, setValue] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const configured = credential.value.length > 0
  const Icon = provider.icon

  const handleSave = () => {
    const trimmed = value.trim()
    if (trimmed.length < MIN_KEY_LENGTH) {
      setError(`کلید باید حداقل ${formatCount(MIN_KEY_LENGTH)} کاراکتر باشد.`)
      return
    }
    saveProviderKey(provider.id, trimmed)
    setValue('')
    setRevealed(false)
    setError(null)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 3200)
  }

  const handleClear = () => {
    if (!configured) return
    if (!window.confirm(`کلید «${provider.title}» حذف شود؟`)) return
    clearProviderKey(provider.id)
    setValue('')
    setError(null)
    setSaved(false)
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14.5px] font-semibold text-tg-text">{provider.title}</h2>
            <Badge tone={configured ? 'success' : 'neutral'} size="sm">
              {configured ? 'تنظیم شده' : 'تنظیم نشده'}
            </Badge>
            {saved ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5" aria-hidden />
                ذخیره شد
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-tg-hint">{provider.description}</p>
          <p className="mt-1 text-[10.5px] text-tg-hint/80">
            متغیر محیطی:{' '}
            <span className="bidi-ltr font-mono text-[10.5px] text-tg-hint">{provider.envVar}</span>
          </p>
        </div>
      </div>

      {configured ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tg-secondary-bg px-3 py-2">
          <ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-hidden />
          <span className="bidi-ltr font-mono text-[12px] text-tg-text">
            {maskSecret(credential.value)}
          </span>
          {credential.updatedAt ? (
            <span className="text-[11px] text-tg-hint">
              آخرین به‌روزرسانی {formatDateTime(credential.updatedAt)}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Input
          label={configured ? 'جایگزینی کلید' : 'کلید API'}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          placeholder={provider.placeholder}
          className="bidi-ltr font-mono text-[12.5px]"
          wrapperClassName="flex-1"
          error={error ?? undefined}
          autoComplete="off"
          spellCheck={false}
          trailing={
            <button
              type="button"
              onClick={() => setRevealed((previous) => !previous)}
              aria-label={revealed ? 'پنهان کردن کلید' : 'نمایش کلید'}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-tg-hint transition-colors hover:bg-tg-secondary-bg hover:text-tg-text"
            >
              {revealed ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          }
        />

        <div className="flex shrink-0 items-center gap-2 sm:pt-[1.65rem]">
          <Button onClick={handleSave} disabled={!value.trim()} leftIcon={<KeyRound className="size-4" />}>
            ذخیره
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            disabled={!configured}
            aria-label={`حذف کلید ${provider.title}`}
            title="حذف کلید"
            className="text-tg-hint hover:text-tg-destructive"
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </Card>
  )
}

/** Manual bank-transfer destination surfaced in the Mini App «افزایش موجودی» sheet. */
function BankTransferCard() {
  const bankDetails = useAdminStore((state) => state.bankDetails)
  const saveBankDetails = useAdminStore((state) => state.saveBankDetails)

  const [cardNumber, setCardNumber] = useState(bankDetails.cardNumber)
  const [accountHolder, setAccountHolder] = useState(bankDetails.accountHolder)
  const [bankName, setBankName] = useState(bankDetails.bankName ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const digits = normalizeCardNumber(cardNumber)

  const handleSave = () => {
    if (digits.length !== 16) {
      setError('شماره کارت باید ۱۶ رقم باشد.')
      return
    }
    if (accountHolder.trim().length < 3) {
      setError('نام صاحب حساب را کامل وارد کنید.')
      return
    }
    saveBankDetails({
      cardNumber: digits,
      accountHolder: accountHolder.trim(),
      bankName: bankName.trim() || undefined,
    })
    setCardNumber(digits)
    setError(null)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 3200)
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
          <CreditCard className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14.5px] font-semibold text-tg-text">کارت دریافت وجه</h2>
            <Badge tone="success" size="sm">
              کارت به کارت
            </Badge>
            {saved ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5" aria-hidden />
                ذخیره شد
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-tg-hint">
            این اطلاعات در برگه افزایش موجودی کیف پول به کاربر نمایش داده می‌شود؛ تا زمان اتصال
            درگاه خودکار، واریز دستی از همین کارت انجام می‌گیرد.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="شماره کارت"
          inputMode="numeric"
          value={cardNumber}
          onChange={(event) => {
            setCardNumber(event.target.value)
            setError(null)
          }}
          placeholder="6037997512345678"
          className="bidi-ltr tabular-nums"
          wrapperClassName="sm:col-span-2"
          error={error ?? undefined}
          hint={digits.length > 0 ? formatCardNumber(digits) : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <Input
          label="نام صاحب حساب"
          value={accountHolder}
          onChange={(event) => {
            setAccountHolder(event.target.value)
            setError(null)
          }}
          placeholder="مثلاً آرش محمدی"
          autoComplete="off"
        />
        <Input
          label="نام بانک (اختیاری)"
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          placeholder="مثلاً بانک ملی ایران"
          autoComplete="off"
          hint={
            bankDetails.updatedAt
              ? `آخرین به‌روزرسانی ${formatDateTime(bankDetails.updatedAt)}`
              : 'شماره کارت و نام صاحب حساب الزامی است.'
          }
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} leftIcon={<Save className="size-4" />}>
          ذخیره اطلاعات کارت
        </Button>
      </div>
    </Card>
  )
}

const MIN_USDT_RATE = 10_000
const MAX_USDT_RATE = 5_000_000

/** «کمتر از ۱ دلار»، «۱ تا ۲ دلار»، «۸ دلار و بیشتر». */
function tierRangeLabel(index: number): string {
  const entry = AUTO_MARGIN_TIERS[index]!
  if (entry.upToUsd === null) {
    return `${formatCount(AUTO_MARGIN_TIERS[index - 1]!.upToUsd!)} دلار و بیشتر`
  }
  if (index === 0) return `کمتر از ${formatCount(entry.upToUsd)} دلار`
  return `${formatCount(AUTO_MARGIN_TIERS[index - 1]!.upToUsd!)} تا ${formatCount(entry.upToUsd)} دلار`
}

/**
 * Toman-per-USDT override for the provider catalogue. The proxy keeps its own
 * `USDT_RATE_TOMAN`, but a saved rate here reprices every product client-side.
 */
function UsdtRateCard() {
  const usdtRateToman = useAdminStore((state) => state.usdtRateToman)
  const serverUsdtRateToman = useAdminStore((state) => state.serverUsdtRateToman)
  const setUsdtRateToman = useAdminStore((state) => state.setUsdtRateToman)

  const [value, setValue] = useState(usdtRateToman > 0 ? String(usdtRateToman) : '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const overridden = usdtRateToman > 0
  const effectiveRate = overridden ? usdtRateToman : serverUsdtRateToman

  const flashSaved = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 3200)
  }

  const handleSave = () => {
    const rate = Number(value.replace(/[,\u066C\s]/g, ''))
    if (!Number.isFinite(rate) || rate <= 0) {
      setError('یک نرخ معتبر وارد کنید.')
      return
    }
    if (rate < MIN_USDT_RATE || rate > MAX_USDT_RATE) {
      setError(
        `نرخ باید بین ${formatCurrency(MIN_USDT_RATE)} و ${formatCurrency(MAX_USDT_RATE)} باشد.`,
      )
      return
    }
    setUsdtRateToman(rate)
    setValue(String(Math.round(rate)))
    setError(null)
    flashSaved()
  }

  const handleReset = () => {
    setUsdtRateToman(0)
    setValue('')
    setError(null)
    flashSaved()
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
          <Coins className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14.5px] font-semibold text-tg-text">نرخ تتر (USDT)</h2>
            <Badge tone={overridden ? 'brand' : 'neutral'} size="sm">
              {overridden ? 'نرخ دستی' : 'نرخ سرور'}
            </Badge>
            {saved ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5" aria-hidden />
                ذخیره شد
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-tg-hint">
            قیمت پایه کاتالوگ ارائه‌دهنده به دلار دیجیتال (USDT) است. نرخ واردشده در این کارت
            جایگزین مقدار <span className="bidi-ltr font-mono">USDT_RATE_TOMAN</span> کلادفلر
            می‌شود و روی همه محصولات اعمال می‌گردد.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Input
          label="نرخ تبدیل (تومان برای هر تتر)"
          inputMode="numeric"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          placeholder={String(serverUsdtRateToman)}
          className="tabular-nums"
          wrapperClassName="flex-1"
          error={error ?? undefined}
          hint={`نرخ مؤثر فعلی: ${formatCurrency(effectiveRate)}`}
        />

        <div className="flex shrink-0 items-center gap-2 sm:pt-[1.65rem]">
          <Button onClick={handleSave} disabled={!value.trim()} leftIcon={<Save className="size-4" />}>
            ذخیره نرخ
          </Button>
          <Button
            variant="secondary"
            onClick={handleReset}
            disabled={!overridden}
            title="بازگشت به نرخ سرور"
          >
            نرخ سرور
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-xl bg-tg-secondary-bg px-3 py-2">
          <span className="text-[12px] text-tg-hint">نرخ سرور (کلادفلر)</span>
          <span className="text-[12.5px] font-semibold tabular-nums text-tg-text">
            {formatCurrency(serverUsdtRateToman)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-tg-secondary-bg px-3 py-2">
          <span className="text-[12px] text-tg-hint">نرخ اعمال‌شده</span>
          <span className="text-[12.5px] font-semibold tabular-nums text-brand-600">
            {formatCurrency(effectiveRate)}
          </span>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[12px] font-medium text-tg-hint">
          سود پلکانی خودکار (بر اساس قیمت پایه تتر)
        </p>
        <ul className="divide-y divide-tg-separator overflow-hidden rounded-xl border border-tg-separator text-[12px]">
          {AUTO_MARGIN_TIERS.map((tier, index) => (
            <li
              key={tier.percent}
              className="flex items-center justify-between px-3 py-1.5"
            >
              <span className="text-tg-hint">{tierRangeLabel(index)}</span>
              <span className="font-semibold tabular-nums text-tg-text">
                {formatCount(tier.percent)}٪
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-tg-hint/80">
          این درصدها به‌صورت خودکار روی همه محصولات اعمال می‌شوند؛ حاشیه سود دستی هر محصول در
          صفحه «محصولات» اولویت دارد.
        </p>
      </div>
    </Card>
  )
}

/**
 * Provider credentials + integration routing.
 *
 * Sensitive by design: real keys belong in the Cloudflare Worker's secret
 * store, never in the browser bundle. The inputs here only exercise the admin
 * UX against an in-memory mock store.
 */
export default function SettingsPage() {
  const providerKeys = useAdminStore((state) => state.providerKeys)
  const configuredCount = PROVIDERS.filter((provider) => providerKeys[provider.id].value).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="سیستم"
        title="تنظیمات"
        description="کارت دریافت وجه، کلیدهای دسترسی ارائه‌دهندگان خارجی و مسیرهای یکپارچه‌سازی. کلیدها فقط در حافظه مرورگر نگه داشته می‌شوند."
        meta={
          <Badge tone={configuredCount > 0 ? 'brand' : 'neutral'} size="sm">
            {formatCount(configuredCount)} از {formatCount(PROVIDERS.length)} کلید تنظیم شده
          </Badge>
        }
      />

      <Card variant="muted" className="flex items-start gap-3 border-amber-500/25 bg-amber-500/10">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
          <LockKeyhole className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-tg-text">
            کلیدهای واقعی را هرگز در فرانت‌اند قرار ندهید
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-tg-hint">
            در محیط تولید، کلیدهای ارائه‌دهنده به‌صورت Secret در Cloudflare Worker نگه‌داری
            می‌شوند و مینی‌اپ فقط با پروکسی امن شما صحبت می‌کند. مقادیر واردشده در این صفحه
            شبیه‌سازی هستند و در localStorage ذخیره نمی‌شوند.
          </p>
        </div>
      </Card>

      <BankTransferCard />

      <UsdtRateCard />

      <div className="grid gap-4 xl:grid-cols-2">
        {PROVIDERS.map((provider) => (
          <ProviderKeyCard key={provider.id} provider={provider} />
        ))}
      </div>

      <Card variant="muted" className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-tg-bg text-tg-hint">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-tg-text">مسیر داده‌ها پس از استقرار</p>
          <ul className="mt-1 list-disc space-y-1 ps-4 text-[12px] leading-relaxed text-tg-hint">
            <li>اکانت‌های دیجیتال و کیف پول: مینی‌اپ ← Cloudflare Worker ← ارائه‌دهنده خارجی</li>
            <li>آی‌پی ثابت: مینی‌اپ ← سرور RADIUS لینوکس با توکن سرور</li>
            <li>کلیدها فقط در لایه سرور خوانده می‌شوند و هرگز به مرورگر ارسال نمی‌شوند.</li>
          </ul>
        </div>
      </Card>
    </div>
  )
}
