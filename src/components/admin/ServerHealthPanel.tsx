import { ArrowLeft, Server } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatCurrency } from '@/lib/format'
import type { StaticIpNode, StaticIpNodeAvailability } from '@/types'

const AVAILABILITY_LABELS: Record<StaticIpNodeAvailability, string> = {
  in_stock: 'موجود',
  coming_soon: 'به‌زودی',
  sold_out: 'ناموجود',
}

const AVAILABILITY_TONES: Record<StaticIpNodeAvailability, BadgeTone> = {
  in_stock: 'success',
  coming_soon: 'info',
  sold_out: 'neutral',
}

export interface ServerHealthPanelProps {
  nodes: StaticIpNode[]
  loading?: boolean
}

/** Compact catalogue list of D1 static-IP nodes for the dashboard's end column. */
export function ServerHealthPanel({ nodes, loading = false }: ServerHealthPanelProps) {
  const visible = nodes.filter((node) => node.enabled)

  return (
    <Card padded={false} className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-tg-text">نودهای آی‌پی ثابت</h2>
          <p className="mt-0.5 text-[12px] text-tg-hint">
            نودهای فعال فروشگاه ({visible.length} از {nodes.length})
          </p>
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
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <EmptyState
          icon={Server}
          title="هنوز نودی ثبت نشده"
          description="برای شروع فروش آی‌پی ثابت، یک نود در بخش مدیریت اضافه کنید."
          className="py-8"
        />
      ) : (
        <div className="mt-2 divide-y divide-tg-separator">
          {nodes.map((node) => (
            <div key={node.id} className="py-3.5 first:pt-2 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-tg-text">{node.name}</p>
                  <p className="truncate text-[11px] text-tg-hint">
                    {node.country} · <span className="bidi-ltr">{node.ip}</span>
                  </p>
                </div>
                <Badge tone={AVAILABILITY_TONES[node.availability]} size="sm">
                  {node.enabled ? AVAILABILITY_LABELS[node.availability] : 'مخفی'}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] font-medium tabular-nums text-tg-hint">
                {formatCurrency(node.price, node.currency)}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
