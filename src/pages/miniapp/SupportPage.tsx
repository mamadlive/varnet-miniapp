import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LifeBuoy,
  MessageCircleQuestion,
  Send,
} from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { useTelegram } from '@/hooks/useTelegram'
import { formatCount, formatDateTime } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAdminStore } from '@/store/adminStore'
import { useAuthStore } from '@/store/authStore'
import type { SupportTicket, SupportTicketCategory, SupportTicketStatus } from '@/types'

const CATEGORIES: SupportTicketCategory[] = ['technical', 'billing', 'order', 'other']

const STATUS_TONES: Record<SupportTicketStatus, BadgeTone> = {
  open: 'warning',
  answered: 'success',
  closed: 'neutral',
}

/** Mini App support inbox: open a ticket and follow the conversation. */
export default function SupportPage() {
  const navigate = useNavigate()
  const { haptic } = useTelegram()

  const user = useAuthStore((state) => state.user)
  const tickets = useAdminStore((state) => state.tickets)
  const createTicket = useAdminStore((state) => state.createTicket)
  const replyToTicket = useAdminStore((state) => state.replyToTicket)

  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<SupportTicketCategory>('technical')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')

  const userId = user?.id ?? 'usr_guest'
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'کاربر ورنت'

  const myTickets = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.userId === userId)
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [tickets, userId],
  )

  const handleSubmit = () => {
    if (subject.trim().length < 4) {
      setError('موضوع درخواست را کامل‌تر بنویسید.')
      return
    }
    if (body.trim().length < 10) {
      setError('توضیح مشکل باید حداقل ۱۰ کاراکتر باشد.')
      return
    }

    const ticket = createTicket({
      subject,
      category,
      body,
      userId,
      userName,
    })
    haptic('medium')
    setSubject('')
    setCategory('technical')
    setBody('')
    setError(null)
    setSent(true)
    setExpandedId(ticket.id)
    window.setTimeout(() => setSent(false), 3600)
  }

  const handleReply = (ticket: SupportTicket) => {
    if (replyBody.trim().length < 3) return
    replyToTicket(ticket.id, replyBody, 'user')
    haptic()
    setReplyBody('')
  }

  return (
    <div className="tg-page animate-fade-in space-y-4 pt-5">
      <header className="flex items-start gap-2">
        <button
          type="button"
          aria-label="بازگشت"
          onClick={() => {
            haptic()
            navigate(-1)
          }}
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-tg-separator bg-tg-bg text-tg-hint transition-colors hover:text-tg-text"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
        <div className="min-w-0">
          <h1 className="text-[21px] font-bold leading-tight text-tg-text">پشتیبانی</h1>
          <p className="mt-0.5 text-[12px] leading-snug text-tg-hint">
            مشکل یا سؤالتان را ثبت کنید؛ معمولاً ظرف چند ساعت پاسخ می‌دهیم.
          </p>
        </div>
      </header>

      <Card variant="surface" className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600">
            <MessageCircleQuestion className="size-4" aria-hidden />
          </span>
          <p className="text-[13.5px] font-semibold text-tg-text">درخواست جدید</p>
        </div>

        <Input
          label="موضوع"
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value)
            setError(null)
          }}
          placeholder="مثلاً کندی اتصال روی آی‌پی ثابت آلمان"
          maxLength={80}
        />

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-tg-hint">دسته‌بندی</p>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => {
                  haptic('light')
                  setCategory(value)
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors',
                  category === value
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                    : 'border-tg-separator bg-tg-bg text-tg-hint hover:text-tg-text',
                )}
              >
                {fa.ticketCategories[value]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-tg-hint">
            توضیح مشکل
          </label>
          <textarea
            rows={4}
            value={body}
            maxLength={1200}
            onChange={(event) => {
              setBody(event.target.value)
              setError(null)
            }}
            placeholder="هر جزئیاتی که کمک کند سریع‌تر بررسی کنیم: شناسه سفارش، آی‌پی، زمان بروز مشکل…"
            className="w-full resize-none rounded-xl border border-tg-separator bg-tg-bg px-3 py-2.5 text-[13px] leading-relaxed text-tg-text outline-none transition-colors placeholder:text-tg-hint/70 focus:border-brand-500"
          />
        </div>

        {error ? <p className="text-[11.5px] font-medium text-tg-destructive">{error}</p> : null}

        <div className="flex items-center justify-between gap-3">
          {sent ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-600">
              <CheckCircle2 className="size-3.5" aria-hidden />
              درخواست ثبت شد
            </span>
          ) : (
            <span className="text-[11px] text-tg-hint">{formatCount(myTickets.length)} تیکت ثبت‌شده</span>
          )}
          <Button
            size="sm"
            onClick={handleSubmit}
            leftIcon={<Send className="size-3.5" aria-hidden />}
          >
            ارسال درخواست
          </Button>
        </div>
      </Card>

      <section>
        <p className="tg-section-title">تیکت‌های من</p>

        {myTickets.length === 0 ? (
          <Card variant="surface" padded={false}>
            <EmptyState
              icon={LifeBuoy}
              title="تیکتی ندارید"
              description="درخواست شما پس از ثبت، همراه با پاسخ پشتیبانی همین‌جا نمایش داده می‌شود."
              className="py-8"
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {myTickets.map((ticket) => {
              const expanded = expandedId === ticket.id
              return (
                <Card key={ticket.id} variant="surface" padded={false} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light')
                      setExpandedId(expanded ? null : ticket.id)
                      setReplyBody('')
                    }}
                    aria-expanded={expanded}
                    className="flex w-full items-start gap-3 p-3.5 text-start transition-colors hover:bg-tg-secondary-bg/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p dir="auto" className="truncate text-[13px] font-semibold text-tg-text">
                          {ticket.subject}
                        </p>
                        <Badge tone={STATUS_TONES[ticket.status]} size="sm">
                          {fa.ticketStatuses[ticket.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[11px] text-tg-hint">
                        {fa.ticketCategories[ticket.category]} ·{' '}
                        <span className="tabular-nums">{formatDateTime(ticket.updatedAt)}</span>
                      </p>
                    </div>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        'mt-1 size-4 shrink-0 text-tg-hint transition-transform',
                        expanded && 'rotate-180',
                      )}
                    />
                  </button>

                  {expanded ? (
                    <div className="space-y-3 border-t border-tg-separator/60 p-3.5">
                      {ticket.messages.map((message) => {
                        const fromSupport = message.author === 'support'
                        return (
                          <div
                            key={message.id}
                            className={cn(
                              'rounded-xl px-3 py-2',
                              fromSupport
                                ? 'bg-tg-secondary-bg'
                                : 'border border-brand-500/20 bg-brand-500/[0.07]',
                            )}
                          >
                            <p className="text-[10px] font-semibold text-tg-hint">
                              {fromSupport ? 'پشتیبانی ورنت' : 'شما'}
                            </p>
                            <p className="mt-1 text-[12.5px] leading-relaxed text-tg-text">
                              {message.body}
                            </p>
                          </div>
                        )
                      })}

                      {ticket.status === 'closed' ? (
                        <p className="text-center text-[11px] text-tg-hint">
                          این تیکت بسته شده است. برای موضوع جدید، درخواست تازه‌ای ثبت کنید.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <textarea
                            rows={2}
                            value={replyBody}
                            maxLength={800}
                            onChange={(event) => setReplyBody(event.target.value)}
                            placeholder="پاسخ خود را بنویسید…"
                            className="w-full resize-none rounded-xl border border-tg-separator bg-tg-bg px-3 py-2 text-[12.5px] leading-relaxed text-tg-text outline-none transition-colors placeholder:text-tg-hint/70 focus:border-brand-500"
                          />
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={replyBody.trim().length < 3}
                              onClick={() => handleReply(ticket)}
                              leftIcon={<Send className="size-3.5" aria-hidden />}
                            >
                              ارسال پاسخ
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
