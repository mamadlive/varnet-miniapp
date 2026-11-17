import { ArrowLeft, Clock, Gauge, MapPin } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CountryFlag } from '@/components/miniapp/CountryFlag'
import { Badge, Button, Card, Skeleton } from '@/components/ui'
import { formatCount, formatCurrency } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { VpnPlan, VpnServer } from '@/types'

function Spec({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-tg-secondary-bg px-2 py-2">
      <p className="flex items-center gap-1 text-[10px] font-medium text-tg-hint">
        <Icon className="size-3" aria-hidden />
        {label}
      </p>
      <p className="mt-1 truncate text-[12px] font-semibold text-tg-text">{value}</p>
    </div>
  )
}

/** Persian label for a plan's bandwidth, e.g. «۱ گیگابیت» / «۵۰۰ مگابیت». */
function bandwidthLabel(bandwidthMbps: number): string {
  return bandwidthMbps >= 1000 ? '۱ گیگابیت' : `${formatCount(bandwidthMbps)} مگابیت`
}

/** Quota of a plan, with the bandwidth suffix when the catalogue provides it. */
function quotaLabel(plan: VpnPlan): string {
  const quota = plan.dataCapGb ? `${formatCount(plan.dataCapGb)} گیگابایت` : '—'
  return plan.bandwidthMbps ? `${quota} · ${bandwidthLabel(plan.bandwidthMbps)}` : quota
}

export interface VpnPlanCardProps {
  plan: VpnPlan
  server?: VpnServer
  onSelect?: (plan: VpnPlan) => void
  className?: string
}

/** Full static-IP plan card: node, specs, price and a single CTA. */
export function VpnPlanCard({ plan, server, onSelect, className }: VpnPlanCardProps) {
  const comingSoon = plan.availability === 'coming_soon'
  const available = !comingSoon && plan.isActive && plan.stock > 0
  const lowStock = available && plan.stock <= 2

  return (
    <Card
      padded={false}
      variant={available ? 'surface' : 'muted'}
      className={cn('overflow-hidden', !available && 'opacity-85', className)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-tg-secondary-bg text-xl">
            <CountryFlag countryCode={plan.countryCode} title={plan.location} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 dir="auto" className="truncate text-[15px] font-semibold text-tg-text">
                {plan.name}
              </h3>
              {plan.staticIp ? (
                <Badge tone="brand" size="sm">
                  IPv4 اختصاصی
                </Badge>
              ) : null}
              <Badge tone="info" size="sm">
                <span className="bidi-ltr">OpenVPN (UDP)</span>
              </Badge>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-tg-hint">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">
                {plan.location}
                {server ? (
                  <>
                    {' · '}
                    <span className="bidi-ltr">{server.protocol}</span>
                  </>
                ) : null}
              </span>
            </p>
          </div>

          <Badge
            tone={comingSoon ? 'info' : available ? (lowStock ? 'warning' : 'success') : 'neutral'}
            size="sm"
            className="shrink-0"
          >
            {comingSoon
              ? 'به‌زودی'
              : available
                ? lowStock
                  ? `فقط ${formatCount(plan.stock)} عدد`
                  : fa.common.available
                : plan.isActive
                  ? fa.common.soldOut
                  : fa.common.unavailable}
          </Badge>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Spec icon={Gauge} label="حجم" value={quotaLabel(plan)} />
          <Spec icon={Clock} label="مدت" value={`${formatCount(plan.durationDays)} روز`} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-tg-separator/70 bg-tg-secondary-bg/50 px-4 py-3">
        <p className="flex items-baseline gap-1">
          <span className="text-[18px] font-bold text-tg-text">
            <bdi>{formatCurrency(plan.price, plan.currency)}</bdi>
          </span>
          <span className="text-[11px] text-tg-hint">/ {formatCount(plan.durationDays)} روز</span>
        </p>

        <Button
          variant={available ? 'primary' : 'secondary'}
          disabled={!available}
          onClick={() => onSelect?.(plan)}
          rightIcon={available ? <ArrowLeft className="size-4" aria-hidden /> : undefined}
        >
          {comingSoon ? 'به‌زودی' : available ? 'دریافت آی‌پی ثابت' : fa.common.unavailable}
        </Button>
      </div>
    </Card>
  )
}

/** Loading placeholder matching the plan card layout. */
export function VpnPlanCardSkeleton() {
  return (
    <div className="rounded-2xl border border-tg-separator bg-tg-bg p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-11 w-32 rounded-xl" />
      </div>
    </div>
  )
}
