/**
 * Cloudflare Pages Function — POST /api/admin/orders/action
 *
 * Admin order decisions:
 * - `complete`: marks a paid order as completed and stores the delivery note
 *   (account credentials / VPN config) the Mini App shows to the customer.
 *   Static-IP orders completed without a note get a generated OpenVPN profile
 *   built from the attached node, so the download works after one click.
 * - `reject`: marks the order refunded, records the admin's reject reason on the
 *   order and, for paid orders, atomically credits the full total back to the
 *   customer's wallet plus a `refund` transaction.
 *
 * The refund uses guarded statements in one D1 batch, so a double-click can
 * never credit the wallet twice.
 */

import { sendVpnDocument, type TelegramDeliveryResult } from '../../_lib/staticIpDelivery'
import {
  authenticateAdmin,
  failure,
  internalFailure,
  jsonResponse,
  type PagesContext,
} from '../_shared'

interface OrderRow {
  id: string
  user_id: string
  product_id: string
  product_title: string
  kind: string
  total: number
  status: string
  payment_method: string | null
}

interface ActionBody {
  orderId?: unknown
  action?: unknown
  deliveryNote?: unknown
  rejectReason?: unknown
}

interface RefundResult {
  refunded: number
  balance: number | null
}

interface NodeInfo {
  ip: string
  protocol: string
  name: string
}

const MAX_BODY_BYTES = 8_192
const MAX_NOTE_LENGTH = 4_000
const MAX_REASON_LENGTH = 1_000
const MIN_REASON_LENGTH = 3
const OPENVPN_PORT = 1_194

async function readBody(context: PagesContext): Promise<ActionBody | null> {
  let raw: string
  try {
    raw = await context.request.text()
  } catch {
    return null
  }
  if (raw.length > MAX_BODY_BYTES) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as ActionBody
  } catch {
    return null
  }
}

function safeHost(value: string): string {
  return value.replace(/[^a-zA-Z0-9.:-]/g, '')
}

/** Deterministic per-order RADIUS username: `vpn_<order uuid without dashes>`. */
function configUsername(order: OrderRow): string {
  const base = order.id.replace(/[^a-zA-Z0-9]/g, '')
  return (base ? `vpn_${base}` : 'vpn_user').slice(0, 48)
}

function buildOpenVpnProfile(order: OrderRow, node: NodeInfo): string | null {
  const host = safeHost(node.ip)
  if (!host) return null

  const username = configUsername(order)
  const password = crypto.randomUUID().replace(/-/g, '')
  const protocol = /tcp/i.test(node.protocol) ? 'tcp' : 'udp'

  const lines = [
    '# VarNet static-IP profile',
    `# Node: ${node.name.replace(/[\r\n]+/g, ' ').trim() || 'static-ip'}`,
    `# Account: ${username}`,
    'client',
    'dev tun',
    `proto ${protocol}`,
    `remote ${host} ${OPENVPN_PORT}`,
    'resolv-retry infinite',
    'nobind',
    'persist-key',
    'persist-tun',
    'remote-cert-tls server',
    'auth-nocache',
    'verb 3',
    '<auth-user-pass>',
    username,
    password,
    '</auth-user-pass>',
  ]

  return `${lines.join('\n')}\n`
}

/**
 * Finds the node attached to the purchased static-IP plan. The plan catalogue
 * lives in `static_ip_plans`; legacy orders stored the node id as product id,
 * so both lookups are attempted. Missing tables (older deployments) fall
 * through to the next strategy instead of failing the approval.
 */
async function loadNodeInfo(
  db: NonNullable<PagesContext['env']['DB']>,
  productId: string,
): Promise<NodeInfo | null> {
  try {
    const planNode = await db
      .prepare(
        `SELECT n.ip AS ip, n.protocol AS protocol, n.name AS name
         FROM static_ip_plans p
         JOIN static_ip_nodes n ON n.id = p.node_id
         WHERE p.id = ?`,
      )
      .bind(productId)
      .first<NodeInfo>()
    if (planNode) return planNode
  } catch {
    // `static_ip_plans` absent in this deployment — try the legacy lookup.
  }

  try {
    const node = await db
      .prepare('SELECT ip, protocol, name FROM static_ip_nodes WHERE id = ?')
      .bind(productId)
      .first<NodeInfo>()
    return node ?? null
  } catch {
    return null
  }
}

