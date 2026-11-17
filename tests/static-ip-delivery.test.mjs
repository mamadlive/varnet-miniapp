// Run: node --test tests/static-ip-delivery.test.mjs (Node 22.5+ with node:sqlite).
// Bundles only in memory; all SQL and Telegram traffic stay local.
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOT = '123456:local-test-secret-token'
const ADMIN = 999
const OWNER = 101
const OTHER = 202
const NOTE = 'client\nremote vpn.example.test 1194\n<auth-user-pass>\nuser\nprivate-password\n</auth-user-pass>\n'
let download, resend, action, sqlite, db, requests, telegramReply, onTelegramRequest
const originalFetch = globalThis.fetch

class FakeStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values }
  bind(...values) { return new FakeStatement(this.database, this.sql, values) }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) } }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values)
    return { success: true, meta: { changes: Number(result.changes) } }
  }
}
class FakeD1 {
  constructor(database) { this.database = database }
  prepare(sql) { return new FakeStatement(this.database, sql) }
  async batch(statements) {
    this.database.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      this.database.exec('COMMIT')
      return results
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}
async function loadHandler(path) {
  const result = await build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
}
function env(user = OWNER) {
  return { DB: db, TELEGRAM_BOT_TOKEN: BOT, PURCHASE_DEMO_TELEGRAM_ID: String(user), ADMIN_TELEGRAM_IDS: String(ADMIN) }
}
function initData(id) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Test' }) })
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const key = createHmac('sha256', 'WebAppData').update(BOT).digest()
  params.set('hash', createHmac('sha256', key).update(check).digest('hex'))
  return params.toString()
}
function request(path, body, headers = {}) {
  return new Request(`https://local.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
}
async function postDownload(orderId, user = OWNER, headers = {}) {
  return download.onRequestPost({ request: request('/api/static-ip/download', { orderId }, headers), env: env(user) })
}
async function getDownload(orderId, token, environment = env()) {
  const query = new URLSearchParams({ orderId, token })
  return download.onRequestGet({ request: new Request(`https://local.test/api/static-ip/download?${query}`), env: environment })
}
async function postResend(orderId, user = OWNER) {
  return resend.onRequestPost({ request: request('/api/static-ip/resend', { orderId }), env: env(user) })
}
async function complete(orderId, deliveryNote) {
  return action.onRequestPost({ request: request('/api/admin/orders/action', { orderId, action: 'complete', ...(deliveryNote === undefined ? {} : { deliveryNote }) }, { 'X-Telegram-Init-Data': initData(ADMIN) }), env: env() })
}
function signedToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', BOT).update(`varnet-static-ip-download-v1.${encoded}`).digest('base64url')
  return `${encoded}.${signature}`
}
async function assertError(response, status, code) {
  assert.equal(response.status, status)
  const text = await response.text()
  assert.equal(JSON.parse(text).code, code)
  assert.ok(!text.includes(BOT), 'response must not expose bot token')
  assert.ok(!text.includes(NOTE), 'response must not expose config')
  assert.ok(!text.includes('private-password'), 'response must not expose config password')
}
function addOrder(id, { user = OWNER, kind = 'vpn', status = 'completed', note = NOTE, product = 'plan_fra_10g_1m' } = {}) {
  sqlite.prepare(`INSERT INTO orders (id,user_id,product_id,product_title,kind,subtotal,total,status,created_at,payment_method,delivery_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, `usr_tg_${user}`, product, 'Static IP', kind, 100, 100, status, '2025-01-01', 'card', note)
}
function addReceipt(orderId) {
  sqlite.prepare(`INSERT INTO payment_receipts (id,user_id,telegram_id,purpose,order_id,amount,reference,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(`receipt_${orderId}`, `usr_tg_${OWNER}`, OWNER, 'product_purchase', orderId, 100, 'ref', 'PENDING', '2025-01-01')
}
async function checkDocument(call, chatId, content) {
  assert.equal(call.url, `https://api.telegram.org/bot${BOT}/sendDocument`)
  assert.equal(call.method, 'POST')
  assert.ok(call.body instanceof FormData)
  assert.equal(call.body.get('chat_id'), String(chatId))
  const document = call.body.get('document')
  assert.ok(document instanceof Blob)
  assert.equal(document.name, 'varnet-config.ovpn')
  assert.equal(document.type, 'application/x-openvpn-profile')
  assert.equal(await document.text(), content)
  // Check actual multipart serialization, not just the FormData API.
  const multipart = new Request(call.url, { method: 'POST', body: call.body })
  assert.match(multipart.headers.get('content-type'), /^multipart\/form-data; boundary=/)
  const parsed = await multipart.formData()
  assert.equal(parsed.get('chat_id'), String(chatId))
  assert.equal(parsed.get('document').name, 'varnet-config.ovpn')
  assert.equal(await parsed.get('document').text(), content)
}

before(async () => {
  ;[download, resend, action] = await Promise.all([
    loadHandler('functions/api/static-ip/download.ts'),
    loadHandler('functions/api/static-ip/resend.ts'),
    loadHandler('functions/api/admin/orders/action.ts'),
  ])
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), ...options })
    if (onTelegramRequest) await onTelegramRequest()
    if (telegramReply instanceof Error) throw telegramReply
    if (telegramReply instanceof Response) return telegramReply.clone()
    return new Response(JSON.stringify(telegramReply.body), { status: telegramReply.status, headers: { 'content-type': 'application/json' } })
  }
})
after(() => { globalThis.fetch = originalFetch; sqlite?.close() })
beforeEach(() => {
  sqlite?.close()
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(resolve(root, 'migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'))
  }
  db = new FakeD1(sqlite)
  for (const id of [OWNER, OTHER, ADMIN]) sqlite.prepare('INSERT INTO users (id,telegram_id,created_at,updated_at) VALUES (?,?,?,?)').run(`usr_tg_${id}`, id, '2025-01-01', '2025-01-01')
  requests = []
  onTelegramRequest = undefined
  telegramReply = { status: 200, body: { ok: true, result: { message_id: 1 } } }
})

