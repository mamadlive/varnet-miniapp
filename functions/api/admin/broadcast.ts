import { authenticateAdmin, failure, jsonResponse, type PagesContext, type D1Database } from './_shared'

interface BroadcastRow {
  id: string; message: string; audience: string; target: string | null
  photo_url: string | null; button_label: string | null; button_url: string | null; created_at: string
}
interface Counts { total: number; pending: number; sending: number; sent: number; failed: number; unknown: number }
const BATCH_SIZE = 10

function validHttps(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password } catch { return false }
}
function validate(value: unknown): { value?: Omit<BroadcastRow, 'id' | 'created_at'>; error?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'ساختار درخواست نامعتبر است.' }
  const input = value as Record<string, unknown>
  const fields = ['message', 'audience', 'target', 'photoUrl', 'buttonLabel', 'buttonUrl']
  if (fields.some((key) => input[key] != null && typeof input[key] !== 'string')) return { error: 'مقادیر ورودی نامعتبر هستند.' }
  const message = ((input.message as string) || '').trim()
  const audience = input.audience as string
  const target = ((input.target as string) || '').trim()
  const photo = ((input.photoUrl as string) || '').trim()
  const label = ((input.buttonLabel as string) || '').trim()
  const url = ((input.buttonUrl as string) || '').trim()
  if (!message || message.length > (photo ? 1024 : 4096)) return { error: 'متن پیام خالی یا بیش از حد طولانی است.' }
  if (audience !== 'all_users' && audience !== 'channel') return { error: 'مخاطب نامعتبر است.' }
  if (audience === 'channel' && !(/^@[A-Za-z0-9_]{5,32}$/.test(target) || /^-?[1-9]\d{0,15}$/.test(target))) return { error: 'شناسه کانال یا گروه نامعتبر است.' }
  if (photo && (photo.length > 2048 || !validHttps(photo))) return { error: 'آدرس تصویر باید HTTPS معتبر باشد.' }
  if (Boolean(label) !== Boolean(url) || label.length > 64 || (url && (url.length > 2048 || !validHttps(url)))) return { error: 'عنوان و آدرس HTTPS معتبر دکمه را با هم وارد کنید.' }
  return { value: { message, audience, target: audience === 'channel' ? target : null, photo_url: photo || null, button_label: label || null, button_url: url || null } }
}
async function summary(db: D1Database, id: string) {
  const broadcast = await db.prepare('SELECT id, message, audience, target, photo_url, button_label, button_url, created_at FROM broadcasts WHERE id = ?').bind(id).first<BroadcastRow>()
  if (!broadcast) return null
  const counts = await db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(status = 'pending'), 0) AS pending,
    COALESCE(SUM(status = 'sending'), 0) AS sending, COALESCE(SUM(status = 'sent'), 0) AS sent,
    COALESCE(SUM(status = 'failed'), 0) AS failed, COALESCE(SUM(status = 'unknown'), 0) AS unknown
    FROM broadcast_recipients WHERE broadcast_id = ?`).bind(id).first<Counts>()
  return { ...broadcast, ...counts }
}
async function authorize(context: PagesContext) {
  const auth = await authenticateAdmin(context.request, context.env)
  return auth.ok ? auth : failure(auth.status, auth.code, auth.message)
}
export async function onRequestGet(context: PagesContext): Promise<Response> {
  const auth = await authorize(context)
  if (auth instanceof Response) return auth
  try {
    const db = context.env.DB!
    const rows = await db.prepare("SELECT id FROM broadcasts WHERE EXISTS (SELECT 1 FROM broadcast_recipients r WHERE r.broadcast_id = broadcasts.id AND r.status IN ('pending', 'sending', 'unknown')) OR id IN (SELECT id FROM broadcasts ORDER BY created_at DESC LIMIT 30) ORDER BY created_at DESC").all<{ id: string }>()
    return jsonResponse({ success: true, data: await Promise.all(rows.results.map((row) => summary(db, row.id))) })
  } catch { return failure(503, 'BROADCAST_DB_ERROR', 'دریافت تاریخچه ناموفق بود.') }
}
export async function onRequestPost(context: PagesContext): Promise<Response> {
  const auth = await authorize(context)
  if (auth instanceof Response) return auth
  let raw: unknown
  try { raw = await context.request.json() } catch { return failure(400, 'BROADCAST_VALIDATION', 'ساختار درخواست نامعتبر است.') }
  const parsed = validate(raw)
  if (!parsed.value) return failure(400, 'BROADCAST_VALIDATION', parsed.error!)
  const db = context.env.DB!
  const id = crypto.randomUUID()
  const input = parsed.value
  try {
    const insert = db.prepare(`INSERT INTO broadcasts (id, message, audience, target, photo_url, button_label, button_url, created_at, admin_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, input.message, input.audience, input.target, input.photo_url, input.button_label, input.button_url, new Date().toISOString(), auth.user.id)
    const recipients = input.audience === 'all_users'
      ? db.prepare(`INSERT INTO broadcast_recipients (broadcast_id, chat_id) SELECT ?, CAST(telegram_id AS TEXT) FROM users WHERE telegram_id IS NOT NULL`).bind(id)
      : db.prepare('INSERT INTO broadcast_recipients (broadcast_id, chat_id) VALUES (?, ?)').bind(id, input.target)
    await db.batch([insert, recipients])
  } catch { return failure(503, 'BROADCAST_DB_ERROR', 'ثبت پیام و مخاطبان ناموفق بود؛ ارسالی انجام نشد.') }
  try { return jsonResponse({ success: true, data: await summary(db, id) }) }
  catch { return failure(503, 'BROADCAST_DB_ERROR', 'پیام ثبت شد اما دریافت وضعیت ناموفق بود؛ تاریخچه را بررسی کنید.') }
}

