// In-memory SQLite and signed local credentials; no network requests.
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BOT = '123456:local-test-secret-token'
const ADMIN = 999
let handler, sqlite, db

class Statement {
  constructor(database, sql, values = []) { Object.assign(this, { database, sql, values }) }
  bind(...values) { return new Statement(this.database, this.sql, values) }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) } }
  async run() { return { success: true, meta: { changes: Number(this.database.prepare(this.sql).run(...this.values).changes) } } }
}
class D1 {
  constructor(database) { this.database = database }
  prepare(sql) { return new Statement(this.database, sql) }
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
function initData(id) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Test' }) })
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const key = createHmac('sha256', 'WebAppData').update(BOT).digest()
  params.set('hash', createHmac('sha256', key).update(check).digest('hex'))
  return params.toString()
}
async function request(body, user = ADMIN, database = db) {
  const headers = { 'content-type': 'application/json' }
  if (user !== null) headers['X-Telegram-Init-Data'] = typeof user === 'number' ? initData(user) : user
  return handler.onRequestPost({
    request: new Request('https://local.test/api/admin/products/delete', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }),
    env: { DB: database, TELEGRAM_BOT_TOKEN: BOT, ADMIN_TELEGRAM_IDS: String(ADMIN) },
  })
}
function addProduct(id) {
  sqlite.prepare('INSERT INTO products (id,title,category,price,stock,synced_at) VALUES (?,?,?,?,?,?)').run(id, id, 'other', 100, 1, '2025-01-01')
}
async function expectError(response, status, code) {
  assert.equal(response.status, status)
  const body = await response.json()
  assert.equal(body.success, false)
  assert.equal(body.code, code)
}

before(async () => {
  const result = await build({ entryPoints: [resolve(root, 'functions/api/admin/products/delete.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  handler = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
})
beforeEach(() => {
  sqlite?.close()
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(resolve(root, 'migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'))
  }
  db = new D1(sqlite)
})
after(() => sqlite?.close())

test('migration adds logo and constrained deletion flag with safe defaults', () => {
  addProduct('p1')
  sqlite.prepare('INSERT INTO product_overrides (product_id) VALUES (?)').run('p1')
  assert.equal(sqlite.prepare('SELECT logo_url FROM products').get().logo_url, null)
  assert.equal(sqlite.prepare('SELECT is_deleted FROM product_overrides').get().is_deleted, 0)
  assert.throws(() => sqlite.exec('UPDATE product_overrides SET is_deleted = 2'))
})

test('authorization and invalid input never modify the database', async () => {
  addProduct('p1')
  await expectError(await request({ productIds: ['p1'] }, null), 401, 'ADMIN_AUTH_FAILED')
  await expectError(await request({ productIds: ['p1'] }, 'invalid'), 401, 'ADMIN_AUTH_FAILED')
  await expectError(await request({ productIds: ['p1'] }, 101), 403, 'ADMIN_AUTH_FAILED')
  for (const body of ['{', null, [], { productIds: [] }, { productIds: [' '] }, { productIds: [' p1'] }, { productIds: [1] }, { productIds: Array(101).fill('p1') }]) {
    const response = await request(body)
    assert.equal(response.status, 400)
  }
  await expectError(await request({ productIds: ['p1', 'missing'] }), 404, 'PRODUCT_DELETE_NOT_FOUND')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM product_overrides').get().n, 0)
})

test('bulk deletion deduplicates, preserves overrides and is idempotent', async () => {
  addProduct('p1'); addProduct('p2')
  sqlite.prepare('INSERT INTO product_overrides (product_id, fa_description, custom_category, is_featured, is_bestseller) VALUES (?, ?, ?, ?, ?)').run('p1', 'manual', 'gaming', 1, 1)
  for (let i = 0; i < 2; i++) {
    const response = await request({ productIds: ['p1', 'p2', 'p1'] })
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).data.productIds, ['p1', 'p2'])
  }
  const row = sqlite.prepare('SELECT * FROM product_overrides WHERE product_id = ?').get('p1')
  assert.equal(row.fa_description, 'manual')
  assert.equal(row.custom_category, 'gaming')
  assert.equal(row.is_featured, 1)
  assert.equal(row.is_bestseller, 1)
  assert.equal(row.is_deleted, 1)
  assert.equal(sqlite.prepare('SELECT is_deleted FROM product_overrides WHERE product_id = ?').get('p2').is_deleted, 1)
})

test('database failures return explicit errors', async () => {
  const brokenRead = { prepare() { throw new Error('secret') } }
  await expectError(await request({ productIds: ['p1'] }, ADMIN, brokenRead), 503, 'PRODUCT_DELETE_READ_FAILED')
  addProduct('p1')
  const brokenWrite = { prepare: db.prepare.bind(db), async batch() { throw new Error('secret') } }
  await expectError(await request({ productIds: ['p1'] }, ADMIN, brokenWrite), 503, 'PRODUCT_DELETE_SAVE_FAILED')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM product_overrides').get().n, 0)
})