test('download mints an order-bound short-lived token and serves the exact profile securely', async () => {
  addOrder('owned')
  const response = await postDownload('owned', OTHER, { 'X-Telegram-Init-Data': initData(OWNER) })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  const { data: { token } } = await response.json()
  const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
  assert.equal(payload.sub, OWNER)
  assert.equal(payload.orderId, 'owned')
  assert.ok(payload.exp > Math.floor(Date.now() / 1000) && payload.exp <= Math.floor(Date.now() / 1000) + 120)
  const fetched = await getDownload('owned', token)
  assert.equal(fetched.status, 200)
  assert.equal(fetched.headers.get('content-type'), 'application/x-openvpn-profile')
  assert.equal(fetched.headers.get('content-disposition'), 'attachment; filename="varnet-config.ovpn"')
  assert.equal(fetched.headers.get('cache-control'), 'no-store')
  assert.equal(fetched.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(fetched.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(await fetched.text(), NOTE)
  assert.equal(requests.length, 0)
})

test('download and resend deny cross-user, pending, wrong-kind, missing and empty configs', async () => {
  addOrder('owned')
  addOrder('pending', { status: 'pending' })
  addOrder('account', { kind: 'account' })
  addOrder('empty', { note: '   ' })
  for (const [id, user] of [['owned', OTHER], ['pending', OWNER], ['account', OWNER], ['missing', OWNER], ['empty', OWNER]]) {
    await assertError(await postDownload(id, user), 404, 'CONFIG_NOT_FOUND')
    await assertError(await postResend(id, user), 404, 'CONFIG_NOT_FOUND')
    await assertError(await getDownload(id, signedToken({ sub: user, orderId: id, exp: Math.floor(Date.now() / 1000) + 60 })), 404, 'CONFIG_NOT_FOUND')
  }
  assert.equal(requests.length, 0)
})

test('issuance and resend require authentication outside local demo mode', async () => {
  addOrder('owned')
  const environment = { DB: db, TELEGRAM_BOT_TOKEN: BOT }
  await assertError(await download.onRequestPost({ request: request('/api/static-ip/download', { orderId: 'owned' }), env: environment }), 401, 'TELEGRAM_AUTH_REQUIRED')
  await assertError(await resend.onRequestPost({ request: request('/api/static-ip/resend', { orderId: 'owned' }), env: environment }), 401, 'TELEGRAM_AUTH_REQUIRED')
  await assertError(await download.onRequestPost({ request: request('/api/static-ip/download', { orderId: 'owned' }, { 'X-Telegram-Init-Data': 'invalid' }), env: environment }), 401, 'TELEGRAM_AUTH_INVALID')
  assert.equal(requests.length, 0)
})

test('download rejects malformed, tampered, expired, overlong-lived and order-mismatched tokens', async () => {
  addOrder('owned')
  addOrder('another')
  const { data: { token } } = await (await postDownload('owned')).json()
  const now = Math.floor(Date.now() / 1000)
  const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
  for (const bad of ['garbage', 'a.b.c', 'x'.repeat(2049), tampered, signedToken({ sub: OWNER, orderId: 'owned', exp: now - 1 }), signedToken({ sub: OWNER, orderId: 'owned', exp: now + 121 })]) {
    await assertError(await getDownload('owned', bad), 401, 'DOWNLOAD_TOKEN_INVALID')
  }
  await assertError(await getDownload('another', token), 401, 'DOWNLOAD_TOKEN_INVALID')
  await assertError(await getDownload('owned', ''), 400, 'INVALID_REQUEST')
  assert.equal(requests.length, 0)
})

test('resend sends multipart profile to owner and handles Telegram errors without leaking secrets', async () => {
  addOrder('owned')
  const success = await postResend('owned')
  assert.equal(success.status, 200)
  assert.equal((await success.json()).success, true)
  assert.equal(requests.length, 1)
  await checkDocument(requests[0], OWNER, NOTE)
  telegramReply = { status: 400, body: { ok: false, error_code: 400, description: `Bad request for ${BOT}` } }
  const failure = await postResend('owned')
  assert.equal(failure.status, 502)
  const error = await failure.text()
  assert.equal(JSON.parse(error).code, 'TELEGRAM_400')
  assert.ok(error.includes('[redacted]'))
  assert.ok(!error.includes(BOT) && !error.includes('private-password'))
  telegramReply = new Error(`network failure ${BOT} private-password`)
  await assertError(await postResend('owned'), 502, 'TELEGRAM_UNAVAILABLE')
  telegramReply = new Response('gateway error', { status: 503 })
  await assertError(await postResend('owned'), 502, 'TELEGRAM_503')
  assert.equal(requests.length, 4)
})

test('admin completion commits generated profile and receipt before sending, and customer can download it', async () => {
  addOrder('generated', { status: 'pending', note: null })
  addReceipt('generated')
  const result = await complete('generated')
  assert.equal(result.status, 200)
  const body = await result.json()
  assert.equal(body.data.status, 'completed')
  assert.deepEqual(body.data.telegramDelivery, { sent: true })
  const profile = body.data.deliveryNote
  assert.match(profile, /remote 45\.83\.104\.21 1194/)
  assert.match(profile, /<auth-user-pass>\nvpn_generated\n[a-f0-9]{32}\n<\/auth-user-pass>/)
  const order = sqlite.prepare('SELECT status, delivery_note FROM orders WHERE id = ?').get('generated')
  assert.equal(order.status, 'completed')
  assert.equal(order.delivery_note, profile)
  const receipt = sqlite.prepare('SELECT status, reviewed_at FROM payment_receipts WHERE order_id = ?').get('generated')
  assert.equal(receipt.status, 'APPROVED')
  assert.ok(receipt.reviewed_at)
  assert.equal(requests.length, 1)
  await checkDocument(requests[0], OWNER, profile)
  const { data: { token } } = await (await postDownload('generated')).json()
  assert.equal(await (await getDownload('generated', token)).text(), profile)
  await assertError(await complete('generated'), 409, 'ORDER_NOT_PAYABLE')
  assert.equal(requests.length, 1)
})

test('admin Telegram failure happens after commit; retry does not send twice and manual note remains downloadable', async () => {
  addOrder('manual', { status: 'paid', note: null })
  addReceipt('manual')
  telegramReply = { status: 403, body: { ok: false, error_code: 403, description: `Forbidden ${BOT}` } }
  let committedAtSend = false
  onTelegramRequest = () => {
    committedAtSend = !sqlite.isTransaction &&
      sqlite.prepare('SELECT status FROM orders WHERE id = ?').get('manual').status === 'completed' &&
      sqlite.prepare('SELECT status FROM payment_receipts WHERE order_id = ?').get('manual').status === 'APPROVED'
  }
  const result = await complete('manual', NOTE)
  assert.equal(committedAtSend, true)
  assert.equal(result.status, 200)
  const body = await result.json()
  assert.equal(body.data.telegramDelivery.sent, false)
  assert.equal(body.data.telegramDelivery.code, 'TELEGRAM_403')
  assert.ok(!body.data.telegramDelivery.message.includes(BOT))
  assert.equal(body.data.deliveryNote, NOTE.trim())
  const order = sqlite.prepare('SELECT status,delivery_note FROM orders WHERE id = ?').get('manual')
  assert.equal(order.status, 'completed')
  assert.equal(order.delivery_note, NOTE.trim())
  assert.equal(sqlite.prepare('SELECT status FROM payment_receipts WHERE order_id = ?').get('manual').status, 'APPROVED')
  assert.equal(requests.length, 1)
  await checkDocument(requests[0], OWNER, NOTE.trim())
  telegramReply = { status: 200, body: { ok: true } }
  await assertError(await complete('manual', NOTE), 409, 'ORDER_NOT_PAYABLE')
  assert.equal(requests.length, 1)
  const { data: { token } } = await (await postDownload('manual')).json()
  assert.equal(await (await getDownload('manual', token)).text(), NOTE.trim())
})