async function resolveDeliveryNote(
  db: NonNullable<PagesContext['env']['DB']>,
  order: OrderRow,
  adminNote: string,
): Promise<string> {
  if (adminNote) return adminNote
  if (order.kind === 'vpn') {
    const node = await loadNodeInfo(db, order.product_id)
    if (node) {
      const profile = buildOpenVpnProfile(order, node)
      if (profile) return profile
    }
  }
  return order.product_title
}

async function completeOrder(
  context: PagesContext,
  order: OrderRow,
  adminNote: string,
): Promise<Response> {
  const db = context.env.DB!
  const now = new Date().toISOString()

  if (
    order.status !== 'pending' &&
    order.status !== 'paid' &&
    order.status !== 'provisioning'
  ) {
    return failure(409, 'ORDER_NOT_PAYABLE', 'فقط سفارش در انتظار یا پرداخت‌شده قابل تایید و تحویل است.')
  }

  const deliveryNote = await resolveDeliveryNote(db, order, adminNote)
  if (deliveryNote.length > MAX_NOTE_LENGTH) {
    return failure(400, 'INVALID_NOTE', 'اطلاعات تحویل بیش از حد طولانی است.')
  }

  const batch = [
    db
      .prepare(
        `UPDATE orders
         SET status = 'completed', delivery_note = ?
         WHERE id = ? AND status IN ('pending', 'paid', 'provisioning')`,
      )
      .bind(deliveryNote, order.id),
    // Delivering a pending card-to-card order is the admin's approval of its receipt.
    db
      .prepare(
        `UPDATE payment_receipts
         SET status = 'APPROVED', reviewed_at = ?
         WHERE order_id = ? AND purpose = 'product_purchase' AND status = 'PENDING'`,
      )
      .bind(now, order.id),
  ]

  const results = await db.batch(batch)

  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    return failure(409, 'ORDER_STATE_CHANGED', 'وضعیت سفارش تغییر کرده است؛ فهرست را به‌روز کنید.')
  }

  let telegramDelivery: TelegramDeliveryResult | undefined
  if (order.kind === 'vpn') {
    try {
      const user = await db.prepare('SELECT telegram_id FROM users WHERE id = ?')
        .bind(order.user_id).first<{ telegram_id: number }>()
      telegramDelivery = await sendVpnDocument(context.env.TELEGRAM_BOT_TOKEN, Number(user?.telegram_id), deliveryNote)
    } catch {
      telegramDelivery = { sent: false, code: 'TELEGRAM_USER_LOOKUP_FAILED', message: 'خواندن شناسه تلگرام مشتری انجام نشد. (TELEGRAM_USER_LOOKUP_FAILED)' }
    }
  }

  return jsonResponse({
    success: true,
    message: 'سفارش تکمیل شد و اطلاعات تحویل برای کاربر ثبت گردید.',
    data: {
      orderId: order.id,
      status: 'completed',
      deliveryNote,
      updatedAt: now,
      telegramDelivery,
    },
  })
}

