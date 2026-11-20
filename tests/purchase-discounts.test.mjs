import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const originalFetch = globalThis.fetch
let purchase, sqlite, db, calls, beforeBatch, failFetch

class Statement {
  constructor(database, sql, values = []) { Object.assign(this, { database, sql, values }) }
  bind(...values) { return new Statement(this.database, this.sql, values) }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) } }
  async run() {
    const result = this.database.prepare(this.sql).run(...this.values)
    return { success: true, meta: { changes: Number(result.changes) } }
  }
}
class FakeD1 {
  prepare(sql) { return new Statement(sqlite, sql) }
  async batch(statements) {
    if (beforeBatch) { beforeBatch(); beforeBatch = undefined }
    sqlite.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) {
        const stmt = sqlite.prepare(statement.sql)
        if (/^\s*SELECT\b/i.test(statement.sql)) results.push({ success: true, results: stmt.all(...statement.values) })
        else results.push({ success: true, meta: { changes: Number(stmt.run(...statement.values).changes) } })
      }
      sqlite.exec('COMMIT')
      return results
    } catch (error) { sqlite.exec('ROLLBACK'); throw error }
  }
}

before(async () => {
  const result = await build({ entryPoints: [resolve(root, 'functions/api/purchase.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  purchase = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), payload: JSON.parse(options.body), inTransaction: sqlite.isTransaction })
    if (failFetch) throw new Error('Telegram unavailable')
    return Response.json({ ok: true })
  }
})
beforeEach(() => {
  sqlite?.close()
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(resolve(root, 'migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort()) sqlite.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'))
  sqlite.prepare('INSERT INTO users (id, telegram_id, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('usr_tg_101', 101, 100000, '2025', '2025')
  // 2 USDT × 25,000 Toman, with the configured 0% tier, is 50,000 Toman.
  // A deliberately different stored price verifies provider pricing is used.
  sqlite.prepare('INSERT INTO products (id, title, category, price, provider_price, provider_currency, stock, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('p1', 'Product', 'ai', 90000, 2, 'USDT', 10, '2025')
  sqlite.prepare('INSERT INTO sync_meta (key, value, updated_at) VALUES (?, ?, ?)').run('usdt_rate', '25000', '2025')
  sqlite.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify([{ upToUsd: 1, percent: 25 }, { upToUsd: null, percent: 0 }]), 'margin_tiers')
  db = new FakeD1()
  calls = []; beforeBatch = undefined; failFetch = false
})
after(() => { globalThis.fetch = originalFetch; sqlite?.close() })

function code(fields = {}) {
  const row = { id: 'd1', code: 'SAVE20', type: 'percent', value: 20, min_subtotal: null, max_discount: null, usage_limit: 1, used_count: 0, is_active: 1, expires_at: null, description: null, ...fields }
  sqlite.prepare('INSERT INTO discount_codes (id,code,type,value,min_subtotal,max_discount,usage_limit,used_count,is_active,expires_at,description) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row))
}
async function submit(input = {}) {
  const body = { productId: 'p1', title: 'Product', kind: 'account', subtotal: 50000, discount: 10000, total: 40000, couponCode: 'save20', currency: 'IRT', paymentMethod: 'wallet', ...input }
  const request = new Request('https://local.test/api/purchase', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const response = await purchase.onRequestPost({ request, env: { DB: db, PURCHASE_DEMO_TELEGRAM_ID: '101', TELEGRAM_BOT_TOKEN: 'test:token', ADMIN_TELEGRAM_IDS: '999' } })
  return { response, body: await response.json() }
}
function count(table) { return sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count }
function balance() { return sqlite.prepare('SELECT balance FROM users WHERE telegram_id = 101').get().balance }

test('server quote returns authoritative discounted price without creating an order', async () => {
  code()
  const { response, body } = await submit({ action: 'quote', paymentMethod: 'card', subtotal: 1, total: 1 })
  assert.equal(response.status, 200)
  assert.deepEqual(body.data, { title: 'Product', subtotal: 50000, discount: 10000, total: 40000, currency: 'IRT' })
  assert.equal(count('orders'), 0)
  assert.equal(count('payment_receipts'), 0)
  assert.equal(count('wallet_transactions'), 0)
  assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 0)
  assert.equal(balance(), 100000)
  assert.equal(calls.length, 0)
})

test('quotes reject invalid coupons and unavailable products without side effects', async () => {
  code({ used_count: 1 })
  const exhausted = await submit({ action: 'quote' })
  assert.equal(exhausted.response.status, 400)
  assert.equal(exhausted.body.code, 'COUPON_EXHAUSTED')
  const missing = await submit({ action: 'quote', couponCode: 'missing' })
  assert.equal(missing.response.status, 400)
  assert.equal(missing.body.code, 'COUPON_NOT_FOUND')
  sqlite.exec("INSERT INTO product_overrides (product_id, is_deleted) VALUES ('p1', 1)")
  const unavailable = await submit({ action: 'quote', couponCode: undefined })
  assert.equal(unavailable.response.status, 404)
  assert.equal(unavailable.body.code, 'PRODUCT_NOT_FOUND')
  assert.equal(count('orders'), 0)
  assert.equal(count('payment_receipts'), 0)
  assert.equal(count('wallet_transactions'), 0)
  assert.equal(balance(), 100000)
  assert.equal(calls.length, 0)
})

test('pricing database errors and invalid settings fail closed', async () => {
  code()
  sqlite.prepare('UPDATE settings SET value = ? WHERE key = ?').run('invalid JSON', 'margin_tiers')
  const malformed = await submit({ action: 'quote' })
  assert.equal(malformed.response.status, 503)
  assert.equal(malformed.body.code, 'DB_UNAVAILABLE')
  const originalDb = db
  db = {
    prepare(sql) {
      if (sql.includes('FROM settings')) throw new Error('simulated D1 failure')
      return originalDb.prepare(sql)
    },
    batch: (...args) => originalDb.batch(...args),
  }
  const unavailable = await submit({ action: 'quote' })
  assert.equal(unavailable.response.status, 503)
  assert.equal(unavailable.body.code, 'DB_UNAVAILABLE')
  assert.equal(count('orders'), 0)
  assert.equal(count('payment_receipts'), 0)
  assert.equal(count('wallet_transactions'), 0)
  assert.equal(balance(), 100000)
  assert.equal(calls.length, 0)
})

test('tampered account claims return authoritative totals without side effects', async () => {
  code()
  for (const claimed of [
    { subtotal: 1000, discount: 200, total: 800 },
    { subtotal: 50000, discount: 20000, total: 30000 },
    { subtotal: 50000, discount: 10000, total: 1 },
  ]) {
    const { response, body } = await submit({ ...claimed, title: 'Client title' })
    assert.equal(response.status, 409)
    assert.equal(body.code, 'PRICE_CHANGED')
    assert.deepEqual(body.data, { title: 'Product', subtotal: 50000, discount: 10000, total: 40000, currency: 'IRT' })
  }
  assert.equal(balance(), 100000)
  assert.equal(count('orders'), 0)
  assert.equal(count('wallet_transactions'), 0)
  assert.equal(count('payment_receipts'), 0)
  assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 0)
  assert.equal(calls.length, 0)
})

test('VPN plan price and name come from D1, not the request or node', async () => {
  // Seeded Frankfurt plan costs 120,000; its node costs 150,000.
  const input = { productId: 'plan_fra_10g_1m', kind: 'vpn', title: 'Client title', couponCode: undefined, subtotal: 50000, discount: 0, total: 50000 }
  const stale = await submit(input)
  assert.equal(stale.response.status, 409)
  assert.equal(stale.body.code, 'PRICE_CHANGED')
  assert.deepEqual(stale.body.data, { title: 'پلن ۱۰ گیگابایت · ۱ ماهه', subtotal: 120000, discount: 0, total: 120000, currency: 'IRT' })
  assert.equal(count('orders'), 0)
  assert.equal(count('wallet_transactions'), 0)
  assert.equal(count('payment_receipts'), 0)
  assert.equal(balance(), 100000)
  assert.equal(calls.length, 0)

  sqlite.exec('UPDATE users SET balance = 200000 WHERE telegram_id = 101')
  const { response, body } = await submit({ ...input, subtotal: 120000, total: 120000 })
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(body.data.order.title, 'پلن ۱۰ گیگابایت · ۱ ماهه')
  assert.equal(body.data.order.subtotal, 120000)
  assert.equal(body.data.order.total, 120000)
  assert.equal(balance(), 80000)
  const order = sqlite.prepare('SELECT product_id, product_title, kind, subtotal, total FROM orders').get()
  assert.deepEqual({ ...order }, { product_id: 'plan_fra_10g_1m', product_title: 'پلن ۱۰ گیگابایت · ۱ ماهه', kind: 'vpn', subtotal: 120000, total: 120000 })
})

test('deleted accounts and disabled, unavailable or missing VPN plans cannot be purchased', async () => {
  code()
  const scenarios = [
    { sql: "INSERT INTO product_overrides (product_id, is_deleted) VALUES ('p1', 1)", input: {}, status: 404, code: 'PRODUCT_NOT_FOUND' },
    { sql: "DELETE FROM products WHERE id = 'p1'", input: {}, status: 404, code: 'PRODUCT_NOT_FOUND' },
    { sql: "UPDATE static_ip_plans SET is_enabled = 0 WHERE id = 'plan_fra_10g_1m'", input: { productId: 'plan_fra_10g_1m', kind: 'vpn' }, status: 409, code: 'PRODUCT_UNAVAILABLE' },
    { sql: "UPDATE static_ip_plans SET is_enabled = 1 WHERE id = 'plan_fra_10g_1m'; UPDATE static_ip_nodes SET is_enabled = 0 WHERE id = 'node_fra'", input: { productId: 'plan_fra_10g_1m', kind: 'vpn' }, status: 409, code: 'PRODUCT_UNAVAILABLE' },
    { sql: "UPDATE static_ip_nodes SET is_enabled = 1, availability = 'sold_out' WHERE id = 'node_fra'", input: { productId: 'plan_fra_10g_1m', kind: 'vpn' }, status: 409, code: 'PRODUCT_UNAVAILABLE' },
    { sql: "DELETE FROM static_ip_plans WHERE id = 'plan_fra_10g_1m'", input: { productId: 'plan_fra_10g_1m', kind: 'vpn' }, status: 404, code: 'PRODUCT_NOT_FOUND' },
  ]
  for (const scenario of scenarios) {
    sqlite.exec(scenario.sql)
    const { response, body } = await submit(scenario.input)
    assert.equal(response.status, scenario.status, scenario.sql)
    assert.equal(body.code, scenario.code, scenario.sql)
    assert.equal(balance(), 100000)
    assert.equal(count('orders'), 0)
    assert.equal(count('wallet_transactions'), 0)
    assert.equal(count('payment_receipts'), 0)
    assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 0)
    assert.equal(calls.length, 0)
  }
})

test('wallet purchase redeems a valid coupon atomically and notifies after commit', async () => {
  code()
  const { response, body } = await submit()
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(balance(), 60000)
  assert.equal(count('orders'), 1)
  assert.equal(count('wallet_transactions'), 1)
  assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 1)
  assert.equal(body.data.balance, 60000)
  assert.deepEqual({ title: body.data.order.title, subtotal: body.data.order.subtotal, discount: body.data.order.discount, total: body.data.order.total }, { title: 'Product', subtotal: 50000, discount: 10000, total: 40000 })
  const order = sqlite.prepare('SELECT product_title, subtotal, discount, total, coupon_code FROM orders').get()
  assert.deepEqual({ ...order }, { product_title: 'Product', subtotal: 50000, discount: 10000, total: 40000, coupon_code: 'SAVE20' })
  assert.equal(body.data.notification.sent, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].inTransaction, false)
  assert.match(calls[0].payload.text, /Product/)
  assert.match(calls[0].payload.text, /کیف پول/)
  const next = await submit()
  assert.equal(next.response.status, 400)
  assert.equal(next.body.code, 'COUPON_EXHAUSTED')
  assert.equal(balance(), 60000)
  assert.equal(count('orders'), 1)
})

test('disabled, expired, exhausted, minimum, and tampered discounts do not create an order or debit', async () => {
  for (const { fields, status, errorCode } of [
    { fields: { is_active: 0 }, status: 400, errorCode: 'COUPON_INACTIVE' },
    { fields: { expires_at: '2020-01-01T00:00:00.000Z' }, status: 400, errorCode: 'COUPON_EXPIRED' },
    { fields: { used_count: 1 }, status: 400, errorCode: 'COUPON_EXHAUSTED' },
    { fields: { min_subtotal: 60000 }, status: 400, errorCode: 'COUPON_MIN_SUBTOTAL' },
    { fields: { value: 30 }, status: 409, errorCode: 'PRICE_CHANGED' },
  ]) {
    sqlite.exec('DELETE FROM discount_codes')
    code(fields)
    const { response, body } = await submit()
    assert.equal(response.status, status, JSON.stringify(fields))
    assert.equal(body.code, errorCode, JSON.stringify(fields))
    assert.equal(balance(), 100000)
    assert.equal(count('orders'), 0)
    assert.equal(count('wallet_transactions'), 0)
  }
  const missingCoupon = await submit({ couponCode: undefined })
  assert.equal(missingCoupon.response.status, 409)
  assert.equal(missingCoupon.body.code, 'PRICE_CHANGED')
  assert.deepEqual(missingCoupon.body.data, { title: 'Product', subtotal: 50000, discount: 0, total: 50000, currency: 'IRT' })
  assert.equal(calls.length, 0)
})

test('deactivation immediately before transaction and insufficient balance cannot consume capacity', async () => {
  code()
  beforeBatch = () => sqlite.exec('UPDATE discount_codes SET is_active = 0')
  assert.equal((await submit()).response.status, 409)
  sqlite.exec('UPDATE discount_codes SET is_active = 1; UPDATE users SET balance = 1000 WHERE telegram_id = 101')
  assert.equal((await submit()).response.status, 402)
  assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 0)
  assert.equal(count('orders'), 0)
  assert.equal(balance(), 1000)
})

