import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ReceiptText, RefreshCw, Search, Undo2 } from 'lucide-react'
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
import { Sheet } from '@/components/ui/Sheet'
import { formatCount, formatCurrency, formatDateTime } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { actOnOrder, listAdminOrders } from '@/services/admin.service'
import type { OrderAction } from '@/services/admin.service'
import type { Order, OrderStatus } from '@/types'

type StatusFilter = OrderStatus | 'all'

interface ActionState {
  order: Order
  action: OrderAction
}

const STATUS_ORDER: OrderStatus[] = [
  'pending',
  'paid',
  'provisioning',
  'completed',
  'cancelled',
  'refunded',
]

function canComplete(order: Order): boolean {
  return order.status === 'paid' || order.status === 'provisioning'
}

function canReject(order: Order): boolean {
  return order.status === 'pending' || order.status === 'paid' || order.status === 'provisioning'
}

function buildColumns(
  onComplete: (order: Order) => void,
  onReject: (order: Order) => void,
): DataTableColumn<Order>[] {
  return [
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
      key: 'payment',
      header: 'پرداخت',
      render: (order) => (
        <Badge tone={order.paymentMethod === 'card' ? 'brand' : 'neutral'} size="sm">
          {order.paymentMethod === 'card' ? 'کارت به کارت' : 'کیف پول'}
        </Badge>
      ),
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
          {canComplete(order) ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[11.5px] text-emerald-600 hover:bg-emerald-500/10"
              leftIcon={<CheckCircle2 className="size-3.5" />}
              onClick={() => onComplete(order)}
            >
              تایید و تکمیل
            </Button>
          ) : null}
          {canReject(order) ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[11.5px] text-red-600 hover:bg-red-500/10"
              leftIcon={<Undo2 className="size-3.5" />}
              onClick={() => onReject(order)}
            >
              رد و بازگشت وجه
            </Button>
          ) : null}
          {!canComplete(order) && !canReject(order) ? (
            <span className="text-[11px] text-tg-hint">—</span>
          ) : null}
        </div>
      ),
    },
  ]
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [actionState, setActionState] = useState<ActionState | null>(null)
  const [note, setNote] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

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

  const openComplete = (order: Order) => {
    setActionError(null)
    setNote(order.deliveryNote ?? '')
    setActionState({ order, action: 'complete' })
  }

  const openReject = (order: Order) => {
    setActionError(null)
    setNote('')
    setActionState({ order, action: 'reject' })
  }

  const columns = useMemo(() => buildColumns(openComplete, openReject), [])

  const closeAction = () => {
    if (actionBusy) return
    setActionState(null)
    setActionError(null)
  }

  const submitAction = async () => {
    if (!actionState || actionBusy) return
    setActionBusy(true)
    setActionError(null)
    setFeedback(null)
    try {
      await actOnOrder(
        actionState.order.id,
        actionState.action,
        actionState.action === 'complete' ? note.trim() : undefined,
      )
      setFeedback(
        actionState.action === 'complete'
          ? 'سفارش تکمیل شد و اطلاعات تحویل برای کاربر ثبت گردید.'
          : 'سفارش رد شد و در صورت پرداخت، مبلغ به کیف پول کاربر برگشت.',
      )
      setActionState(null)
      refresh()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'اقدام روی سفارش انجام نشد.')
    } finally {
      setActionBusy(false)
    }
  }

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

  const isComplete = actionState?.action === 'complete'

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="عملیات"
        title="سفارش‌ها"
        description="همه سفارش‌های واقعی ثبت‌شده در D1، همراه با تایید، تحویل اطلاعات و بازگشت وجه."
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

      {feedback ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
          {feedback}
        </div>
      ) : null}

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
            columns={columns}
            rows={filteredOrders}
            rowKey={(order) => order.id}
            loading={loading && orders.length === 0}
            skeletonRows={7}
            minWidthClassName="min-w-[1100px]"
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
                    : 'سفارش‌های واقعی بازارچه به‌محض ثبت مشتریان اینجا نمایش داده می‌شوند.'
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

      <Sheet
        open={actionState !== null}
        onClose={closeAction}
        title={isComplete ? 'تایید و تکمیل سفارش' : 'رد سفارش و بازگشت وجه'}
        description={
          actionState
            ? `سفارش ${actionState.order.id} · ${formatCurrency(actionState.order.total, actionState.order.currency)}`
            : undefined
        }
        footer={
          <div className="flex flex-col gap-2">
            {actionError ? (
              <p className="rounded-xl border border-red-500/25 bg-red-500/10 p-2.5 text-[12px] font-medium text-red-600 dark:text-red-400">
                {actionError}
              </p>
            ) : null}
            <Button
              fullWidth
              size="lg"
              loading={actionBusy}
              onClick={submitAction}
              leftIcon={isComplete ? <CheckCircle2 className="size-4" /> : <Undo2 className="size-4" />}
            >
              {isComplete ? 'تایید و تکمیل سفارش' : 'رد سفارش و بازگشت وجه'}
            </Button>
            <Button fullWidth variant="secondary" disabled={actionBusy} onClick={closeAction}>
              {fa.common.cancel}
            </Button>
          </div>
        }
      >
        {isComplete ? (
          <div className="space-y-2">
            <label htmlFor="order-delivery-note" className="block text-[13px] font-medium text-tg-hint">
              اطلاعات تحویل (نام کاربری، رمز، لینک کانفیگ…)
            </label>
            <textarea
              id="order-delivery-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={6}
              placeholder="این متن در بخش «سفارش‌های من» به کاربر نمایش داده می‌شود."
              className="w-full rounded-xl border border-tg-separator bg-tg-bg p-3 text-[12.5px] leading-relaxed text-tg-text outline-none focus:border-brand-500"
            />
            <p className="text-[11px] leading-relaxed text-tg-hint">
              سفارش به وضعیت «تحویل شد» تغییر می‌کند و همین متن برای مشتری قابل مشاهده خواهد بود.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[13px] leading-relaxed text-tg-text">
              این سفارش به وضعیت «بازگشت وجه» تغییر می‌کند. اگر پرداخت انجام شده باشد، مبلغ{' '}
              <bdi>{formatCurrency(actionState?.order.total ?? 0)}</bdi> به‌صورت اتمیک به کیف پول
              کاربر برگردانده می‌شود.
            </p>
            <p className="text-[11.5px] leading-relaxed text-tg-hint">
              سفارش‌های کارت به کارت در انتظار تایید، پرداختی نداشته‌اند و فقط لغو می‌شوند.
            </p>
          </div>
        )}
      </Sheet>
    </div>
  )
}
