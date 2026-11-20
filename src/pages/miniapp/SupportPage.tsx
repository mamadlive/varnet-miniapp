import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LifeBuoy,
  Link2,
  MessageCircleQuestion,
  RotateCcw,
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
import { isApiError } from '@/services/apiClient'
import { createSupportTicket, listSupportTickets, replyToSupportTicket } from '@/services/support.service'
import type { SupportTicket, SupportTicketCategory, SupportTicketStatus } from '@/types'

const CATEGORIES: SupportTicketCategory[] = ['technical', 'billing', 'order', 'other']

const STATUS_TONES: Record<SupportTicketStatus, BadgeTone> = {
  open: 'warning',
  answered: 'success',
  closed: 'neutral',
}

function describeFailure(cause: unknown, fallback: string): string {
  if (isApiError(cause)) {
    const message = cause.message?.trim() || fallback
    return cause.code ? `${message} (${cause.code})` : message
  }
  return cause instanceof Error && cause.message ? cause.message : fallback
}

/** Mini App support inbox backed by the real D1 `/api/support` inbox. */
export default function SupportPage() {
  const navigate = useNavigate()
  const { haptic } = useTelegram()
  const [searchParams] = useSearchParams()

  const linkedOrderId = searchParams.get('orderId')?.trim() || null

  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [subject, setSubject] = useState(linkedOrderId ? `پیگیری سفارش ${linkedOrderId}` : '')
  const [category, setCategory] = useState<SupportTicketCategory>(linkedOrderId ? 'order' : 'technical')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyBusyId, setReplyBusyId] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listSupportTickets()
      .then((next) => {
        if (cancelled) return
        setTickets(next)
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(describeFailure(cause, 'خواندن تیکت‌های پشتیبانی انجام نشد.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const sortedTickets = useMemo(
    () => tickets.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [tickets],
  )

  const handleRetry = () => {
    haptic()
    setReloadKey((key) => key + 1)
  }

  const handleSubmit = async () => {
    if (sending) return
    if (subject.trim().length < 4) {
      setError('موضوع درخواست را کامل‌تر بنویسید.')
      return
    }
    if (body.trim().length < 10) {
      setError('توضیح مشکل باید حداقل ۱۰ کاراکتر باشد.')
      return
    }

    setSending(true)
    setError(null)
    try {
      const ticket = await createSupportTicket({
        subject,
        category,
        body,
        orderId: linkedOrderId,
      })
      haptic('medium')
      setTickets((current) => [ticket, ...current.filter((item) => item.id !== ticket.id)])
      setReloadKey((key) => key + 1)
      setExpandedId(ticket.id)
      setSubject(linkedOrderId ? `پیگیری سفارش ${linkedOrderId}` : '')
      setCategory(linkedOrderId ? 'order' : 'technical')
      setBody('')
      setSent(true)
      window.setTimeout(() => setSent(false), 3600)
    } catch (cause) {
      setError(describeFailure(cause, 'ثبت درخواست پشتیبانی انجام نشد.'))
    } finally {
      setSending(false)
    }
  }

  const handleReply = useCallback(
    async (ticket: SupportTicket) => {
      if (replyBusyId || replyBody.trim().length < 3) return
      setReplyBusyId(ticket.id)
      setReplyError(null)
      try {
        const updated = await replyToSupportTicket(ticket.id, replyBody)
        haptic()
        setTickets((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        setReplyBody('')
      } catch (cause) {
        setReplyError(describeFailure(cause, 'ارسال پاسخ انجام نشد.'))
      } finally {
        setReplyBusyId(null)
      }
    },
    [haptic, replyBody, replyBusyId],
  )

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

        {linkedOrderId ? (
          <div className="flex items-center gap-1.5 rounded-xl border border-brand-500/25 bg-brand-500/[0.07] px-3 py-2 text-[11.5px] text-brand-600">
            <Link2 className="size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">
              مرتبط با سفارش <span className="bidi-ltr font-mono">#{linkedOrderId}</span>
            </span>
          </div>
        ) : null}

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

        {error ? (
          <p role="alert" className="text-[11.5px] font-medium text-tg-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          {sent ? (
            <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-emerald-600">
              <CheckCircle2 className="size-3.5" aria-hidden />
              درخواست ثبت شد
            </span>
          ) : (
            <span className="text-[11px] text-tg-hint">{formatCount(tickets.length)} تیکت ثبت‌شده</span>
          )}
          <Button
            size="sm"
            onClick={() => void handleSubmit()}
            disabled={sending}
            leftIcon={<Send className="size-3.5" aria-hidden />}
          >
            {sending ? 'در حال ارسال…' : 'ارسال درخواست'}
          </Button>
        </div>
      </Card>

      <section>
        <p className="tg-section-title">تیکت‌های من</p>

        {loading ? (
          <div className="space-y-3" aria-busy>
            {Array.from({ length: 2 }).map((_, index) => (
              <Card key={index} variant="surface" className="space-y-2">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-tg-secondary-bg" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-tg-secondary-bg" />
              </Card>
            ))}
          </div>
        ) : loadError ? (
          <Card variant="surface" className="space-y-3 text-center">
            <p className="text-[13px] font-semibold text-tg-text">بارگذاری تیکت‌ها انجام نشد</p>
            <p className="text-[11.5px] leading-relaxed text-tg-hint">{loadError}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRetry}
              leftIcon={<RotateCcw className="size-3.5" aria-hidden />}
            >
              تلاش دوباره
            </Button>
          </Card>
        ) : sortedTickets.length === 0 ? (
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
            {sortedTickets.map((ticket) => {
              const expanded = expandedId === ticket.id
              return (
                <Card key={ticket.id} variant="surface" padded={false} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      haptic('light')
                      setExpandedId(expanded ? null : ticket.id)
                      setReplyBody('')
                      setReplyError(null)
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
                      {ticket.orderId ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-brand-600">
                          <Link2 className="size-3" aria-hidden />
                          سفارش <span className="bidi-ltr font-mono">#{ticket.orderId}</span>
                        </p>
                      ) : null}
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
                            <p className="flex items-center gap-1 text-[10px] font-semibold text-tg-hint">
                              {fromSupport ? 'پشتیبانی ورنت' : 'شما'}
                              <span className="font-normal tabular-nums">
                                · {formatDateTime(message.createdAt)}
                              </span>
                            </p>
                            <p className="mt-1 whitespace-pre-line text-[12.5px] leading-relaxed text-tg-text">
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
                            maxLength={1200}
                            onChange={(event) => {
                              setReplyBody(event.target.value)
                              setReplyError(null)
                            }}
                            placeholder="پاسخ خود را بنویسید…"
                            className="w-full resize-none rounded-xl border border-tg-separator bg-tg-bg px-3 py-2 text-[12.5px] leading-relaxed text-tg-text outline-none transition-colors placeholder:text-tg-hint/70 focus:border-brand-500"
                          />
                          {replyError ? (
                            <p role="alert" className="text-[11px] font-medium text-tg-destructive">
                              {replyError}
                            </p>
                          ) : null}
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={replyBusyId !== null || replyBody.trim().length < 3}
                              onClick={() => void handleReply(ticket)}
                              leftIcon={<Send className="size-3.5" aria-hidden />}
                            >
                              {replyBusyId === ticket.id ? 'در حال ارسال…' : 'ارسال پاسخ'}
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
