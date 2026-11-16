/**
 * Cloudflare Pages Function — POST /api/admin/wallet/adjust
 *
 * Manual wallet top-up / deduction by an admin. The balance change and its
 * `ADMIN_ADJUSTMENT` ledger row are written in one D1 batch (atomic).
 *
 * Body: { userId: string, amount: number, note?: string }
 * `amount` is signed integer Toman; a debit may not push the balance below 0.
 */

import {
  authenticateAdmin,
  failure,
  jsonResponse,
  type PagesContext,
} from '../_shared'

const MAX_ADJUSTMENT = 1_000_000_000
const MAX_NOTE_LENGTH = 200

interface AdjustBody {
  userId?: unknown
  amount?: unknown
  note?: unknown
}

interface ValidatedAdjustment {
  userId: string
  amount: number
  note: string | null
}

function validateBody(body: AdjustBody): { ok: true; value: ValidatedAdjustment } | { ok: false; message: string } {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  if (!userId || userId.length > 100) {
    return { ok: false, message: 'شناسه کاربر نامعتبر است.' }
  }

  const amount = Number(body.amount)
  if (!Number.isInteger(amount) || amount === 0) {
    return { ok: false, message: 'مبلغ باید یک عدد صحیح و غیر صفر (تومان) باشد.' }
  }
  if (Math.abs(amount) > MAX_ADJUSTMENT) {
    return { ok: false, message: 'مبلغ تعدیل بیش از حد مجاز است.' }
  }

  const rawNote = typeof body.note === 'string' ? body.note.trim() : ''
  if (rawNote.length > MAX_NOTE_LENGTH) {
    return { ok: false, message: 'توضیح تراکنش بیش از حد طولانی است.' }
  }

  return { ok: true, value: { userId, amount, note: rawNote || null } }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const auth = await authenticateAdmin(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  const db = context.env.DB!
  const rawBody = await context.request.text()

  let body: AdjustBody
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return failure(400, 'ADJUST_BAD_REQUEST', 'ساختار درخواست نامعتبر است.')
    }
    body = parsed as AdjustBody
  } catch {
    return failure(400, 'ADJUST_BAD_REQUEST', 'ساختار درخواست نامعتبر است.')
  }

  const validated = validateBody(body)
  if (!validated.ok) return failure(400, 'ADJUST_VALIDATION', validated.message)
  const { userId, amount, note } = validated.value

  const user = await db
    .prepare('SELECT id, balance FROM users WHERE id = ?')
    .bind(userId)
    .first<{ id: string; balance: number }>()
    .catch(() => null)

  if (!user) {
    return failure(404, 'USER_NOT_FOUND', 'کاربری با این شناسه در پایگاه داده پیدا نشد.')
  }

  const currentBalance = Number(user.balance)
  const nextBalance = currentBalance + amount
  if (nextBalance < 0) {
    return failure(
      422,
      'INSUFFICIENT_BALANCE',
      'موجودی کاربر برای این کسر کافی نیست.',
      { balance: currentBalance },
    )
  }

  const now = new Date().toISOString()
  const transactionId = `txn_${crypto.randomUUID()}`
  const description = note
    ? `تعدیل دستی توسط مدیر — ${note}`
    : amount > 0
      ? 'شارژ دستی توسط مدیر'
      : 'کسر دستی توسط مدیر'

  let changes = 0
  try {
    const [update] = await db.batch([
      db
        .prepare(
          'UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ? AND balance + ? >= 0',
        )
        .bind(amount, now, userId, amount),
      db
        .prepare(
          `INSERT INTO wallet_transactions
             (id, user_id, type, amount, balance_after, currency, description, reference, created_at)
           VALUES (?, ?, 'ADMIN_ADJUSTMENT', ?, ?, 'IRT', ?, NULL, ?)`,
        )
        .bind(transactionId, userId, amount, nextBalance, description, now),
    ])
    changes = update?.meta?.changes ?? 0
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ثبت تعدیل کیف پول انجام نشد. دوباره تلاش کنید.')
  }

  if (changes !== 1) {
    return failure(
      409,
      'BALANCE_CONFLICT',
      'موجودی کاربر هم‌زمان تغییر کرد؛ فهرست را به‌روزرسانی کنید و دوباره تلاش کنید.',
    )
  }

  return jsonResponse({
    success: true,
    data: {
      userId,
      balance: nextBalance,
      currency: 'IRT',
      transactionId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
    },
  })
}
