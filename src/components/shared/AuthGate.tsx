import type { ReactNode } from 'react'
import { RefreshCw, Send, ShieldCheck, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { env } from '@/config/env'
import { useAuthStore } from '@/store/authStore'

function BrandMark() {
  return (
    <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/25">
      <ShieldCheck className="size-8" aria-hidden />
    </span>
  )
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-tg-secondary-bg px-5 py-10">
      <div className="w-full max-w-sm space-y-5 text-center">{children}</div>
    </div>
  )
}

/**
 * Blocks the app until the boot session is resolved.
 *
 * Inside Telegram the user is authenticated against D1 before any screen
 * renders. Outside Telegram, `VITE_DEMO_MODE` provides a limited preview;
 * otherwise the visitor is asked to open the Mini App in Telegram.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)
  const error = useAuthStore((state) => state.error)
  const errorCode = useAuthStore((state) => state.errorCode)
  const hydrateSession = useAuthStore((state) => state.hydrateSession)

  if (status === 'idle' || status === 'hydrating') {
    return (
      <AuthShell>
        <BrandMark />
        <div className="space-y-1">
          <p className="text-[17px] font-semibold text-tg-text">{env.appName}</p>
          <p className="text-[12.5px] text-tg-hint">در حال تأیید حساب تلگرام…</p>
        </div>
        <Spinner label="لطفاً کمی صبر کنید" className="justify-center" />
      </AuthShell>
    )
  }

  if (status === 'error') {
    return (
      <AuthShell>
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-600">
          <TriangleAlert className="size-7" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-[17px] font-semibold text-tg-text">ورود به حساب انجام نشد</h1>
          <p className="text-[12.5px] leading-relaxed text-tg-hint">
            {error || 'تأیید حساب تلگرام با خطا مواجه شد.'}
          </p>
          {errorCode ? (
            <p className="text-[11px] font-medium text-tg-hint">
              کد خطا: <span className="bidi-ltr">{errorCode}</span>
            </p>
          ) : null}
        </div>
        <Button
          fullWidth
          size="lg"
          onClick={() => void hydrateSession()}
          leftIcon={<RefreshCw className="size-4" aria-hidden />}
        >
          تلاش دوباره
        </Button>
        <p className="text-[11px] leading-relaxed text-tg-hint">
          اگر مشکل ادامه داشت، مینی‌اپ را ببندید و دوباره از داخل تلگرام باز کنید.
        </p>
      </AuthShell>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <AuthShell>
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-600">
          <Send className="size-7" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-[17px] font-semibold text-tg-text">
            {env.appName} را داخل تلگرام باز کنید
          </h1>
          <p className="text-[12.5px] leading-relaxed text-tg-hint">
            برای استفاده از حساب کاربری، کیف پول و سفارش‌ها، مینی‌اپ را از ربات ورنت در تلگرام باز
            کنید. ورود بدون تأیید تلگرام ممکن نیست.
          </p>
        </div>
      </AuthShell>
    )
  }

  return <>{children}</>
}
