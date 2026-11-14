import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CalendarDays, Gauge, ShieldCheck, ShoppingBag } from 'lucide-react'
import { CountryFlag } from '@/components/miniapp/CountryFlag'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCount, formatCurrency } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { VpnPlan } from '@/types'
import type { PurchaseTarget } from '@/components/marketplace/types'

function Spec({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-tg-secondary-bg px-1.5 py-0.5 text-[10px] font-medium text-tg-hint">
      <Icon className="size-2.5" aria-hidden />
      {children}
    </span>
  )
}

/** Persian label for a plan's bandwidth, e.g. «۱ گیگابیت» / «۵۰۰ مگابیت». */
function bandwidthLabel(bandwidthMbps: number): string {
  return bandwidthMbps >= 1000 ? '۱ گیگابیت' : `${formatCount(bandwidthMbps)} مگابیت`
}

export interface VpnOfferCardProps {
  plan: VpnPlan
  onPurchase: (target: PurchaseTarget) => void
  className?: string
  style?: CSSProperties
}

/**
 * Static IP VPN offer: node location + flag, dedicated IPv4 specs, price per
 * term and a dedicated purchase action (the parent opens the confirmation
 * sheet).
 */
export function VpnOfferCard({ plan, onPurchase, className, style }: VpnOfferCardProps) {
  const comingSoon = plan.availability === 'coming_soon'
  const unavailable = comingSoon || !plan.isActive || plan.stock <= 0
  const city = plan.name.split('·').slice(1).join('·').trim() || plan.name
  const title = `${plan.location} · آی‌پی ثابت اختصاصی`

  return (
    <article
      style={style}
      className={cn(
        'animate-slide-up overflow-hidden rounded-2xl border border-tg-separator bg-tg-bg shadow-sm transition-shadow duration-200 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start gap-3 p-3.5">
        <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-500/25">
          <span aria-hidden className="absolute -right-3 -top-4 size-10 rounded-full bg-white/20 blur-md" />
          <CountryFlag
            countryCode={plan.countryCode}
            className="relative text-[20px] font-semibold text-white"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 dir="auto" className="truncate text-[14px] font-semibold text-tg-text">
              {title}
            </h3>
            {comingSoon ? (
              <Badge size="sm" tone="info">
                به‌زودی
              </Badge>
            ) : unavailable ? (
              <Badge size="sm" tone="neutral">
                {fa.common.unavailable}
              </Badge>
            ) : plan.stock <= 3 ? (
              <Badge size="sm" tone="warning">
                فقط {formatCount(plan.stock)} عدد
              </Badge>
            ) : (
              <Badge size="sm" tone="success">
                {fa.common.available}
              </Badge>
            )}
          </div>

          <p className="mt-0.5 truncate text-[11px] text-tg-hint">
            {city}
            {plan.bandwidthMbps ? ` · ${bandwidthLabel(plan.bandwidthMbps)}` : ''}
            {plan.pingMs !== undefined ? ` · ~${formatCount(plan.pingMs)} میلی‌ثانیه` : ''}
          </p>

          <div className="mt-1.5 flex flex-wrap gap-1">
            <Spec icon={ShieldCheck}>IPv4 اختصاصی</Spec>
            <Spec icon={Gauge}>OpenVPN (UDP)</Spec>
            {plan.bandwidthMbps ? (
              <Spec icon={Gauge}>{bandwidthLabel(plan.bandwidthMbps)}</Spec>
            ) : null}
            <Spec icon={CalendarDays}>{formatCount(plan.durationDays)} روز</Spec>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-tg-separator/70 bg-tg-secondary-bg/40 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-[15px] font-bold tabular-nums text-tg-text">
            <bdi>{formatCurrency(plan.price, plan.currency)}</bdi>
            <span className="ms-1 text-[10px] font-medium text-tg-hint">
              / {formatCount(plan.durationDays)} روز
            </span>
          </p>
          <p className="truncate text-[10px] text-tg-hint">
            {comingSoon ? 'به‌زودی در دسترس' : 'IPv4 اختصاصی · تحویل تقریباً فوری'}
          </p>
        </div>

        <Button
          size="sm"
          disabled={unavailable}
          onClick={() => onPurchase({ id: plan.id, title })}
          aria-label={`خرید ${title}`}
          leftIcon={<ShoppingBag className="size-3.5" aria-hidden />}
          className="h-9 shrink-0 rounded-xl px-3.5 text-[12px]"
        >
          {comingSoon ? 'به‌زودی' : unavailable ? fa.common.unavailable : fa.common.purchase}
        </Button>
      </div>
    </article>
  )
}

/** Loading placeholder matching the VPN offer card layout. */
export function VpnOfferCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-tg-separator bg-tg-bg">
      <div className="flex items-start gap-3 p-3.5">
        <Skeleton className="size-12 shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-2.5 w-1/2" />
          <div className="flex gap-1">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-tg-separator/70 px-3.5 py-2.5">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
    </div>
  )
}