test('expiry uses database time when the transaction starts', async () => {
  code({ expires_at: new Date(Date.now() - 60_000).toISOString() })
  const RealDate = globalThis.Date
  const staleTime = RealDate.now() - 120_000
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [staleTime])) }
    static now() { return staleTime }
  }
  try {
    assert.equal((await submit()).response.status, 409)
    assert.equal(count('orders'), 0)
    assert.equal(balance(), 100000)
    assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 0)
  } finally {
    globalThis.Date = RealDate
  }
})

test('full discount creates only a valid free wallet order', async () => {
  code({ value: 100 })
  const tampered = await submit({ subtotal: 0, discount: 0, total: 0, couponCode: undefined })
  assert.equal(tampered.response.status, 409)
  assert.equal(tampered.body.code, 'PRICE_CHANGED')
  assert.equal((await submit({ discount: 50000, total: 0, paymentMethod: 'card', receiptReference: '123456' })).response.status, 400)
  assert.equal(count('orders'), 0)
  const { response, body } = await submit({ discount: 50000, total: 0 })
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(body.data.order.status, 'paid')
  assert.equal(balance(), 100000)
  assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 1)
  assert.equal(count('payment_receipts'), 0)
})

test('card orders reserve coupon once without debiting and report notification failure', async () => {
  code({ type: 'fixed', value: 10000 })
  failFetch = true
  const { response, body } = await submit({ paymentMethod: 'card', receiptReference: '123456' })
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(body.data.notification.sent, false)
  assert.equal(body.data.order.status, 'pending')
  assert.equal(body.data.order.subtotal, 50000)
  assert.equal(body.data.order.discount, 10000)
  assert.equal(body.data.order.total, 40000)
  assert.equal(balance(), 100000)
  assert.equal(count('orders'), 1)
  const order = sqlite.prepare('SELECT subtotal, discount, total, coupon_code FROM orders').get()
  assert.deepEqual({ ...order }, { subtotal: 50000, discount: 10000, total: 40000, coupon_code: 'SAVE20' })
  assert.equal(count('payment_receipts'), 1)
  const receipt = sqlite.prepare('SELECT amount, reference, status FROM payment_receipts').get()
  assert.deepEqual({ ...receipt }, { amount: 40000, reference: '123456', status: 'PENDING' })
  assert.equal(count('wallet_transactions'), 0)
  assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 1)
  assert.match(calls[0].payload.text, /کارت به کارت/)
})
