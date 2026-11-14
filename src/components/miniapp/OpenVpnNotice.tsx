import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'

export const OPENVPN_CLIENT_NOTICE =
  'لطفاً نرم‌افزار OpenVPN را متناسب با دستگاه خود (ویندوز، اندروید، آیفون) دانلود و نصب کنید.'

export interface OpenVpnNoticeProps {
  className?: string
  compact?: boolean
}

/**
 * The one instruction every static-IP customer needs after delivery: install
 * the OpenVPN client. Kept in a single component so the exact wording appears
 * identically in checkout, order details and the services tab.
 */
export function OpenVpnNotice({ className, compact = false }: OpenVpnNoticeProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-brand-500/25 bg-brand-500/10 p-3.5',
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600">
        <Download className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-tg-text">نصب نرم‌افزار OpenVPN</p>
        <p
          className={cn(
            'mt-1 leading-relaxed text-tg-hint',
            compact ? 'text-[11.5px]' : 'text-[12px]',
          )}
        >
          {OPENVPN_CLIENT_NOTICE}
        </p>
        {compact ? null : (
          <p className="mt-1 text-[11px] leading-relaxed text-tg-hint/90">
            نام کاربری و رمز عبور به‌صورت خودکار داخل پروفایل تزریق می‌شود؛ کافی است فایل پروفایل
            را در برنامه باز کنید.
          </p>
        )}
      </div>
    </div>
  )
}
