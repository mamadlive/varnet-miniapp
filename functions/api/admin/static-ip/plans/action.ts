/**
 * Cloudflare Pages Function — POST /api/admin/static-ip/plans/action
 *
 * `save`:   create or update a selling plan (node, quota, duration, price).
 * `toggle`: flip `is_enabled` (a disabled plan disappears from the Mini App).
 * `delete`: remove a plan from the catalogue; past orders keep their title.
 */

import {
  authenticateAdmin,
  failure,
  internalFailure,
  jsonResponse,
  type PagesContext,
} from '../../_shared'
import { PLAN_SELECT, toAdminPlan, type StaticIpPlanRow } from '../plans'

interface ActionBody {
  action?: unknown
  planId?: unknown
  nodeId?: unknown
  name?: unknown
  dataCapGb?: unknown
  durationDays?: unknown
  price?: unknown
  enabled?: unknown
  sortOrder?: unknown
}

const MAX_PRICE = 100_000_000

async function readPlan(db: NonNullable<PagesContext['env']['DB']>, id: string) {
  return db
    .prepare(`${PLAN_SELECT} WHERE p.id = ?`)
    .bind(id)
    .first<StaticIpPlanRow>()
}

function intInRange(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null
  return parsed
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
    if (raw.length > 8_192) return failure(413, 'INVALID_BODY', 'درخواست بیش از حد بزرگ است.')

    let body: ActionBody
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return failure(400, 'INVALID_BODY', 'ساختار درخواست نامعتبر است.')
      }
      body = parsed as ActionBody
    } catch {
      return failure(400, 'INVALID_BODY', 'ساختار درخواست نامعتبر است.')
    }

    const db = context.env.DB!
    const action = typeof body.action === 'string' ? body.action : ''
    const planId = typeof body.planId === 'string' ? body.planId.trim() : ''
    const now = new Date().toISOString()

    if (action === 'toggle') {
      if (!planId) return failure(400, 'INVALID_PLAN', 'شناسه پلن ارسال نشده است.')

      const existing = await readPlan(db, planId)
      if (!existing) return failure(404, 'PLAN_NOT_FOUND', 'پلن موردنظر پیدا نشد.')

      const nextEnabled = Number(existing.is_enabled) === 1 ? 0 : 1
      await db
        .prepare('UPDATE static_ip_plans SET is_enabled = ?, updated_at = ? WHERE id = ?')
        .bind(nextEnabled, now, planId)
        .run()

      const updated = await readPlan(db, planId)
      return jsonResponse({
        success: true,
        message:
          nextEnabled === 1
            ? 'پلن فعال شد و در مینی‌اپ قابل فروش است.'
            : 'پلن غیرفعال شد و از مینی‌اپ مخفی شد.',
        data: updated ? toAdminPlan(updated) : null,
      })
    }

    if (action === 'delete') {
      if (!planId) return failure(400, 'INVALID_PLAN', 'شناسه پلن ارسال نشده است.')

      const existing = await readPlan(db, planId)
      if (!existing) return failure(404, 'PLAN_NOT_FOUND', 'پلن موردنظر پیدا نشد.')

      const result = await db
        .prepare('DELETE FROM static_ip_plans WHERE id = ?')
        .bind(planId)
        .run()
      if ((result.meta?.changes ?? 0) !== 1) {
        return failure(409, 'PLAN_STATE_CHANGED', 'این پلن دیگر وجود ندارد؛ فهرست را به‌روز کنید.')
      }

      return jsonResponse({
        success: true,
        message: 'پلن حذف شد. سفارش‌های قبلی با عنوان ثبت‌شده باقی می‌مانند.',
        data: { id: planId },
      })
    }

    if (action !== 'save') {
      return failure(400, 'INVALID_ACTION', 'عملیات درخواستی پشتیبانی نمی‌شود.')
    }

    const existing = planId ? await readPlan(db, planId) : null
    if (planId && !existing) return failure(404, 'PLAN_NOT_FOUND', 'پلن موردنظر پیدا نشد.')

    const nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const dataCapGb = intInRange(body.dataCapGb, 1, 100_000)
    const durationDays = intInRange(body.durationDays, 1, 3650)
    const price = intInRange(body.price, 0, MAX_PRICE)
    const sortOrder =
      body.sortOrder === undefined
        ? (existing?.sort_order ?? 100)
        : intInRange(body.sortOrder, 0, 100_000)
    const enabled = body.enabled === undefined ? true : body.enabled === true

    if (!nodeId) return failure(400, 'INVALID_NODE', 'نود متصل به پلن را انتخاب کنید.')
    if (name.length < 2 || name.length > 80) {
      return failure(400, 'INVALID_NAME', 'نام پلن باید بین ۲ تا ۸۰ نویسه باشد.')
    }
    if (dataCapGb === null) {
      return failure(400, 'INVALID_QUOTA', 'حجم پلن باید بین ۱ تا ۱۰۰۰۰۰ گیگابایت باشد.')
    }
    if (durationDays === null) {
      return failure(400, 'INVALID_DURATION', 'مدت پلن باید بین ۱ تا ۳۶۵۰ روز باشد.')
    }
    if (price === null) {
      return failure(400, 'INVALID_PRICE', 'قیمت پلن معتبر نیست.')
    }
    if (sortOrder === null) {
      return failure(400, 'INVALID_SORT', 'ترتیب نمایش معتبر نیست.')
    }

    const node = await db
      .prepare('SELECT id FROM static_ip_nodes WHERE id = ?')
      .bind(nodeId)
      .first<{ id: string }>()
    if (!node) return failure(404, 'NODE_NOT_FOUND', 'نود انتخاب‌شده پیدا نشد.')

    const id = planId || `plan_${crypto.randomUUID()}`

    if (existing) {
      await db
        .prepare(
          `UPDATE static_ip_plans
           SET node_id = ?, name = ?, data_cap_gb = ?, duration_days = ?, price = ?,
               is_enabled = ?, sort_order = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          nodeId,
          name,
          dataCapGb,
          durationDays,
          price,
          enabled ? 1 : 0,
          sortOrder,
          now,
          id,
        )
        .run()
    } else {
      await db
        .prepare(
          `INSERT INTO static_ip_plans
             (id, node_id, name, data_cap_gb, duration_days, price, currency,
              is_enabled, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'IRT', ?, ?, ?, ?)`,
        )
        .bind(id, nodeId, name, dataCapGb, durationDays, price, enabled ? 1 : 0, sortOrder, now, now)
        .run()
    }

    const saved = await readPlan(db, id)
    return jsonResponse({
      success: true,
      message: existing ? 'تغییرات پلن ذخیره شد.' : 'پلن جدید ساخته شد.',
      data: saved ? toAdminPlan(saved) : null,
    })
  } catch (cause) {
    return internalFailure(cause, 'STATIC_IP_PLAN_WRITE_FAILED')
  }
}
