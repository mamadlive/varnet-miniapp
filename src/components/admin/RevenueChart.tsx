import { Activity, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCount, formatCurrency, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RevenuePoint } from '@/types'

export interface RevenueChartProps {
  data: RevenuePoint[]
  loading?: boolean
  className?: string
}

const AXIS_FRACTIONS = [1, 0.75, 0.5, 0.25, 0] as const
const SKELETON_HEIGHTS = [45, 62, 52, 72, 84, 76, 94]

/** Pure CSS/flex 7-day revenue chart — no chart library, theme-token bars. */
export function RevenueChart({ data, loading = false, className }: RevenueChartProps) {
  const maxRevenue = data.reduce((max, point) => Math.max(max, point.revenue), 0) || 1
  const totalRevenue = data.reduce((total, point) => total + point.revenue, 0)
  const totalOrders = data.reduce((total, point) => total + point.orders, 0)

  return (
    <Card className={cn('p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-tg-text">درآمد</h2>
          <p className="mt-0.5 text-[12px] text-tg-hint">درآمد کل · ۷ روز گذشته</p>
        </div>
        <div className="text-end">
          <p className="text-[20px] font-semibold leading-none text-tg-text tabular-nums">
            {loading ? '—' : formatCurrency(totalRevenue)}
          </p>
          <p className="mt-1 flex items-center justify-end gap-1 text-[11.5px] text-tg-hint">
            <TrendingUp className="size-3.5 text-emerald-500" aria-hidden />
            {loading ? '—' : `${formatCount(totalOrders)} سفارش`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex h-56 items-end gap-2 sm:gap-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton
              key={index}
              className="flex-1 rounded-t-lg"
              style={{ height: `${SKELETON_HEIGHTS[index]}%` }}
            />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="هنوز داده درآمدی ثبت نشده"
          description="پس از تکمیل اولین سفارش‌ها، درآمد اینجا نمایش داده می‌شود."
          className="py-12"
        />
      ) : (
        <>
          <div className="mt-6 flex gap-3">
            <div className="flex h-56 w-16 shrink-0 flex-col justify-between pb-0.5 text-end text-[10px] tabular-nums text-tg-hint">
              {AXIS_FRACTIONS.map((fraction) => (
                <span key={fraction} className="leading-none">
                  {formatNumber(Math.round(maxRevenue * fraction))}
                </span>
              ))}
            </div>

            <div className="relative h-56 min-w-0 flex-1">
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {AXIS_FRACTIONS.map((fraction) => (
                  <div key={fraction} className="border-t border-dashed border-tg-separator" />
                ))}
              </div>

              <div className="relative flex h-full items-end gap-2 sm:gap-3">
                {data.map((point) => {
                  const height = Math.max((point.revenue / maxRevenue) * 100, 3)
                  return (
                    <div
                      key={point.label}
                      className="group relative flex h-full flex-1 items-end justify-center"
                    >
                      <div
                        className="relative w-full max-w-14 rounded-t-lg bg-gradient-to-t from-brand-600 via-brand-500 to-brand-400 transition-all duration-300 group-hover:brightness-110"
                        style={{ height: `${height}%` }}
                      >
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-tg-separator bg-tg-bg px-2 py-1 opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
                          <p className="text-[11.5px] font-semibold text-tg-text tabular-nums">
                            {formatCurrency(point.revenue)}
                          </p>
                          <p className="text-[10px] text-tg-hint">
                            {formatCount(point.orders)} سفارش
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-3 flex gap-3">
            <div className="w-16 shrink-0" />
            <div className="flex min-w-0 flex-1 gap-2 sm:gap-3">
              {data.map((point) => (
                <p
                  key={point.label}
                  className="flex-1 text-center text-[11px] font-medium text-tg-hint"
                >
                  {point.label}
                </p>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