// One authenticated request processes at most ten recipients. Claim each row before
// sending, so overlapping requests cannot duplicate deliveries. An interrupted claim
// remains visible as "sending" rather than being retried with an unknown outcome.
export async function onRequestPatch(context: PagesContext): Promise<Response> {
  const auth = await authorize(context)
  if (auth instanceof Response) return auth
  let raw: unknown
  try { raw = await context.request.json() } catch { return failure(400, 'BROADCAST_VALIDATION', 'درخواست نامعتبر است.') }
  const id = raw && typeof raw === 'object' && 'id' in raw ? (raw as { id?: unknown }).id : null
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return failure(400, 'BROADCAST_VALIDATION', 'شناسه ارسال نامعتبر است.')
  const db = context.env.DB!
  let lease = 0
  try {
    const broadcast = await db.prepare('SELECT * FROM broadcasts WHERE id = ?').bind(id).first<BroadcastRow>()
    if (!broadcast) return failure(404, 'BROADCAST_NOT_FOUND', 'پیام پیدا نشد.')
    if (!context.env.TELEGRAM_BOT_TOKEN?.trim()) return failure(503, 'BROADCAST_NOT_CONFIGURED', 'توکن ربات تنظیم نشده است.')
    const leaseUntil = Date.now() + 120000
    const lock = await db.prepare('UPDATE broadcasts SET processing_until = ? WHERE id = ? AND processing_until < ?').bind(leaseUntil, id, Date.now()).run()
    if (lock.meta?.changes !== 1) return failure(409, 'BROADCAST_BUSY', 'این پیام در حال پردازش است؛ بعداً ادامه دهید.')
    lease = leaseUntil
    const rows = await db.prepare("SELECT chat_id FROM broadcast_recipients WHERE broadcast_id = ? AND status = 'pending' ORDER BY chat_id LIMIT ?").bind(id, BATCH_SIZE).all<{ chat_id: string }>()
    for (const [index, row] of rows.results.entries()) {
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 100))
      const claim = await db.prepare("UPDATE broadcast_recipients SET status = 'sending' WHERE broadcast_id = ? AND chat_id = ? AND status = 'pending'").bind(id, row.chat_id).run()
      if (claim.meta?.changes !== 1) continue
      let status = 'unknown'
      let error: string | null = null
      try {
        const payload: Record<string, unknown> = { chat_id: row.chat_id }
        const method = broadcast.photo_url ? 'sendPhoto' : 'sendMessage'
        if (broadcast.photo_url) { payload.photo = broadcast.photo_url; payload.caption = broadcast.message } else payload.text = broadcast.message
        if (broadcast.button_url) payload.reply_markup = { inline_keyboard: [[{ text: broadcast.button_label, url: broadcast.button_url }]] }
        const response = await fetch(`https://api.telegram.org/bot${context.env.TELEGRAM_BOT_TOKEN!.trim()}/${method}`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
        })
        const result = await response.json() as { ok?: boolean; description?: string; error_code?: number; parameters?: { retry_after?: number } }
        if (response.ok && result.ok === true) status = 'sent'
        else if (result.ok === false && (result.error_code === 429 || response.status === 429)) {
          await db.prepare("UPDATE broadcast_recipients SET status = 'pending', error = ? WHERE broadcast_id = ? AND chat_id = ? AND status = 'sending'").bind('Telegram rate limit', id, row.chat_id).run()
          return jsonResponse({ success: true, data: await summary(db, id), retryAfter: Math.min(Math.max(Number(result.parameters?.retry_after) || 1, 1), 300) })
        } else if (result.ok === false && result.error_code && result.error_code >= 400 && result.error_code < 500) {
          status = 'failed'; error = String(result.description || 'Telegram rejected delivery').slice(0, 300)
        } else error = 'Telegram response inconclusive'
      } catch { error = 'Network error; delivery outcome unknown' }
      await db.prepare('UPDATE broadcast_recipients SET status = ?, error = ? WHERE broadcast_id = ? AND chat_id = ? AND status = ?').bind(status, error, id, row.chat_id, 'sending').run()
    }
    return jsonResponse({ success: true, data: await summary(db, id) })
  } catch { return failure(503, 'BROADCAST_PROCESS_ERROR', 'پردازش متوقف شد؛ تاریخچه را بررسی کنید. وضعیت ارسال‌های در حال پردازش ممکن است نامشخص باشد.') }
  finally {
    if (lease) {
      try { await db.prepare('UPDATE broadcasts SET processing_until = 0 WHERE id = ? AND processing_until = ?').bind(id, lease).run() } catch { /* Lease expires if D1 is unavailable. */ }
    }
  }
}
