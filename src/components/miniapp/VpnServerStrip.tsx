import { CountryFlag } from '@/components/miniapp/CountryFlag'
import { Skeleton } from '@/components/ui'
import { formatCount } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { clamp, cn } from '@/lib/utils'
import type { VpnServer, VpnServerStatus } from '@/types'

const STATUS_META: Record<VpnServerStatus, { dot: string; text: string }> = {
  online: { dot: 'bg-emerald-500', text: 'text-emerald-600' },
  degraded: { dot: 'bg-amber-500', text: 'text-amber-600' },
  maintenance: { dot: 'bg-sky-500', text: 'text-sky-600' },
  offline: { dot: 'bg-rose-500', text: 'text-rose-600' },
  coming_soon: { dot: 'bg-tg-hint/40', text: 'text-tg-hint' },
}

function loadBarTone(load: number): string {
  if (load >= 85) return 'bg-rose-500'
  if (load >= 60) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export interface VpnServerStripProps {
  servers: VpnServer[]
  className?: string
}

/** Live node status strip: status dot, protocol and capacity bar per server. */
export function VpnServerStrip({ servers, className }: VpnServerStripProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-tg-separator bg-tg-bg shadow-sm',
        className,
      )}
    >
      {servers.map((server, index) => {
        const meta = STATUS_META[server.status]
        return (
          <div
            key={server.id}
            className={cn(
              'flex flex-col gap-2 p-3.5',
              index > 0 && 'border-t border-tg-separator/60',
            )}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-tg-secondary-bg text-lg">
                <CountryFlag countryCode={server.countryCode} title={server.country} />
              </span>

              <div className="min-w-0 flex-1">
                <p dir="auto" className="truncate text-[13px] font-semibold text-tg-text">
                  {server.name}
                </p>
                <p className="truncate text-[11px] text-tg-hint">
                  {server.country}
                  {' · '}
                  <span className="bidi-ltr">{server.protocol}</span>
                </p>
              </div>

              <span
                className={cn(
                  'flex shrink-0 items-center gap-1.5 text-[11px] font-semibold',
                  meta.text,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 rounded-full',
                    meta.dot,
                    server.status === 'online' && 'animate-pulse',
                  )}
                />
                {fa.vpnStatuses[server.status]}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tg-secondary-bg">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', loadBarTone(server.load))}
                  style={{ width: `${clamp(server.load, 0, 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-[10px] font-medium tabular-nums text-tg-hint">
                {formatCount(server.activeClients)} از {formatCount(server.maxClients)} کاربر
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Loading placeholder for the node status strip. */
export function VpnServerStripSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-tg-separator bg-tg-bg shadow-sm">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className={cn('space-y-2.5 p-3.5', index > 0 && 'border-t border-tg-separator/60')}
        >
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-9 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      ))}
    </div>
  )
}
