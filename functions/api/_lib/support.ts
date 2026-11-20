/**
 * Shared support-inbox helpers for the customer and admin Pages Functions.
 *
 * The browser is never trusted with identity or authorship:
 * - tickets are always written with the `user_id` derived from the signed
 *   Telegram `initData` (`userIdFor(user)`), never from the request body;
 * - an optional `orderId` is only stored after D1 proves the order belongs to
 *   that same user;
 * - a message's `author` is decided by the route (`/api/support` always writes
 *   `user`, `/api/admin/support` always writes `support`).
 *
 * Files starting with `_` are not routed by Cloudflare Pages.
 */

export interface SupportD1PreparedStatement {
  bind(...values: unknown[]): SupportD1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>
}

export interface SupportD1Database {
  prepare(sql: string): SupportD1PreparedStatement
  batch(statements: SupportD1PreparedStatement[]): Promise<Array<{ success: boolean; meta?: { changes?: number } }>>
}

export const TICKET_CATEGORIES = ['technical', 'billing', 'order', 'other'] as const
export type TicketCategory = (typeof TICKET_CATEGORIES)[number]

export const TICKET_STATUSES = ['open', 'answered', 'closed'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export type TicketAuthor = 'user' | 'support'

export const MAX_SUBJECT_LENGTH = 80
export const MIN_SUBJECT_LENGTH = 4
export const MAX_BODY_LENGTH = 1_200
export const MIN_BODY_LENGTH = 10
export const MIN_REPLY_LENGTH = 2
export const MAX_ORDER_ID_LENGTH = 128
export const MAX_TICKETS_ADMIN = 300

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS })
}

export function failure(status: number, code: string, message: string): Response {
  return jsonResponse({ success: false, code, message }, status)
}

export function internalFailure(cause: unknown, code = 'SUPPORT_FAILED'): Response {
  return failure(
    500,
    code,
    cause instanceof Error && cause.message ? cause.message : 'خطای داخلی سرور رخ داد. دوباره تلاش کنید.',
  )
}

export interface InboxBody {
  action?: unknown
  ticketId?: unknown
  subject?: unknown
  category?: unknown
  body?: unknown
  orderId?: unknown
  status?: unknown
}

/** Read and size-check a JSON object body. Returns `null` for anything else. */
export function parseInboxBody(raw: string, maxBytes = 8_192): InboxBody | null {
  if (!raw || raw.length > maxBytes) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as InboxBody
  } catch {
    return null
  }
}

/** Read and size-check a JSON object body straight from the request. */
export async function readInboxBody(request: Request, maxBytes = 8_192): Promise<InboxBody | null> {
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return null
  }
  return parseInboxBody(raw, maxBytes)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ')
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string }

export interface CreateTicketInput {
  subject: string
  category: TicketCategory
  body: string
  orderId: string | null
}

/** Validate the free-form part of a ticket creation request. */
export function parseCreateTicket(body: InboxBody): ValidationResult<CreateTicketInput> {
  const subject = collapse(text(body.subject))
  if (subject.length < MIN_SUBJECT_LENGTH) {
    return { ok: false, code: 'INVALID_SUBJECT', message: 'موضوع درخواست باید حداقل ۴ کاراکتر باشد.' }
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return { ok: false, code: 'INVALID_SUBJECT', message: 'موضوع درخواست بیش از حد طولانی است.' }
  }

  const bodyText = text(body.body)
  if (bodyText.length < MIN_BODY_LENGTH) {
    return { ok: false, code: 'INVALID_BODY_TEXT', message: 'توضیح مشکل باید حداقل ۱۰ کاراکتر باشد.' }
  }
  if (bodyText.length > MAX_BODY_LENGTH) {
    return { ok: false, code: 'INVALID_BODY_TEXT', message: 'توضیح مشکل بیش از حد طولانی است.' }
  }

  const category = TICKET_CATEGORIES.includes(body.category as TicketCategory)
    ? (body.category as TicketCategory)
    : null
  if (!category) {
    return { ok: false, code: 'INVALID_CATEGORY', message: 'دسته‌بندی درخواست نامعتبر است.' }
  }

  let orderId: string | null = null
  if (body.orderId !== undefined && body.orderId !== null && body.orderId !== '') {
    if (typeof body.orderId !== 'string') {
      return { ok: false, code: 'INVALID_ORDER', message: 'شناسه سفارش نامعتبر است.' }
    }
    orderId = body.orderId.trim()
    if (!orderId || orderId.length > MAX_ORDER_ID_LENGTH) {
      return { ok: false, code: 'INVALID_ORDER', message: 'شناسه سفارش نامعتبر است.' }
    }
  }

  return { ok: true, value: { subject, category, body: bodyText, orderId } }
}

