import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ReceiptText,
  Server,
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
import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCount, formatCurrency, formatNumber, formatRelativeTime } from '@/lib/format'
import {
  fetchAdminStats,
  fetchRevenueSeries,
  listAdminOrders,
  listAdminServers,
} from '@/services/admin.service'
import type { AdminStats, Order, RevenuePoint, VpnServer } from '@/types'

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
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [revenue, setRevenue] = useState<RevenuePoint[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [servers, setServers] = useState<VpnServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [statsData, revenueData, ordersData, serversData] = await Promise.all([
        fetchAdminStats(),
        fetchRevenueSeries(),
        listAdminOrders(),
        listAdminServers(),
      ])
      setStats(statsData)
      setRevenue(revenueData)
      setOrders(ordersData)
      setServers(serversData)
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
        const [statsData, revenueData, ordersData, serversData] = await Promise.all([
          fetchAdminStats(),
          fetchRevenueSeries(),
          listAdminOrders(),
          listAdminServers(),
        ])
        if (cancelled) return
        setStats(statsData)
        setRevenue(revenueData)
        setOrders(ordersData)
        setServers(serversData)
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

  const vpnAvailabilityTone: BadgeTone = !stats
    ? 'neutral'
    : stats.vpnNodesOnline === stats.vpnNodesTotal
      ? 'success'
      : stats.vpnNodesOnline === 0
        ? 'danger'
        : 'warning'

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="داشبورد"
        title="نمای کلی"
        description="درآمد، جریان سفارش‌ها و سلامت نودهای آی‌پی ثابت در یک نگاه."
        actions={
          <>
            <span className="inline-flex h-9 items-center gap-2 rounded-xl border border-tg-separator bg-tg-bg px-3 text-[12.5px] font-medium text-tg-text shadow-sm">
              <CalendarDays className="size-4 text-tg-hint" aria-hidden />
              {formatCount(7)} روز گذشته
              <ChevronDown className="size-3.5 text-tg-hint" aria-hidden />
            </span>
            <Button
              variant="secondary"
              size="icon"
              className="size-9"
              aria-label="به‌روزرسانی داشبورد"
              loading={loading}
              onClick={refresh}
            />
          </>
        }
      />

      {error ? (
        <AdminErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          {/* KPI row ------------------------------------------------------ */}
          <section aria-label="شاخص‌های کلیدی" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="کل درآمد"
              value={stats ? formatCurrency(stats.totalRevenue) : '—'}
              icon={Wallet}
              iconClassName="bg-emerald-500/10 text-emerald-600"
              trend={stats?.revenueChange}
              hint="نسبت به هفته گذشته"
              loading={statsLoading}
            />
            <StatCard
              label="کاربران فعال"
              value={stats ? formatNumber(stats.activeUsers) : '—'}
              icon={Users}
              trend={stats?.usersChange}
              hint="نسبت به هفته گذشته"
              loading={statsLoading}
            />
            <StatCard
              label="سفارش‌های امروز"
              value={stats ? formatNumber(stats.ordersToday) : '—'}
              icon={ReceiptText}
              iconClassName="bg-sky-500/10 text-sky-600"
              trend={stats?.ordersChange}
              hint="نسبت به دیروز"
              loading={statsLoading}
            />
            <StatCard
              label="نودهای آنلاین آی‌پی ثابت"
              value={
                stats
                  ? `${formatCount(stats.vpnNodesOnline)}/${formatCount(stats.vpnNodesTotal)}`
                  : '—'
              }
              icon={Server}
              iconClassName="bg-violet-500/10 text-violet-600"
              badge={
                stats ? (
                  <Badge tone={vpnAvailabilityTone}>
                    {formatCount(stats.vpnNodesOnline)} از {formatCount(stats.vpnNodesTotal)}{' '}
                    آنلاین
                  </Badge>
                ) : null
              }
              hint="دسترس‌پذیری ناوگان"
              loading={statsLoading}
            />
          </section>

          {/* Revenue ----------------------------------------------------- */}
          <section aria-label="نمودار درآمد">
            <RevenueChart data={revenue} loading={loading && revenue.length === 0} />
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
              <ServerHealthPanel servers={servers} loading={loading && servers.length === 0} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
