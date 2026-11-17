import { authenticateUser, userIdFor, type UserContext } from '../_lib/userAuth'
import { createStaticIpDownloadToken, verifyStaticIpDownloadToken } from '../_lib/telegram'
import { findOwnedConfig } from '../_lib/staticIpDelivery'

const headers = {
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
}

function failure(status: number, code: string, message: string): Response {
  return Response.json({ success: false, code, message }, { status, headers })
}

export async function onRequestPost(context: UserContext): Promise<Response> {
  const auth = await authenticateUser(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)
  const db = context.env.DB
  const botToken = context.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده تنظیم نشده است.')
  if (!botToken) return failure(503, 'TELEGRAM_NOT_CONFIGURED', 'توکن ربات تنظیم نشده است.')
  let body: { orderId?: unknown }
  try {
    body = await context.request.json() as { orderId?: unknown }
  } catch {
    return failure(400, 'INVALID_BODY', 'درخواست نامعتبر است.')
  }
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : ''
  if (!orderId || orderId.length > 128) return failure(400, 'INVALID_ORDER', 'شناسه سفارش نامعتبر است.')
  try {
    const note = await findOwnedConfig(db, orderId, userIdFor(auth.user))
    if (!note) return failure(404, 'CONFIG_NOT_FOUND', 'کانفیگ تحویل‌شده پیدا نشد.')
    const token = await createStaticIpDownloadToken(auth.user.id, orderId, botToken)
    return Response.json({ success: true, data: { token } }, { headers })
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن کانفیگ از پایگاه داده انجام نشد.')
  }
}

export async function onRequestGet(context: UserContext): Promise<Response> {
  const db = context.env.DB
  const botToken = context.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده تنظیم نشده است.')
  if (!botToken) return failure(503, 'TELEGRAM_NOT_CONFIGURED', 'توکن ربات تنظیم نشده است.')
  const params = new URL(context.request.url).searchParams
  const orderId = params.get('orderId')?.trim() ?? ''
  const token = params.get('token') ?? ''
  if (!orderId || orderId.length > 128 || !token) return failure(400, 'INVALID_REQUEST', 'درخواست نامعتبر است.')
  const telegramId = await verifyStaticIpDownloadToken(token, orderId, botToken)
  if (!telegramId) return failure(401, 'DOWNLOAD_TOKEN_INVALID', 'لینک دانلود معتبر نیست یا منقضی شده است.')
  try {
    const note = await findOwnedConfig(db, orderId, `usr_tg_${telegramId}`)
    if (!note) return failure(404, 'CONFIG_NOT_FOUND', 'کانفیگ تحویل‌شده پیدا نشد.')
    return new Response(note, { headers: {
      ...headers,
      'content-type': 'application/x-openvpn-profile',
      'content-disposition': 'attachment; filename="varnet-config.ovpn"',
    } })
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن کانفیگ از پایگاه داده انجام نشد.')
  }
}
