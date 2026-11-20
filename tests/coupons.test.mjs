// Local-only integration tests: node --test tests/coupons.test.mjs
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const bot = '123456:local-secret'
let sqlite, db, admin, customer, helpers, pricing
class Statement {
  constructor(db, sql, values = []) { Object.assign(this, { db, sql, values }) }
  bind(...values) { return new Statement(this.db, this.sql, values) }
  async first() { return this.db.prepare(this.sql).get(...this.values) ?? null }
  async all() { return { results: this.db.prepare(this.sql).all(...this.values) } }
  async run() { const result = this.db.prepare(this.sql).run(...this.values); return { success: true, meta: { changes: Number(result.changes) } } }
}
class FakeD1 { constructor(db) { this.db = db } prepare(sql) { return new Statement(this.db, sql) } }
async function load(path, extra = {}) {
  const output = await build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', ...extra })
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString('base64')}`)
}
function signed(id) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Test' }) })
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const key = createHmac('sha256', 'WebAppData').update(bot).digest()
  params.set('hash', createHmac('sha256', key).update(check).digest('hex'))
  return params.toString()
}
function env() { return { DB: db, TELEGRAM_BOT_TOKEN: bot, ADMIN_TELEGRAM_IDS: '999' } }
function req(method, body, id = 999) {
  const headers = { 'content-type': 'application/json' }
  if (id !== null) headers['X-Telegram-Init-Data'] = typeof id === 'number' ? signed(id) : id
  return new Request('https://local.test/api', { method, headers, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
}
const input = (extra = {}) => ({ action: 'create', code: 'SAVE20', type: 'percent', value: 20, active: true, ...extra })
async function adminPost(body, id = 999, environment = env()) { return admin.onRequestPost({ request: req('POST', body, id), env: environment }) }
async function validate(body, id = 1, environment = env()) { return customer.onRequestPost({ request: req('POST', body, id), env: environment }) }
async function result(response, status, code) {
  assert.equal(response.status, status, await response.clone().text())
  const json = await response.json()
  if (code) assert.equal(json.code, code)
  return json.data
}
before(async () => {
  ;[admin, customer, helpers, pricing] = await Promise.all([
    load('functions/api/admin/coupons.ts'), load('functions/api/coupon.ts'), load('functions/api/_lib/discounts.ts'),
    load('src/lib/pricing.ts', { alias: { '@/lib/format': resolve(root, 'src/lib/format.ts'), '@/types': resolve(root, 'src/types/index.ts') } }),
  ])
})
beforeEach(() => {
  sqlite?.close()
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(resolve(root, 'migrations/0011_discount_codes.sql'), 'utf8'))
  db = new FakeD1(sqlite)
})
after(() => sqlite?.close())

test('admin authentication is required for every CRUD operation', async () => {
  for (const identity of [null, 'invalid', 1]) {
    const status = identity === 1 ? 403 : 401
    await result(await admin.onRequestGet({ request: req('GET', undefined, identity), env: env() }), status)
    for (const action of ['create', 'update', 'toggle', 'delete']) {
      await result(await adminPost(input({ action, id: 'id' }), identity), status)
    }
  }
  assert.equal(sqlite.prepare('SELECT count(*) n FROM discount_codes').get().n, 0)
})

test('CRUD persists, enforces case-insensitive uniqueness and preserves use counts', async () => {
  const created = await result(await adminPost(input({ code: ' save20 ', minSubtotal: 100000, maxDiscount: 25000, usageLimit: 4, description: 'test' })), 201)
  assert.equal(created.code, 'SAVE20')
  assert.equal(created.usedCount, 0)
  await result(await adminPost(input({ code: 'save20' })), 409, 'COUPON_DUPLICATE')
  sqlite.prepare('UPDATE discount_codes SET used_count = 2 WHERE id = ?').run(created.id)
  const updated = await result(await adminPost(input({ action: 'update', id: created.id, code: 'SAVE30', value: 30, active: false, usedCount: 999 })), 200)
  assert.equal(updated.usedCount, 2)
  assert.equal(updated.active, false)
  const list = await result(await admin.onRequestGet({ request: req('GET'), env: env() }), 200)
  assert.deepEqual(list, [updated])
  const enabled = await result(await adminPost({ action: 'toggle', id: created.id, active: true }), 200)
  assert.equal(enabled.active, true)
  assert.equal(enabled.usedCount, 2)
  await result(await adminPost({ action: 'delete', id: created.id }), 200)
  await result(await adminPost({ action: 'delete', id: created.id }), 404, 'COUPON_NOT_FOUND')
  await result(await validate({ code: 'SAVE30', subtotal: 100000 }), 400, 'COUPON_NOT_FOUND')
})

test('invalid admin inputs never write and database failures are explicit', async () => {
  for (const changes of [
    { code: '!!' }, { value: 0 }, { value: 101 }, { type: 'other' }, { value: 1.5 },
    { active: 1 }, { usageLimit: 0 }, { minSubtotal: -1 }, { maxDiscount: '5' },
    { expiresAt: 'invalid' }, { description: 'x'.repeat(81) }, { type: 'fixed', value: 10000001 },
  ]) await result(await adminPost(input(changes)), 400, 'COUPON_INVALID_INPUT')
  await result(await adminPost('{'), 400, 'COUPON_INVALID_BODY')
  await result(await adminPost({ action: 'toggle', id: 'missing', active: true }), 404, 'COUPON_NOT_FOUND')
  const broken = { ...env(), DB: { prepare() { throw new Error('unavailable') } } }
  await result(await adminPost(input(), 999, broken), 503, 'COUPON_DB_UNAVAILABLE')
  assert.equal(sqlite.prepare('SELECT count(*) n FROM discount_codes').get().n, 0)
})

test('customer validation checks active, expiry, limit, minimum and no-discount cases', async () => {
  const created = await result(await adminPost(input({ minSubtotal: 100000, maxDiscount: 25000, usageLimit: 2 })), 201)
  await result(await validate({ code: 'save20', subtotal: 100000 }, null), 401, 'TELEGRAM_AUTH_REQUIRED')
  await result(await validate({ code: '', subtotal: 100000 }), 400, 'COUPON_REQUIRED')
  await result(await validate({ code: 'missing', subtotal: 100000 }), 400, 'COUPON_NOT_FOUND')
  await result(await validate({ code: 'save20', subtotal: -1 }), 400, 'COUPON_INVALID_SUBTOTAL')
  await result(await validate({ code: 'save20', subtotal: 99999 }), 400, 'COUPON_MIN_SUBTOTAL')
  const valid = await result(await validate({ code: ' save20 ', subtotal: 200000 }), 200)
  assert.equal(valid.discount, 25000)
  assert.equal(valid.total, 175000)
  assert.equal(valid.coupon.id, created.id)
  assert.equal(sqlite.prepare('SELECT used_count FROM discount_codes WHERE id = ?').get(created.id).used_count, 0)
  sqlite.prepare('UPDATE discount_codes SET is_active = 0 WHERE id = ?').run(created.id)
  await result(await validate({ code: 'save20', subtotal: 200000 }), 400, 'COUPON_INACTIVE')
  sqlite.prepare("UPDATE discount_codes SET is_active = 1, expires_at = '2000-01-01T00:00:00Z' WHERE id = ?").run(created.id)
  await result(await validate({ code: 'save20', subtotal: 200000 }), 400, 'COUPON_EXPIRED')
  sqlite.prepare('UPDATE discount_codes SET expires_at = NULL, used_count = 2 WHERE id = ?').run(created.id)
  await result(await validate({ code: 'save20', subtotal: 200000 }), 400, 'COUPON_EXHAUSTED')
  sqlite.prepare('UPDATE discount_codes SET used_count = 0, min_subtotal = 0, max_discount = 0 WHERE id = ?').run(created.id)
  await result(await validate({ code: 'save20', subtotal: 200000 }), 400, 'COUPON_NO_DISCOUNT')
})

test('server calculation and expiry boundaries match pricing.ts', async () => {
  const created = await result(await adminPost(input()), 201)
  const row = sqlite.prepare('SELECT * FROM discount_codes WHERE id = ?').get(created.id)
  for (const type of ['percent', 'fixed']) for (const value of [1, 20, 100]) for (const subtotal of [0, 499, 500, 1499, 1500, 105001]) for (const cap of [null, 0, 501, 2500]) {
    const candidate = { ...row, type, value, max_discount: cap }
    const coupon = helpers.toDiscountCoupon(candidate)
    const expected = pricing.couponDiscount(coupon, subtotal)
    const actual = helpers.evaluateDiscount(candidate, subtotal)
    if (expected === 0) assert.equal(actual.code, 'COUPON_NO_DISCOUNT')
    else assert.equal(actual.discount, expected)
  }
  const now = Date.now()
  const boundary = { ...row, expires_at: new Date(now).toISOString() }
  assert.equal(helpers.evaluateDiscount(boundary, 100000, now - 1).ok, true)
  assert.equal(helpers.evaluateDiscount(boundary, 100000, now).code, 'COUPON_EXPIRED')
})
