/**
 * Cloudflare Pages Function — /api/support
 *
 * The customer side of the real D1 support inbox used by the Mini App:
 *
 * - `GET`  → the signed-in user's tickets with every message.
 * - `POST` → `action=create` opens a ticket, `action=reply` appends a customer
 *   message. Identity always comes from the verified Telegram `initData`
 *   (`usr_tg_<id>`); any `userId`/`author` sent by the client is ignored.
 *
 * An optional `orderId` is validated against D1 before it is linked: a ticket
 * can only reference an order owned by the same user. Ownership of a ticket is
 * re-checked on every reply, so one user can never read or write another
 * user's conversation.
 */

import { authenticateUser, userIdFor, type UserEnv } from './_lib/userAuth'
import {
  failure,
  findOwnedOrderId,
  internalFailure,
  jsonResponse,
  loadTickets,
  parseCreateTicket,
  parseInboxBody,
  parseReply,
  toSupportTicket,
  type InboxBody,
  type MessageRow,
  type TicketRow,
} from './_lib/support'

interface PagesContext {
  request: Request
  env: UserEnv
}

interface TicketStateRow {
  id: string
  user_id: string
  status: string
}

const USER_TICKET_LIMIT = 100

async function loadTicketById(db: NonNullable<UserEnv['DB']>, ticketId: string) {
  return db
    .prepare(
      `SELECT id, user_id, telegram_id, order_id, category, subject, status, created_at, updated_at
       FROM support_tickets WHERE id = ?`,
    )
    .bind(ticketId)
    .first<TicketRow>()
}

async function loadMessages(db: NonNullable<UserEnv['DB']>, ticketId: string) {
  const result = await db
    .prepare(
      `SELECT id, ticket_id, author, body, created_at
       FROM support_ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .bind(ticketId)
    .all<MessageRow>()
  return result.results ?? []
}

async function handleCreate(
  context: PagesContext & { env: UserEnv & { DB: NonNullable<UserEnv['DB']> }; telegramId: number },
  userId: string,
  body: InboxBody,
): Promise<Response> {
  const db = context.env.DB

  const parsed = parseCreateTicket(body)
  if (!parsed.ok) return failure(400, parsed.code, parsed.message)
  const input = parsed.value

  let linkedOrderId: string | null
  try {
    const owned = await findOwnedOrderId(db, input.orderId, userId)
    if (owned === undefined) {
      return failure(403, 'ORDER_NOT_OWNED', 'این سفارش متعلق به حساب شما نیست.')
    }
    linkedOrderId = owned
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'بررسی سفارش انجام نشد. دوباره تلاش کنید.')
  }

  const now = new Date().toISOString()
  const ticketId = `tkt_${crypto.randomUUID()}`

  try {
    const results = await db.batch([
      db
        .prepare(
          `INSERT INTO support_tickets
             (id, user_id, telegram_id, order_id, category, subject, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
        )
        .bind(ticketId, userId, context.telegramId, linkedOrderId, input.category, input.subject, now, now),
      db
        .prepare(
          `INSERT INTO support_ticket_messages (id, ticket_id, author, body, created_at)
           VALUES (?, ?, 'user', ?, ?)`,
        )
        .bind(`msg_${crypto.randomUUID()}`, ticketId, input.body, now),
    ])
    if (results.some((result) => result.success === false)) throw new Error('D1 write failed')
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ثبت درخواست انجام نشد. دوباره تلاش کنید.')
  }

  const row = await loadTicketById(db, ticketId)
  if (!row) return failure(503, 'DB_UNAVAILABLE', 'خواندن تیکت ثبت‌شده انجام نشد.')
  const ticket = toSupportTicket(row, await loadMessages(db, ticketId))
  return jsonResponse({ success: true, message: 'درخواست پشتیبانی ثبت شد.', data: ticket }, 201)
}

