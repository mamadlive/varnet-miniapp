import type { D1Database } from './userAuth'

export interface TelegramDeliveryResult {
  sent: boolean
  code?: string
  message?: string
}

export async function findOwnedConfig(db: D1Database, orderId: string, userId: string): Promise<string | null> {
  const row = await db.prepare(
    `SELECT delivery_note FROM orders
     WHERE id = ? AND user_id = ? AND kind = 'vpn' AND status = 'completed'`,
  ).bind(orderId, userId).first<{ delivery_note: string | null }>()
  return row?.delivery_note?.trim() ? row.delivery_note : null
}

export async function sendVpnDocument(
  botToken: string | undefined,
  telegramId: number,
  content: string,
): Promise<TelegramDeliveryResult> {
  botToken = botToken?.trim()
  if (!botToken) {
    return { sent: false, code: 'TELEGRAM_NOT_CONFIGURED', message: 'توکن ربات تلگرام تنظیم نشده است. (TELEGRAM_NOT_CONFIGURED)' }
  }
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    return { sent: false, code: 'TELEGRAM_USER_NOT_FOUND', message: 'شناسه تلگرام مشتری پیدا نشد. (TELEGRAM_USER_NOT_FOUND)' }
  }
  const form = new FormData()
  form.set('chat_id', String(telegramId))
  form.set('document', new Blob([content], { type: 'application/x-openvpn-profile' }), 'varnet-config.ovpn')
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(10000),
    })
    const result = await response.json().catch(() => null) as { ok?: boolean; error_code?: number; description?: string } | null
    if (response.ok && result?.ok === true) return { sent: true }
    const code = `TELEGRAM_${result?.error_code || response.status}`
    const detail = typeof result?.description === 'string'
      ? result.description.replaceAll(botToken, '[redacted]').slice(0, 300)
      : 'پاسخ نامعتبر از تلگرام'
    return { sent: false, code, message: `${detail} (${code})` }
  } catch {
    return { sent: false, code: 'TELEGRAM_UNAVAILABLE', message: 'ارتباط با تلگرام برقرار نشد. (TELEGRAM_UNAVAILABLE)' }
  }
}
