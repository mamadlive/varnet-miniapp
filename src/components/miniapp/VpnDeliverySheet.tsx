import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Download, ReceiptText, Zap } from 'lucide-react'
import { OpenVpnNotice } from '@/components/miniapp/OpenVpnNotice'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { useTelegram } from '@/hooks/useTelegram'
import { downloadOpenVpnProfile } from '@/lib/ovpn'
import type { ActiveService } from '@/types'

export type VpnDeliveryMode = 'new' | 'renew'

export interface VpnDeliverySheetProps {
  open: boolean
  onClose: () => void
  planTitle: string
  /** `new` issues fresh credentials; `renew` keeps the existing pair. */
  mode?: VpnDeliveryMode
  service?: Pick<ActiveService, 'username' | 'password' | 'ipAddress'>
}

/**
 * Success state for a static-IP purchase or renewal. The profile is generated
 * in-browser and downloaded as a `.ovpn` file with the RADIUS credentials
 * embedded, alongside the OpenVPN client-install notice.
 */
export function VpnDeliverySheet({
  open,
  onClose,
  planTitle,
  mode = 'new',
  service,
}: VpnDeliverySheetProps) {
  const navigate = useNavigate()
  const { haptic } = useTelegram()
  const [profileReady, setProfileReady] = useState(false)
  const profileTimer = useRef<number | null>(null)

  const renewed = mode === 'renew'

  useEffect(
    () => () => {
      if (profileTimer.current !== null) window.clearTimeout(profileTimer.current)
    },
    [],
  )

  const handleOrders = () => {
    haptic()
    onClose()
    navigate('/app/orders')
  }

  const handleDownload = () => {
    if (!service) return
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
    <Sheet
      open={open}
      onClose={onClose}
      title={renewed ? 'سرویس شما تمدید شد' : 'سرویس شما فعال شد'}
      description={
        renewed
          ? 'زمان و حجم به سرویس موجود اضافه شد؛ نام کاربری و رمز قبلی بدون تغییر باقی مانده است.'
          : 'تحویل تقریباً فوری — جزئیات اتصال در بخش سفارش‌ها و پیام تلگرام شما قرار گرفت.'
      }
      footer={
        <div className="flex flex-col gap-2">
          {service ? (
            <Button
              fullWidth
              size="lg"
              onClick={handleDownload}
              leftIcon={<Download className="size-4" aria-hidden />}
            >
              دانلود فایل پروفایل (.ovpn)
            </Button>
          ) : null}
          <Button
            fullWidth
            size={service ? 'md' : 'lg'}
            variant={service ? 'secondary' : 'primary'}
            onClick={handleOrders}
            leftIcon={<ReceiptText className="size-4" aria-hidden />}
          >
            مشاهده در سفارش‌ها
          </Button>
          <Button fullWidth size="sm" variant="ghost" onClick={onClose}>
            بستن
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
            <CheckCircle2 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-tg-text">{planTitle}</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-tg-hint">
              {renewed
                ? 'حجم و زمان سرویس افزایش یافت و همان آی‌پی ثابت قبلی باقی ماند.'
                : 'آی‌پی ثابت اختصاصی و نام کاربری/رمز OpenVPN به‌صورت خودکار داخل پروفایل تزریق شد.'}
            </p>
          </div>
        </div>

        {service ? (
          <div className="space-y-2 rounded-2xl border border-tg-separator bg-tg-bg p-3.5">
            <p className="text-[11px] font-semibold text-tg-hint">اطلاعات ورود RADIUS</p>
            <div className="grid gap-1.5 text-[11.5px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-tg-hint">نام کاربری</span>
                <span dir="ltr" className="max-w-[65%] truncate font-mono font-semibold text-tg-text">
                  {service.username}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-tg-hint">رمز عبور</span>
                <span dir="ltr" className="max-w-[65%] truncate font-mono font-semibold text-tg-text">
                  {service.password}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-tg-hint">آدرس سرور</span>
                <span dir="ltr" className="max-w-[65%] truncate font-mono font-semibold text-tg-text">
                  {service.ipAddress}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-2 rounded-2xl border border-tg-separator bg-tg-bg p-3.5">
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-tg-text">
            <Zap className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
            فعال‌سازی روی تونل امن OpenVPN (UDP) انجام شد؛ پروفایل را از همین صفحه یا بخش
            سفارش‌ها دریافت کنید.
          </p>
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-tg-hint">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
            {renewed
              ? 'نام کاربری و رمز OpenVPN تغییری نکرده‌اند؛ فایل .ovpn جدید نیز همان اطلاعات را دارد.'
              : 'نیازی به تنظیم دستی نام کاربری یا رمز نیست؛ همه‌چیز داخل فایل پروفایل قرار دارد.'}
          </p>
        </div>

        {profileReady ? (
          <p role="status" className="text-center text-[11.5px] font-medium text-emerald-600">
            فایل پروفایل ساخته شد و دانلود آغاز شد.
          </p>
        ) : null}

        <OpenVpnNotice />
      </div>
    </Sheet>
  )
}
