import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  Headset,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react'

import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { Badge } from '@/components/ui/Badge'
import type { BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { formatCount, formatDateTime } from '@/lib/format'
import { fa } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useAdminStore } from '@/store/adminStore'
import type { SupportTicketStatus } from '@/types'

type StatusFilter = 'all' | SupportTicketStatus

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'همه' },
  { value: 'open', label: 'در انتظار پاسخ' },
  { value: 'answered', label: 'پاسخ داده شد' },
  { value: 'closed', label: 'بسته‌شده' },
]

const STATUS_TONES: Record<SupportTicketStatus, BadgeTone> = {
  open: 'warning',
  answered: 'success',
  closed: 'neutral',
}

export default function TicketsPage() {
  const tickets = useAdminStore((state) => state.tickets)
  const replyToTicket = useAdminStore((state) => state.replyToTicket)
  const setTicketStatus = useAdminStore((state) => state.setTicketStatus)

  const [filter, setFilter] = useState<StatusFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return tickets
      .filter((ticket) => filter === 'all' || ticket.status === filter)
      .filter((ticket) =>
        needle === ''
          ? true
          : `${ticket.subject} ${ticket.userName} ${ticket.id}`.toLowerCase().includes(needle),
      )
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [filter, query, tickets])

  const openCount = tickets.filter((ticket) => ticket.status === 'open').length
  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? filtered[0] ?? null

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 3200)
  }

  const handleReply = () => {
    if (!selected || reply.trim().length < 2) return
    replyToTicket(selected.id, reply, 'support')
    setReply('')
    showNotice('پاسخ شما برای کاربر ارسال شد.')
  }

  const toggleStatus = () => {
    if (!selected) return
    const next: SupportTicketStatus = selected.status === 'closed' ? 'open' : 'closed'
    setTicketStatus(selected.id, next)
    showNotice(next === 'closed' ? 'تیکت بسته شد.' : 'تیکت دوباره باز شد.')
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="ارتباطات"
        title="تیکت‌های پشتیبانی"
        description="درخواست‌های کاربران از مینی‌اپ را بررسی کنید و همین‌جا پاسخ دهید."
        meta={
          <Badge tone={openCount > 0 ? 'warning' : 'success'} size="sm">
            {formatCount(openCount)} تیکت در انتظار پاسخ
          </Badge>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((option) => {
            const count =
              option.value === 'all'
                ? tickets.length
                : tickets.filter((ticket) => ticket.status === option.value).length
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={filter === option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition-colors',
                  filter === option.value
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                    : 'border-tg-separator bg-tg-bg text-tg-hint hover:text-tg-text',
                )}
              >
                {option.label}
                <span className="rounded-full bg-tg-secondary-bg px-1.5 text-[10px] tabular-nums">
                  {formatCount(count)}
                </span>
              </button>
            )
          })}
        </div>

        <div className="w-full lg:w-72">
          <Input
            icon={Search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جستجوی موضوع یا کاربر…"
            aria-label="جستجوی تیکت‌ها"
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        <Card padded={false} className="overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Headset}
              title="تیکتی یافت نشد"
              description="با این فیلتر یا عبارت جستجو تیکتی وجود ندارد."
              className="py-10"
            />
          ) : (
            <ul className="max-h-[70dvh] divide-y divide-tg-separator overflow-y-auto">
              {filtered.map((ticket) => {
                const active = selected?.id === ticket.id
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(ticket.id)
                        setReply('')
                      }}
                      className={cn(
                        'flex w-full items-start gap-2.5 px-4 py-3 text-start transition-colors',
                        active ? 'bg-brand-500/[0.08]' : 'hover:bg-tg-secondary-bg',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p dir="auto" className="truncate text-[13px] font-semibold text-tg-text">
                            {ticket.subject}
                          </p>
                          <Badge tone={STATUS_TONES[ticket.status]} size="sm">
                            {fa.ticketStatuses[ticket.status]}
                          </Badge>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-tg-hint">
                          {ticket.userName} · {fa.ticketCategories[ticket.category]}
                        </p>
                        <p className="mt-0.5 text-[10.5px] tabular-nums text-tg-hint/80">
                          {formatDateTime(ticket.updatedAt)}
                        </p>
                      </div>
                      <ChevronLeft className="mt-1 size-4 shrink-0 text-tg-hint/70" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {selected ? (
          <Card padded={false} className="flex min-h-[26rem] flex-col overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-tg-separator p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 dir="auto" className="text-[15px] font-semibold text-tg-text">
                    {selected.subject}
                  </h2>
                  <Badge tone={STATUS_TONES[selected.status]} size="sm">
                    {fa.ticketStatuses[selected.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-[11.5px] text-tg-hint">
                  {selected.userName} · {fa.ticketCategories[selected.category]} ·{' '}
                  <span className="bidi-ltr">{selected.id}</span>
                </p>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={toggleStatus}
                leftIcon={
                  selected.status === 'closed' ? (
                    <RotateCcw className="size-3.5" aria-hidden />
                  ) : (
                    <XCircle className="size-3.5" aria-hidden />
                  )
                }
              >
                {selected.status === 'closed' ? 'بازگشایی تیکت' : 'بستن تیکت'}
              </Button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {selected.messages.map((message) => {
                const fromSupport = message.author === 'support'
                return (
                  <div
                    key={message.id}
                    className={cn(
                      'rounded-2xl px-3.5 py-2.5',
                      fromSupport
                        ? 'ms-6 border border-brand-500/20 bg-brand-500/[0.07]'
                        : 'me-6 bg-tg-secondary-bg',
                    )}
                  >
                    <p className="flex items-center gap-1.5 text-[10.5px] font-semibold text-tg-hint">
                      {fromSupport ? (
                        <ShieldCheck className="size-3 text-brand-500" aria-hidden />
                      ) : null}
                      {fromSupport ? 'پشتیبانی ورنت' : selected.userName}
                      <span className="font-normal tabular-nums">
                        · {formatDateTime(message.createdAt)}
                      </span>
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-tg-text">
                      {message.body}
                    </p>
                  </div>
                )
              })}
            </div>

            {selected.status !== 'closed' ? (
              <div className="space-y-2 border-t border-tg-separator p-4">
                <textarea
                  rows={3}
                  value={reply}
                  maxLength={1200}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="پاسخ خود را برای کاربر بنویسید…"
                  className="w-full resize-none rounded-xl border border-tg-separator bg-tg-bg px-3 py-2.5 text-[12.5px] leading-relaxed text-tg-text outline-none transition-colors placeholder:text-tg-hint/70 focus:border-brand-500"
                />
                <div className="flex items-center justify-between gap-3">
                  {notice ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                      <CheckCircle2 className="size-3.5" aria-hidden />
                      {notice}
                    </span>
                  ) : (
                    <span className="text-[11px] text-tg-hint">
                      پاسخ از طرف «پشتیبانی ورنت» ثبت می‌شود.
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={handleReply}
                    disabled={reply.trim().length < 2}
                    leftIcon={<Send className="size-3.5" aria-hidden />}
                  >
                    ارسال پاسخ
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border-t border-tg-separator p-4">
                <p className="text-[11.5px] text-tg-hint">
                  این تیکت بسته شده است. برای ادامه گفتگو، آن را بازگشایی کنید.
                </p>
              </div>
            )}
          </Card>
        ) : (
          <Card className="flex min-h-[26rem] items-center justify-center">
            <EmptyState
              icon={Headset}
              title="تیکتی انتخاب نشده"
              description="از فهرست کنار، یک تیکت را انتخاب کنید تا گفتگو را ببینید."
              className="py-8"
            />
          </Card>
        )}
      </div>
    </div>
  )
}
