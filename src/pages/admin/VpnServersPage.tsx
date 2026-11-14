import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Gauge,
  MoreHorizontal,
  RefreshCw,
  RotateCw,
  Server,
  Users,
  Wifi,
} from 'lucide-react'
import { AdminErrorState } from '@/components/admin/AdminStates'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { LoadBar } from '@/components/admin/LoadBar'
import { VpnStatusBadge } from '@/components/admin/StatusBadges'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCount, formatDate } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { listAdminServers } from '@/services/admin.service'
import type { VpnServer } from '@/types'

/** ISO country code ("DE") → flag emoji (🇩🇪). */
function countryFlag(countryCode: string): string {
  const code = countryCode.trim().toUpperCase()
  if (code.length !== 2) return '🌐'
  return String.fromCodePoint(...[...code].map((char) => 127397 + char.charCodeAt(0)))
}

export default function VpnServersPage() {
  const [servers, setServers] = useState<VpnServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [restartingId, setRestartingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setServers(await listAdminServers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'بارگیری نودهای آی‌پی ثابت ممکن نشد.')
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
        const data = await listAdminServers()
        if (!cancelled) setServers(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'بارگیری نودهای آی‌پی ثابت ممکن نشد.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  // Placeholder "Restart" feedback — local-only, no backend mutation.
  useEffect(() => {
    if (!restartingId) return
    const timer = window.setTimeout(() => setRestartingId(null), 1400)
    return () => window.clearTimeout(timer)
  }, [restartingId])

  const summary = useMemo(() => {
    const online = servers.filter((server) => server.status === 'online').length
    const activeClients = servers.reduce((total, server) => total + server.activeClients, 0)
    const averageLoad = servers.length
      ? Math.round(servers.reduce((total, server) => total + server.load, 0) / servers.length)
      : 0
    return { online, activeClients, averageLoad }
  }, [servers])

  const isLoading = loading && servers.length === 0

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="کاتالوگ"
        title="نودهای آی‌پی ثابت"
        description="زیرساخت آی‌پی ثابت اختصاصی روی تونل امن OpenVPN (UDP). پایش دسترس‌پذیری نودها، ظرفیت کاربران و بار سرورها."
        meta={
          <Badge tone="brand" size="sm">
            {formatCount(servers.length)} نود
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

      {error ? (
        <AdminErrorState message={error} onRetry={refresh} />
      ) : (
        <>
          {/* Summary strip ---------------------------------------------- */}
          {isLoading ? (
            <Card
              padded={false}
              className="grid grid-cols-1 divide-y divide-tg-separator sm:grid-cols-3 sm:divide-x sm:divide-y-0"
            >
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 p-5">
                  <Skeleton className="size-10 rounded-xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                </div>
              ))}
            </Card>
          ) : (
            <Card
              padded={false}
              className="grid grid-cols-1 divide-y divide-tg-separator sm:grid-cols-3 sm:divide-x sm:divide-y-0"
            >
              <div className="flex items-center gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <Wifi className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-tg-hint">نودهای آنلاین</p>
                  <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums text-tg-text">
                    {formatCount(summary.online)}
                    <span className="ms-1 text-[12.5px] font-normal text-tg-hint">
                      از {formatCount(servers.length)}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600">
                  <Gauge className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-tg-hint">بار متوسط</p>
                  <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums text-tg-text">
                    {formatCount(summary.averageLoad)}٪
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
                  <Users className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-tg-hint">کاربران فعال</p>
                  <p className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums text-tg-text">
                    {formatCount(summary.activeClients)}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Node cards -------------------------------------------------- */}
          {isLoading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-64 rounded-2xl" />
              ))}
            </div>
          ) : servers.length === 0 ? (
            <Card>
              <EmptyState
                icon={Server}
                title="هنوز نود آی‌پی ثابتی ثبت نشده"
                description="اولین نود daloRADIUS خود را راه‌اندازی کنید تا فروش پلن‌های آی‌پی ثابت آغاز شود."
                className="py-10"
              />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {servers.map((server) => (
                <Card key={server.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tg-secondary-bg text-lg"
                        aria-hidden
                      >
                        {countryFlag(server.countryCode)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-tg-text">
                          {server.name}
                        </p>
                        <p className="truncate font-mono text-[11px] text-tg-hint">
                          <span className="bidi-ltr">{server.hostname}</span>
                        </p>
                      </div>
                    </div>
                    <VpnStatusBadge status={server.status} />
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-tg-secondary-bg/60 p-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-[11px] font-semibold text-tg-hint">نشانی IP</dt>
                      <dd className="mt-0.5 truncate font-mono text-[12px] text-tg-text">
                        <span className="bidi-ltr">{server.ip}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-tg-hint">پروتکل</dt>
                      <dd className="mt-0.5 truncate text-[12px] text-tg-text">
                        <span className="bidi-ltr">{server.protocol}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold text-tg-hint">موقعیت</dt>
                      <dd className="mt-0.5 truncate text-[12px] text-tg-text">{server.country}</dd>
                    </div>
                  </dl>

                  <div className="mt-4">
                    <div className="flex items-center justify-between gap-3 text-[11.5px]">
                      <span className="text-tg-hint">بار سرور</span>
                      <span className="font-medium tabular-nums text-tg-text">
                        {formatCount(server.load)}٪ · {formatCount(server.activeClients)}/
                        {formatCount(server.maxClients)} کاربر
                      </span>
                    </div>
                    <LoadBar value={server.load} className="mt-2" />
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-tg-separator pt-3">
                    <p className="flex items-center gap-1.5 text-[11.5px] text-tg-hint">
                      <CalendarDays className="size-3.5" aria-hidden />
                      افزوده‌شده {formatDate(server.createdAt)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<RotateCw className="size-3.5" />}
                        loading={restartingId === server.id}
                        onClick={() => setRestartingId(server.id)}
                      >
                        راه‌اندازی مجدد
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 rounded-lg"
                        aria-label={`اقدامات بیشتر برای ${server.name}`}
                      >
                        <MoreHorizontal className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
