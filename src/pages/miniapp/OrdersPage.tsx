import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PackageSearch, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { FilterTabs } from '@/components/wallet/FilterTabs'
import type { FilterTabOption } from '@/components/wallet/FilterTabs'
import { OrderCard } from '@/components/wallet/OrderCard'
import { OrderDetailsSheet } from '@/components/wallet/OrderDetailsSheet'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCount } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { listOrders } from '@/services/orders.service'
import type { Order, OrderStatus } from '@/types'

type OrderFilter = 'all' | OrderStatus

const FILTER_OPTIONS: ReadonlyArray<FilterTabOption<OrderFilter>> = [
  { value: 'all', label: fa.common.all },
  { value: 'pending', label: fa.orderStatuses.pending },
  { value: 'paid', label: fa.orderStatuses.paid },
  { value: 'provisioning', label: fa.orderStatuses.provisioning },
  { value: 'completed', label: fa.orderStatuses.completed },
  { value: 'cancelled', label: fa.orderStatuses.cancelled },
  { value: 'refunded', label: fa.orderStatuses.refunded },
]

function OrderCardSkeleton() {
  return (
    <Card variant="surface" padded={false} className="p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
        <Skeleton className="h-5 w-16 rounded-md" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
    </Card>
  )
}

/** Mini App order history: status filters + tappable order cards. */
export default function OrdersPage() {
  const { haptic } = useTelegram()
  const navigate = useNavigate()

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<OrderFilter>('all')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    listOrders()
      .then((next) => {
        if (!cancelled) setOrders(next)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'سفارش‌های شما بارگذاری نشد.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const filteredOrders = useMemo(
    () => (filter === 'all' ? orders : orders.filter((order) => order.status === filter)),
    [filter, orders],
  )

  const activeFilterLabel =
    FILTER_OPTIONS.find((option) => option.value === filter)?.label ?? 'انتخاب‌شده'

  const handleFilterChange = (next: OrderFilter) => {
    haptic()
    setFilter(next)
  }

  const handleSelect = (order: Order) => {
    haptic()
    setSelectedOrder(order)
  }

  const handleRetry = () => {
    haptic()
    setLoading(true)
    setError(null)
    setReloadKey((key) => key + 1)
  }

  return (
    <div className="tg-page animate-fade-in space-y-4 pt-5">
      <header className="px-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[22px] font-bold text-tg-text">سفارش‌های من</h1>
          {!loading && !error ? (
            <span className="text-[12px] tabular-nums text-tg-hint">
              {formatCount(orders.length)} سفارش
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[13px] text-tg-hint">
          خرید اکانت‌ها و آی‌پی ثابت را پیگیری کنید.
        </p>
      </header>

      <FilterTabs
        options={FILTER_OPTIONS}
        value={filter}
        onChange={handleFilterChange}
        ariaLabel="فیلتر سفارش‌ها بر اساس وضعیت"
      />

      {loading ? (
        <div className="space-y-3" aria-busy>
          {Array.from({ length: 3 }).map((_, index) => (
            <OrderCardSkeleton key={index} />
          ))}
        </div>
      ) : error ? (
        <Card variant="surface" className="space-y-3 text-center">
          <p className="text-[14px] font-semibold text-tg-text">بارگذاری سفارش‌ها انجام نشد</p>
          <p className="text-[12.5px] text-tg-hint">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRetry}
            leftIcon={<RotateCcw className="size-4" />}
          >
            تلاش دوباره
          </Button>
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card variant="surface" padded={false}>
          <EmptyState
            icon={PackageSearch}
            title={
              filter === 'all'
                ? 'هنوز سفارشی ندارید'
                : `سفارشی با وضعیت «${activeFilterLabel}» نیست`
            }
            description={
              filter === 'all'
                ? 'خرید اکانت و آی‌پی ثابت شما اینجا نمایش داده می‌شود.'
                : 'فیلتر وضعیت دیگری را امتحان کنید تا بقیه تاریخچه را ببینید.'
            }
            action={
              filter === 'all' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    haptic()
                    navigate('/app/marketplace')
                  }}
                >
                  مشاهده بازارچه
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => handleFilterChange('all')}>
                  نمایش همه سفارش‌ها
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <OrderCard key={order.id} order={order} onSelect={handleSelect} />
          ))}
        </div>
      )}

      <OrderDetailsSheet
        order={selectedOrder}
        open={selectedOrder !== null}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  )
}
