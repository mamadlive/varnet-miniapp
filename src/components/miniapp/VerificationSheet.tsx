import { useState } from 'react'
import { BadgeCheck, Info, LockKeyhole, Phone, ShieldCheck, ShieldOff } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Sheet } from '@/components/ui/Sheet'
import { useTelegram } from '@/hooks/useTelegram'
import { formatDate } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'

const BENEFITS = [
  {
    icon: LockKeyhole,
    title: 'شماره شما محفوظ می‌ماند',
    body: 'شماره تلفن فقط برای احراز هویت ذخیره می‌شود و در اختیار فروشندگان قرار نمی‌گیرد.',
  },
  {
    icon: BadgeCheck,
    title: 'خرید بدون محدودیت',
    body: 'پس از تأیید، می‌توانید اکانت‌های دیجیتال و آی‌پی ثابت را از کیف پول خریداری کنید.',
  },
  {
    icon: Phone,
    title: 'تأیید با یک ضربه',
    body: 'تلگرام شماره ثبت‌شده در حساب شما را نمایش می‌دهد؛ فقط اشتراک‌گذاری را تأیید کنید.',
  },
]

export interface VerificationSheetProps {
  open: boolean
  onClose: () => void
  /** Fired after a successful verification (e.g. resume a checkout). */
  onVerified?: () => void
}

/**
 * Phone-based KYC gate.
 *
 * Uses Telegram's native `requestContact` dialog inside the client. In the
 * browser preview the auth store simulates a verified phone so the rest of the
 * purchase flow stays reviewable.
 */
export function VerificationSheet({ open, onClose, onVerified }: VerificationSheetProps) {
  const user = useAuthStore((state) => state.user)
  const verifyWithPhone = useAuthStore((state) => state.verifyWithPhone)
  const { isTelegram, haptic, notify } = useTelegram()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const verified = user?.verified === true

  const handleClose = () => {
    if (submitting) return
    setError(null)
    onClose()
  }

  const handleVerify = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await verifyWithPhone()
      haptic('medium')
      notify('success')
      onVerified?.()
    } catch (cause) {
      notify('error')
      setError(cause instanceof Error ? cause.message : 'احراز هویت انجام نشد. دوباره تلاش کنید.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="احراز هویت"
      description="برای خرید اول، شماره تلفن خود را با تلگرام تأیید کنید."
      footer={
        verified ? (
          <Button fullWidth size="lg" variant="secondary" onClick={handleClose}>
            بستن
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              fullWidth
              size="lg"
              loading={submitting}
              onClick={handleVerify}
              leftIcon={<Phone className="size-4" aria-hidden />}
            >
              تأیید و ارسال شماره
            </Button>
            <Button fullWidth size="md" variant="secondary" onClick={handleClose}>
              انصراف
            </Button>
            <p className="mt-1 text-center text-[11px] leading-relaxed text-tg-hint">
              شماره شما فقط برای احراز هویت ذخیره می‌شود.
            </p>
          </div>
        )
      }
    >
      {verified ? (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-5 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
              <ShieldCheck className="size-6" aria-hidden />
            </span>
            <p className="text-[15px] font-semibold text-tg-text">هویت شما تأیید شده است</p>
            {user?.phoneNumber ? (
              <p className="bidi-ltr text-[13px] font-medium tabular-nums text-tg-hint">
                {user.phoneNumber}
              </p>
            ) : null}
            {user?.verifiedAt ? (
              <p className="text-[11.5px] text-tg-hint">
                تأیید در {formatDate(user.verifiedAt)}
              </p>
            ) : null}
          </div>
          <p className="text-[13px] leading-relaxed text-tg-hint">
            اکنون می‌توانید از کیف پول خود خرید کنید. اگر شماره تلگرام‌تان عوض شد، دوباره از
            پروفایل احراز هویت را انجام دهید.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
              <ShieldOff className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-tg-text">هنوز احراز هویت نشده‌اید</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-tg-hint">
                برای جلوگیری از سوءاستفاده، اولین خرید فقط پس از تأیید شماره تلفن انجام می‌شود.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon
              return (
                <div
                  key={benefit.title}
                  className="flex items-start gap-2.5 rounded-xl border border-tg-separator bg-tg-bg p-3"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-600">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-tg-text">{benefit.title}</p>
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-tg-hint">
                      {benefit.body}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {!isTelegram ? (
            <Card variant="muted" className="flex items-start gap-2.5 p-3">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
              <p className="text-[11.5px] leading-relaxed text-tg-hint">
                در پیش‌نمایش مرورگر، ارسال شماره شبیه‌سازی می‌شود. نسخه واقعی از دیالوگ بومی
                تلگرام استفاده می‌کند.
              </p>
            </Card>
          ) : null}

          {user?.phoneNumber ? (
            <p className="text-center text-[12px] text-tg-hint">
              شماره ثبت‌شده:{' '}
              <span className="bidi-ltr font-medium tabular-nums text-tg-text">
                {user.phoneNumber}
              </span>
            </p>
          ) : null}

          {error ? (
            <p className="rounded-xl bg-tg-destructive/10 px-3 py-2 text-[12px] font-medium text-tg-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex justify-center">
            <Badge tone="warning" size="sm">
              احراز هویت برای اولین خرید الزامی است
            </Badge>
          </div>
        </div>
      )}
    </Sheet>
  )
}
