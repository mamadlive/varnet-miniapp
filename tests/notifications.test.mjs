// Run locally: node --test tests/notifications.test.mjs. Fetch is always mocked.
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOT = 'test:secret-token'
const ADMIN = 999, ROLE_ADMIN = 998, BUYER = 101
let receipt, orders, review, helper, sqlite, db, calls, reply, onSend, beforeBatch
const originalFetch = globalThis.fetch
const originalWarn = console.warn
let logs

class Statement {
  constructor(database, sql, values = []) { Object.assign(this, { database, sql, values }) }
  bind(...values) { return new Statement(this.database, this.sql, values) }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) } }
  async run() { const result = this.database.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } } }
}
class FakeD1 {
  constructor(database) { this.database = database }
  prepare(sql) { return new Statement(this.database, sql) }
  async batch(statements) {
    if (beforeBatch) { beforeBatch(); beforeBatch = undefined }
    this.database.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.run())
      this.database.exec('COMMIT')
      return results
    } catch (error) { this.database.exec('ROLLBACK'); throw error }
  }
}
async function load(path) {
  const result = await build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
}
function initData(id) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Test' }) })
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const key = createHmac('sha256', 'WebAppData').update(BOT).digest()
  params.set('hash', createHmac('sha256', key).update(check).digest('hex'))
  return params.toString()
}
function env() { return { DB: db, TELEGRAM_BOT_TOKEN: BOT, ADMIN_TELEGRAM_IDS: `${ADMIN},${ROLE_ADMIN}`, PURCHASE_DEMO_TELEGRAM_ID: String(BUYER) } }
function req(body, admin = false) {
  return new Request('https://local.test/api', { method: 'POST', headers: { 'content-type': 'application/json', ...(admin ? { 'X-Telegram-Init-Data': initData(ADMIN) } : {}) }, body: JSON.stringify(body) })
}
function addOrder(id, status, kind = 'account') {
  sqlite.prepare('INSERT INTO orders (id,user_id,product_id,product_title,kind,subtotal,total,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, `usr_tg_${BUYER}`, 'p1', 'Test product', kind, 25000, 25000, status, '2025-01-01')
}
function addReceipt(id, purpose = 'wallet_topup', orderId = null) {
  sqlite.prepare('INSERT INTO payment_receipts (id,user_id,telegram_id,purpose,order_id,amount,reference,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, `usr_tg_${BUYER}`, BUYER, purpose, orderId, 20000, 'reference', 'PENDING', '2025-01-01')
}
function text(call) { return JSON.parse(call.body).text }
before(async () => {
  ;[receipt, orders, review, helper] = await Promise.all([
    load('functions/api/wallet/receipt.ts'), load('functions/api/admin/orders/action.ts'),
    load('functions/api/admin/receipts/action.ts'), load('functions/api/_lib/notifications.ts'),
  ])
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), ...options })
    if (onSend) await onSend()
    if (reply instanceof Error) throw reply
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } })
  }
  console.warn = (...args) => logs.push(args.join(' '))
})
after(() => { globalThis.fetch = originalFetch; console.warn = originalWarn; sqlite?.close() })
beforeEach(() => {
  sqlite?.close()
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(resolve(root, 'migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort()) sqlite.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'))
  db = new FakeD1(sqlite)
  for (const id of [BUYER, ADMIN, ROLE_ADMIN]) sqlite.prepare('INSERT INTO users (id,telegram_id,created_at,updated_at,role) VALUES (?,?,?,?,?)').run(`usr_tg_${id}`, id, '2025', '2025', id === ROLE_ADMIN ? 'admin' : 'user')
  calls = []; logs = []; onSend = undefined; beforeBatch = undefined; reply = { status: 200, body: { ok: true } }
})

