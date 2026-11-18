// Run with Node 22.5+: node --test tests/product-overrides.test.mjs
// esbuild bundles in memory; SQLite and every network response are local.
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
const USER = 101
const originalFetch = globalThis.fetch
let categories, mapper, products, override, sync, sqlite, db, requests, catalog

// Independent fixtures for the requested classifier contract, not imported from production.
const keywords = [
  ['ai', ['claude', 'chatgpt', 'gpt', 'gemini', 'grok', 'perplexity', 'elevenlabs', 'muse ai', 'openart', 'leonardo', 'suno', 'ripple', 'cursor', 'krea ai', 'gamma', 'midjourney', 'copilot', 'wispr flow', 'manus', 'minimax', 'antigravity', 'higgsfield', 'pangram', 'chatprd', 'lovable', 'magic patterns']],
  ['design', ['adobe', 'photoshop', 'illustrator', 'acrobat', 'canva', 'figma', 'framer', 'corel', 'coreldraw', 'capcut', 'alight motion', 'meitu', 'wink', 'xingtu', 'mobbin', 'autodesk']],
  ['os', ['windows', 'win 10', 'win 11', 'windows server']],
  ['office', ['office', 'microsoft 365', 'ms365', 'notion', 'zoom', 'grammarly', 'quizlet', 'coursera', 'udemy', 'granola', 'intercom', 'dropbox', 'google drive']],
  ['security', ['kaspersky', 'nordvpn', 'expressvpn', 'surfshark', 'purevpn', 'proton', 'vpn', 'antivirus']],
  ['streaming', ['netflix', 'spotify', 'youtube', 'amazon prime', 'hbo', 'crunchyroll', 'apple music', 'apple tv', 'tv360', 'brain.fm']],
  ['dev', ['visual studio', 'jetbrains', 'posthog', 'railway', 'resend', 'warp', 'n8n', 'linear', 'api', 'sql']],
  ['social', ['facebook', 'linkedin', 'x premium', 'twitter', 'discord nitro']],
  ['gaming', ['xbox', 'exitlag', 'game', 'steam']],
]

class FakeStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values }
  bind(...values) { return new FakeStatement(this.database, this.sql, values) }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) } }
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
async function load(path) {
  const result = await build({ entryPoints: [resolve(root, path)], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
}
function env(database = db) { return { DB: database, TELEGRAM_BOT_TOKEN: BOT, ADMIN_TELEGRAM_IDS: String(ADMIN) } }
function initData(id) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: 'Test' }) })
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const key = createHmac('sha256', 'WebAppData').update(BOT).digest()
  params.set('hash', createHmac('sha256', key).update(check).digest('hex'))
  return params.toString()
}
function payload(changes = {}) {
  return { productId: 'p1', faDescription: null, customCategory: null, isFeatured: false, isBestseller: false, ...changes }
}
async function save(body = payload(), user = ADMIN, environment = env()) {
  const headers = { 'content-type': 'application/json' }
  if (user !== null) headers['X-Telegram-Init-Data'] = typeof user === 'number' ? initData(user) : user
  const request = new Request('https://local.test/api/admin/products/override', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
  return override.onRequestPost({ request, env: environment })
}
async function getProducts(environment = env()) {
  return products.onRequestGet({ request: new Request('https://local.test/api/products'), env: environment })
}
async function expectError(response, status, code) {
  assert.equal(response.status, status)
  const result = await response.json()
  assert.equal(result.success, false)
  if (code) assert.equal(result.code, code)
}
function addProduct(id = 'p1', title = 'ChatGPT 1M') {
  sqlite.prepare('INSERT INTO products (id,title,category,price,stock,synced_at) VALUES (?,?,?,?,?,?)').run(id, title, 'ai', 100, 1, '2025-01-01')
}
async function syncCatalog() {
  const request = new Request('https://local.test/api/sync', { method: 'POST' })
  return sync.onRequestPost({ request, env: { DB: db, ACCOUNTS_PROVIDER_API_KEY: 'local-only', ACCOUNTS_PROVIDER_BASE_URL: 'https://provider.local.test/products' } })
}

before(async () => {
  ;[categories, mapper, products, override, sync] = await Promise.all([
    load('src/lib/productCategories.ts'), load('src/lib/providerMapper.ts'), load('functions/api/products.ts'),
    load('functions/api/admin/products/override.ts'), load('functions/api/sync.ts'),
  ])
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options })
    assert.equal(String(url), 'https://provider.local.test/products', 'unexpected external network request')
    return Response.json({ data: catalog })
  }
})
beforeEach(() => {
  sqlite?.close()
  sqlite = new DatabaseSync(':memory:')
  const migrations = readdirSync(resolve(root, 'migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort()
  assert.ok(migrations.some(name => name.startsWith('0009')), 'migration 0009 is required')
  for (const file of migrations) sqlite.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'))
  db = new FakeD1(sqlite)
  requests = []
  catalog = []
})
after(() => { globalThis.fetch = originalFetch; sqlite?.close() })

test('every requested keyword classifies with case, whitespace and substring variations', () => {
  assert.deepEqual(categories.PRODUCT_CATEGORIES, [...keywords.map(([category]) => category), 'other'])
  for (const [category, words] of keywords) {
    for (const word of words) {
      for (const input of [word, `  ${word.toUpperCase()}  `, `\t${word}\n`, `prefix-${word}-suffix`]) {
        assert.equal(categories.classifyProduct(input), category, JSON.stringify(input))
      }
    }
  }
  for (const input of ['', '  \t\n', 'unknown subscription', 'سرویس ناشناخته']) {
    assert.equal(categories.classifyProduct(input), 'other', JSON.stringify(input))
  }
})

test('all category precedence pairs win regardless of title order', () => {
  for (let i = 0; i < keywords.length; i++) {
    for (let j = i + 1; j < keywords.length; j++) {
      const [expected, [first]] = keywords[i]
      const [, [second]] = keywords[j]
      for (const title of [`${first} ${second}`, `${second} ${first}`]) {
        assert.equal(categories.classifyProduct(title), expected, title)
      }
    }
  }
})

test('mapper preserves manual category and Persian description on repeated passes', () => {
  const source = { id: 'p1', title: 'ChatGPT 1M', category: 'ai', customCategory: 'gaming', faDescription: 'توضیح دستی', isFeatured: true, isBestseller: false, price: 100, currency: 'IRT', stock: 1 }
  const first = mapper.localizeProviderProduct(source)
  const second = mapper.localizeProviderProduct(first)
  for (const product of [first, second]) {
    assert.equal(product.category, 'gaming')
    assert.equal(product.customCategory, 'gaming')
    assert.equal(product.description, 'توضیح دستی')
    assert.equal(product.providerTitle, source.title)
    assert.equal(product.isFeatured, true)
    assert.equal(product.isBestseller, false)
  }
  const detected = mapper.localizeProviderProduct({ ...source, customCategory: undefined, faDescription: undefined })
  assert.equal(detected.category, 'ai')
  assert.equal(mapper.localizeProviderProduct(detected).category, 'ai')
})

test('admin authorization rejects absent, invalid, and non-admin credentials', async () => {
  addProduct()
  await expectError(await save(payload(), null), 401, 'ADMIN_AUTH_FAILED')
  await expectError(await save(payload(), 'invalid'), 401, 'ADMIN_AUTH_FAILED')
  await expectError(await save(payload(), USER), 403, 'ADMIN_AUTH_FAILED')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM product_overrides').get().n, 0)
  assert.equal(requests.length, 0)
})

test('admin validates categories, booleans, product and JSON without writing', async () => {
  addProduct()
  for (const value of ['bogus', 'AI', '', 1, true, {}, []]) {
    await expectError(await save(payload({ customCategory: value })), 400, 'OVERRIDE_INVALID_CATEGORY')
  }
  for (const field of ['isFeatured', 'isBestseller']) {
    for (const value of [0, 1, 'true', 'false', null, {}, []]) {
      await expectError(await save(payload({ [field]: value })), 400, 'OVERRIDE_INVALID_FLAGS')
    }
    const missing = payload(); delete missing[field]
    await expectError(await save(missing), 400, 'OVERRIDE_INVALID_FLAGS')
  }
  await expectError(await save(payload({ productId: 'missing' })), 404, 'OVERRIDE_PRODUCT_NOT_FOUND')
  await expectError(await save(payload({ productId: ' ' })), 400, 'OVERRIDE_INVALID_PRODUCT_ID')
  await expectError(await save(payload({ faDescription: 123 })), 400, 'OVERRIDE_INVALID_DESCRIPTION')
  await expectError(await save('{'), 400, 'OVERRIDE_BAD_REQUEST')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM product_overrides').get().n, 0)
})

test('authenticated save, GET propagation, mapper re-pass and clearing roundtrip', async () => {
  addProduct()
  const saved = payload({ faDescription: 'توضیح سفارشی', customCategory: 'gaming', isFeatured: true, isBestseller: true })
  const response = await save(saved)
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).data, saved)
  const row = sqlite.prepare('SELECT * FROM product_overrides WHERE product_id = ?').get('p1')
  assert.equal(row.fa_description, saved.faDescription)
  assert.equal(row.custom_category, 'gaming')
  assert.equal(row.is_featured, 1)
  assert.equal(row.is_bestseller, 1)
  const result = await getProducts()
  assert.equal(result.status, 200)
  const product = (await result.json()).data.find(item => item.id === 'p1')
  assert.equal(product.category, 'gaming')
  assert.equal(product.customCategory, 'gaming')
  assert.equal(product.description, saved.faDescription)
  assert.equal(product.faDescription, saved.faDescription)
  assert.equal(product.isFeatured, true)
  assert.equal(product.isBestseller, true)
  const second = mapper.localizeProviderProduct(product)
  assert.equal(second.category, 'gaming')
  assert.equal(second.description, saved.faDescription)
  assert.equal(second.isFeatured, true)
  assert.equal(second.isBestseller, true)

  const cleared = payload()
  const clearResponse = await save(cleared)
  assert.equal(clearResponse.status, 200)
  assert.deepEqual((await clearResponse.json()).data, cleared)
  const clearedRow = sqlite.prepare('SELECT * FROM product_overrides WHERE product_id = ?').get('p1')
  assert.equal(clearedRow.fa_description, null)
  assert.equal(clearedRow.custom_category, null)
  assert.equal(clearedRow.is_featured, 0)
  assert.equal(clearedRow.is_bestseller, 0)
  const reset = (await (await getProducts()).json()).data.find(item => item.id === 'p1')
  assert.equal(reset.category, 'ai')
  assert.notEqual(reset.description, saved.faDescription)
  assert.equal(reset.customCategory ?? null, null)
  assert.equal(reset.faDescription ?? null, null)
  assert.equal(reset.isFeatured, false)
  assert.equal(reset.isBestseller, false)
  assert.equal(mapper.localizeProviderProduct(reset).category, 'ai')
  assert.equal(requests.length, 0)
})

