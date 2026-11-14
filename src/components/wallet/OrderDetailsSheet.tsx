import { CalendarClock, ReceiptText } from 'lucide-react'

import { OpenVpnNotice } from '@/components/miniapp/OpenVpnNotice'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { OrderStatusBadge } from '@/components/wallet/OrderStatusBadge'
import { formatCount, formatCurrency, formatDateTime } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'

interface TimelineStep {
  label: string
  time?: string
  done: boolean
  cancelled?: boolean
}

const TIMELINE_FLOW: ReadonlyArray<{ status: OrderStatus; label: string }> = [
  { status: 'pending', label: 'ثبت سفارش' },
  { status: 'paid', label: 'تأیید پرداخت' },
  { status: 'provisioning', label: 'در حال فعال‌سازی' },
  { status: 'completed', label: 'تحویل شد' },
]

function buildTimeline(order: Order): TimelineStep[] {
  if (order.status === 'cancelled' || order.status === 'refunded') {
    const isRefund = order.status === 'refunded'
    return [
      { label: 'ثبت سفارش', time: formatDateTime(order.createdAt), done: true },
      {
        label: isRefund ? 'بازگشت وجه به کیف پول' : 'لغو سفارش',
        time: formatDateTime(order.updatedAt),
        done: true,
        cancelled: true,
      },
    ]
  }

  const activeIndex = TIMELINE_FLOW.findIndex((step) => step.status === order.status)

  return TIMELINE_FLOW.map((step, index) => ({
    label: step.label,
    time:
      index === 0
        ? formatDateTime(order.createdAt)
        : index === activeIndex
          ? formatDateTime(order.updatedAt)
          : undefined,
    done: index <= activeIndex,
  }))
}

interface SummaryRowProps {
  label: string
  value: string
  emphasis?: boolean
}

function SummaryRow({ label, value, emphasis = false }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn('text-[13px]', emphasis ? 'font-semibold text-tg-text' : 'text-tg-hint')}>
        {label}
      </span>
      <span
        className={cn(
          'text-[13px] tabular-nums',
          emphasis ? 'text-[15px] font-semibold text-tg-text' : 'font-medium text-tg-text',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export interface OrderDetailsSheetProps {
  order: Order | null
  open: boolean
  onClose: () => void
}

/** Full order breakdown opened from an `OrderCard`. */
export function OrderDetailsSheet({ order, open, onClose }: OrderDetailsSheetProps) {
  const subtotal = order
    ? order.items.reduce((total, item) => total + item.unitPrice * item.quantity, 0)
    : 0
  const steps = order ? buildTimeline(order) : []
  const vpnDelivered =
    order?.kind === 'vpn' &&
    (order.status === 'paid' ||
      order.status === 'provisioning' ||
      order.status === 'completed')

  return (
    <Sheet
      open={open && order !== null}
      onClose={onClose}
      title="جزئیات سفارش"
      description={order ? `شناسه سفارش: ${order.id}` : undefined}
      footer={
        <Button variant="secondary" fullWidth onClick={onClose}>
          بستن
        </Button>
      }
    >
      {order ? (
        <div className="no-scrollbar max-h-[65dvh] space-y-5 overflow-y-auto pb-1 pe-0.5">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-tg-secondary-bg p-3.5">
            <div>
              <p className="text-[10.5px] font-semibold text-tg-hint">وضعیت</p>
              <div className="mt-1 flex items-center gap-2">
                <OrderStatusBadge status={order.status} size="md" />
                <span className="text-[12px] text-tg-hint">{fa.orderKinds[order.kind]}</span>
              </div>
            </div>
            <p className="text-[20px] font-bold tabular-nums text-tg-text">
              {formatCurrency(order.total, order.currency)}
            </p>
          </div>

          <section>
            <p className="tg-section-title flex items-center gap-1.5">
              <ReceiptText className="size-3.5" aria-hidden />
              اقلام
            </p>
            <div className="divide-y divide-tg-separator overflow-hidden rounded-xl border border-tg-separator bg-tg-bg">
              {order.items.map((item) => (
                <div
                  key={item.productId}
                  className="flex items-start justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-tg-text">{item.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-tg-hint">
                      {formatCount(item.quantity)} × {formatCurrency(item.unitPrice, order.currency)}
                    </p>
                  </div>
                  <p className="shrink-0 text-[13.5px] font-semibold tabular-nums text-tg-text">
                    {formatCurrency(item.unitPrice * item.quantity, order.currency)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {vpnDelivered ? (
            <section>
              <OpenVpnNotice />
              <p className="mt-2 px-1 text-[11px] leading-relaxed text-tg-hint">
                نام کاربری و رمز به‌صورت خودکار روی تونل امن OpenVPN (UDP) تزریق شده است؛ نیازی به
                تنظیم دستی نیست.
              </p>
            </section>
          ) : null}

          <section>
            <p className="tg-section-title">خلاصه</p>
            <div className="space-y-2 rounded-xl border border-tg-separator bg-tg-bg p-3">
              <SummaryRow label="جمع جزء" value={formatCurrency(subtotal, order.currency)} />
              <SummaryRow label="تحویل" value="رایگان" />
              <div className="border-t border-tg-separator pt-2">
                <SummaryRow
                  label="مبلغ کل"
                  value={formatCurrency(order.total, order.currency)}
                  emphasis
                />
              </div>
            </div>
          </section>

          <section>
            <p className="tg-section-title">روند سفارش</p>
            <ol className="relative ms-1.5 space-y-3.5 border-s border-tg-separator ps-5">
              {steps.map((step) => (
                <li key={step.label} className="relative">
                  <span
                    className={cn(
                      'absolute -start-[1.6rem] top-1 size-3 rounded-full border-2',
                      step.cancelled
                        ? 'border-rose-500 bg-rose-500'
                        : step.done
                          ? 'border-brand-500 bg-brand-500'
                          : 'border-tg-separator bg-tg-bg',
                    )}
                    aria-hidden
                  />
                  <p
                    className={cn(
                      'text-[13px] font-medium',
                      step.done ? 'text-tg-text' : 'text-tg-hint',
                    )}
                  >
                    {step.label}
                  </p>
                  {step.time ? (
                    <p className="mt-0.5 text-[11.5px] text-tg-hint">{step.time}</p>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="mt-2 ps-1 text-[11px] text-tg-hint">
              به‌روزرسانی‌های فعال‌سازی پس از اتصال بک‌اند به‌صورت زنده نمایش داده می‌شوند.
            </p>
          </section>

          <section>
            <p className="tg-section-title">زمان‌ها</p>
            <div className="space-y-1.5 rounded-xl border border-tg-separator bg-tg-bg p-3">
              <div className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="flex items-center gap-1.5 text-tg-hint">
                  <CalendarClock className="size-3.5" aria-hidden />
                  ثبت سفارش
                </span>
                <span className="font-medium text-tg-text">{formatDateTime(order.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="flex items-center gap-1.5 text-tg-hint">
                  <CalendarClock className="size-3.5" aria-hidden />
                  آخرین به‌روزرسانی
                </span>
                <span className="font-medium text-tg-text">{formatDateTime(order.updatedAt)}</span>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </Sheet>
  )
}
