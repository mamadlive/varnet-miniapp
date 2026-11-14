import { ArrowLeft, Server } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LoadBar } from '@/components/admin/LoadBar'
import { StatusDot } from '@/components/admin/StatusBadges'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCount } from '@/lib/format'
import type { VpnServer } from '@/types'

export interface ServerHealthPanelProps {
  servers: VpnServer[]
  loading?: boolean
}

/** Compact VPN node health list for the dashboard's end column. */
export function ServerHealthPanel({ servers, loading = false }: ServerHealthPanelProps) {
  return (
    <Card padded={false} className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-tg-text">سلامت سرورها</h2>
          <p className="mt-0.5 text-[12px] text-tg-hint">بارگذاری لحظه‌ای نودهای آی‌پی ثابت</p>
        </div>
        <Link
          to="/admin/vpn-servers"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-500 transition-colors hover:text-brand-600"
        >
          مدیریت
          <ArrowLeft className="size-3.5" aria-hidden />
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-1.5 w-full" />
            </div>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <EmptyState
          icon={Server}
          title="هیچ سروری متصل نیست"
          description="برای پایش بار، یک نود آی‌پی ثابت اضافه کنید."
          className="py-8"
        />
      ) : (
        <div className="mt-2 divide-y divide-tg-separator">
          {servers.map((server) => (
            <div key={server.id} className="py-3.5 first:pt-2 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <StatusDot status={server.status} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-tg-text">{server.name}</p>
                    <p className="truncate text-[11px] text-tg-hint">
                      {server.country} · <span className="bidi-ltr">{server.protocol}</span>
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-medium tabular-nums text-tg-hint">
                  {formatCount(server.activeClients)}/{formatCount(server.maxClients)}
                </span>
              </div>
              <LoadBar value={server.load} showValue className="mt-2" />
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