test('all valid categories can be saved, including other', async () => {
  addProduct()
  for (const category of [...keywords.map(([key]) => key), 'other']) {
    const response = await save(payload({ customCategory: category }))
    assert.equal(response.status, 200, category)
    const product = (await (await getProducts()).json()).data.find(item => item.id === 'p1')
    assert.equal(product.category, category)
    assert.equal(mapper.localizeProviderProduct(product).category, category)
  }
})

test('database unavailable fails rather than reporting a successful save or catalogue', async () => {
  const broken = { prepare() { throw new Error('local database unavailable') } }
  await expectError(await save(payload(), ADMIN, env(broken)), 503, 'OVERRIDE_PRODUCT_READ_FAILED')
  await expectError(await save(payload(), ADMIN, { TELEGRAM_BOT_TOKEN: BOT, ADMIN_TELEGRAM_IDS: String(ADMIN) }), 500, 'ADMIN_AUTH_FAILED')
  await expectError(await getProducts(env(broken)), 500, 'PRODUCTS_READ_FAILED')
  await expectError(await getProducts({}), 500, 'PRODUCTS_DB_NOT_CONFIGURED')
  addProduct()
  const failingWrite = { prepare(sql) {
    if (/INSERT INTO product_overrides/i.test(sql)) return { bind() { return { async run() { throw new Error('write unavailable') } } } }
    return db.prepare(sql)
  } }
  await expectError(await save(payload(), ADMIN, env(failingWrite)), 503, 'OVERRIDE_SAVE_FAILED')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM product_overrides').get().n, 0)
})

test('sync retains original provider title and overrides survive resync and clearing', async () => {
  catalog = [{ id: 'p1', title: 'ChatGPT 1M', price: 10, currency: 'IRT', stock: 1 }]
  const firstSync = await syncCatalog()
  assert.equal(firstSync.status, 200, await firstSync.clone().text())
  let row = sqlite.prepare('SELECT title, provider_title FROM products WHERE id = ?').get('p1')
  assert.equal(row.provider_title, 'ChatGPT 1M')
  assert.notEqual(row.title, row.provider_title, 'sync should persist the localized title')
  let product = (await (await getProducts()).json()).data.find(item => item.id === 'p1')
  assert.equal(product.category, 'ai')
  assert.equal(product.providerTitle, 'ChatGPT 1M')
  assert.equal(mapper.localizeProviderProduct(product).category, 'ai')

  const saved = payload({ faDescription: 'توضیح دستی', customCategory: 'gaming', isFeatured: true, isBestseller: false })
  assert.equal((await save(saved)).status, 200)
  catalog = [{ id: 'p1', title: 'Netflix Premium', price: 20, currency: 'IRT', stock: 2 }]
  const secondSync = await syncCatalog()
  assert.equal(secondSync.status, 200, await secondSync.clone().text())
  row = sqlite.prepare('SELECT title, provider_title FROM products WHERE id = ?').get('p1')
  assert.equal(row.provider_title, 'Netflix Premium')
  product = (await (await getProducts()).json()).data.find(item => item.id === 'p1')
  assert.equal(product.category, 'gaming')
  assert.equal(product.description, saved.faDescription)
  assert.equal(product.isFeatured, true)
  assert.equal(product.isBestseller, false)
  assert.equal(mapper.localizeProviderProduct(product).category, 'gaming')
  assert.equal((await save(payload())).status, 200)
  product = (await (await getProducts()).json()).data.find(item => item.id === 'p1')
  assert.equal(product.category, 'streaming')
  assert.equal(product.providerTitle, 'Netflix Premium')
  assert.equal(mapper.localizeProviderProduct(product).category, 'streaming')
  assert.equal(requests.length, 2)
})

