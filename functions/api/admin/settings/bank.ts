/**
 * Cloudflare Pages Function — GET/POST /api/admin/settings/bank
 *
 * Persists the card-to-card destination in D1 `settings` and hands it back to
 * the admin panel. The public Mini App reads the same keys via `GET /api/bank`.
 */

import {
  authenticateAdmin,
  failure,
  internalFailure,
  jsonResponse,
  type PagesContext,
} from '../_shared'

interface SettingRow {
  key: string
  value: string
  updated_at: string
}

interface BankBody {
  cardNumber?: unknown
  accountHolder?: unknown
  bankName?: unknown
}

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

function normalizeCard(value: string): string {
  return value.replace(/[^\d]/g, '')
}

async function readSettings(db: NonNullable<PagesContext['env']['DB']>) {
  const result = await db
    .prepare(
      `SELECT key, value, updated_at FROM settings
       WHERE key IN ('bank_card_number', 'bank_account_holder', 'bank_name')`,
    )
    .all<SettingRow>()
  const map = new Map((result.results ?? []).map((row) => [row.key, row]))
  return {
    cardNumber: map.get('bank_card_number')?.value ?? '',
    accountHolder: map.get('bank_account_holder')?.value ?? '',
    bankName: map.get('bank_name')?.value || undefined,
    updatedAt:
      map.get('bank_card_number')?.updated_at ??
      map.get('bank_account_holder')?.updated_at ??
      null,
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)

    const db = context.env.DB!
    return jsonResponse({ success: true, data: await readSettings(db) })
  } catch (cause) {
    return internalFailure(cause, 'BANK_SETTINGS_READ_FAILED')
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)

    let raw: string
    try {
      raw = await context.request.text()
    } catch {
      return failure(400, 'INVALID_BODY', 'بدنه درخواست قابل خواندن نبود.')
    }
    if (raw.length > 4_096) return failure(413, 'INVALID_BODY', 'درخواست بیش از حد بزرگ است.')

    let body: BankBody
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return failure(400, 'INVALID_BODY', 'ساختار درخواست نامعتبر است.')
      }
      body = parsed as BankBody
    } catch {
      return failure(400, 'INVALID_BODY', 'ساختار درخواست نامعتبر است.')
    }

    const cardNumber = normalizeCard(typeof body.cardNumber === 'string' ? body.cardNumber : '')
    const accountHolder = typeof body.accountHolder === 'string' ? body.accountHolder.trim() : ''
    const bankName = typeof body.bankName === 'string' ? body.bankName.trim() : ''

    if (cardNumber.length !== 16) {
      return failure(400, 'INVALID_CARD', 'شماره کارت باید ۱۶ رقم باشد.')
    }
    if (accountHolder.length < 3 || accountHolder.length > 80) {
      return failure(400, 'INVALID_HOLDER', 'نام صاحب حساب را کامل وارد کنید.')
    }
    if (bankName.length > 80) {
      return failure(400, 'INVALID_BANK', 'نام بانک بیش از حد طولانی است.')
    }

    const db = context.env.DB!
    const now = new Date().toISOString()
    const values: Array<[string, string]> = [
      ['bank_card_number', cardNumber],
      ['bank_account_holder', accountHolder],
      ['bank_name', bankName],
    ]

    try {
      await db.batch(
        values.map(([key, value]) =>
          db
            .prepare(
              `INSERT INTO settings (key, value, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            )
            .bind(key, value, now),
        ),
      )
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'ذخیره اطلاعات کارت انجام نشد. دوباره تلاش کنید.')
    }

    return jsonResponse({
      success: true,
      message: 'اطلاعات کارت ذخیره شد.',
      data: await readSettings(db),
    })
  } catch (cause) {
    return internalFailure(cause, 'BANK_SETTINGS_WRITE_FAILED')
  }
}
