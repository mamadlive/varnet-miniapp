/**
 * Cloudflare Pages Function — POST /api/admin/static-ip/nodes/action
 *
 * `toggle`: flip `is_enabled` (a disabled node disappears from the Mini App).
 * `save`:   create or update a node (name, IP, price, availability, …).
 */

import {
  authenticateAdmin,
  failure,
  internalFailure,
  jsonResponse,
  type PagesContext,
} from '../../_shared'
import { toAdminNode, type StaticIpNodeRow } from '../nodes'

interface ActionBody {
  action?: unknown
  nodeId?: unknown
  name?: unknown
  ip?: unknown
  country?: unknown
  countryCode?: unknown
  price?: unknown
  durationDays?: unknown
  dataCapGb?: unknown
  availability?: unknown
  enabled?: unknown
  sortOrder?: unknown
}

const MAX_PRICE = 100_000_000
const AVAILABILITY = new Set(['in_stock', 'coming_soon', 'sold_out'])
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/

const SELECT_COLUMNS = `id, name, ip, country, country_code, protocol, price, currency,
  duration_days, data_cap_gb, availability, is_enabled, sort_order, created_at, updated_at`

async function readNode(db: NonNullable<PagesContext['env']['DB']>, id: string) {
  return db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM static_ip_nodes WHERE id = ?`)
    .bind(id)
    .first<StaticIpNodeRow>()
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
    const nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : ''
    const now = new Date().toISOString()

    if (action === 'toggle') {
      if (!nodeId) return failure(400, 'INVALID_NODE', 'شناسه نود ارسال نشده است.')

      const existing = await readNode(db, nodeId)
      if (!existing) return failure(404, 'NODE_NOT_FOUND', 'نود موردنظر پیدا نشد.')

      const nextEnabled = Number(existing.is_enabled) === 1 ? 0 : 1
      await db
        .prepare('UPDATE static_ip_nodes SET is_enabled = ?, updated_at = ? WHERE id = ?')
        .bind(nextEnabled, now, nodeId)
        .run()

      const updated = await readNode(db, nodeId)
      return jsonResponse({
        success: true,
        message: nextEnabled === 1 ? 'نود فعال شد و در مینی‌اپ نمایش داده می‌شود.' : 'نود غیرفعال شد و از مینی‌اپ مخفی شد.',
        data: updated ? toAdminNode(updated) : null,
      })
    }

    if (action !== 'save') {
      return failure(400, 'INVALID_ACTION', 'عملیات درخواستی پشتیبانی نمی‌شود.')
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const ip = typeof body.ip === 'string' ? body.ip.trim() : ''
    const country = typeof body.country === 'string' ? body.country.trim() : ''
    const countryCode =
      typeof body.countryCode === 'string' ? body.countryCode.trim().toUpperCase() : ''
    const price = intInRange(body.price, 0, MAX_PRICE)
    const durationDays = intInRange(body.durationDays, 1, 3650)
    const dataCapGb = intInRange(body.dataCapGb, 1, 100_000)
    const availability = typeof body.availability === 'string' ? body.availability : ''
    const sortOrder =
      body.sortOrder === undefined ? 100 : intInRange(body.sortOrder, 0, 100_000)
    const enabled = body.enabled === undefined ? true : body.enabled === true

    if (name.length < 2 || name.length > 80) {
      return failure(400, 'INVALID_NAME', 'نام نود باید بین ۲ تا ۸۰ نویسه باشد.')
    }
    if (!IPV4.test(ip)) {
      return failure(400, 'INVALID_IP', 'نشانی IPv4 نود معتبر نیست.')
    }
    if (country.length < 2 || country.length > 60) {
      return failure(400, 'INVALID_COUNTRY', 'نام کشور را کامل وارد کنید.')
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return failure(400, 'INVALID_COUNTRY_CODE', 'کد کشور باید دو حرف لاتین باشد (مثلاً DE).')
    }
    if (price === null) {
      return failure(400, 'INVALID_PRICE', 'قیمت نود معتبر نیست.')
    }
    if (durationDays === null) {
      return failure(400, 'INVALID_DURATION', 'مدت اعتبار باید بین ۱ تا ۳۶۵۰ روز باشد.')
    }
    if (dataCapGb === null) {
      return failure(400, 'INVALID_QUOTA', 'حجم سرویس معتبر نیست.')
    }
    if (!AVAILABILITY.has(availability)) {
      return failure(400, 'INVALID_AVAILABILITY', 'وضعیت نود باید «موجود»، «به‌زودی» یا «ناموجود» باشد.')
    }
    if (sortOrder === null) {
      return failure(400, 'INVALID_SORT', 'ترتیب نمایش معتبر نیست.')
    }

    const id = nodeId || `node_${crypto.randomUUID()}`
    const existing = nodeId ? await readNode(db, nodeId) : null
    if (nodeId && !existing) return failure(404, 'NODE_NOT_FOUND', 'نود موردنظر پیدا نشد.')

    if (existing) {
      await db
        .prepare(
          `UPDATE static_ip_nodes
           SET name = ?, ip = ?, country = ?, country_code = ?, price = ?,
               duration_days = ?, data_cap_gb = ?, availability = ?, is_enabled = ?,
               sort_order = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          name,
          ip,
          country,
          countryCode,
          price,
          durationDays,
          dataCapGb,
          availability,
          enabled ? 1 : 0,
          sortOrder,
          now,
          id,
        )
        .run()
    } else {
      await db
        .prepare(
          `INSERT INTO static_ip_nodes
             (id, name, ip, country, country_code, protocol, price, currency,
              duration_days, data_cap_gb, availability, is_enabled, sort_order,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'OpenVPN (UDP)', ?, 'IRT', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          name,
          ip,
          country,
          countryCode,
          price,
          durationDays,
          dataCapGb,
          availability,
          enabled ? 1 : 0,
          sortOrder,
          now,
          now,
        )
        .run()
    }

    const saved = await readNode(db, id)
    return jsonResponse({
      success: true,
      message: existing ? 'تغییرات نود ذخیره شد.' : 'نود جدید ساخته شد.',
      data: saved ? toAdminNode(saved) : null,
    })
  } catch (cause) {
    return internalFailure(cause, 'STATIC_IP_NODE_WRITE_FAILED')
  }
}
