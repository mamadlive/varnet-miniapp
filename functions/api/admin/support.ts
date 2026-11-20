/**
 * Cloudflare Pages Function — /api/admin/support
 *
 * Admin side of the real D1 support inbox shared with the Mini App.
 *
 * - `GET`  → every ticket with its full message thread (capped).
 * - `POST` → `action=reply` appends a `support` message and notifies the
 *   customer in Telegram; `action=status` opens or closes a ticket.
 *
 * Authorship is decided by the route, never by the client: anything written
 * here is stored with `author = 'support'`. Admin identity is verified by
 * `authenticateAdmin` (OTP Bearer session or Mini App `initData`).
 */

import { notifyBuyer } from '../_lib/notifications'
import {
  failure,
  jsonResponse,
  loadTickets,
  parseInboxBody,
  parseReply,
  toSupportTicket,
  TICKET_STATUSES,
  type InboxBody,
  type MessageRow,
  type SupportD1Database,
  type TicketRow,
  type TicketStatus,
} from '../_lib/support'
import {
  authenticateAdmin,
  internalFailure,
  type PagesContext,
} from './_shared'

interface TicketStateRow {
  id: string
  user_id: string
  telegram_id: number
  order_id: string | null
  category: string
  subject: string
  status: string
  created_at: string
  updated_at: string
}

async function loadTicket(db: SupportD1Database, ticketId: string): Promise<TicketRow | null> {
  return db
    .prepare(
      `SELECT id, user_id, telegram_id, order_id, category, subject, status, created_at, updated_at
       FROM support_tickets WHERE id = ?`,
    )
    .bind(ticketId)
    .first<TicketRow>()
}

async function loadMessages(db: SupportD1Database, ticketId: string): Promise<MessageRow[]> {
  const result = await db
    .prepare(
      `SELECT id, ticket_id, author, body, created_at
       FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .bind(ticketId)
    .all<MessageRow>()
  return result.results ?? []
}

async function handleReply(
  db: SupportD1Database,
  environment: Parameters<typeof notifyBuyer>[0],
  body: InboxBody,
): Promise<Response> {
  const parsed = parseReply(body)
  if (!parsed.ok) return failure(400, parsed.code, parsed.message)
  const input = parsed.value

  let ticket: TicketStateRow | null
  try {
    ticket = await db
      .prepare('SELECT id, user_id, telegram_id, order_id, category, subject, status, created_at, updated_at FROM support_tickets WHERE id = ?')
      .bind(input.ticketId)
      .first<TicketStateRow>()
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن تیکت انجام نشد. دوباره تلاش کنید.')
  }
  if (!ticket) return failure(404, 'TICKET_NOT_FOUND', 'تیکت پیدا نشد.')
  if (ticket.status === 'closed') {
    return failure(409, 'TICKET_CLOSED', 'این تیکت بسته شده است؛ برای پاسخ آن را بازگشایی کنید.')
  }

  const now = new Date().toISOString()
  try {
    const results = await db.batch([
      db
        .prepare(
          `UPDATE support_tickets SET status = 'answered', updated_at = ?
           WHERE id = ? AND status != 'closed'`,
        )
        .bind(now, input.ticketId),
      db
        .prepare(
          `INSERT INTO support_ticket_messages (id, ticket_id, author, body, created_at)
           SELECT ?, ?, 'support', ?, ?
           WHERE EXISTS (SELECT 1 FROM support_tickets WHERE id = ? AND status != 'closed')`,
        )
        .bind(`msg_${crypto.randomUUID()}`, input.ticketId, input.body, now, input.ticketId),
    ])
    if ((results[0]?.meta?.changes ?? 0) !== 1 || results[1]?.success === false) {
      return failure(409, 'TICKET_STATE_CHANGED', 'وضعیت تیکت تغییر کرده است؛ فهرست را به‌روز کنید.')
    }
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ثبت پاسخ انجام نشد. دوباره تلاش کنید.')
  }

  const notification = await notifyBuyer(
    environment,
    db,
    ticket.user_id,
    `پشتیبانی ورنت به تیکت شما پاسخ داد.\nموضوع: ${ticket.subject}\nشماره تیکت: ${ticket.id}\n\n${input.body}\n\nبرای دیدن گفتگو مینی‌اپ را باز کنید.`,
  )

  const row = await loadTicket(db, input.ticketId)
  if (!row) return failure(503, 'DB_UNAVAILABLE', 'خواندن تیکت انجام نشد.')
  const messages = await loadMessages(db, input.ticketId)
  return jsonResponse({
    success: true,
    message: 'پاسخ برای کاربر ثبت شد.',
    notification,
    data: toSupportTicket(row, messages),
  })
}

async function handleStatus(db: SupportD1Database, body: InboxBody): Promise<Response> {
  const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : ''
  if (!ticketId || ticketId.length > 128) {
    return failure(400, 'INVALID_TICKET', 'شناسه تیکت نامعتبر است.')
  }
  const status = body.status
  if (!TICKET_STATUSES.includes(status as TicketStatus)) {
    return failure(400, 'INVALID_STATUS', 'وضعیت تیکت نامعتبر است.')
  }

  const now = new Date().toISOString()
  try {
    const result = await db
      .prepare('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, now, ticketId)
      .run()
    if ((result.meta?.changes ?? 0) !== 1) {
      return failure(404, 'TICKET_NOT_FOUND', 'تیکت پیدا نشد.')
    }
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'تغییر وضعیت تیکت انجام نشد. دوباره تلاش کنید.')
  }

  return jsonResponse({
    success: true,
    message: status === 'closed' ? 'تیکت بسته شد.' : 'وضعیت تیکت به‌روز شد.',
    data: { ticketId, status, updatedAt: now },
  })
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)
    const db = context.env.DB!

    let rows: TicketRow[]
    try {
      const result = await db
        .prepare(
          `SELECT t.id, t.user_id, t.telegram_id, t.order_id, t.category, t.subject, t.status,
                  t.created_at, t.updated_at,
                  TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS user_name,
                  u.username AS username
           FROM support_tickets t
           LEFT JOIN users u ON u.id = t.user_id
           ORDER BY t.updated_at DESC
           LIMIT 300`,
        )
        .all<TicketRow>()
      rows = result.results ?? []
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'خواندن تیکت‌ها از پایگاه داده انجام نشد.')
    }

    return jsonResponse({ success: true, data: await loadTickets(db, rows), meta: { count: rows.length } })
  } catch (cause) {
    return internalFailure(cause, 'ADMIN_SUPPORT_LIST_FAILED')
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)
    const db = context.env.DB!

    let raw: string
    try {
      raw = await context.request.text()
    } catch {
      return failure(400, 'SUPPORT_INVALID_BODY', 'بدنه درخواست قابل خواندن نبود.')
    }
    const body = parseInboxBody(raw)
    if (!body) return failure(400, 'SUPPORT_INVALID_BODY', 'ساختار درخواست نامعتبر است.')

    if (body.action === 'reply') return await handleReply(db, context.env, body)
    if (body.action === 'status') return await handleStatus(db, body)
    return failure(400, 'SUPPORT_INVALID_ACTION', 'عملیات پشتیبانی نامعتبر است.')
  } catch (cause) {
    return internalFailure(cause, 'ADMIN_SUPPORT_ACTION_FAILED')
  }
}

