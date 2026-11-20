import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Copy, KeyRound, ShieldCheck, Timer, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useTelegram } from '@/hooks/useTelegram'
import { toPersianDigits } from '@/lib/format'
import {
  TOTP_PERIOD_SECONDS,
  extractTotpSecret,
  generateTotpCode,
  totpSecondsRemaining,
} from '@/lib/totp'
import { cn } from '@/lib/utils'

/** Splits "123456" into "123 456" so the code is easy to read aloud. */
function groupCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}

/**
 * «کد تایید ۲۴ (2FA)» — the in-app authenticator. The customer pastes the
 * delivery text (or just the Base32 seed) and gets a live RFC 6238 code with a
 * 30-second countdown, entirely client-side.
 */
export default function TwoFactorPage() {
  const { haptic } = useTelegram()
  const [params] = useSearchParams()

  const [input, setInput] = useState(() => params.get('secret') ?? '')
  const [now, setNow] = useState(() => Date.now())
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const secret = useMemo(() => extractTotpSecret(input), [input])
  const windowIndex = Math.floor(now / 1000 / TOTP_PERIOD_SECONDS)
  const secondsRemaining = totpSecondsRemaining(now)
  const progress = secondsRemaining / TOTP_PERIOD_SECONDS
  const cryptoReady = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!secret || !cryptoReady) {
      setCode(null)
      return
    }

    let cancelled = false
    // Pin generation to the start of the window so the code only recomputes
    // when the 30-second counter rolls over, not on every tick.
    generateTotpCode(secret, windowIndex * TOTP_PERIOD_SECONDS * 1000)
      .then((next) => {
        if (cancelled) return
        setCode(next)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'تولید کد ممکن نشد.')
        setCode(null)
      })

    return () => {
      cancelled = true
    }
  }, [secret, windowIndex, cryptoReady])

  const copyCode = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      haptic('light')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('کپی خودکار ممکن نشد؛ کد را دستی یادداشت کنید.')
    }
  }

  const clearInput = () => {
    haptic()
    setInput('')
    setCode(null)
    setError(null)
  }

  return (
    <div className="tg-page animate-fade-in space-y-4 pt-5">
      <header className="px-1">
        <h1 className="text-[22px] font-bold text-tg-text">کد تایید ۲۴ (2FA)</h1>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tg-hint">
          کلید 2FA اکانت یا متن تحویل سفارش را وارد کنید تا کد ۶ رقمی لحظه‌ای بسازیم. کد هر ۳۰
          ثانیه به‌روز می‌شود.
        </p>
      </header>

      <Card variant="surface" className="space-y-3">
        <Input
          label="کلید 2FA یا متن تحویل"
          hint={
            secret
              ? 'کلید شناسایی شد — کد در حال تولید است.'
              : 'امکان چسباندن متن کامل سفارش، JSON یا لینک otpauth نیز وجود دارد.'
          }
          icon={KeyRound}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="مثال: JBSWY3DPEHPK3PXP"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          className="font-mono text-[14px] tracking-wide"
          trailing={
            input ? (
              <button
                type="button"
                onClick={clearInput}
                aria-label="پاک کردن"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg text-tg-hint transition-colors hover:bg-tg-secondary-bg hover:text-tg-text"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            ) : null
          }
        />

        {!cryptoReady ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-600">
            این محیط از رمزنگاری مرورگر پشتیبانی نمی‌کند؛ مینی‌اپ را داخل تلگرام باز کنید.
          </p>
        ) : null}
      </Card>

      <Card variant="brand" className="relative overflow-hidden text-center">
        <span aria-hidden className="pointer-events-none absolute -end-10 -top-12 size-32 rounded-full bg-white/15 blur-2xl" />

        <p className="relative text-[12px] font-medium text-white/80">کد تایید فعلی</p>

        <p className="relative mt-2 font-mono text-[38px] font-bold leading-none tracking-[0.18em] text-white">
          {code ? toPersianDigits(groupCode(code)) : '— — —  — — —'}
        </p>

        <div className="relative mx-auto mt-4 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/25">
          <div
            className={cn(
              'h-full rounded-full bg-white transition-[width] duration-1000 ease-linear',
              secondsRemaining <= 5 && 'bg-amber-300',
            )}
            style={{ width: `${Math.max(progress * 100, 3)}%` }}
          />
        </div>

        <p className="relative mt-2 flex items-center justify-center gap-1.5 text-[12px] text-white/85">
          <Timer className="size-3.5" aria-hidden />
          {secret ? (
            <>
              <span className="tabular-nums">{toPersianDigits(String(secondsRemaining))}</span>
              {' ثانیه تا کد بعدی'}
            </>
          ) : (
            'در انتظار کلید'
          )}
        </p>

        <Button
          variant="secondary"
          size="lg"
          fullWidth
          className="relative mt-4 border-white/25 bg-white/15 text-white hover:bg-white/25"
          leftIcon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          disabled={!code}
          onClick={() => void copyCode()}
        >
          {copied ? 'کد کپی شد' : 'کپی کد'}
        </Button>
      </Card>

      {error ? (
        <Card variant="surface" className="border-rose-500/30 bg-rose-500/5">
          <p className="text-[12.5px] font-medium text-rose-600">{error}</p>
        </Card>
      ) : null}

      <Card variant="muted" className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] font-semibold text-tg-text">راهنمای استفاده</p>
          <ul className="list-inside list-disc space-y-0.5 text-[12px] leading-relaxed text-tg-hint">
            <li>کلید 2FA را از بخش «جزئیات سفارش» یا اطلاعات تحویل کپی کنید.</li>
            <li>کد تولیدشده را در صفحه ورود سرویس وارد کنید.</li>
            <li>کلید فقط روی همین دستگاه پردازش می‌شود و جایی ارسال نمی‌گردد.</li>
          </ul>
        </div>
        <Badge tone="brand" size="sm" className="ms-auto shrink-0 self-start">
          امن
        </Badge>
      </Card>
    </div>
  )
}
