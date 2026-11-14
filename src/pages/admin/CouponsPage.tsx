import { useMemo, useState } from 'react'
import { Plus, Search, TicketPercent } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DataTable } from '@/components/admin/AdminTable'
import type { DataTableColumn } from '@/components/admin/AdminTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { Switch } from '@/components/ui/Switch'
import { formatCount, formatCurrency, formatDate } from '@/lib/format'
import { describeCouponValue, isCouponExhausted, isCouponExpired } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import { useAdminStore } from '@/store/adminStore'
import type { Coupon, DiscountType } from '@/types'

const MAX_FIXED_DISCOUNT = 10_000_000

interface CouponDraft {
  code: string
  value: string
  minSubtotal: string
  maxDiscount: string
  usageLimit: string
  expiresInDays: string
  description: string
}

const EMPTY_DRAFT: CouponDraft = {
  code: '',
  value: '',
  minSubtotal: '',
  maxDiscount: '',
  usageLimit: '',
  expiresInDays: '30',
  description: '',
}

function toOptionalNumber(value: string): number | undefined {
  const parsed = Number(value.replace(/[^\d.]/g, ''))
  return value.trim() === '' || !Number.isFinite(parsed) ? undefined : Math.round(parsed)
}

export default function CouponsPage() {
  const coupons = useAdminStore((state) => state.coupons)
  const saveCoupon = useAdminStore((state) => state.saveCoupon)
  const toggleCoupon = useAdminStore((state) => state.toggleCoupon)

  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [type, setType] = useState<DiscountType>('percent')
  const [draft, setDraft] = useState<CouponDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return coupons
    return coupons.filter((coupon) =>
      `${coupon.code} ${coupon.description ?? ''}`.toLowerCase().includes(needle),
    )
  }, [coupons, query])

  const activeCount = coupons.filter((coupon) => coupon.active).length
  const redemptions = coupons.reduce((sum, coupon) => sum + coupon.usedCount, 0)

  const resetForm = () => {
    setType('percent')
    setDraft(EMPTY_DRAFT)
    setFormError(null)
  }

  const closeForm = () => {
    setFormOpen(false)
    resetForm()
  }

  const handleCreate = () => {
    const code = draft.code.trim().toUpperCase()

    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
      setFormError('کد باید ۳ تا ۲۴ کاراکتر انگلیسی، عدد، خط تیره یا زیرخط باشد.')
      return
    }
    if (coupons.some((coupon) => coupon.code === code)) {
      setFormError('این کد قبلاً ساخته شده است.')
      return
    }

    const value = toOptionalNumber(draft.value)
    if (value === undefined || value <= 0) {
      setFormError('مقدار تخفیف را وارد کنید.')
      return
    }
    if (type === 'percent' && value > 100) {
      setFormError('درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.')
      return
    }
    if (type === 'fixed' && value > MAX_FIXED_DISCOUNT) {
      setFormError(`مبلغ ثابت نمی‌تواند بیشتر از ${formatCurrency(MAX_FIXED_DISCOUNT)} باشد.`)
      return
    }

    const expiresInDays = toOptionalNumber(draft.expiresInDays)
    const usageLimit = toOptionalNumber(draft.usageLimit)

    const coupon: Coupon = {
      id: `coup_${Date.now().toString(36)}`,
      code,
      type,
      value,
      minSubtotal: toOptionalNumber(draft.minSubtotal),
      maxDiscount: type === 'percent' ? toOptionalNumber(draft.maxDiscount) : undefined,
      active: true,
      usageLimit,
      usedCount: 0,
      expiresAt:
        expiresInDays !== undefined
          ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
          : undefined,
      description: draft.description.trim() || undefined,
    }

    saveCoupon(coupon)
    setNotice(`کد ${code} ساخته شد.`)
    window.setTimeout(() => setNotice(null), 3200)
    closeForm()
  }

  const columns: DataTableColumn<Coupon>[] = [
    {
      key: 'code',
      header: 'کد',
      render: (coupon) => (
        <div className="min-w-0">
          <p className="bidi-ltr w-fit rounded-md bg-tg-secondary-bg px-2 py-1 font-mono text-[12.5px] font-semibold text-tg-text">
            {coupon.code}
          </p>
          <p className="mt-1 max-w-52 truncate text-[11px] text-tg-hint">
            {coupon.description ?? 'بدون توضیح'}
          </p>
        </div>
      ),
    },
    {
      key: 'value',
      header: 'تخفیف',
      render: (coupon) => (
        <Badge tone="brand" size="sm">
          {describeCouponValue(coupon, (amount) => formatCurrency(amount))}
        </Badge>
      ),
    },
    {
      key: 'conditions',
      header: 'شرایط',
      render: (coupon) => (
        <div className="space-y-0.5 text-[11.5px] text-tg-hint">
          <p>
            {coupon.minSubtotal
              ? `حداقل خرید ${formatCurrency(coupon.minSubtotal)}`
              : 'بدون حداقل خرید'}
          </p>
          {coupon.maxDiscount ? (
            <p>سقف تخفیف {formatCurrency(coupon.maxDiscount)}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'usage',
      header: 'استفاده',
      render: (coupon) => {
        const exhausted = isCouponExhausted(coupon)
        return (
          <div>
            <p className={cn('text-[12.5px] font-semibold tabular-nums', exhausted ? 'text-rose-600' : 'text-tg-text')}>
              {formatCount(coupon.usedCount)}
              {coupon.usageLimit !== undefined ? ` از ${formatCount(coupon.usageLimit)}` : ''}
            </p>
            <p className="text-[11px] text-tg-hint">
              {exhausted ? 'ظرفیت تکمیل' : coupon.usageLimit !== undefined ? 'قابل استفاده' : 'نامحدود'}
            </p>
          </div>
        )
      },
    },
    {
      key: 'expiry',
      header: 'انقضا',
      render: (coupon) => {
        const expired = isCouponExpired(coupon)
        return (
          <span className={cn('text-[12px]', expired ? 'font-medium text-rose-600' : 'text-tg-hint')}>
            {coupon.expiresAt ? formatDate(coupon.expiresAt) : 'بدون انقضا'}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (coupon) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={coupon.active}
            label={`${coupon.active ? 'غیرفعال کردن' : 'فعال کردن'} کد ${coupon.code}`}
            onCheckedChange={() => toggleCoupon(coupon.id)}
          />
          <span
            className={cn(
              'text-[12px] font-medium',
              coupon.active ? 'text-tg-text' : 'text-tg-hint',
            )}
          >
            {coupon.active ? 'فعال' : 'غیرفعال'}
          </span>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="فروش"
        title="کدهای تخفیف"
        description="کدهای درصدی و مبلغ ثابت برای مینی‌اپ. وضعیت و موجودی استفاده بلافاصله در چک‌اوت اعمال می‌شود."
        meta={
          <Badge tone="brand" size="sm">
            {formatCount(activeCount)} کد فعال
          </Badge>
        }
        actions={
          <Button
            size="sm"
            leftIcon={<Plus className="size-4" />}
            onClick={() => {
              resetForm()
              setFormOpen(true)
            }}
          >
            کد تخفیف جدید
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-tg-hint">
        <span>{formatCount(coupons.length)} کد ثبت‌شده</span>
        <span className="text-tg-hint/50">·</span>
        <span>{formatCount(redemptions)} استفاده</span>
        <span className="text-tg-hint/50">·</span>
        <span>ذخیره‌سازی آزمایشی در همین مرورگر</span>
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12.5px] font-medium text-emerald-600"
        >
          {notice}
        </p>
      ) : null}

      <DataTable<Coupon>
        columns={columns}
        rows={filtered}
        rowKey={(coupon) => coupon.id}
        minWidthClassName="min-w-[860px]"
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-tg-text">همه کدها</h2>
              <p className="mt-0.5 text-[12px] text-tg-hint">
                با غیرفعال کردن یک کد، چک‌اوت مینی‌اپ همان لحظه آن را رد می‌کند.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <Input
                icon={Search}
                placeholder="جستجوی کد یا توضیح…"
                aria-label="جستجوی کدهای تخفیف"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          </div>
        }
        empty={
          <EmptyState
            icon={TicketPercent}
            title={query.trim() ? 'کدی با این جستجو پیدا نشد' : 'هنوز کد تخفیفی ساخته نشده'}
            description={
              query.trim()
                ? 'عبارت دیگری را امتحان کنید یا جستجو را پاک کنید.'
                : 'اولین کد تخفیف را بسازید تا در چک‌اوت مینی‌اپ قابل استفاده باشد.'
            }
            action={
              query.trim() ? (
                <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
                  پاک کردن جستجو
                </Button>
              ) : undefined
            }
            className="py-8"
          />
        }
        footer={
          <p className="text-[11.5px] text-tg-hint">
            {formatCount(filtered.length)} از {formatCount(coupons.length)} کد نمایش داده می‌شود.
          </p>
        }
      />

      <Sheet
        open={formOpen}
        onClose={closeForm}
        title="کد تخفیف جدید"
        description="کد پس از ذخیره بلافاصله در چک‌اوت مینی‌اپ قابل استفاده است."
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="flex-1" onClick={handleCreate} leftIcon={<Plus className="size-4" />}>
              ساخت کد
            </Button>
            <Button className="flex-1" variant="secondary" onClick={closeForm}>
              انصراف
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="کد تخفیف"
            value={draft.code}
            onChange={(event) => {
              setDraft((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))
              setFormError(null)
            }}
            placeholder="مثلاً MEHRGAN25"
            className="bidi-ltr uppercase"
            hint="فقط حروف انگلیسی، عدد، - و _"
            spellCheck={false}
            autoComplete="off"
            maxLength={24}
          />

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-tg-hint">نوع تخفیف</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="نوع تخفیف">
              {(
                [
                  { value: 'percent', label: 'درصدی' },
                  { value: 'fixed', label: 'مبلغ ثابت' },
                ] as const
              ).map((option) => {
                const active = type === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setType(option.value)
                      setFormError(null)
                    }}
                    className={cn(
                      'h-10 rounded-xl border text-[13px] font-medium transition-colors',
                      active
                        ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                        : 'border-tg-separator bg-tg-bg text-tg-text hover:bg-tg-secondary-bg',
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <Input
            label={type === 'percent' ? 'درصد تخفیف' : 'مبلغ تخفیف'}
            type="number"
            inputMode="numeric"
            min={1}
            max={type === 'percent' ? 100 : MAX_FIXED_DISCOUNT}
            value={draft.value}
            onChange={(event) => {
              setDraft((previous) => ({ ...previous, value: event.target.value }))
              setFormError(null)
            }}
            placeholder={type === 'percent' ? '۲۰' : '۵۰۰۰۰'}
            trailing={
              <span className="shrink-0 text-[12px] font-medium text-tg-hint">
                {type === 'percent' ? '٪' : 'تومان'}
              </span>
            }
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="حداقل خرید (اختیاری)"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.minSubtotal}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, minSubtotal: event.target.value }))
              }
              placeholder="۳۰۰۰۰۰"
              trailing={<span className="shrink-0 text-[12px] text-tg-hint">تومان</span>}
            />
            <Input
              label="سقف تخفیف (اختیاری)"
              type="number"
              inputMode="numeric"
              min={0}
              disabled={type === 'fixed'}
              value={draft.maxDiscount}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, maxDiscount: event.target.value }))
              }
              placeholder="۲۰۰۰۰۰"
              hint={type === 'fixed' ? 'فقط برای کدهای درصدی' : undefined}
              trailing={<span className="shrink-0 text-[12px] text-tg-hint">تومان</span>}
            />
            <Input
              label="سقف استفاده (اختیاری)"
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.usageLimit}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, usageLimit: event.target.value }))
              }
              placeholder="۵۰۰"
              hint="خالی = نامحدود"
            />
            <Input
              label="اعتبار (روز)"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={draft.expiresInDays}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, expiresInDays: event.target.value }))
              }
              placeholder="۳۰"
              hint="خالی = بدون انقضا"
            />
          </div>

          <Input
            label="توضیح (اختیاری)"
            value={draft.description}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, description: event.target.value }))
            }
            placeholder="مثلاً تخفیف کمپین مهرگان"
            maxLength={80}
          />

          {formError ? (
            <p className="rounded-xl bg-tg-destructive/10 px-3 py-2 text-[12px] font-medium text-tg-destructive">
              {formError}
            </p>
          ) : null}
        </div>
      </Sheet>
    </div>
  )
}
