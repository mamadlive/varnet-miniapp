import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Coins,
  RefreshCw,
  Server,
  ShoppingBag,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import { DataTable, type DataTableColumn } from '@/components/admin/AdminTable'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminErrorState } from '@/components/admin/AdminStates'
import { OrderStatusBadge } from '@/components/admin/StatusBadges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCount, formatCurrency, formatDateTime } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { fetchProviderOverview } from '@/services/admin.service'
import type { ProviderOverview, ProviderPurchase, ProviderSourcedOrder } from '@/types'

/**
 * Admin «ارائهدهنده» tab (`/admin/provider`).
 *
 * Shows the digital-account provider's real wallet balance and purchase history
 * (fetched server-side so the provider key never reaches the browser) next to
 * the provider-sourced D1 orders. The provider is a third party, so an upstream
 * outage is surfaced as a connection status rather than an error.
 */
export default function ProviderPage() {
  const [overview, setOverview] = useState<ProviderOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (mode: 'initial' | 'sync') => {
    if (mode === 'sync') setSyncing(true)
    try {
      const data = await fetchProviderOverview()
      setOverview(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خواندن وضعیت ارائه‌دهنده ممکن نشد.')
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchProviderOverview()
      .then((data) => {
        if (!cancelled) setOverview(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'خواندن وضعیت ارائه‌دهنده ممکن نشد.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const provider = overview?.provider ?? null
  const orders = overview?.orders ?? []
  const purchases = provider?.purchases ?? []

  const orderColumns: DataTableColumn<ProviderSourcedOrder>[] = [
    {
      key: 'title',
      header: 'محصول',
      render: (row) => (
        <div className="min-w-0">
          <p dir="auto" className="truncate text-[13px] font-medium text-tg-text">
            {row.title}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-tg-hint">{row.productId}</p>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'مشتری',
      render: (row) => (
        <span className="text-[12.5px] text-tg-text">{row.userName ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <OrderStatusBadge status={row.status} />
          {row.delivered ? (
            <Badge tone="success" size="sm">
              تحویل‌شده
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'مبلغ',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-[12.5px] text-tg-text">
          {formatCurrency(row.total)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'تاریخ',
      render: (row) => (
        <span className="whitespace-nowrap text-[11.5px] text-tg-hint">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
  ]

  const purchaseColumns: DataTableColumn<ProviderPurchase>[] = [
    {
      key: 'title',
      header: 'عنوان',
      render: (row) => (
        <span dir="auto" className="text-[12.5px] text-tg-text">
          {row.title}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'مبلغ',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums text-[12.5px] text-tg-text">
          {formatCount(row.amount)} {row.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <Badge tone={row.status.toLowerCase() === 'completed' ? 'success' : 'neutral'} size="sm">
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'تاریخ',
      render: (row) => (
        <span className="whitespace-nowrap text-[11.5px] text-tg-hint">
          {row.createdAt ? formatDateTime(row.createdAt) : '—'}
        </span>
      ),
    },
  ]

  const connected = provider?.connected === true

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="سیستم"
        title="ارائه‌دهنده"
        description="موجودی کیف پول و خریدهای ثبت‌شده در پنل تامین‌کننده اکانت‌های دیجیتال، همراه با سفارش‌های مرتبط در فروشگاه."
        meta={
          provider ? (
            <Badge tone={connected ? 'success' : 'warning'} size="sm">
              {connected ? 'متصل' : provider.configured ? 'اتصال ناموفق' : 'تنظیم‌نشده'}
            </Badge>
          ) : null
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="size-4" />}
            loading={syncing}
            onClick={() => void load('sync')}
          >
            همگام‌سازی
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <AdminErrorState message={error} onRetry={() => void load('initial')} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Provider wallet balance ------------------------------------ */}
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600">
                  <Wallet className="size-4.5" aria-hidden />
                </span>
                <p className="text-[12px] font-semibold text-tg-hint">موجودی کیف پول ارائه‌دهنده</p>
              </div>
              {provider?.wallet ? (
                <div className="space-y-1">
                  <p className="text-[22px] font-semibold leading-none tabular-nums text-tg-text">
                    {formatCount(provider.wallet.balance)}
                    <span className="ms-1.5 text-[12.5px] font-normal text-tg-hint">
                      {provider.wallet.currency}
                    </span>
                  </p>
                  {provider.wallet.balanceToman !== null ? (
                    <p className="text-[12px] text-tg-hint">
                      معادل {formatCurrency(provider.wallet.balanceToman)}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-[13px] leading-relaxed text-tg-hint">
                  موجودی کیف پول در دسترس نیست.
                </p>
              )}
              <p className="mt-auto text-[10.5px] text-tg-hint">
                نرخ تبدیل USDT: {formatCount(provider?.usdtRate ?? 0)} تومان
              </p>
            </Card>

            {/* API connection status -------------------------------------- */}
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-xl',
                    connected ? 'bg-emerald-500/12 text-emerald-600' : 'bg-amber-500/15 text-amber-600',
                  )}
                >
                  {connected ? (
                    <CheckCircle2 className="size-4.5" aria-hidden />
                  ) : (
                    <TriangleAlert className="size-4.5" aria-hidden />
                  )}
                </span>
                <p className="text-[12px] font-semibold text-tg-hint">وضعیت اتصال API</p>
              </div>
              <p className="text-[15px] font-semibold text-tg-text">
                {connected
                  ? 'ارتباط با ارائه‌دهنده برقرار است'
                  : provider?.configured
                    ? 'ارتباط با ارائه‌دهنده برقرار نشد'
                    : 'کلید ارائه‌دهنده تنظیم نشده است'}
              </p>
              {provider?.message ? (
                <p className="text-[12px] leading-relaxed text-tg-hint">{provider.message}</p>
              ) : null}
              <p className="mt-auto truncate font-mono text-[10.5px] text-tg-hint" dir="ltr">
                {provider?.baseUrl ?? '—'}
              </p>
            </Card>

            {/* Purchase counters ------------------------------------------ */}
            <Card className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600">
                  <ShoppingBag className="size-4.5" aria-hidden />
                </span>
                <p className="text-[12px] font-semibold text-tg-hint">خریدهای ثبت‌شده</p>
              </div>
              <p className="text-[22px] font-semibold leading-none tabular-nums text-tg-text">
                {formatCount(provider?.purchasedCount ?? 0)}
                <span className="ms-1.5 text-[12.5px] font-normal text-tg-hint">در تامین‌کننده</span>
              </p>
              <p className="text-[12px] text-tg-hint">
                {formatCount(orders.length)} سفارش مرتبط در فروشگاه
              </p>
              {provider ? (
                <p className="mt-auto text-[10.5px] text-tg-hint">
                  آخرین به‌روزرسانی {formatDateTime(provider.fetchedAt)}
                </p>
              ) : null}
            </Card>
          </div>

          {/* Provider purchases ------------------------------------------- */}
          <section className="space-y-2">
            <h2 className="text-[15px] font-semibold text-tg-text">خریدهای انجام‌شده از ارائه‌دهنده</h2>
            <p className="text-[12px] leading-relaxed text-tg-hint">
              تاریخچه خریدهای ثبت‌شده در پنل تامین‌کننده؛ در صورت پشتیبانی‌نشدن اندپوینت، خالی
              می‌ماند.
            </p>
            <DataTable
              columns={purchaseColumns}
              rows={purchases}
              rowKey={(row) => row.id}
              minWidthClassName="min-w-[560px]"
              scrollHeightClassName="max-h-[min(48dvh,28rem)]"
              empty={
                <EmptyState
                  icon={Coins}
                  title="خرید ثبت‌شده‌ای دریافت نشد"
                  description="اندپوینت تاریخچه خریدهای تامین‌کننده پاسخ نداده یا هنوز خریدی ثبت نشده است."
                  className="py-8"
                />
              }
            />
          </section>

          {/* Provider-sourced D1 orders ----------------------------------- */}
          <section className="space-y-2">
            <h2 className="text-[15px] font-semibold text-tg-text">سفارش‌های مرتبط از فروشگاه</h2>
            <p className="text-[12px] leading-relaxed text-tg-hint">
              سفارش‌های اکانت دیجیتال در انتظار و تکمیل‌شده که از این ارائه‌دهنده تامین می‌شوند.
            </p>
            <DataTable
              columns={orderColumns}
              rows={orders}
              rowKey={(row) => row.id}
              minWidthClassName="min-w-[720px]"
              empty={
                <EmptyState
                  icon={Server}
                  title="سفارشی ثبت نشده"
                  description="هنوز سفارش اکانت دیجیتال در انتظار یا تکمیل‌شده‌ای ثبت نشده است."
                  className="py-8"
                />
              }
              footer={
                orders.length > 0 ? (
                  <p className="text-[11.5px] text-tg-hint">
                    {formatCount(orders.length)} سفارش · {fa.common.refresh} برای دریافت آخرین وضعیت
                  </p>
                ) : null
              }
            />
          </section>
        </>
      )}
    </div>
  )
}
