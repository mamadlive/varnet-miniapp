import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  Download,
  Eye,
  EyeOff,
  Gauge,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Timer,
} from 'lucide-react'
import { CountryFlag } from '@/components/miniapp/CountryFlag'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCount, formatDataSize, formatDate, formatDecimal } from '@/lib/format'
import { downloadOpenVpnProfile } from '@/lib/ovpn'
import { cn } from '@/lib/utils'
import { PLAN_EXPIRY_WARNING, daysRemaining } from '@/lib/vpn'
import type { ActiveService } from '@/types'

export interface ActiveServiceCardProps {
  service: ActiveService
  onRenew: (service: ActiveService) => void
  className?: string
}

/**
 * Live subscription meter: consumed data, a smooth progress bar and days left.
 * Crosses into the warning state at ≥90% traffic or ≤3 days remaining.
 */
export function ActiveServiceCard({ service, onRenew, className }: ActiveServiceCardProps) {
  const { haptic } = useTelegram()
  const [credentialsVisible, setCredentialsVisible] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const profileTimer = useRef<number | null>(null)

  const daysLeft = daysRemaining(service.expiresAt)
  const usedRatio = service.dataCapGb > 0 ? service.usedGb / service.dataCapGb : 0
  const percent = Math.min(100, Math.round(usedRatio * 100))
  const warning = usedRatio >= 0.9 || daysLeft <= 3
  const remainingGb = Math.max(service.dataCapGb - service.usedGb, 0)

  useEffect(
    () => () => {
      if (profileTimer.current !== null) window.clearTimeout(profileTimer.current)
    },
    [],
  )

  const toggleCredentials = () => {
    haptic('light')
    setCredentialsVisible((visible) => !visible)
  }

  const handleDownloadProfile = () => {
    haptic('light')
    downloadOpenVpnProfile({
      username: service.username,
      password: service.password,
      remoteHost: service.ipAddress,
    })
    setProfileReady(true)
    if (profileTimer.current !== null) window.clearTimeout(profileTimer.current)
    profileTimer.current = window.setTimeout(() => setProfileReady(false), 4_000)
  }

  return (
    <Card
      padded={false}
      className={cn(
        'animate-slide-up overflow-hidden',
        warning && 'border-amber-500/35',
        className,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-500/25">
          <span aria-hidden className="absolute -end-3 -top-4 size-10 rounded-full bg-white/20 blur-md" />
          <CountryFlag
            countryCode={service.countryCode}
            className="relative text-[19px] font-semibold text-white"
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 dir="auto" className="truncate text-[14px] font-semibold text-tg-text">
              {service.planName}
            </h3>
            <Badge tone={warning ? 'warning' : 'success'} size="sm">
              {warning ? 'رو به اتمام' : 'فعال'}
            </Badge>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-tg-hint">
            <span className="bidi-ltr">{service.ipAddress}</span>
            <span aria-hidden>·</span>
            <span className="bidi-ltr">{service.protocol}</span>
          </p>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10.5px] font-semibold text-tg-hint">مصرف داده</p>
            <p className="mt-0.5 text-[15px] font-bold tabular-nums text-tg-text">
              {formatDecimal(service.usedGb)}{' '}
              <span className="text-[12px] font-medium text-tg-hint">
                از {formatDecimal(service.dataCapGb)} گیگابایت
              </span>
            </p>
          </div>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
              warning ? 'bg-amber-500/15 text-amber-600' : 'bg-brand-500/12 text-brand-600',
            )}
          >
            {formatCount(percent)}٪
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`مصرف داده ${service.planName}`}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-tg-secondary-bg"
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              warning
                ? 'bg-gradient-to-l from-amber-400 to-rose-500'
                : 'bg-gradient-to-l from-brand-400 via-brand-500 to-emerald-500',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-tg-secondary-bg px-2 py-2">
            <p className="flex items-center gap-1 text-[9.5px] font-medium text-tg-hint">
              <Gauge className="size-3" aria-hidden />
              باقیمانده
            </p>
            <p className="mt-1 truncate text-[12px] font-semibold text-tg-text">
              {formatDataSize(remainingGb)}
            </p>
          </div>
          <div className="rounded-xl bg-tg-secondary-bg px-2 py-2">
            <p className="flex items-center gap-1 text-[9.5px] font-medium text-tg-hint">
              <Timer className="size-3" aria-hidden />
              زمان باقیمانده
            </p>
            <p className="mt-1 truncate text-[12px] font-semibold text-tg-text">
              {formatCount(daysLeft)} روز
            </p>
          </div>
          <div className="rounded-xl bg-tg-secondary-bg px-2 py-2">
            <p className="flex items-center gap-1 text-[9.5px] font-medium text-tg-hint">
              <CalendarClock className="size-3" aria-hidden />
              انقضا
            </p>
            <p className="mt-1 truncate text-[11.5px] font-semibold text-tg-text">
              {formatDate(service.expiresAt)}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-tg-separator bg-tg-bg p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-tg-hint">
              <KeyRound className="size-3.5" aria-hidden />
              اطلاعات ورود RADIUS
            </p>
            <button
              type="button"
              onClick={toggleCredentials}
              aria-pressed={credentialsVisible}
              aria-label={
                credentialsVisible
                  ? 'پنهان کردن نام کاربری و رمز عبور'
                  : 'نمایش نام کاربری و رمز عبور'
              }
              className="flex size-7 items-center justify-center rounded-lg text-tg-hint transition-colors hover:bg-tg-secondary-bg hover:text-tg-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              {credentialsVisible ? (
                <EyeOff className="size-4" aria-hidden />
              ) : (
                <Eye className="size-4" aria-hidden />
              )}
            </button>
          </div>

          <dl className="mt-2 grid gap-1.5 text-[11.5px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-tg-hint">نام کاربری</dt>
              <dd
                dir="ltr"
                className="max-w-[65%] truncate font-mono text-[11px] font-semibold text-tg-text"
              >
                {credentialsVisible ? service.username : '••••••••••'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-tg-hint">رمز عبور</dt>
              <dd
                dir="ltr"
                className="max-w-[65%] truncate font-mono text-[11px] font-semibold text-tg-text"
              >
                {credentialsVisible ? service.password : '••••••••••'}
              </dd>
            </div>
          </dl>

          <p className="mt-1.5 text-[10px] leading-relaxed text-tg-hint">
            {credentialsVisible
              ? 'برای ورود دستی در کلاینت OpenVPN از این اطلاعات استفاده کنید.'
              : 'برای نمایش نام کاربری و رمز، روی آیکن چشم بزنید.'}
          </p>
        </div>

        {warning ? (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <p className="text-[11.5px] font-medium leading-relaxed text-amber-700 dark:text-amber-400">
              {PLAN_EXPIRY_WARNING}
            </p>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Download className="size-3.5" aria-hidden />}
            onClick={handleDownloadProfile}
          >
            دانلود .ovpn
          </Button>
          <Button
            variant={warning ? 'primary' : 'secondary'}
            size="sm"
            leftIcon={<RefreshCw className="size-3.5" aria-hidden />}
            onClick={() => onRenew(service)}
          >
            تمدید سرویس
          </Button>
        </div>

        {profileReady ? (
          <p role="status" className="mt-2 text-center text-[10.5px] font-medium text-emerald-600">
            فایل پروفایل ساخته شد و دانلود آغاز شد.
          </p>
        ) : null}

        <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-tg-hint">
          <ShieldCheck className="size-3" aria-hidden />
          {service.autoRenew ? 'تمدید خودکار فعال است' : 'تمدید خودکار غیرفعال است'}
        </p>
      </div>
    </Card>
  )
}

/** Loading placeholder matching the active service card. */
export function ActiveServiceCardSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border border-tg-separator bg-tg-bg p-4">
      <div className="flex items-center gap-3">
        <div className="size-11 shrink-0 animate-pulse rounded-2xl bg-tg-secondary-bg" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-tg-secondary-bg" />
          <div className="h-2.5 w-2/3 animate-pulse rounded bg-tg-secondary-bg" />
        </div>
      </div>
      <div className="h-2.5 w-full animate-pulse rounded-full bg-tg-secondary-bg" />
      <div className="grid grid-cols-3 gap-2">
        <div className="h-12 animate-pulse rounded-xl bg-tg-secondary-bg" />
        <div className="h-12 animate-pulse rounded-xl bg-tg-secondary-bg" />
        <div className="h-12 animate-pulse rounded-xl bg-tg-secondary-bg" />
      </div>
    </div>
  )
}
