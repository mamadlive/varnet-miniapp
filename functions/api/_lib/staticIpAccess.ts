import type { D1Database } from './userAuth'

/**
 * Per-order access state for static-IP services (`static_ip_service_access`).
 *
 * Administrative suspension is an ACCESS decision layered on top of the
 * financial order: `orders.status` / totals are never touched. The helper is
 * used by every customer route that hands out configuration so suspension is
 * enforced server-side for the initial download token, the token download and
 * the Telegram resend alike.
 *
 * LIMITATION: suspending blocks D1/app delivery only. It cannot revoke an
 * OpenVPN credential that was already delivered nor disconnect a live tunnel;
 * that lives on the RADIUS server (`/v1/radius/suspend`), which this project
 * does not call.
 */

export const SERVICE_ACCESS_SUSPENDED = 'SERVICE_SUSPENDED'

export const SERVICE_SUSPENDED_MESSAGE =
  'این سرویس به‌صورت موقت توسط پشتیبانی معلق شده است. برای پیگیری با پشتیبانی تماس بگیرید. (SERVICE_SUSPENDED)'

export interface ServiceAccessState {
  suspended: boolean
  reason: string | null
  suspendedAt: string | null
}

export type ServiceAccessLookup =
  | { ok: true; access: ServiceAccessState }
  | { ok: false } // access table unavailable / query failed — fail closed

const ACTIVE: ServiceAccessState = { suspended: false, reason: null, suspendedAt: null }

interface AccessRow {
  state: string
  reason: string | null
  suspended_at: string | null
}

/** Reads the access row for one order. Missing rows mean "active". */
export async function readServiceAccess(
  db: D1Database,
  orderId: string,
): Promise<ServiceAccessLookup> {
  try {
    const row = await db
      .prepare(
        'SELECT state, reason, suspended_at FROM static_ip_service_access WHERE order_id = ?',
      )
      .bind(orderId)
      .first<AccessRow>()
    if (!row) return { ok: true, access: ACTIVE }
    const suspended = row.state === 'suspended'
    return {
      ok: true,
      access: suspended
        ? {
            suspended: true,
            reason: row.reason?.trim() || null,
            suspendedAt: row.suspended_at ?? null,
          }
        : ACTIVE,
    }
  } catch {
    return { ok: false }
  }
}

/**
 * Same as `readServiceAccess`, but the row must also belong to `userId`;
 * a row owned by somebody else is treated as a hard failure (never active).
 */
export async function readOwnedServiceAccess(
  db: D1Database,
  orderId: string,
  userId: string,
): Promise<ServiceAccessLookup> {
  try {
    const row = await db
      .prepare(
        `SELECT user_id, state, reason, suspended_at
         FROM static_ip_service_access
         WHERE order_id = ?`,
      )
      .bind(orderId)
      .first<AccessRow & { user_id: string }>()
    if (!row) return { ok: true, access: ACTIVE }
    if (row.user_id !== userId) return { ok: false }
    const suspended = row.state === 'suspended'
    return {
      ok: true,
      access: suspended
        ? {
            suspended: true,
            reason: row.reason?.trim() || null,
            suspendedAt: row.suspended_at ?? null,
          }
        : ACTIVE,
    }
  } catch {
    return { ok: false }
  }
}
