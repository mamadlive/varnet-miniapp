import { authenticateUser, userIdFor, type UserContext } from '../_lib/userAuth'
import { findOwnedConfig, sendVpnDocument } from '../_lib/staticIpDelivery'
import {
  SERVICE_ACCESS_SUSPENDED,
  SERVICE_SUSPENDED_MESSAGE,
  readOwnedServiceAccess,
} from '../_lib/staticIpAccess'

function failure(status: number, code: string, message: string): Response {
  return Response.json({ success: false, code, message }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function onRequestPost(context: UserContext): Promise<Response> {
  const auth = await authenticateUser(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)
  const db = context.env.DB
  if (!db) return failure(503, 'DB_NOT_CONFIGURED', 'پایگاه داده تنظیم نشده است.')
  let body: { orderId?: unknown }
  try {
    body = await context.request.json() as { orderId?: unknown }
  } catch {
    return failure(400, 'INVALID_BODY', 'درخواست نامعتبر است.')
  }
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : ''
  if (!orderId || orderId.length > 128) return failure(400, 'INVALID_ORDER', 'شناسه سفارش نامعتبر است.')
  const userId = userIdFor(auth.user)
  let note: string | null
  try {
    const access = await readOwnedServiceAccess(db, orderId, userId)
    if (!access.ok) return failure(503, 'DB_UNAVAILABLE', 'خواندن وضعیت سرویس از پایگاه داده انجام نشد.')
    if (access.access.suspended) {
      return failure(403, SERVICE_ACCESS_SUSPENDED, SERVICE_SUSPENDED_MESSAGE)
    }
    note = await findOwnedConfig(db, orderId, userId)
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'خواندن کانفیگ از پایگاه داده انجام نشد.')
  }
  if (!note) return failure(404, 'CONFIG_NOT_FOUND', 'کانفیگ تحویل‌شده پیدا نشد.')
  const result = await sendVpnDocument(context.env.TELEGRAM_BOT_TOKEN, auth.user.id, note)
  if (!result.sent) return failure(502, result.code!, result.message!)
  return Response.json({ success: true, message: 'فایل به تلگرام شما ارسال شد.' }, { headers: { 'cache-control': 'no-store' } })
}
