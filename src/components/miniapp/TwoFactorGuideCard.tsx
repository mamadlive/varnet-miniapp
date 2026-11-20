import type { ReactNode } from 'react'
import { Braces, KeyRound, ShieldCheck, Sparkles, Timer } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

export interface TwoFactorGuideCardProps {
  /** Denser layout for the order sheet, where vertical space is tight. */
  compact?: boolean
  /** Set when the delivery text already yielded a seed, so we can say so. */
  secretFound?: boolean
  className?: string
}

interface GuideItemProps {
  icon: typeof KeyRound
  title: string
  children: ReactNode
}

function GuideItem({ icon: Icon, title, children }: GuideItemProps) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-600">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[12.5px] font-semibold text-tg-text">{title}</p>
        <p className="text-[11.5px] leading-relaxed text-tg-hint">{children}</p>
      </div>
    </li>
  )
}

/**
 * Persian how-to for the in-app authenticator, shown on products that likely
 * need a 2FA code (CDK / TOTP accounts) and on account orders whose delivery
 * text carries the seed. Keeps the guidance identical in both places.
 */
export function TwoFactorGuideCard({
  compact = false,
  secretFound = false,
  className,
}: TwoFactorGuideCardProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-brand-500/25 bg-brand-500/5',
        compact ? 'p-3' : 'p-3.5',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600">
          <ShieldCheck className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('font-semibold text-tg-text', compact ? 'text-[12.5px]' : 'text-[13px]')}>
            راهنمای کد تایید ۲۴ (2FA)
          </p>
          <p className="text-[11px] text-tg-hint">کلید را از متن تحویلی بردارید و کد بگیرید</p>
        </div>
        <Badge tone="brand" size="sm" className="shrink-0 self-start">
          ۳۰ ثانیه
        </Badge>
      </div>

      {secretFound ? (
        <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11.5px] font-medium text-emerald-600">
          <Sparkles className="size-3.5 shrink-0" aria-hidden />
          کلید 2FA در اطلاعات تحویل این سفارش پیدا شد؛ با دکمه پایین مستقیم وارد ابزار می‌شود.
        </p>
      ) : null}

      <ul className={cn('space-y-2.5', compact ? 'mt-2.5' : 'mt-3')}>
        <GuideItem icon={KeyRound} title="کلید 2FA چیست؟">
          سکرت یا رشته Base32 است که برای ساخت کد ۶ رقمی لحظه‌ای (TOTP با بازه ۳۰ ثانیه) به کار
          می‌رود. این کلید همراه اطلاعات تحویل اکانت یا CDK به شما داده می‌شود.
        </GuideItem>

        <GuideItem icon={Braces} title="استخراج کلید از JSON یا متن تحویلی">
          متن تحویلی را همان‌گونه که هست در ابزار «کد تایید ۲۴ (2FA)» بچسبانید؛ کلید خودکار پیدا
          می‌شود. پشتیبانی از JSON مثل{' '}
          <code dir="ltr" className="rounded bg-tg-secondary-bg px-1 py-0.5 text-[11px]">
            "two_factor_secret": "..."
          </code>{' '}
          یا{' '}
          <code dir="ltr" className="rounded bg-tg-secondary-bg px-1 py-0.5 text-[11px]">
            "secret": "..."
          </code>
          ، متن چندخطی مثل <span dir="ltr">2FA: JBSWY3DP…</span> و لینک{' '}
          <code dir="ltr" className="rounded bg-tg-secondary-bg px-1 py-0.5 text-[11px]">
            otpauth://...
          </code>
          . اگر فقط خود کلید را دارید، همان را مستقیماً پیست کنید.
        </GuideItem>

        <GuideItem icon={Timer} title="نحوه گرفتن و وارد کردن کد">
          ابزار «کد تایید ۲۴ (2FA)» را باز کنید، کد ۶ رقمی را پیش از پایان شمارش معکوس ۳۰
          ثانیه‌ای کپی کنید و در مرحله ورود به اکانت/سایت جای‌گذاری کنید.
        </GuideItem>
      </ul>
    </section>
  )
}
