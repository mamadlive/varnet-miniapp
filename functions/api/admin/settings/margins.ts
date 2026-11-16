/**
 * Cloudflare Pages Function — GET/POST /api/admin/settings/margins
 *
 * Persists the automatic margin ladder in D1 `settings` (`margin_tiers`).
 * `GET /api/products` exposes the same JSON in `meta.marginTiers`, so the
 * Mini App reprices from the database instead of the hardcoded fallback.
 */

import {
  authenticateAdmin,
  DEFAULT_MARGIN_TIERS,
  failure,
  jsonResponse,
  MARGIN_TIERS_KEY,
  parseMarginTiers,
  type MarginTier,
  type PagesContext,
} from '../_shared'

interface SettingsRow {
  value: string
}

async function readTiers(context: PagesContext): Promise<MarginTier[]> {
  const db = context.env.DB!
  const row = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(MARGIN_TIERS_KEY)
    .first<SettingsRow>()
    .catch(() => null)

  if (!row?.value) return DEFAULT_MARGIN_TIERS
  try {
    return parseMarginTiers(JSON.parse(row.value)) ?? DEFAULT_MARGIN_TIERS
  } catch {
    return DEFAULT_MARGIN_TIERS
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const auth = await authenticateAdmin(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  return jsonResponse({
    success: true,
    data: { tiers: await readTiers(context) },
  })
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const auth = await authenticateAdmin(context.request, context.env)
  if (!auth.ok) return failure(auth.status, auth.code, auth.message)

  const rawBody = await context.request.text()
  let body: { tiers?: unknown }
  try {
    const parsed: unknown = JSON.parse(rawBody)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return failure(400, 'MARGINS_BAD_REQUEST', 'ساختار درخواست نامعتبر است.')
    }
    body = parsed as { tiers?: unknown }
  } catch {
    return failure(400, 'MARGINS_BAD_REQUEST', 'ساختار درخواست نامعتبر است.')
  }

  const tiers = parseMarginTiers(body.tiers)
  if (!tiers) {
    return failure(
      400,
      'MARGINS_VALIDATION',
      'پلکان سود نامعتبر است؛ بازه‌ها باید صعودی و آخرین بازه «بیشتر از» باشد.',
    )
  }

  try {
    await context.env.DB!
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(MARGIN_TIERS_KEY, JSON.stringify(tiers), new Date().toISOString())
      .run()
  } catch {
    return failure(503, 'DB_UNAVAILABLE', 'ذخیره سود پلکانی انجام نشد. دوباره تلاش کنید.')
  }

  return jsonResponse({ success: true, data: { tiers } })
}
