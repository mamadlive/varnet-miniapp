/**
 * Shared helpers for `/api/admin/*` Pages Functions.
 *
 * Admin authorization is server-side only: the caller's Telegram `initData`
 * is verified against `TELEGRAM_BOT_TOKEN`, then the Telegram id must be listed
 * in `ADMIN_TELEGRAM_IDS` or have `users.role = 'admin'` in D1.
 *
 * Files starting with `_` are not routed by Cloudflare Pages.
 */

import {
  configuredAdminIds,
  verifyInitData,
  type TelegramMiniAppUser,
} from '../_lib/telegram'

export interface D1Meta {
  changes?: number
}

export interface D1Result {
  success: boolean
  meta?: D1Meta
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<{ results: T[] }>
  run(): Promise<D1Result>
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
}

export interface AdminEnv {
  DB?: D1Database
  TELEGRAM_BOT_TOKEN?: string
  /** Comma/space separated Telegram ids allowed to call admin routes. */
  ADMIN_TELEGRAM_IDS?: string
  /** Local-only auth switch (same switch as `PURCHASE_DEMO_TELEGRAM_ID`). */
  PURCHASE_DEMO_TELEGRAM_ID?: string
}

export interface PagesContext {
  request: Request
  env: AdminEnv
}

export type AuthResult =
  | { ok: true; user: TelegramMiniAppUser }
  | { ok: false; status: number; code: string; message: string }

export interface MarginTier {
  upToUsd: number | null
  percent: number
}

/** Fallback ladder used before the `settings` row exists. */
export const DEFAULT_MARGIN_TIERS: MarginTier[] = [
  { upToUsd: 1, percent: 70 },
  { upToUsd: 2, percent: 60 },
  { upToUsd: 3, percent: 50 },
  { upToUsd: 4, percent: 45 },
  { upToUsd: 5, percent: 40 },
  { upToUsd: 6, percent: 30 },
  { upToUsd: 7, percent: 25 },
  { upToUsd: 8, percent: 20 },
  { upToUsd: null, percent: 15 },
]

export const MARGIN_TIERS_KEY = 'margin_tiers'

const RESPONSE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS })
}

export function failure(status: number, code: string, message: string, extra?: unknown): Response {
  return jsonResponse({ success: false, code, message, ...(extra ? { data: extra } : {}) }, status)
}

async function hasAdminRole(db: D1Database, telegramId: number): Promise<boolean> {
  try {
    const row = await db
      .prepare('SELECT role FROM users WHERE telegram_id = ?')
      .bind(telegramId)
      .first<{ role: string | null }>()
    return row?.role === 'admin'
  } catch {
    return false
  }
}

/**
 * Verify the caller is an admin. `ADMIN_TELEGRAM_IDS` is authoritative; D1
 * `users.role` is the fallback once ops flips that column.
 */
export async function authenticateAdmin(
  request: Request,
  env: AdminEnv,
): Promise<AuthResult> {
  if (!env.DB) {
    return {
      ok: false,
      status: 500,
      code: 'DB_NOT_CONFIGURED',
      message: 'اتصال پایگاه‌داده D1 در سرور تنظیم نشده است.',
    }
  }

  let user: TelegramMiniAppUser | null = null
  const initData = request.headers.get('X-Telegram-Init-Data')?.trim()

  if (initData) {
    const botToken = env.TELEGRAM_BOT_TOKEN?.trim()
    if (!botToken) {
      return {
        ok: false,
        status: 500,
        code: 'SERVER_NOT_CONFIGURED',
        message: 'توکن ربات در تنظیمات سرور موجود نیست.',
      }
    }
    user = await verifyInitData(initData, botToken)
    if (!user) {
      return {
        ok: false,
        status: 401,
        code: 'TELEGRAM_AUTH_INVALID',
        message: 'نشست تلگرام معتبر نیست. مینی‌اپ را دوباره باز کنید.',
      }
    }
  }

  const demoId = Number(env.PURCHASE_DEMO_TELEGRAM_ID)
  if (!user && Number.isInteger(demoId) && demoId > 0) {
    user = { id: demoId, first_name: 'کاربر آزمایشی' }
  }

  if (!user) {
    return {
      ok: false,
      status: 401,
      code: 'TELEGRAM_AUTH_REQUIRED',
      message: 'برای عملیات مدیریتی باید مینی‌اپ را از داخل تلگرام باز کنید.',
    }
  }

  const allowed =
    configuredAdminIds(env).has(user.id) || (await hasAdminRole(env.DB, user.id))
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      code: 'ADMIN_FORBIDDEN',
      message: 'این حساب اجازه دسترسی به عملیات مدیریتی را ندارد.',
    }
  }

  return { ok: true, user }
}

/** Parse and validate a tier ladder coming from JSON (D1 row or request body). */
export function parseMarginTiers(value: unknown): MarginTier[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null

  const tiers: MarginTier[] = []
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index]
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

    const record = raw as { upToUsd?: unknown; percent?: unknown }
    const percent = Number(record.percent)
    if (!Number.isFinite(percent) || percent < 0 || percent > 500) return null

    const isLast = index === value.length - 1
    if (record.upToUsd === null) {
      if (!isLast) return null
      tiers.push({ upToUsd: null, percent })
      continue
    }

    const upToUsd = Number(record.upToUsd)
    if (!Number.isFinite(upToUsd) || upToUsd <= 0) return null
    const previous = tiers[index - 1]
    if (previous && previous.upToUsd !== null && upToUsd <= previous.upToUsd) return null
    tiers.push({ upToUsd, percent })
  }

  return tiers[tiers.length - 1]!.upToUsd === null ? tiers : null
}
