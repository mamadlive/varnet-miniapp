import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CalendarDays, Clock, Gauge, ShieldCheck, ShoppingBag } from 'lucide-react'
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

/** Node city parsed out of the plan name (`آی‌پی ثابت اختصاصی · آلمان`). */
function planCity(plan: VpnPlan): string {
  return plan.name.split('·').slice(1).join('·').trim() || plan.name
}

function planTitle(plan: VpnPlan): string {
  return `${plan.location} · آی‌پی ثابت اختصاصی`
}

export type VpnOfferCardVariant = 'list' | 'featured'

export interface VpnOfferCardProps {
  plan: VpnPlan
  onPurchase: (target: PurchaseTarget) => void
  /**
   * `list` (default) is the stacked storefront row; `featured` mirrors the
   * home «پیشنهادهای ویژه» cards so plans sit flush with the marketplace ones.
   */
  variant?: VpnOfferCardVariant
  className?: string
  style?: CSSProperties
}

/**
 * Static IP VPN offer: node location + flag, dedicated IPv4 specs and a
 * dedicated purchase action (the parent opens the confirmation sheet).
 */
export function VpnOfferCard({
  plan,
  onPurchase,
  variant = 'list',
  className,
  style,
}: VpnOfferCardProps) {
  const comingSoon = plan.availability === 'coming_soon'
  const unavailable = comingSoon || !plan.isActive || plan.stock <= 0
  const title = planTitle(plan)
  const city = planCity(plan)
  /** City + term; the country already heads the hero title, so it is not repeated. */
  const heroSubtitle = [
    city && city !== plan.location ? city : null,
    `${formatCount(plan.durationDays)} روز`,
    plan.bandwidthMbps ? bandwidthLabel(plan.bandwidthMbps) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  if (variant === 'featured') {
    return (
      <article
        style={style}
        className={cn(
          'group relative flex w-[262px] shrink-0 snap-start flex-col overflow-hidden rounded-[22px] border border-tg-separator bg-tg-bg text-start shadow-[0_12px_28px_-18px_rgba(15,23,42,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-18px_rgba(15,23,42,0.55)]',
          className,
        )}
      >
        <div className="relative isolate overflow-hidden bg-gradient-to-br from-brand-500 to-brand-700 p-3.5 text-white">
          <span aria-hidden className="absolute -left-10 -top-12 size-32 rounded-full bg-white/25 blur-2xl" />
          <span aria-hidden className="absolute -bottom-16 -right-8 size-36 rounded-full bg-black/25 blur-2xl" />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

          <div className="relative flex items-start justify-between gap-2">
            <span className="inline-flex h-6 items-center rounded-full border border-white/30 bg-white/20 px-2.5 text-[10px] font-semibold text-white shadow-sm backdrop-blur-md">
              پیشنهاد ویژه
            </span>
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-white/25 bg-black/20 px-2.5 text-[10px] font-medium text-white/95 backdrop-blur-md">
              <ShieldCheck className="size-3" aria-hidden />
              <span className="bidi-ltr">OpenVPN</span>
            </span>
          </div>

          <div className="relative mt-3 flex items-center gap-2.5">
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/35 bg-white/20 shadow-lg shadow-black/15 backdrop-blur-md">
              <CountryFlag
                countryCode={plan.countryCode}
                title={plan.location}
                className="text-[26px]"
              />
            </span>
            <div className="min-w-0">
              <h3
                dir="auto"
                className="line-clamp-2 min-h-[2.6em] text-[17px] font-extrabold leading-[1.3] drop-shadow-sm"
              >
                {title}
              </h3>
              <p dir="auto" className="mt-0.5 line-clamp-1 text-[11px] font-medium text-white/75">
                {heroSubtitle}
              </p>
            </div>
          </div>

          <div className="relative mt-3 flex items-center justify-between gap-2 rounded-2xl border border-white/25 bg-white/15 py-1.5 pe-1.5 ps-3 shadow-lg shadow-black/10 backdrop-blur-xl">
            <div className="min-w-0">
              <span className="block text-[9px] font-semibold text-white/70">قیمت پلن</span>
              <span className="text-[15.5px] font-extrabold tabular-nums text-white">
                <bdi>{formatCurrency(plan.price, plan.currency)}</bdi>
              </span>
            </div>

            <button
              type="button"
              disabled={unavailable}
              onClick={() => onPurchase({ id: plan.id, title })}
              aria-label={`خرید ${title}`}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/35 bg-white/25 px-3 text-[12px] font-bold text-white shadow-sm backdrop-blur-md transition-all duration-150 hover:bg-white/35 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <ShoppingBag className="size-3.5" aria-hidden />
              {comingSoon ? 'به‌زودی' : unavailable ? fa.common.unavailable : fa.common.purchase}
            </button>
          </div>

          {unavailable && !comingSoon ? (
            <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 text-[12px] font-bold text-white backdrop-blur-[2px]">
              {fa.common.unavailable}
            </span>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-3">
          <p dir="auto" className="line-clamp-2 min-h-[2.6em] text-[11.5px] leading-snug text-tg-hint">
            آی‌پی ثابت اختصاصی روی تونل امن OpenVPN (UDP) با تحویل تقریباً فوری.
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
            {plan.dataCapGb ? (
              <Spec icon={Gauge}>{formatCount(plan.dataCapGb)} گیگابایت</Spec>
            ) : null}
            <Spec icon={Clock}>{formatCount(plan.durationDays)} روز</Spec>
            <Spec icon={ShieldCheck}>IPv4 اختصاصی</Spec>
          </div>
        </div>
      </article>
    )
  }

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
            title={plan.location}
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