test('GET bundle excludes the mapper and serves stored fields without classification', async () => {
  const result = await build({ entryPoints: [resolve(root, 'functions/api/products.ts')], bundle: true, platform: 'neutral', format: 'esm', write: false, metafile: true, logLevel: 'silent' })
  const inputs = Object.keys(result.metafile.inputs)
  assert.ok(!inputs.some(path => /providerMapper|productCategories/.test(path)))

  addProduct('p1', 'ChatGPT Netflix')
  sqlite.prepare(`UPDATE products SET category = ?, description = ?, provider_title = ?,
    logo_url = ?, features = ? WHERE id = ?`).run('gaming', 'ذخیره‌شده', 'ChatGPT Netflix', 'https://example.test/logo.png', '["ویژگی"]', 'p1')
  const response = await getProducts()
  assert.equal(response.status, 200)
  const product = (await response.json()).data[0]
  assert.equal(product.title, 'ChatGPT Netflix')
  assert.equal(product.category, 'gaming')
  assert.equal(product.description, 'ذخیره‌شده')
  assert.equal(product.logoUrl, 'https://example.test/logo.png')
  assert.deepEqual(product.features, ['ویژگی'])
})

test('soft deletion survives resync and preserves other overrides', async () => {
  catalog = [{ id: 'p1', title: 'ChatGPT 1M', price: 10, stock: 1 }]
  assert.equal((await syncCatalog()).status, 200)
  assert.equal((await save(payload({ faDescription: 'دستی', customCategory: 'gaming', isFeatured: true }))).status, 200)
  sqlite.prepare('UPDATE product_overrides SET is_deleted = 1 WHERE product_id = ?').run('p1')
  assert.deepEqual((await (await getProducts()).json()).data, [])
  catalog[0].title = 'Netflix Premium'
  assert.equal((await syncCatalog()).status, 200)
  assert.deepEqual((await (await getProducts()).json()).data, [])
  const row = sqlite.prepare('SELECT * FROM product_overrides WHERE product_id = ?').get('p1')
  assert.equal(row.is_deleted, 1)
  assert.equal(row.fa_description, 'دستی')
  assert.equal(row.custom_category, 'gaming')
  assert.equal(row.is_featured, 1)
})

test('sync localizes 301 unique products, stores logos and batches prepared upserts', async () => {
  catalog = Array.from({ length: 301 }, (_, index) => ({ id: `product-${index}`, title: index % 2 ? `Netflix Premium ${index}` : `ChatGPT ${index}`, price: 10, stock: 1 }))
  catalog.push(catalog[0], { id: 'invalid', price: 1 })
  let prepares = 0
  let batches = 0
  const prepare = db.prepare.bind(db)
  const batch = db.batch.bind(db)
  db.prepare = (sql) => { if (/INSERT INTO products\s*\(/i.test(sql)) prepares++; return prepare(sql) }
  db.batch = async (statements) => { batches++; assert.ok(statements.length <= 50); return batch(statements) }
  const response = await syncCatalog()
  assert.equal(response.status, 200, await response.clone().text())
  const result = await response.json()
  assert.equal(result.data.synced, 301)
  assert.equal(result.data.skipped, 2)
  assert.equal(result.data.batches, 7)
  assert.equal(prepares, 1)
  assert.equal(batches, 7)
  const saved = sqlite.prepare('SELECT category, title, provider_title, logo_url FROM products WHERE id = ?').get('product-0')
  assert.equal(saved.category, 'ai')
  assert.notEqual(saved.title, saved.provider_title)
  assert.ok(saved.logo_url)
  const productsRead = (await (await getProducts()).json()).data
  assert.equal(productsRead.length, 301)
  assert.equal(productsRead.find(item => item.id === 'product-0').logoUrl, saved.logo_url)
  assert.equal(productsRead.find(item => item.id === 'product-1').category, 'streaming')
})

test('sync exposes a database batch failure', async () => {
  catalog = [{ id: 'p1', title: 'ChatGPT', price: 1, stock: 1 }]
  db.batch = async () => { throw new Error('write unavailable') }
  await expectError(await syncCatalog(), 500, 'SYNC_DB_WRITE_FAILED')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM products').get().n, 0)
})
