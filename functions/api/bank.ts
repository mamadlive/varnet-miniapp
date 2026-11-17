/**
 * Cloudflare Pages Function — GET /api/bank
 *
 * Public card-to-card destination configured by the admin. Only the three
 * display fields are exposed; nothing else from `settings` leaks.
 */

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
}

interface D1Database {
  prepare(sql: string): D1PreparedStatement
}

interface PagesContext {
  env: { DB?: D1Database }
}

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

interface SettingRow {
  key: string
  value: string
  updated_at: string
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const db = context.env.DB
  if (!db) {
    return new Response(
      JSON.stringify({ success: false, code: 'DB_NOT_CONFIGURED', message: 'پایگاه داده تنظیمات در سرور آماده نیست.' }),
      { status: 503, headers: RESPONSE_HEADERS },
    )
  }

  try {
    const result = await db
      .prepare(
        `SELECT key, value, updated_at FROM settings
         WHERE key IN ('bank_card_number', 'bank_account_holder', 'bank_name')`,
      )
      .all<SettingRow>()

    const values = new Map((result.results ?? []).map((row) => [row.key, row]))
    const card = values.get('bank_card_number')
    const holder = values.get('bank_account_holder')

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          cardNumber: card?.value ?? '',
          accountHolder: holder?.value ?? '',
          bankName: values.get('bank_name')?.value || undefined,
          updatedAt: card?.updated_at ?? holder?.updated_at ?? null,
        },
      }),
      { headers: RESPONSE_HEADERS },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, code: 'DB_UNAVAILABLE', message: 'خواندن اطلاعات کارت انجام نشد.' }),
      { status: 503, headers: RESPONSE_HEADERS },
    )
  }
}
