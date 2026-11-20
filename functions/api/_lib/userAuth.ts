/**
 * Telegram Mini App authentication shared by customer-facing Pages Functions.
 *
 * Accepts the signed `X-Telegram-Init-Data` header or, for local testing only,
 * the numeric `PURCHASE_DEMO_TELEGRAM_ID` switch. Never used by admin routes.
 */

import { verifyInitData, type TelegramMiniAppUser } from './telegram'

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

export interface UserEnv {
  DB?: D1Database
  TELEGRAM_BOT_TOKEN?: string
  PURCHASE_DEMO_TELEGRAM_ID?: string
}

export interface UserContext {
  request: Request
  env: UserEnv
}

export type UserAuthResult =
  | { ok: true; user: TelegramMiniAppUser }
  | { ok: false; status: number; code: string; message: string }

export async function authenticateUser(
  request: Request,
  env: UserEnv,
): Promise<UserAuthResult> {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim()
  const initData = request.headers.get('X-Telegram-Init-Data')?.trim()

  if (initData) {
    if (!botToken) {
      return {
        ok: false,
        status: 500,
        code: 'SERVER_NOT_CONFIGURED',
        message: 'توکن ربات در تنظیمات سرور موجود نیست.',
      }
    }
    const user = await verifyInitData(initData, botToken)
    if (!user) {
      return {
        ok: false,
        status: 401,
        code: 'TELEGRAM_AUTH_INVALID',
        message: 'نشست تلگرام معتبر نیست. مینی‌اپ را دوباره باز کنید.',
      }
    }
    return { ok: true, user }
  }

  const demoTelegramId = Number(env.PURCHASE_DEMO_TELEGRAM_ID)
  if (Number.isInteger(demoTelegramId) && demoTelegramId > 0) {
    return { ok: true, user: { id: demoTelegramId, first_name: 'کاربر آزمایشی' } }
  }

  return {
    ok: false,
    status: 401,
    code: 'TELEGRAM_AUTH_REQUIRED',
    message: 'برای مشاهده این بخش باید مینی‌اپ را از داخل تلگرام باز کنید.',
  }
}

export function userIdFor(user: TelegramMiniAppUser): string {
  return `usr_tg_${user.id}`
}
