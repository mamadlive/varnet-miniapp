import { configuredAdminIds } from './telegram'

/** Results contain only fixed codes and counts, never Telegram responses or secrets. */
export interface NotificationResult {
  sent: boolean
  code?: string
  attempted?: number
  delivered?: number
}

export interface NotificationEnv {
  TELEGRAM_BOT_TOKEN?: string
  ADMIN_TELEGRAM_IDS?: string
}

interface NotificationDatabase {
  prepare(sql: string): {
    bind(...values: unknown[]): { first<T = unknown>(): Promise<T | null> }
  }
}

/** Log only the fixed code — never message text, chat ids, tokens or responses. */
function failed(code: string): NotificationResult {
  console.warn(JSON.stringify({ event: 'telegram_notification', code }))
  return { sent: false, code }
}

function sendMessage(token: string | undefined, chatId: number, text: string): Promise<NotificationResult> {
  if (!token?.trim()) return Promise.resolve(failed('TELEGRAM_NOT_CONFIGURED'))
  if (!Number.isSafeInteger(chatId) || chatId <= 0) return Promise.resolve(failed('TELEGRAM_USER_NOT_FOUND'))
  return postMessage(token.trim(), chatId, text)
}

async function postMessage(token: string, chatId: number, text: string): Promise<NotificationResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10000),
    })
    const result = await response.json().catch(() => null) as { ok?: boolean } | null
    if (response.ok && result?.ok === true) return { sent: true }
    return failed('TELEGRAM_REJECTED')
  } catch {
    return failed('TELEGRAM_UNAVAILABLE')
  }
}

export async function notifyAdmins(
  env: NotificationEnv,
  text: string,
): Promise<NotificationResult> {
  try {
    const ids = new Set([...configuredAdminIds(env)].map(Number).filter(id => Number.isSafeInteger(id) && id > 0))
    if (!ids.size) return failed('TELEGRAM_NO_ADMINS')
    const results = await Promise.all([...ids].map(id => sendMessage(env.TELEGRAM_BOT_TOKEN, id, text)))
    const delivered = results.filter(result => result.sent).length
    return {
      sent: delivered === ids.size,
      ...(delivered !== ids.size ? { code: 'TELEGRAM_PARTIAL_FAILURE' } : {}),
      attempted: ids.size,
      delivered,
    }
  } catch {
    return failed('TELEGRAM_NOTIFICATION_FAILED')
  }
}

/** Resolve the buyer from D1 and send a post-commit notification; never throws. */
export async function notifyBuyer(
  env: NotificationEnv,
  db: NotificationDatabase,
  userId: string,
  text: string,
): Promise<NotificationResult> {
  try {
    const user = await db.prepare('SELECT telegram_id FROM users WHERE id = ?')
      .bind(userId).first<{ telegram_id: number }>()
    return await sendMessage(env.TELEGRAM_BOT_TOKEN, Number(user?.telegram_id), text)
  } catch {
    return failed('TELEGRAM_USER_LOOKUP_FAILED')
  }
}

/** Purchase integration: call only after commit, then return this result in data.notification. */
export async function notifyPurchaseAdmins(
  env: NotificationEnv,
  purchase: { orderId: string; userId: string; userName: string; productTitle: string; total: number; paymentMethod: 'wallet' | 'card' },
): Promise<NotificationResult> {
  try {
    const method = purchase.paymentMethod === 'card' ? 'کارت به کارت' : 'کیف پول'
    return await notifyAdmins(env, `سفارش جدید ثبت شد.\nشناسه سفارش: ${purchase.orderId}\nکاربر: ${purchase.userName} (${purchase.userId})\nمحصول: ${purchase.productTitle}\nمبلغ: ${purchase.total.toLocaleString('en-US')} تومان\nروش پرداخت: ${method}`)
  } catch {
    return failed('TELEGRAM_NOTIFICATION_FAILED')
  }
}
