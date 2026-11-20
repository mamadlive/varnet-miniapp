// Run with node --test tests/admin-stats.test.mjs. All database work is in memory.
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOT = '123456:local-test-secret-token'
let handler, sqlite, db

class Statement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values }
  bind(...values) { return new Statement(this.database, this.sql, values) }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) } }
}
function initData(id) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Test' }) })
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const key = createHmac('sha256', 'WebAppData').update(BOT).digest()
  params.set('hash', createHmac('sha256', key).update(check).digest('hex'))
  return params.toString()
}
function call(id = 999, environment = {}) {
  return handler.onRequestGet({
    request: new Request('https://local.test/api/admin/stats', { headers: id === null ? {} : { 'X-Telegram-Init-Data': initData(id) } }),
    env: { DB: db, TELEGRAM_BOT_TOKEN: BOT, ADMIN_TELEGRAM_IDS: '999', ...environment },
  })
}
function addOrder(id, status, total, date) {
  sqlite.prepare('INSERT INTO orders (id,user_id,product_id,product_title,subtotal,total,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, 'user', 'product', 'Product', total, total, status, date)
}
function addReceipt(id, status) {
  sqlite.prepare('INSERT INTO payment_receipts (id,user_id,telegram_id,purpose,amount,reference,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, 'user', 1, 'wallet_topup', 9999, id, status, '2025-01-01')
}
before(async () => {
  const result = await build({ entryPoints: [resolve(root, 'functions/api/admin/stats.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  handler = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
})
beforeEach(() => {
  sqlite?.close()
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(resolve(root, 'migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'))
  }
  db = { prepare: sql => new Statement(sqlite, sql) }
})
after(() => sqlite?.close())

test('empty database returns zero counts and an empty chart', async () => {
  const response = await call()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual((await response.json()).data, { totalUsers: 0, totalSales: 0, pendingOrders: 0, pendingReceipts: 0, revenue: [] })
})

test('counts all users, only paid and completed sales, pending orders and PENDING receipts', async () => {
  sqlite.prepare('INSERT INTO users (id,telegram_id,created_at,updated_at) VALUES (?,?,?,?)').run('user', 1, '2025-01-01', '2025-01-01')
  sqlite.prepare('INSERT INTO users (id,telegram_id,created_at,updated_at) VALUES (?,?,?,?)').run('user2', 2, '2025-01-01', '2025-01-01')
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const old = new Date(Date.now() - 8 * 86400000).toISOString().slice(0, 10)
  addOrder('paid', 'paid', 100, today)
  addOrder('completed', 'completed', 200, yesterday)
  addOrder('old', 'completed', 400, old)
  addOrder('pending', 'pending', 800, today)
  addOrder('refunded', 'refunded', 1600, today)
  addOrder('failed', 'failed', 3200, today)
  addReceipt('pending1', 'PENDING')
  addReceipt('pending2', 'PENDING')
  addReceipt('approved', 'APPROVED')
  addReceipt('rejected', 'REJECTED')
  const response = await call()
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data, {
    totalUsers: 2, totalSales: 700, pendingOrders: 1, pendingReceipts: 2,
    revenue: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(Date.parse(`${today}T00:00:00Z`) - (6 - index) * 86400000).toISOString().slice(0, 10)
      return { label: day, revenue: day === today ? 100 : day === yesterday ? 200 : 0, orders: day === today || day === yesterday ? 1 : 0 }
    }),
  })
})

test('rejects unauthenticated and non-admin callers before querying metrics', async () => {
  assert.equal((await call(null)).status, 401)
  assert.equal((await call(123)).status, 403)
  assert.equal((await call(999, { DB: undefined })).status, 500)
})

test('accepts valid admin bearer sessions and rejects invalid tokens', async () => {
  const now = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({ sub: 999, scope: 'admin', iat: now, exp: now + 60 })).toString('base64url')
  const key = createHmac('sha256', 'varnet-admin-session-v1').update(BOT).digest()
  const signature = createHmac('sha256', key).update(payload).digest('base64url')
  const request = token => new Request('https://local.test/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
  const environment = { DB: db, TELEGRAM_BOT_TOKEN: BOT, ADMIN_TELEGRAM_IDS: '999' }
  assert.equal((await handler.onRequestGet({ request: request(`a1.${payload}.${signature}`), env: environment })).status, 200)
  assert.equal((await handler.onRequestGet({ request: request('invalid'), env: environment })).status, 401)
})

test('reports database errors rather than returning fabricated metrics', async () => {
  sqlite.exec('DROP TABLE payment_receipts')
  const response = await call()
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'DB_UNAVAILABLE')
})
