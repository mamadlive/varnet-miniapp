/**
 * Cloudflare Pages Function — POST /api/admin/receipts/action
 *
 * Approves or rejects a card-to-card claim.
 * - wallet_topup approved  → wallet credited + `deposit` transaction.
 * - product_purchase approved → the linked pending order becomes `paid`.
 * - rejected → receipt marked REJECTED; an unpaid product order is cancelled.
 *
 * All writes run in one D1 batch with status guards, so replaying an approval
 * can never credit the wallet twice.
 */

import {
  authenticateAdmin,
  failure,
  internalFailure,
  jsonResponse,
  type PagesContext,
} from '../_shared'

interface ReceiptRow {
  id: string
  user_id: string
  purpose: string
  order_id: string | null
  amount: number
  status: string
  reference: string
}

interface ActionBody {
  receiptId?: unknown
  action?: unknown
}

const MAX_BODY_BYTES = 4_096

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

async function approveReceipt(
  context: PagesContext,
  receipt: ReceiptRow,
): Promise<Response> {
  const db = context.env.DB!
  const now = new Date().toISOString()
  const amount = Number(receipt.amount)

  if (receipt.purpose === 'product_purchase') {
    if (!receipt.order_id) {
      return failure(400, 'RECEIPT_NO_ORDER', 'این فیش به سفارشی متصل نیست.')
    }

    const results = await db.batch([
      db
        .prepare(
          `UPDATE orders SET status = 'paid'
           WHERE id = ? AND status = 'pending'`,
        )
        .bind(receipt.order_id),
      db
        .prepare(
          `UPDATE payment_receipts SET status = 'APPROVED', reviewed_at = ?
           WHERE id = ? AND status = 'PENDING'
             AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')`,
        )
        .bind(now, receipt.id, receipt.order_id),
    ])

    if ((results[0]?.meta?.changes ?? 0) !== 1) {
      return failure(409, 'ORDER_NOT_PENDING', 'این سفارش قبلاً پرداخت یا لغو شده است.')
    }

    return jsonResponse({
      success: true,
      message: 'فیش تایید شد و سفارش به وضعیت پرداخت‌شده تغییر کرد.',
      data: { receiptId: receipt.id, status: 'APPROVED', orderId: receipt.order_id },
    })
  }

  const transactionId = `txn_${crypto.randomUUID()}`
  const results = await db.batch([
    db
      .prepare(
        `UPDATE payment_receipts SET status = 'APPROVED', reviewed_at = ?
         WHERE id = ? AND status = 'PENDING'`,
      )
      .bind(now, receipt.id),
    db
      .prepare(
        `UPDATE users SET balance = balance + ?, updated_at = ?
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM wallet_transactions WHERE type = 'deposit' AND reference = ?
           )`,
      )
      .bind(amount, now, receipt.user_id, receipt.id),
    db
      .prepare(
        `INSERT INTO wallet_transactions
           (id, user_id, type, amount, balance_after, currency, description, reference, created_at)
         SELECT ?, ?, 'deposit', ?, balance, 'IRT', ?, ?, ?
         FROM users
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM wallet_transactions WHERE type = 'deposit' AND reference = ?
           )`,
      )
      .bind(
        transactionId,
        receipt.user_id,
        amount,
        'شارژ کیف پول (کارت به کارت)',
        receipt.id,
        now,
        receipt.user_id,
        receipt.id,
      ),
  ])

  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    return failure(409, 'RECEIPT_ALREADY_REVIEWED', 'این فیش قبلاً بررسی شده است.')
  }

  let balance: number | null = null
  try {
    const row = await db
      .prepare('SELECT balance FROM users WHERE id = ?')
      .bind(receipt.user_id)
      .first<{ balance: number }>()
    balance = row ? Number(row.balance) : null
  } catch {
    balance = null
  }

  return jsonResponse({
    success: true,
    message: 'فیش تایید شد و موجودی کیف پول کاربر افزایش یافت.',
    data: { receiptId: receipt.id, status: 'APPROVED', amount, balance },
  })
}

async function rejectReceipt(
  context: PagesContext,
  receipt: ReceiptRow,
): Promise<Response> {
  const db = context.env.DB!
  const now = new Date().toISOString()

  const statements = [
    db
      .prepare(
        `UPDATE payment_receipts SET status = 'REJECTED', reviewed_at = ?
         WHERE id = ? AND status = 'PENDING'`,
      )
      .bind(now, receipt.id),
  ]
  if (receipt.purpose === 'product_purchase' && receipt.order_id) {
    statements.push(
      db
        .prepare(
          `UPDATE orders SET status = 'cancelled'
           WHERE id = ? AND status = 'pending'`,
        )
        .bind(receipt.order_id),
    )
  }

  const results = await db.batch(statements)
  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    return failure(409, 'RECEIPT_ALREADY_REVIEWED', 'این فیش قبلاً بررسی شده است.')
  }

  return jsonResponse({
    success: true,
    message: 'فیش رد شد و در صورت وجود سفارش در انتظار، لغو گردید.',
    data: { receiptId: receipt.id, status: 'REJECTED' },
  })
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)

    const body = await readBody(context)
    if (!body) return failure(400, 'INVALID_BODY', 'ساختار درخواست نامعتبر است.')

    const receiptId = typeof body.receiptId === 'string' ? body.receiptId.trim() : ''
    if (!receiptId || receiptId.length > 128) {
      return failure(400, 'INVALID_RECEIPT', 'شناسه فیش نامعتبر است.')
    }
    if (body.action !== 'approve' && body.action !== 'reject') {
      return failure(400, 'INVALID_ACTION', 'اقدام فیش نامعتبر است.')
    }

    const db = context.env.DB!
    let receipt: ReceiptRow | null
    try {
      receipt = await db
        .prepare(
          `SELECT id, user_id, purpose, order_id, amount, status, reference
           FROM payment_receipts WHERE id = ?`,
        )
        .bind(receiptId)
        .first<ReceiptRow>()
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'خواندن فیش واریز انجام نشد.')
    }
    if (!receipt) return failure(404, 'RECEIPT_NOT_FOUND', 'فیش واریز پیدا نشد.')
    if (receipt.status !== 'PENDING') {
      return failure(409, 'RECEIPT_ALREADY_REVIEWED', 'این فیش قبلاً بررسی شده است.')
    }

    return body.action === 'approve'
      ? await approveReceipt(context, receipt)
      : await rejectReceipt(context, receipt)
  } catch (cause) {
    return internalFailure(cause, 'RECEIPT_ACTION_FAILED')
  }
}
