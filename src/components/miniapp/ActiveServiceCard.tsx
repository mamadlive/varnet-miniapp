import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileText,
  KeyRound,
  ShieldCheck,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCurrency, formatDate } from '@/lib/format'
import { downloadTextFile, looksLikeOpenVpnProfile } from '@/lib/ovpn'
import { cn } from '@/lib/utils'
import type { PurchasedStaticIpService } from '@/types'

export interface ActiveServiceCardProps {
  service: PurchasedStaticIpService
  /** Emits a transient toast message (copy/download feedback). */
  onNotice?: (message: string) => void
  className?: string
}

function configFilename(service: PurchasedStaticIpService, profile: boolean): string {
  const safeId = service.orderId.replace(/[^a-zA-Z0-9_-]/g, '')
  return `varnet-${safeId || 'static-ip'}.${profile ? 'ovpn' : 'txt'}`
}

/**
 * D1-backed purchased static-IP service: the config the admin recorded when
 * completing the order is downloadable as an `.ovpn` profile, or viewable and
 * copyable as plain credentials when it is free-form text.
 */
export function ActiveServiceCard({ service, onNotice, className }: ActiveServiceCardProps) {
  const { haptic } = useTelegram()
  const [showConfig, setShowConfig] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<number | null>(null)

  const note = service.deliveryNote?.trim() ?? ''
  const hasConfig = note.length > 0
  const isProfile = hasConfig && looksLikeOpenVpnProfile(note)

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    },
    [],
  )

  const handleDownload = () => {
    if (!hasConfig) return
    haptic('light')
    const content = isProfile && !note.endsWith('\n') ? `${note}\n` : note
    downloadTextFile(
      content,
      configFilename(service, isProfile),
      isProfile ? 'application/x-openvpn-profile' : 'text/plain;charset=utf-8',
    )
    onNotice?.(
      isProfile
        ? 'فایل پروفایل OpenVPN دانلود شد؛ آن را در برنامه OpenVPN باز کنید.'
        : 'فایل اطلاعات اتصال دانلود شد.',
    )
  }

  const handleCopy = async () => {
    if (!hasConfig) return
    haptic('light')
    try {
      await navigator.clipboard.writeText(note)
      setCopied(true)
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 3_000)
    } catch {
      onNotice?.('کپی خودکار ممکن نشد؛ متن کانفیگ را دستی انتخاب و کپی کنید.')
    }
  }

  return (
    <Card
      padded={false}
      className={cn('animate-slide-up overflow-hidden', className)}
    >
      <div className="flex items-start gap-3 p-4">
        <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm shadow-brand-500/25">
          <span aria-hidden className="absolute -end-3 -top-4 size-10 rounded-full bg-white/20 blur-md" />
          <ShieldCheck className="relative size-5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 dir="auto" className="truncate text-[14px] font-semibold text-tg-text">
              {service.planName}
            </h3>
            <Badge tone="success" size="sm">
              فعال
            </Badge>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-tg-hint">
            <span>خرید: {formatDate(service.purchasedAt)}</span>
            <span aria-hidden>·</span>
            <span>{formatCurrency(service.amount, service.currency)}</span>
          </p>
        </div>
      </div>

      <div className="px-4 pb-4">
        {hasConfig ? (
          <div className="rounded-xl border border-tg-separator bg-tg-bg p-3">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-tg-hint">
              <KeyRound className="size-3.5" aria-hidden />
              {isProfile ? 'پروفایل OpenVPN تحویل‌شده' : 'اطلاعات اتصال تحویل‌شده'}
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-tg-hint">
              {isProfile
                ? 'این فایل کامل است؛ آن را در برنامه OpenVPN باز کنید و متصل شوید.'
                : 'نام کاربری، رمز و اطلاعات سرور را از متن زیر بردارید و در کلاینت OpenVPN وارد کنید.'}
            </p>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download className="size-3.5" aria-hidden />}
                onClick={handleDownload}
              >
                دانلود فایل کانفیگ
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<FileText className="size-3.5" aria-hidden />}
                onClick={() => {
                  haptic('light')
                  setShowConfig((visible) => !visible)
                }}
                aria-expanded={showConfig}
              >
                {showConfig ? 'بستن متن' : 'نمایش متن کانفیگ'}
              </Button>
            </div>

            {showConfig ? (
              <div className="mt-2.5">
                <div className="relative">
                  <pre
                    dir="ltr"
                    className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-tg-secondary-bg p-3 pe-10 font-mono text-[10.5px] leading-relaxed text-tg-text"
                  >
                    {note}
                  </pre>
                  <button
                    type="button"
                    onClick={handleCopy}
                    aria-label="کپی متن کانفیگ"
                    className="absolute end-1.5 top-1.5 flex size-7 items-center justify-center rounded-lg bg-tg-bg/80 text-tg-hint transition-colors hover:text-tg-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
                  >
                    {copied ? (
                      <Check className="size-3.5 text-emerald-500" aria-hidden />
                    ) : (
                      <Copy className="size-3.5" aria-hidden />
                    )}
                  </button>
                </div>
                {copied ? (
                  <p role="status" className="mt-1.5 text-[10.5px] font-medium text-emerald-600">
                    متن کانفیگ کپی شد.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <p className="text-[11.5px] font-medium leading-relaxed text-amber-700 dark:text-amber-400">
                کانفیگ این سرویس هنوز توسط پشتیبانی ثبت نشده است. به‌محض تکمیل سفارش، فایل دانلود
                در همین کارت فعال می‌شود.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              disabled
              leftIcon={<Download className="size-3.5" aria-hidden />}
            >
              دانلود فایل کانفیگ
            </Button>
          </div>
        )}
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
      <div className="h-20 w-full animate-pulse rounded-xl bg-tg-secondary-bg" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-9 animate-pulse rounded-xl bg-tg-secondary-bg" />
        <div className="h-9 animate-pulse rounded-xl bg-tg-secondary-bg" />
      </div>
    </div>
  )
}
