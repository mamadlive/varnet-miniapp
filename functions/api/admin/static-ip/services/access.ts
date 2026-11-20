/**
 * Cloudflare Pages Function — POST /api/admin/static-ip/services/access
 *
 * Administrative suspension of an already completed static-IP (VPN) service.
 *
 * - `suspend`:    records `state = 'suspended'` plus a validated reason.
 * - `reactivate`: records `state = 'active'` and clears the reason.
 *
 * Only `kind = 'vpn'` orders whose financial `status = 'completed'` can be
 * suspended. Suspension is stored in `static_ip_service_access` and NEVER
 * touches `orders.status`, totals, wallet rows or receipts. While suspended the
 * customer's service list withholds the delivery note and the download /
 * resend routes refuse the order.
 *
 * LIMITATION: this does not revoke an OpenVPN credential already delivered and
 * does not disconnect a live tunnel. The response carries
 * `networkRevoked: false` and the UI says so explicitly.
 */

import { notifyBuyer } from '../../../_lib/notifications'
import {
  authenticateAdmin,
  failure,
  internalFailure,
  jsonResponse,
  type PagesContext,
} from '../../_shared'

interface AccessBody {
  orderId?: unknown
  action?: unknown
  reason?: unknown
}

interface OrderRow {
  id: string
  user_id: string
  product_title: string
  kind: string
  status: string
}

interface AccessRow {
  state: string
  reason: string | null
  suspended_at: string | null
  updated_at: string
}

const MAX_BODY_BYTES = 4_096
const MIN_REASON_LENGTH = 3
const MAX_REASON_LENGTH = 500

async function readBody(context: PagesContext): Promise<AccessBody | null> {
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
    return parsed as AccessBody
  } catch {
    return null
  }
}

async function readAccess(
  db: NonNullable<PagesContext['env']['DB']>,
  orderId: string,
): Promise<AccessRow | null> {
  return db
    .prepare(
      'SELECT state, reason, suspended_at, updated_at FROM static_ip_service_access WHERE order_id = ?',
    )
    .bind(orderId)
    .first<AccessRow>()
}

