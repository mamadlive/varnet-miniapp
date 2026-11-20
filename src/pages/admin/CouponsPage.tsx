import { useEffect, useMemo, useState } from 'react'
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
import { deleteCoupon, listCoupons, saveCoupon, setCouponActive } from '@/services/coupons.service'
import type { Coupon, DiscountType } from '@/types'

const MAX_FIXED_DISCOUNT = 10_000_000

interface CouponDraft {
  code: string
  value: string
  minSubtotal: string
  maxDiscount: string
  usageLimit: string
  expiresAt: string
  description: string
}

const EMPTY_DRAFT: CouponDraft = {
  code: '',
  value: '',
  minSubtotal: '',
  maxDiscount: '',
  usageLimit: '',
  expiresAt: '',
  description: '',
}

function toOptionalNumber(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value)
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [editing, setEditing] = useState<Coupon | null>(null)
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [type, setType] = useState<DiscountType>('percent')
  const [draft, setDraft] = useState<CouponDraft>(EMPTY_DRAFT)
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listCoupons().then((data) => { if (!cancelled) setCoupons(data) })
      .catch((cause: unknown) => { if (!cancelled) { setLoadError(true); setError(cause instanceof Error ? cause.message : 'دریافت کدها انجام نشد.') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

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
    setEditing(null)
    setDraft(EMPTY_DRAFT)
    setFormError(null)
  }

  const closeForm = () => {
    setFormOpen(false)
    resetForm()
  }

  const openEdit = (coupon: Coupon) => {
    setEditing(coupon)
    setType(coupon.type)
    const localDate = coupon.expiresAt ? new Date(coupon.expiresAt) : null
    const expiresAt = localDate && Number.isFinite(localDate.getTime())
      ? new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : ''
    setDraft({ code: coupon.code, value: String(coupon.value), minSubtotal: coupon.minSubtotal?.toString() ?? '',
      maxDiscount: coupon.maxDiscount?.toString() ?? '', usageLimit: coupon.usageLimit?.toString() ?? '',
      expiresAt, description: coupon.description ?? '' })
    setFormError(null)
    setFormOpen(true)
  }

  const handleCreate = async () => {
    if (busy) return
    const code = draft.code.trim().toUpperCase()

    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
      setFormError('کد باید ۳ تا ۲۴ کاراکتر انگلیسی، عدد، خط تیره یا زیرخط باشد.')
      return
    }
    if (coupons.some((coupon) => coupon.id !== editing?.id && coupon.code.toUpperCase() === code)) {
      setFormError('این کد قبلاً ساخته شده است.')
      return
    }

    const value = toOptionalNumber(draft.value)
    if (value === undefined || !Number.isSafeInteger(value) || value <= 0) {
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

    const minSubtotal = toOptionalNumber(draft.minSubtotal)
    const maxDiscount = toOptionalNumber(draft.maxDiscount)
    const usageLimit = toOptionalNumber(draft.usageLimit)
    if ([minSubtotal, maxDiscount, usageLimit].some((n) => n !== undefined && (!Number.isSafeInteger(n) || n < 0)) || usageLimit === 0) {
      setFormError('شرایط کد باید اعداد صحیح و معتبر باشند.')
      return
    }
    const expiryDate = draft.expiresAt ? new Date(draft.expiresAt) : null
    if (expiryDate && !Number.isFinite(expiryDate.getTime())) {
      setFormError('تاریخ انقضا نامعتبر است.')
      return
    }
    const originalExpiry = editing?.expiresAt ? new Date(editing.expiresAt).getTime() : NaN
    const expiryDifference = expiryDate ? originalExpiry - expiryDate.getTime() : NaN
    const expiresAt = expiryDifference >= 0 && expiryDifference < 60_000
      ? editing?.expiresAt : expiryDate?.toISOString()
    setBusy(true)
    try {
      const saved = await saveCoupon({ code, type, value, minSubtotal,
        maxDiscount: type === 'percent' ? maxDiscount : undefined,
        active: editing?.active ?? true, usageLimit, expiresAt,
        description: draft.description.trim() || undefined }, editing?.id)
      setCoupons((previous) => editing ? previous.map((item) => item.id === saved.id ? saved : item) : [...previous, saved])
      setNotice(`کد ${code} ذخیره شد.`)
      closeForm()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'ذخیره کد انجام نشد.')
    } finally {
      setBusy(false)
    }
  }

  const toggleCoupon = async (coupon: Coupon) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const saved = await setCouponActive(coupon.id, !coupon.active)
      setCoupons((previous) => previous.map((item) => item.id === saved.id ? saved : item))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تغییر وضعیت انجام نشد.')
    } finally { setBusy(false) }
  }

  const removeCoupon = async (coupon: Coupon) => {
    if (busy || !window.confirm(`کد ${coupon.code} حذف شود؟`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteCoupon(coupon.id)
      setCoupons((previous) => previous.filter((item) => item.id !== coupon.id))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'حذف کد انجام نشد.')
    } finally { setBusy(false) }
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
            disabled={busy}
            onCheckedChange={() => void toggleCoupon(coupon)}
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
    {
      key: 'actions', header: 'عملیات',
      render: (coupon) => (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => openEdit(coupon)}>ویرایش</Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => void removeCoupon(coupon)}>حذف</Button>
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
            disabled={loading || busy || loadError}
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
      </div>

      {error ? <p role="alert" className="rounded-xl bg-tg-destructive/10 px-3 py-2 text-tg-destructive">{error} <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>تلاش مجدد</Button></p> : null}
      {loading ? <p role="status">در حال دریافت کدها…</p> : null}

      {notice ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12.5px] font-medium text-emerald-600"
        >
          {notice}
        </p>
      ) : null}

      {!loading && !loadError ? <DataTable<Coupon>
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
      /> : null}

      <Sheet
        open={formOpen}
        onClose={() => { if (!busy) closeForm() }}
        title={editing ? 'ویرایش کد تخفیف' : 'کد تخفیف جدید'}
        description="کد پس از ذخیره بلافاصله در چک‌اوت مینی‌اپ قابل استفاده است."
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button className="flex-1" loading={busy} onClick={() => void handleCreate()} leftIcon={<Plus className="size-4" />}>
              {editing ? 'ذخیره تغییرات' : 'ساخت کد'}
            </Button>
            <Button className="flex-1" variant="secondary" disabled={busy} onClick={closeForm}>
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
              label="تاریخ و ساعت انقضا"
              type="datetime-local"
              value={draft.expiresAt}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, expiresAt: event.target.value }))
              }
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
