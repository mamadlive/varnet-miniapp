import { useState } from 'react'
import { CheckCircle2, Megaphone, Radio, Send, Users } from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { formatCount, formatDateTime } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAdminStore } from '@/store/adminStore'
import type { BroadcastAudience } from '@/types'

const AUDIENCES: Array<{
  value: BroadcastAudience
  icon: typeof Users
  recipients: number
  hint: string
}> = [
  {
    value: 'all_users',
    icon: Users,
    recipients: 1_284,
    hint: 'به همه کاربرانی که ربات را استارت کرده‌اند',
  },
  {
    value: 'channel',
    icon: Radio,
    recipients: 8_420,
    hint: 'پست در کانال اصلی ورنت',
  },
]

const MAX_LENGTH = 600

export default function BroadcastPage() {
  const broadcasts = useAdminStore((state) => state.broadcasts)
  const sendBroadcast = useAdminStore((state) => state.sendBroadcast)

  const [audience, setAudience] = useState<BroadcastAudience>('all_users')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const selectedAudience = AUDIENCES.find((item) => item.value === audience)!

  const handleSend = () => {
    if (message.trim().length < 5) {
      setError('متن پیام باید حداقل ۵ کاراکتر باشد.')
      return
    }

    sendBroadcast({
      message,
      audience,
      recipients: selectedAudience.recipients,
    })
    setMessage('')
    setError(null)
    setSent(
      `پیام برای ${fa.broadcastAudiences[audience]} ثبت شد (${formatCount(selectedAudience.recipients)} دریافت‌کننده).`,
    )
    window.setTimeout(() => setSent(null), 4200)
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="ارتباطات"
        title="پیام انبوه"
        description="اطلاع‌رسانی موجودی و به‌روزرسانی‌ها را برای کاربران ربات یا کانال اصلی آماده کنید."
        meta={
          <Badge tone="neutral" size="sm">
            حالت نمایشی
          </Badge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="space-y-4">
          <div>
            <p className="text-[13px] font-medium text-tg-hint">مخاطبان</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {AUDIENCES.map((option) => {
                const Icon = option.icon
                const active = audience === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAudience(option.value)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-2xl border p-3 text-start transition-colors',
                      active
                        ? 'border-brand-500 bg-brand-500/[0.08]'
                        : 'border-tg-separator bg-tg-bg hover:bg-tg-secondary-bg',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-xl',
                        active
                          ? 'bg-brand-500/15 text-brand-600'
                          : 'bg-tg-secondary-bg text-tg-hint',
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-tg-text">
                        {fa.broadcastAudiences[option.value]}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-tg-hint">
                        {option.hint}
                      </span>
                      <span className="mt-1 block text-[10.5px] font-medium tabular-nums text-tg-hint">
                        {formatCount(option.recipients)} دریافت‌کننده
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="broadcast-message"
              className="text-[13px] font-medium text-tg-hint"
            >
              متن پیام
            </label>
            <textarea
              id="broadcast-message"
              rows={5}
              value={message}
              maxLength={MAX_LENGTH}
              onChange={(event) => {
                setMessage(event.target.value)
                setError(null)
              }}
              placeholder="مثلاً: ظرفیت جدید آی‌پی ثابت آلمان اضافه شد؛ همین حالا از مینی‌اپ سفارش دهید."
              className="mt-1.5 w-full resize-none rounded-xl border border-tg-separator bg-tg-bg px-3 py-2.5 text-[13px] leading-relaxed text-tg-text outline-none transition-colors placeholder:text-tg-hint/70 focus:border-brand-500"
            />
            <div className="mt-1 flex items-center justify-between gap-3">
              {error ? (
                <p className="text-[11.5px] font-medium text-tg-destructive">{error}</p>
              ) : (
                <p className="text-[11px] text-tg-hint">
                  پیش از ارسال، متن را یک‌بار در پیش‌نمایش بازبینی کنید.
                </p>
              )}
              <span className="shrink-0 text-[10.5px] tabular-nums text-tg-hint">
                {formatCount(message.length)} / {formatCount(MAX_LENGTH)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-tg-separator bg-tg-secondary-bg/60 p-3">
            <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-tg-hint">
              <Megaphone className="size-3.5" aria-hidden />
              پیش‌نمایش
            </p>
            <p className="mt-1.5 min-h-6 whitespace-pre-wrap text-[12.5px] leading-relaxed text-tg-text">
              {message.trim() || 'متن پیام اینجا نمایش داده می‌شود…'}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            {sent ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-600">
                <CheckCircle2 className="size-3.5" aria-hidden />
                {sent}
              </span>
            ) : (
              <span className="text-[11px] text-tg-hint">
                ارسال واقعی پس از اتصال به Bot API فعال می‌شود.
              </span>
            )}
            <Button
              onClick={handleSend}
              disabled={message.trim().length < 5}
              leftIcon={<Send className="size-4" aria-hidden />}
            >
              ارسال پیام
            </Button>
          </div>
        </Card>

        <Card padded={false} className="overflow-hidden">
          <div className="border-b border-tg-separator px-4 py-3">
            <h2 className="text-[14px] font-semibold text-tg-text">ارسال‌های اخیر</h2>
            <p className="mt-0.5 text-[11px] text-tg-hint">
              تاریخچه پیام‌های انبوه این نشست و نمونه‌های اولیه.
            </p>
          </div>

          {broadcasts.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12px] text-tg-hint">
              هنوز پیامی ارسال نشده است.
            </p>
          ) : (
            <ul className="max-h-[60dvh] divide-y divide-tg-separator overflow-y-auto">
              {broadcasts.map((broadcast) => (
                <li key={broadcast.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={broadcast.audience === 'channel' ? 'brand' : 'neutral'} size="sm">
                      {fa.broadcastAudiences[broadcast.audience]}
                    </Badge>
                    <span className="text-[10.5px] tabular-nums text-tg-hint">
                      {formatDateTime(broadcast.sentAt)}
                    </span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-tg-text">{broadcast.message}</p>
                  <p className="text-[10.5px] tabular-nums text-tg-hint">
                    {formatCount(broadcast.recipients)} دریافت‌کننده
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