/** Validate a reply body (user or admin). */
export function parseReply(body: InboxBody): ValidationResult<{ ticketId: string; body: string }> {
  const ticketId = text(body.ticketId)
  if (!ticketId || ticketId.length > 128) {
    return { ok: false, code: 'INVALID_TICKET', message: 'شناسه تیکت نامعتبر است.' }
  }
  const reply = text(body.body)
  if (reply.length < MIN_REPLY_LENGTH) {
    return { ok: false, code: 'INVALID_REPLY', message: 'متن پاسخ را کامل تر بنویسید.' }
  }
  if (reply.length > MAX_BODY_LENGTH) {
    return { ok: false, code: 'INVALID_REPLY', message: 'متن پاسخ بیش از حد طولانی است.' }
  }
  return { ok: true, value: { ticketId, body: reply } }
}

/**
 * Ownership gate for an optional order reference. `null` means "no order",
 * `undefined` means "found but not owned".
 */
export async function findOwnedOrderId(
  db: SupportD1Database,
  orderId: string | null,
  userId: string,
): Promise<string | null | undefined> {
  if (!orderId) return null
  const row = await db
    .prepare('SELECT id FROM orders WHERE id = ? AND user_id = ?')
    .bind(orderId, userId)
    .first<{ id: string }>()
  return row ? row.id : undefined
}

export interface TicketRow {
  id: string
  user_id: string
  telegram_id: number
  order_id: string | null
  category: string
  subject: string
  status: string
  created_at: string
  updated_at: string
  user_name?: string | null
  username?: string | null
}

export interface MessageRow {
  id: string
  ticket_id: string
  author: string
  body: string
  created_at: string
}

export interface TicketMessageDto {
  id: string
  author: TicketAuthor
  body: string
  createdAt: string
}

export interface SupportTicketDto {
  id: string
  userId: string
  userName: string
  telegramId: number | null
  orderId: string | null
  subject: string
  category: TicketCategory
  status: TicketStatus
  createdAt: string
  updatedAt: string
  messages: TicketMessageDto[]
}

function displayName(row: TicketRow): string {
  const full = (row.user_name ?? '').trim()
  if (full) return full
  if (row.username) return `@${row.username}`
  return row.telegram_id ? `کاربر ${row.telegram_id}` : 'کاربر ورنت'
}

function asCategory(value: string): TicketCategory {
  return TICKET_CATEGORIES.includes(value as TicketCategory) ? (value as TicketCategory) : 'other'
}

function asStatus(value: string): TicketStatus {
  return TICKET_STATUSES.includes(value as TicketStatus) ? (value as TicketStatus) : 'open'
}

/** Serialize one ticket plus its already-loaded messages. */
export function toSupportTicket(row: TicketRow, messages: MessageRow[]): SupportTicketDto {
  return {
    id: row.id,
    userId: row.user_id,
    userName: displayName(row),
    telegramId: row.telegram_id == null ? null : Number(row.telegram_id),
    orderId: row.order_id ?? null,
    subject: row.subject,
    category: asCategory(row.category),
    status: asStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: messages.map((message) => ({
      id: message.id,
      author: message.author === 'support' ? 'support' : 'user',
      body: message.body,
      createdAt: message.created_at,
    })),
  }
}

/**
 * Load tickets with their messages in two queries (no N+1). Rows must already
 * be filtered by the caller (user id for the Mini App, no filter for admins).
 */
export async function loadTickets(db: SupportD1Database, rows: TicketRow[]): Promise<SupportTicketDto[]> {
  if (rows.length === 0) return []
  const messages = await db
    .prepare(
      `SELECT id, ticket_id, author, body, created_at
       FROM support_ticket_messages
       WHERE ticket_id IN (${rows.map(() => '?').join(', ')})
       ORDER BY created_at ASC, id ASC`,
    )
    .bind(...rows.map((row) => row.id))
    .all<MessageRow>()
  const grouped = new Map<string, MessageRow[]>()
  for (const message of messages.results ?? []) {
    const list = grouped.get(message.ticket_id)
    if (list) list.push(message)
    else grouped.set(message.ticket_id, [message])
  }
  return rows.map((row) => toSupportTicket(row, grouped.get(row.id) ?? []))
}

/** Admin list: tickets + customer profile + message counts, capped. */
export async function loadTicketSummaries(
  db: SupportD1Database,
  limit = MAX_TICKETS_ADMIN,
): Promise<Array<{ ticket: TicketRow; messageCount: number }>> {
  const result = await db
    .prepare(
      `SELECT t.id, t.user_id, t.telegram_id, t.order_id, t.category, t.subject, t.status,
              t.created_at, t.updated_at,
              TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS user_name,
              u.username AS username,
              (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.updated_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<TicketRow & { message_count: number }>()
  return (result.results ?? []).map((row) => ({ ticket: row, messageCount: Number(row.message_count ?? 0) }))
}