function accessPayload(orderId: string, state: 'active' | 'suspended', reason: string | null, updatedAt: string) {
  return {
    orderId,
    access: { state, reason, updatedAt },
    // No server-side RADIUS/OpenVPN integration: existing tunnels are untouched.
    networkRevoked: false,
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const auth = await authenticateAdmin(context.request, context.env)
    if (!auth.ok) return failure(auth.status, auth.code, auth.message)

    const body = await readBody(context)
    if (!body) return failure(400, 'INVALID_BODY', 'ساختار درخواست کنترل سرویس نامعتبر است.')

    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
    if (!orderId || orderId.length > 128) {
      return failure(400, 'INVALID_ORDER', 'شناسه سفارش نامعتبر است.')
    }

    const action = body.action
    if (action !== 'suspend' && action !== 'reactivate') {
      return failure(400, 'INVALID_ACTION', 'اقدام سرویس نامعتبر است.')
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length > MAX_REASON_LENGTH) {
      return failure(400, 'INVALID_REASON', 'دلیل تعلیق بیش از حد طولانی است.')
    }
    if (action === 'suspend' && reason.length < MIN_REASON_LENGTH) {
      return failure(400, 'REASON_REQUIRED', 'دلیل تعلیق سرویس را وارد کنید (حداقل ۳ حرف).')
    }

    const db = context.env.DB!
    let order: OrderRow | null
    try {
      order = await db
        .prepare('SELECT id, user_id, product_title, kind, status FROM orders WHERE id = ?')
        .bind(orderId)
        .first<OrderRow>()
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'خواندن سفارش از پایگاه داده انجام نشد.')
    }
    if (!order) return failure(404, 'ORDER_NOT_FOUND', 'سفارش پیدا نشد.')

    if (order.kind !== 'vpn') {
      return failure(409, 'NOT_VPN_SERVICE', 'تعلیق فقط برای سرویس‌های آی‌پی ثابت (VPN) امکان‌پذیر است.')
    }
    if (order.status !== 'completed') {
      return failure(409, 'SERVICE_NOT_COMPLETED', 'فقط سرویس تحویل‌شده (تکمیل‌شده) قابل تعلیق یا فعال‌سازی است.')
    }

    const now = new Date().toISOString()
    let current: AccessRow | null
    try {
      current = await readAccess(db, orderId)
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'خواندن وضعیت سرویس انجام نشد.')
    }
    const adminId = auth.user.id

    if (action === 'suspend') {
      if (current?.state === 'suspended') {
        return failure(409, 'ALREADY_SUSPENDED', 'این سرویس از قبل معلق است.')
      }
      // Guarded upsert: only flips rows that are not already suspended. The
      // previous suspended_at/suspended_by are preserved across reactivations
      // only in `updated_at`; the reason is always the latest one.
      try {
        const result = await db
          .prepare(
            `INSERT INTO static_ip_service_access
               (order_id, user_id, state, reason, suspended_at, suspended_by, resumed_at, resumed_by, updated_at)
             VALUES (?, ?, 'suspended', ?, ?, ?, NULL, NULL, ?)
             ON CONFLICT (order_id) DO UPDATE SET
               user_id = excluded.user_id,
               state = 'suspended',
               reason = excluded.reason,
               suspended_at = excluded.suspended_at,
               suspended_by = excluded.suspended_by,
               resumed_at = NULL,
               resumed_by = NULL,
               updated_at = excluded.updated_at
             WHERE static_ip_service_access.state <> 'suspended'`,
          )
          .bind(orderId, order.user_id, reason, now, adminId, now)
          .run()
        if ((result.meta?.changes ?? 0) !== 1) {
          return failure(409, 'ACCESS_STATE_CHANGED', 'وضعیت سرویس هم‌زمان تغییر کرد؛ فهرست را به‌روز و دوباره تلاش کنید.')
        }
      } catch {
        return failure(503, 'DB_UNAVAILABLE', 'ثبت تعلیق سرویس در پایگاه داده انجام نشد.')
      }

      const notification = await notifyBuyer(
        context.env,
        db,
        order.user_id,
        `سرویس آی‌پی ثابت شما موقتاً معلق شد.\nشناسه سفارش: ${order.id}\nمحصول: ${order.product_title}\nدلیل: ${reason}\nدر این مدت دانلود کانفیگ و ارسال مجدد غیرفعال است. برای پیگیری با پشتیبانی تماس بگیرید.`,
      )

      return jsonResponse({
        success: true,
        message: 'سرویس معلق شد؛ دانلود و ارسال مجدد برای مشتری غیرفعال است. وضعیت مالی سفارش تغییر نکرد.',
        data: { ...accessPayload(orderId, 'suspended', reason, now), notification },
      })
    }

    // reactivate
    if (!current) {
      // Nothing was ever suspended — idempotent success, nothing to write.
      return jsonResponse({
        success: true,
        message: 'این سرویس معلق نبود؛ وضعیت آن فعال است.',
        data: accessPayload(orderId, 'active', null, now),
      })
    }
    if (current.state === 'active') {
      return jsonResponse({
        success: true,
        message: 'این سرویس از قبل فعال است.',
        data: accessPayload(orderId, 'active', null, current.updated_at ?? now),
      })
    }

    try {
      const result = await db
        .prepare(
          `UPDATE static_ip_service_access
           SET state = 'active', reason = NULL, resumed_at = ?, resumed_by = ?, updated_at = ?
           WHERE order_id = ? AND state = 'suspended'`,
        )
        .bind(now, adminId, now, orderId)
        .run()
      if ((result.meta?.changes ?? 0) !== 1) {
        return failure(409, 'ACCESS_STATE_CHANGED', 'وضعیت سرویس هم‌زمان تغییر کرد؛ فهرست را به‌روز و دوباره تلاش کنید.')
      }
    } catch {
      return failure(503, 'DB_UNAVAILABLE', 'فعال‌سازی مجدد سرویس در پایگاه داده انجام نشد.')
    }

    const notification = await notifyBuyer(
      context.env,
      db,
      order.user_id,
      `سرویس آی‌پی ثابت شما دوباره فعال شد.\nشناسه سفارش: ${order.id}\nمحصول: ${order.product_title}\nاکنون می‌توانید کانفیگ را از مینی‌اپ دریافت کنید.`,
    )

    return jsonResponse({
      success: true,
      message: 'تعلیق سرویس برداشته شد؛ مجدداً دسترسی تحویل کانفیگ برقرار است.',
      data: { ...accessPayload(orderId, 'active', null, now), notification },
    })
  } catch (cause) {
    return internalFailure(cause, 'SERVICE_ACCESS_FAILED')
  }
}
