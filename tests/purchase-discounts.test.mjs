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

test('wallet purchase redeems a valid coupon atomically and notifies after commit', async () => {
  code()
  const { response, body } = await submit()
  assert.equal(response.status, 200, JSON.stringify(body))
  assert.equal(balance(), 60000)
  assert.equal(count('orders'), 1)
  assert.equal(count('wallet_transactions'), 1)
  assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 1)
  assert.equal(body.data.balance, 60000)
  assert.equal(body.data.notification.sent, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].inTransaction, false)
  assert.match(calls[0].payload.text, /Product/)
  assert.match(calls[0].payload.text, /کیف پول/)
  const next = await submit()
  assert.equal(next.response.status, 409)
  assert.equal(balance(), 60000)
  assert.equal(count('orders'), 1)
})

test('disabled, expired, exhausted, minimum, and tampered discounts do not create an order or debit', async () => {
  for (const fields of [
    { is_active: 0 }, { expires_at: '2020-01-01T00:00:00.000Z' },
    { used_count: 1 }, { min_subtotal: 60000 }, { value: 30 },
  ]) {
    sqlite.exec('DELETE FROM discount_codes')
    code(fields)
    const { response } = await submit()
    assert.equal(response.status, 409, JSON.stringify(fields))
    assert.equal(balance(), 100000)
    assert.equal(count('orders'), 0)
    assert.equal(count('wallet_transactions'), 0)
  }
  assert.equal((await submit({ couponCode: undefined })).response.status, 400)
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
  assert.equal((await submit({ subtotal: 0, discount: 0, total: 0, couponCode: undefined })).response.status, 400)
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
  assert.equal(balance(), 100000)
  assert.equal(count('payment_receipts'), 1)
  assert.equal(count('wallet_transactions'), 0)
  assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes').get().used_count, 1)
  assert.match(calls[0].payload.text, /کارت به کارت/)
})