test('receipt commits before notifying deduplicated configured admins', async () => {
  onSend = () => { assert.equal(sqlite.isTransaction, false); assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_receipts').get().n, 1) }
  const response = await receipt.onRequestPost({ request: req({ amount: 20000, reference: 'ref-123' }), env: env() })
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.deepEqual(body.data.notification, { sent: true, attempted: 2, delivered: 2 })
  assert.deepEqual(calls.map(call => JSON.parse(call.body).chat_id).sort(), [ROLE_ADMIN, ADMIN])
  assert.ok(calls.every(call => text(call).includes('ref-123') && text(call).includes(body.data.receiptId)))
})

test('receipt remains successful on Telegram failure and logs no secret', async () => {
  reply = new Error(`network ${BOT}`)
  const response = await receipt.onRequestPost({ request: req({ amount: 20000, reference: 'ref-123' }), env: env() })
  const raw = await response.text(), body = JSON.parse(raw)
  assert.equal(response.status, 200)
  assert.equal(body.data.notification.sent, false)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM payment_receipts').get().n, 1)
  assert.ok(!raw.includes(BOT) && !logs.join(' ').includes(BOT))
})

test('order completion notifies buyer after commit, without exposing delivery credentials', async () => {
  addOrder('complete', 'paid')
  onSend = () => { assert.equal(sqlite.isTransaction, false); assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id = ?').get('complete').status, 'completed') }
  const response = await orders.onRequestPost({ request: req({ orderId: 'complete', action: 'complete', deliveryNote: 'private-password' }, true), env: env() })
  const body = await response.json()
  assert.equal(body.data.notification.sent, true)
  assert.equal(calls.length, 1)
  assert.equal(JSON.parse(calls[0].body).chat_id, BUYER)
  assert.ok(text(calls[0]).includes('complete') && !text(calls[0]).includes('private-password'))
})

test('rejection accurately distinguishes unpaid and refunded and retries do not notify or credit twice', async () => {
  for (const [id, status] of [['unpaid', 'pending'], ['paid', 'paid']]) {
    addOrder(id, status)
    const post = () => orders.onRequestPost({ request: req({ orderId: id, action: 'reject', rejectReason: 'not available' }, true), env: env() })
    onSend = () => { assert.equal(sqlite.isTransaction, false); assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id = ?').get(id).status, 'refunded') }
    const response = await post(), body = await response.json()
    assert.equal(body.data.refunded, status === 'paid' ? 25000 : 0)
    assert.equal(body.data.notification.sent, true)
    assert.match(text(calls.at(-1)), status === 'paid' ? /25,000 تومان به کیف پول شما بازگردانده شد/ : /این سفارش پرداختی نداشت/)
    assert.equal((await post()).status, 409)
  }
  assert.equal(calls.length, 2)
  assert.equal(sqlite.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(BUYER).balance, 25000)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE type = 'refund'").get().n, 1)
})

test('rejection does not refund or notify if the order changes before the batch', async () => {
  for (const [id, status, change] of [
    ['became-completed', 'paid', "status = 'completed'"],
    ['became-paid', 'pending', "status = 'paid'"],
    ['became-provisioning', 'paid', "status = 'provisioning'"],
    ['changed-total', 'paid', 'total = 30000'],
  ]) {
    addOrder(id, status)
    beforeBatch = () => sqlite.prepare(`UPDATE orders SET ${change} WHERE id = ?`).run(id)
    const response = await orders.onRequestPost({ request: req({ orderId: id, action: 'reject', rejectReason: 'not available' }, true), env: env() })
    const body = await response.json()
    assert.equal(response.status, 409, id)
    assert.equal(body.code, 'ORDER_STATE_CHANGED', id)
    assert.equal(sqlite.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(BUYER).balance, 0, id)
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE type = 'refund'").get().n, 0, id)
    assert.equal(calls.length, 0, id)
  }
})

test('a failed rejection batch rolls back the refund and does not notify', async () => {
  addOrder('rollback', 'paid')
  sqlite.exec("CREATE TRIGGER fail_order_rejection BEFORE UPDATE ON orders WHEN NEW.status = 'refunded' BEGIN SELECT RAISE(ABORT, 'simulated failure'); END")
  const response = await orders.onRequestPost({ request: req({ orderId: 'rollback', action: 'reject', rejectReason: 'not available' }, true), env: env() })
  assert.equal(response.status, 500)
  assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id = ?').get('rollback').status, 'paid')
  assert.equal(sqlite.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(BUYER).balance, 0)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE type = 'refund'").get().n, 0)
  assert.equal(calls.length, 0)
})

test('approved product receipt notifies buyer after commit without retrying a failed send', async () => {
  addOrder('card-order', 'pending')
  addReceipt('product-receipt', 'product_purchase', 'card-order')
  reply = { status: 403, body: { ok: false } }
  onSend = () => {
    assert.equal(sqlite.isTransaction, false)
    assert.equal(sqlite.prepare('SELECT status FROM orders WHERE id = ?').get('card-order').status, 'paid')
    assert.equal(sqlite.prepare('SELECT status FROM payment_receipts WHERE id = ?').get('product-receipt').status, 'APPROVED')
  }
  const post = () => review.onRequestPost({ request: req({ receiptId: 'product-receipt', action: 'approve' }, true), env: env() })
  const response = await post(), body = await response.json()
  assert.equal(response.status, 200)
  assert.equal(body.data.notification.code, 'TELEGRAM_REJECTED')
  assert.equal(JSON.parse(calls[0].body).chat_id, BUYER)
  assert.match(text(calls[0]), /در انتظار تکمیل/)
  assert.equal((await post()).status, 409)
  assert.equal(calls.length, 1)
})

test('approved topup commits credit before notification; failed send cannot cause a second deposit', async () => {
  addReceipt('topup')
  reply = { status: 403, body: { ok: false, description: `forbidden ${BOT}` } }
  onSend = () => { assert.equal(sqlite.isTransaction, false); assert.equal(sqlite.prepare('SELECT balance FROM users WHERE telegram_id = ?').get(BUYER).balance, 20000) }
  const post = () => review.onRequestPost({ request: req({ receiptId: 'topup', action: 'approve' }, true), env: env() })
  const response = await post(), raw = await response.text(), body = JSON.parse(raw)
  assert.equal(response.status, 200)
  assert.equal(body.data.notification.code, 'TELEGRAM_REJECTED')
  assert.match(text(calls[0]), /20,000/)
  assert.equal((await post()).status, 409)
  assert.equal(calls.length, 1)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM wallet_transactions WHERE type = 'deposit'").get().n, 1)
  assert.ok(!raw.includes(BOT) && !logs.join(' ').includes(BOT))
})

test('purchase helper reports partial delivery and no admins without throwing', async () => {
  const purchase = { orderId: 'o1', userId: 'usr_tg_101', userName: 'Buyer', productTitle: 'Product', total: 20000, paymentMethod: 'wallet' }
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), ...options })
    const ok = JSON.parse(options.body).chat_id === ADMIN
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 403 })
  }
  const result = await helper.notifyPurchaseAdmins(env(), purchase)
  assert.equal(result.sent, false)
  assert.equal(result.attempted, 2)
  assert.equal(result.delivered, 1)
  assert.match(text(calls[0]), /o1/)
  const before = calls.length
  const none = await helper.notifyPurchaseAdmins({ TELEGRAM_BOT_TOKEN: BOT }, purchase)
  assert.equal(none.code, 'TELEGRAM_NO_ADMINS')
  assert.equal(calls.length, before)
})
