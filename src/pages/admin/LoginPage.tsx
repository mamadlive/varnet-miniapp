import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, KeyRound, Loader2, RefreshCw, Send, ShieldCheck, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { env } from '@/config/env'
import { isApiError } from '@/services/apiClient'
import { useAdminAuthStore } from '@/store/adminAuthStore'
import { useAuthStore } from '@/store/authStore'

const RESEND_AFTER_SECONDS = 45

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/**
 * Desktop `/admin/login` — the only way into the web panel outside Telegram.
 *
 * A one-time code is delivered to the admin's Telegram chat; a successful
 * verification stores a signed admin token used by every `/api/admin/*` call.
 * There is deliberately no demo or `initData` bypass on this screen.
 */
export default function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const token = useAdminAuthStore((state) => state.token)
  const status = useAdminAuthStore((state) => state.status)
  const hydrate = useAdminAuthStore((state) => state.hydrate)
  const requestOtp = useAdminAuthStore((state) => state.requestOtp)
  const verifyOtp = useAdminAuthStore((state) => state.verifyOtp)
  const logout = useAdminAuthStore((state) => state.logout)

  const miniAppAdmin = useAuthStore((state) => state.isAdmin && !state.isDemo)

  const [step, setStep] = useState<'request' | 'verify'>('request')
  const [code, setCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const redirectTo = useMemo(() => {
    const from = (location.state as { from?: unknown } | null)?.from
    return typeof from === 'string' && from.startsWith('/admin') && from !== '/admin/login'
      ? from
      : '/admin'
  }, [location.state])

  const enterPanel = () => navigate(redirectTo, { replace: true })

  // Inside Telegram an allow-listed admin already has a valid session.
  useEffect(() => {
    if (miniAppAdmin) enterPanel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miniAppAdmin])

  // Validate a stored token before asking for a new code.
  useEffect(() => {
    if (miniAppAdmin || !token || status !== 'idle') return
    void hydrate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miniAppAdmin, token, status])

  useEffect(() => {
    if (status === 'authenticated') enterPanel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const handleRequestOtp = async () => {
    if (sending || cooldown > 0) return
    setSending(true)
    setError(null)
    setErrorCode(null)
    try {
      const result = await requestOtp()
      setStep('verify')
      setCooldown(Math.max(RESEND_AFTER_SECONDS, result.cooldownSeconds || 0))
      setNotice(
        'کد ۶ رقمی به تلگرام مدیر ارسال شد. اعتبار کد ۵ دقیقه است — کد را در همین صفحه وارد کنید.',
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'ارسال کد تایید انجام نشد.')
      setErrorCode(isApiError(cause) ? (cause.code ?? null) : null)
      const retryAfter = isApiError(cause)
        ? (cause.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds
        : undefined
      if (typeof retryAfter === 'number' && retryAfter > 0) setCooldown(retryAfter)
    } finally {
      setSending(false)
    }
  }

  const handleVerify = async () => {
    if (verifying || code.length !== 6) return
    setVerifying(true)
    setError(null)
    setErrorCode(null)
    try {
      await verifyOtp(code)
      enterPanel()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'بررسی کد تایید انجام نشد.')
      setErrorCode(isApiError(cause) ? (cause.code ?? null) : null)
    } finally {
      setVerifying(false)
    }
  }

  const restart = () => {
    logout()
    setStep('request')
    setCode('')
    setNotice(null)
    setError(null)
    setErrorCode(null)
  }

  const checking = Boolean(token) && (status === 'idle' || status === 'checking')

  if (checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-tg-secondary-bg px-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-6 animate-spin text-brand-500" aria-hidden />
          <p className="text-[13px] text-tg-hint">در حال بررسی نشست مدیریتی…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-tg-secondary-bg px-5 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/25">
            <ShieldCheck className="size-8" aria-hidden />
          </span>
          <div className="space-y-1">
            <h1 className="text-[20px] font-semibold text-tg-text">ورود امن به پنل مدیریت</h1>
            <p className="text-[12.5px] leading-relaxed text-tg-hint">
              {env.appName} — دسترسی فقط با کد یکبارمصرفی که به تلگرام مدیر ارسال می‌شود.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-tg-separator bg-tg-bg p-5 shadow-sm">
          {step === 'request' ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-tg-secondary-bg p-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600">
                  <Send className="size-[18px]" aria-hidden />
                </span>
                <p className="text-[12.5px] leading-relaxed text-tg-hint">
                  با کلیک روی دکمه زیر، یک کد ۶ رقمی برای آیدی‌های تعریف‌شده در{' '}
                  <span className="bidi-ltr">ADMIN_TELEGRAM_IDS</span> ارسال می‌شود. کد تا ۵ دقیقه
                  اعتبار دارد.
                </p>
              </div>

              <Button
                fullWidth
                size="lg"
                loading={sending}
                onClick={() => void handleRequestOtp()}
                leftIcon={<Send className="size-4" aria-hidden />}
                disabled={cooldown > 0}
              >
                {cooldown > 0 ? `ارسال دوباره تا ${formatCountdown(cooldown)}` : 'ارسال کد تایید به تلگرام مدیر'}
              </Button>

            </div>
          ) : (
            <div className="space-y-4">
              <Input
                autoFocus
                label="کد تایید ۶ رقمی"
                icon={KeyRound}
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void handleVerify()
                }}
                className="text-center text-[20px] font-semibold tracking-[0.45em] tabular-nums"
              />

              <Button
                fullWidth
                size="lg"
                loading={verifying}
                disabled={code.length !== 6}
                onClick={() => void handleVerify()}
                leftIcon={<ShieldCheck className="size-4" aria-hidden />}
              >
                تایید و ورود به پنل
              </Button>

              <div className="flex flex-col items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRequestOtp()}
                  disabled={sending || cooldown > 0}
                  leftIcon={<RefreshCw className="size-3.5" aria-hidden />}
                >
                  {cooldown > 0
                    ? `ارسال دوباره تا ${formatCountdown(cooldown)}`
                    : 'ارسال دوباره کد تایید'}
                </Button>
                <Button variant="ghost" size="sm" onClick={restart}>
                  تغییر روش ورود
                </Button>
              </div>
            </div>
          )}

          {notice ? (
            <p className="mt-4 rounded-xl bg-emerald-500/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-emerald-600">
              {notice}
            </p>
          ) : null}

          {error ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
              <div className="min-w-0 space-y-0.5">
                <p className="text-[12.5px] leading-relaxed text-rose-600">{error}</p>
                {errorCode ? (
                  <p className="text-[11px] text-tg-hint">
                    کد خطا: <span className="bidi-ltr">{errorCode}</span>
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <p className="text-center text-[11.5px] leading-relaxed text-tg-hint">
          ورود نمایشی (Demo) به پنل مدیریت غیرفعال است. اگر کد را دریافت نکردید، از ادمین بخواهید
          آیدی تلگرام شما را در <span className="bidi-ltr">ADMIN_TELEGRAM_IDS</span> اضافه کند.
        </p>

        <div className="text-center">
          <Link
            to="/app/profile"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-tg-hint transition-colors hover:text-tg-text"
          >
            <ArrowRight className="size-3.5" aria-hidden />
            بازگشت به مینی‌اپ
          </Link>
        </div>
      </div>
    </div>
  )
}
