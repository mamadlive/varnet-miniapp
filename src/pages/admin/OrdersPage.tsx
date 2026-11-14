import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, MoreHorizontal, ReceiptText, RefreshCw, Search } from 'lucide-react'
import { AdminErrorState } from '@/components/admin/AdminStates'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { DataTable } from '@/components/admin/AdminTable'
import type { DataTableColumn } from '@/components/admin/AdminTable'
import { FilterChips } from '@/components/admin/FilterChips'
import type { FilterChipOption } from '@/components/admin/FilterChips'
import { OrderKindBadge, OrderStatusBadge } from '@/components/admin/StatusBadges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { formatCount, formatCurrency, formatDateTime } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { listAdminOrders } from '@/services/admin.service'
import type { Order, OrderStatus } from '@/types'

type StatusFilter = OrderStatus | 'all'

const STATUS_ORDER: OrderStatus[] = [
  'pending',
  'paid',
  'provisioning',
  'completed',
  'cancelled',
  'refunded',
]

const ORDER_COLUMNS: DataTableColumn<Order>[] = [
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
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-tg-text">
          {order.userName ?? 'مشتری ناشناس'}
        </p>
        <p className="truncate text-[11px] text-tg-hint">
          <span className="bidi-ltr">{order.userId}</span>
        </p>
      </div>
    ),
  },
  {
    key: 'items',
    header: 'اقلام',
    render: (order) => {
      const visibleTitles = order.items
        .slice(0, 2)
        .map((item) => item.title)
        .join('، ')
      const hiddenCount = order.items.length - 2
      const totalQuantity = order.items.reduce((total, item) => total + item.quantity, 0)
      return (
        <div className="max-w-[260px]">
          <p
            className="truncate text-[12.5px] text-tg-text"
            title={order.items.map((item) => item.title).join('، ')}
          >
            {visibleTitles || '—'}
            {hiddenCount > 0 ? ` +${formatCount(hiddenCount)} مورد دیگر` : ''}
          </p>
          <p className="text-[11px] text-tg-hint">
            {formatCount(order.items.length)} قلم · تعداد {formatCount(totalQuantity)}
          </p>
        </div>
      )
    },
  },
  {
    key: 'kind',
    header: 'نوع',
    render: (order) => <OrderKindBadge kind={order.kind} />,
  },
  {
    key: 'total',
    header: 'مبلغ کل',
    align: 'right',
    render: (order) => (
      <span className="text-[13px] font-semibold tabular-nums text-tg-text">
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
    header: 'تاریخ ثبت',
    render: (order) => (
      <span className="whitespace-nowrap text-[12px] text-tg-hint">
        {formatDateTime(order.createdAt)}
      </span>
    ),
  },
  {
    key: 'actions',
    header: 'اقدامات',
    align: 'right',
    render: (order) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-[12px]"
          leftIcon={<Eye className="size-3.5" />}
        >
          مشاهده
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 rounded-lg"
          aria-label={`اقدامات بیشتر برای سفارش ${order.id}`}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </div>
    ),
  },
]

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const load = useCallback(async () => {
    try {
      setOrders(await listAdminOrders())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'بارگیری سفارش‌ها ممکن نشد.')
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
        const data = await listAdminOrders()
        if (!cancelled) setOrders(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'بارگیری سفارش‌ها ممکن نشد.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const statusOptions: FilterChipOption<StatusFilter>[] = useMemo(
    () => [
      { value: 'all', label: 'همه سفارش‌ها', count: orders.length },
      ...STATUS_ORDER.map((status) => ({
        value: status,
        label: fa.orderStatuses[status],
        count: orders.filter((order) => order.status === status).length,
      })),
    ],
    [orders],
  )

  const filteredOrders = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (!needle) return true
      return `${order.id} ${order.userName ?? ''}`.toLowerCase().includes(needle)
    })
  }, [orders, query, statusFilter])

  const filteredRevenue = filteredOrders.reduce((total, order) => total + order.total, 0)
  const hasFilters = statusFilter !== 'all' || query.trim().length > 0

  const clearFilters = () => {
    setStatusFilter('all')
    setQuery('')
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="عملیات"
        title="سفارش‌ها"
        description="همه سفارش‌های اکانت و آی‌پی ثابت ثبت‌شده در مینی‌اپ، همراه با وضعیت و جزئیات تحویل."
        meta={
          <Badge tone="brand" size="sm">
            {formatCount(orders.length)} سفارش
          </Badge>
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="size-4" />}
            loading={loading}
            onClick={refresh}
          >
            {fa.common.refresh}
          </Button>
        }
      />

      {error ? (
        <AdminErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-tg-hint">
            <span>
              نمایش {formatCount(filteredOrders.length)} از {formatCount(orders.length)} سفارش
            </span>
            <span className="text-tg-hint/50">·</span>
            <span className="font-medium tabular-nums text-tg-text">
              {formatCurrency(filteredRevenue)}
            </span>
            <span>در درآمد فیلترشده</span>
          </div>

          <DataTable<Order>
            columns={ORDER_COLUMNS}
            rows={filteredOrders}
            rowKey={(order) => order.id}
            loading={loading && orders.length === 0}
            skeletonRows={7}
            minWidthClassName="min-w-[1020px]"
            header={
              <div className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-[15px] font-semibold text-tg-text">تاریخچه سفارش‌ها</h2>
                    <p className="mt-0.5 text-[12px] text-tg-hint">
                      تعدادها با تغییر فیلترها به‌روز می‌شوند
                    </p>
                  </div>
                  <div className="w-full sm:w-72">
                    <Input
                      icon={Search}
                      placeholder="جستجوی شناسه سفارش یا مشتری…"
                      aria-label="جستجوی سفارش‌ها"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </div>
                </div>
                <FilterChips
                  options={statusOptions}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  label="فیلتر سفارش‌ها بر اساس وضعیت"
                />
              </div>
            }
            empty={
              <EmptyState
                icon={ReceiptText}
                title={hasFilters ? 'سفارشی با این فیلترها پیدا نشد' : 'هنوز سفارشی ثبت نشده'}
                description={
                  hasFilters
                    ? 'وضعیت یا شناسه سفارش دیگری را امتحان کنید یا فیلترها را پاک کنید تا همه سفارش‌ها نمایش داده شوند.'
                    : 'سفارش‌های بازارچه به‌محض تسویه مشتریان اینجا نمایش داده می‌شوند.'
                }
                action={
                  hasFilters ? (
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      پاک کردن فیلترها
                    </Button>
                  ) : undefined
                }
                className="py-8"
              />
            }
            footer={
              <p className="text-[11.5px] text-tg-hint">
                {formatCount(filteredOrders.length)} سفارش · مجموع {formatCurrency(filteredRevenue)}
              </p>
            }
          />
        </>
      )}
    </div>
  )
}
