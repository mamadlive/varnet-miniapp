import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  ReceiptText,
  Clock,
  Users,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { AdminErrorState } from '@/components/admin/AdminStates'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DataTable } from '@/components/admin/AdminTable'
import type { DataTableColumn } from '@/components/admin/AdminTable'
import { RevenueChart } from '@/components/admin/RevenueChart'
import { ServerHealthPanel } from '@/components/admin/ServerHealthPanel'
import { StatCard } from '@/components/admin/StatCard'
import { OrderStatusBadge } from '@/components/admin/StatusBadges'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency, formatNumber, formatRelativeTime } from '@/lib/format'
import { fetchAdminStats, listAdminOrders, listAdminNodes } from '@/services/admin.service'
import type { DashboardStats } from '@/services/admin.service'
import type { Order, StaticIpNode } from '@/types'

const RECENT_ORDER_COLUMNS: DataTableColumn<Order>[] = [
  {
    key: 'order',
    header: 'سفارش',
    render: (order) => (
      <span className="bidi-ltr font-mono text-[12.5px] font-medium text-tg-text">{order.id}</span>
    ),
  },
  {
    key: 'customer',
    header: 'مشتری',
    render: (order) => (
      <span className="text-[13px] text-tg-text">
        {order.userName ?? (
          <span className="bidi-ltr font-mono text-[12px]">{order.userId}</span>
        )}
      </span>
    ),
  },
  {
    key: 'total',
    header: 'مبلغ',
    align: 'right',
    render: (order) => (
      <span className="text-[13px] font-medium tabular-nums text-tg-text">
        {formatCurrency(order.total, order.currency)}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'وضعیت',
    render: (order) => <OrderStatusBadge status={order.status} />,
  },
  {
    key: 'created',
    header: 'زمان ثبت',
    align: 'right',
    render: (order) => (
      <span className="text-[12px] text-tg-hint">{formatRelativeTime(order.createdAt)}</span>
    ),
  },
]

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [nodes, setNodes] = useState<StaticIpNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [statsData, ordersData, serversData] = await Promise.all([
        fetchAdminStats(),
        listAdminOrders(),
        listAdminNodes(),
      ])
      setStats(statsData)
      setOrders(ordersData)
      setNodes(serversData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'بارگیری داشبورد ممکن نشد.')
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => {
    setError(null)
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [statsData, ordersData, serversData] = await Promise.all([
          fetchAdminStats(),
          listAdminOrders(),
          listAdminNodes(),
        ])
        if (cancelled) return
        setStats(statsData)
        setOrders(ordersData)
        setNodes(serversData)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'بارگیری داشبورد ممکن نشد.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const statsLoading = loading && stats === null
  const recentOrders = orders.slice(0, 5)

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="داشبورد"
        title="نمای کلی"
        description="فروش، سفارش‌ها و نودهای فروشگاه در یک نگاه."
        actions={
          <Button
            variant="secondary"
            size="icon"
            className="size-9"
            aria-label="به‌روزرسانی داشبورد"
            loading={loading}
            onClick={refresh}
          />
        }
      />

      {error ? (
        <AdminErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          {/* KPI row ------------------------------------------------------ */}
          <section aria-label="شاخص‌های کلیدی" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="کل فروش"
              value={stats ? formatCurrency(stats.totalSales) : '—'}
              icon={Wallet}
              iconClassName="bg-emerald-500/10 text-emerald-600"
              hint="سفارش‌های پرداخت‌شده و تکمیل‌شده"
              loading={statsLoading}
            />
            <StatCard
              label="کل کاربران"
              value={stats ? formatNumber(stats.totalUsers) : '—'}
              icon={Users}
              loading={statsLoading}
            />
            <StatCard
              label="سفارش‌های در انتظار"
              value={stats ? formatNumber(stats.pendingOrders) : '—'}
              icon={Clock}
              iconClassName="bg-sky-500/10 text-sky-600"
              loading={statsLoading}
            />
            <StatCard
              label="فیش‌های در انتظار"
              value={stats ? formatNumber(stats.pendingReceipts) : '—'}
              icon={ReceiptText}
              iconClassName="bg-violet-500/10 text-violet-600"
              loading={statsLoading}
            />
          </section>

          {/* Revenue ----------------------------------------------------- */}
          <section aria-label="نمودار درآمد">
            <p className="mb-2 text-[12px] text-tg-hint">فروش بر اساس تاریخ ثبت سفارش، در روزهای UTC</p>
            <RevenueChart data={stats?.revenue ?? []} loading={statsLoading} />
          </section>

          {/* Orders + servers ------------------------------------------- */}
          <section className="grid gap-6 xl:grid-cols-3">
            <div className="min-w-0 xl:col-span-2">
              <DataTable<Order>
                columns={RECENT_ORDER_COLUMNS}
                rows={recentOrders}
                rowKey={(order) => order.id}
                loading={loading && orders.length === 0}
                skeletonRows={5}
                minWidthClassName="min-w-[640px]"
                scrollHeightClassName="max-h-[23rem]"
                header={
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[15px] font-semibold text-tg-text">سفارش‌های اخیر</h2>
                      <p className="mt-0.5 text-[12px] text-tg-hint">
                        آخرین فعالیت‌های بازارچه
                      </p>
                    </div>
                    <Link
                      to="/admin/orders"
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-500 transition-colors hover:text-brand-600"
                    >
                      مشاهده همه
                      <ArrowLeft className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                }
                empty={
                  <EmptyState
                    icon={ReceiptText}
                    title="هنوز سفارشی ثبت نشده"
                    description="سفارش‌های جدید بازارچه به‌صورت لحظه‌ای اینجا نمایش داده می‌شوند."
                    className="py-8"
                  />
                }
              />
            </div>
            <div className="min-w-0 xl:col-span-1">
              <ServerHealthPanel nodes={nodes} loading={loading && nodes.length === 0} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