async function rejectOrder(
  context: PagesContext,
  order: OrderRow,
  reason: string,
): Promise<Response> {
  const db = context.env.DB!
  const now = new Date().toISOString()
  const refundTotal = order.status === 'paid' || order.status === 'provisioning' ? Number(order.total) : 0
  const refundTxId = `txn_${crypto.randomUUID()}`
  const rejectionNote = `دلیل رد سفارش: ${reason}`

  const batch = [
    db
      .prepare(
        `UPDATE orders
         SET status = 'refunded', delivery_note = ?
         WHERE id = ? AND status IN ('pending', 'paid', 'provisioning')`,
      )
      .bind(rejectionNote, order.id),
  ]

  if (refundTotal > 0) {
    batch.push(
      db
        .prepare(
          `UPDATE users SET balance = balance + ?, updated_at = ?
           WHERE id = ?
             AND NOT EXISTS (
               SELECT 1 FROM wallet_transactions WHERE type = 'refund' AND reference = ?
             )`,
        )
        .bind(refundTotal, now, order.user_id, order.id),
      db
        .prepare(
          `INSERT INTO wallet_transactions
             (id, user_id, type, amount, balance_after, currency, description, reference, created_at)
           SELECT ?, ?, 'refund', ?, balance, 'IRT', ?, ?, ?
           FROM users
           WHERE id = ?
             AND NOT EXISTS (
               SELECT 1 FROM wallet_transactions WHERE type = 'refund' AND reference = ?
             )`,
        )
        .bind(
          refundTxId,
          order.user_id,
          refundTotal,
          `بازگشت وجه سفارش ${order.product_title}`,
          order.id,
          now,
          order.user_id,
          order.id,
        ),
    )
  }

  const results = await db.batch(batch)
  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    return failure(409, 'ORDER_STATE_CHANGED', 'این سفارش دیگر قابل رد نیست؛ فهرست را به‌روز کنید.')
  }

  let balance: number | null = null
  try {
    const row = await db
      .prepare('SELECT balance FROM users WHERE id = ?')
      .bind(order.user_id)
      .first<{ balance: number }>()
    balance = row ? Number(row.balance) : null
  } catch {
    balance = null
  }

  const refunded = refundTotal > 0 && (results[1]?.meta?.changes ?? 0) === 1 ? refundTotal : 0
  const result: RefundResult = { refunded, balance }

  return jsonResponse({
    success: true,
    message: refunded > 0
      ? `سفارش رد شد و ${refunded.toLocaleString('en-US')} تومان به کیف پول کاربر برگشت.`
      : 'سفارش رد شد. این سفارش پرداختی نداشت و مبلغی به کیف پول برنگشت.',
    data: { orderId: order.id, status: 'refunded', reason, ...result },
  })
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)

    const body = await readBody(context)
    if (!body) return failure(400, 'INVALID_BODY', 'ساختار درخواست اقدام سفارش نامعتبر است.')

    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    if (!orderId || orderId.length > 128) {
      return failure(400, 'INVALID_ORDER', 'شناسه سفارش نامعتبر است.')
    }

    const action = body.action
    if (action !== 'complete' && action !== 'reject') {
      return failure(400, 'INVALID_ACTION', 'اقدام سفارش نامعتبر است.')
    }

    const deliveryNote = typeof body.deliveryNote === 'string' ? body.deliveryNote.trim() : ''
    if (deliveryNote.length > MAX_NOTE_LENGTH) {
      return failure(400, 'INVALID_NOTE', 'اطلاعات تحویل بیش از حد طولانی است.')
    }

    const rejectReason = typeof body.rejectReason === 'string' ? body.rejectReason.trim() : ''
    if (rejectReason.length > MAX_REASON_LENGTH) {
      return failure(400, 'INVALID_REASON', 'دلیل رد سفارش بیش از حد طولانی است.')
    }
    if (action === 'reject' && rejectReason.length < MIN_REASON_LENGTH) {
      return failure(400, 'REJECT_REASON_REQUIRED', 'دلیل رد سفارش را وارد کنید.')
    }

    const db = context.env.DB!
    let order: OrderRow | null
    try {
      order = await db
        .prepare(
          `SELECT id, user_id, product_id, product_title, kind, total, status, payment_method
           FROM orders WHERE id = ?`,
        )
        .bind(orderId)
        .first<OrderRow>()
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'خواندن سفارش از پایگاه داده انجام نشد.')
    }
    if (!order) return failure(404, 'ORDER_NOT_FOUND', 'سفارش پیدا نشد.')

    return action === 'complete'
      ? await completeOrder(context, order, deliveryNote)
      : await rejectOrder(context, order, rejectReason)
  } catch (cause) {
    return internalFailure(cause, 'ORDER_ACTION_FAILED')
  }
}