async function handleReply(
  context: PagesContext & { env: UserEnv & { DB: NonNullable<UserEnv['DB']> } },
  userId: string,
  body: InboxBody,
): Promise<Response> {
  const db = context.env.DB

  const parsed = parseReply(body)
  if (!parsed.ok) return failure(400, parsed.code, parsed.message)
  const input = parsed.value

  let ticket: TicketStateRow | null
  try {
    ticket = await db
      .prepare('SELECT id, user_id, status FROM support_tickets WHERE id = ? AND user_id = ?')
      .bind(input.ticketId, userId)
      .first<TicketStateRow>()
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن تیکت انجام نشد. دوباره تلاش کنید.')
  }
  // Same answer for "missing" and "someone else's ticket": no existence leak.
  if (!ticket) return failure(404, 'TICKET_NOT_FOUND', 'تیکت پیدا نشد.')
  if (ticket.status === 'closed') {
    return failure(409, 'TICKET_CLOSED', 'این تیکت بسته شده است؛ درخواست تازه‌ای ثبت کنید.')
  }

  const now = new Date().toISOString()
  try {
    const results = await db.batch([
      db
        .prepare(
          `UPDATE support_tickets SET status = 'open', updated_at = ?
           WHERE id = ? AND user_id = ? AND status != 'closed'`,
        )
        .bind(now, input.ticketId, userId),
      db
        .prepare(
          `INSERT INTO support_ticket_messages (id, ticket_id, author, body, created_at)
           SELECT ?, ?, 'user', ?, ?
           WHERE EXISTS (
             SELECT 1 FROM support_tickets WHERE id = ? AND user_id = ? AND status != 'closed'
           )`,
        )
        .bind(`msg_${crypto.randomUUID()}`, input.ticketId, input.body, now, input.ticketId, userId),
    ])
    if ((results[0]?.meta?.changes ?? 0) !== 1 || results[1]?.success === false) {
      return failure(409, 'TICKET_STATE_CHANGED', 'وضعیت تیکت تغییر کرده است؛ فهرست را به‌روز کنید.')
    }
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ثبت پاسخ انجام نشد. دوباره تلاش کنید.')
  }

  const row = await loadTicketById(db, input.ticketId)
  if (!row) return failure(503, 'DB_UNAVAILABLE', 'خواندن تیکت انجام نشد.')
  return jsonResponse({
    success: true,
    message: 'پاسخ شما ثبت شد.',
    data: toSupportTicket(row, await loadMessages(db, input.ticketId)),
  })
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateUser(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)
    const db = context.env.DB
    if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده پشتیبانی در سرور تنظیم نشده است.')

    let rows: TicketRow[]
    try {
      const result = await db
        .prepare(
          `SELECT id, user_id, telegram_id, order_id, category, subject, status, created_at, updated_at
           FROM support_tickets
           WHERE user_id = ?
           ORDER BY updated_at DESC
           LIMIT ?`,
        )
        .bind(userIdFor(auth.user), USER_TICKET_LIMIT)
        .all<TicketRow>()
      rows = result.results ?? []
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'خواندن تیکت‌ها از پایگاه داده انجام نشد.')
    }

    return jsonResponse({
      success: true,
      data: await loadTickets(db, rows),
      meta: { count: rows.length },
    })
  } catch (cause) {
    return internalFailure(cause, 'SUPPORT_LIST_FAILED')
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateUser(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)
    const db = context.env.DB
    if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده پشتیبانی در سرور تنظیم نشده است.')

    let raw: string
    try {
      raw = await context.request.text()
    } catch {
      return failure(400, 'SUPPORT_INVALID_BODY', 'بدنه درخواست قابل خواندن نبود.')
    }
    const body = parseInboxBody(raw)
    if (!body) return failure(400, 'SUPPORT_INVALID_BODY', 'ساختار درخواست نامعتبر است.')

    const scoped = { ...context, env: { ...context.env, DB: db } }
    const userId = userIdFor(auth.user)
    if (body.action === 'create') {
      return await handleCreate({ ...scoped, telegramId: auth.user.id }, userId, body)
    }
    if (body.action === 'reply') return await handleReply(scoped, userId, body)
    if (body.action === undefined) {
      return failure(400, 'SUPPORT_INVALID_ACTION', 'عملیات درخواست پشتیبانی مشخص نشده است.')
    }
    return failure(400, 'SUPPORT_INVALID_ACTION', 'عملیات پشتیبانی نامعتبر است.')
  } catch (cause) {
    return internalFailure(cause, 'SUPPORT_ACTION_FAILED')
  }
}
