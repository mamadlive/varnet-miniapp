import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const token = '123:local-only'
const originalFetch = globalThis.fetch
let api, sqlite, db, calls, responder
class Statement {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args }
  bind(...args) { return new Statement(this.db, this.sql, args) }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) } }
  async run() { return { success: true, meta: { changes: Number(this.db.prepare(this.sql).run(...this.args).changes) } } }
}
class D1 {
  prepare(sql) { return new Statement(sqlite, sql) }
  async batch(statements) {
    sqlite.exec('BEGIN')
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results } catch (error) { sqlite.exec('ROLLBACK'); throw error }
  }
}
function initData(id) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id }) })
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const key = createHmac('sha256', 'WebAppData').update(token).digest()
  params.set('hash', createHmac('sha256', key).update(check).digest('hex'))
  return params.toString()
}
async function call(method, body, user = 999) {
  const headers = { 'content-type': 'application/json' }
  if (user !== null) headers['X-Telegram-Init-Data'] = initData(user)
  const request = new Request('https://local.test/api/admin/broadcast', { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return api[`onRequest${method[0]}${method.slice(1).toLowerCase()}`]({ request, env: { DB: db, TELEGRAM_BOT_TOKEN: token, ADMIN_TELEGRAM_IDS: '999' } })
}
const input = (extra = {}) => ({ audience: 'all_users', message: 'Hello', ...extra })
async function create(extra = {}) { const response = await call('POST', input(extra)); assert.equal(response.status, 200); return (await response.json()).data }
before(async () => {
  const result = await build({ entryPoints: [resolve(root, 'functions/api/admin/broadcast.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' })
  api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), body: JSON.parse(options.body) }); assert.match(String(url), /^https:\/\/api\.telegram\.org\/bot123:local-only\//); return responder(calls.at(-1)) }
})
beforeEach(() => {
  sqlite?.close(); sqlite = new DatabaseSync(':memory:')
  sqlite.exec('CREATE TABLE users (id TEXT PRIMARY KEY, telegram_id INTEGER UNIQUE, role TEXT, username TEXT, first_name TEXT, last_name TEXT)')
  sqlite.exec(readFileSync(resolve(root, 'migrations/0012_broadcasts.sql'), 'utf8'))
  db = new D1(); calls = []; responder = () => Response.json({ ok: true, result: {} })
})
after(() => { globalThis.fetch = originalFetch; sqlite?.close() })

test('authorization and validation prevent sending', async () => {
  assert.equal((await call('GET', undefined, null)).status, 401)
  assert.equal((await call('PATCH', { id: '00000000-0000-0000-0000-000000000000' }, 123)).status, 403)
  assert.equal((await call('POST', input(), null)).status, 401)
  assert.equal((await call('POST', input(), 123)).status, 403)
  for (const extra of [{ message: ' ' }, { audience: 'channel', target: 'bad' }, { photoUrl: 'http://example.org/a' }, { buttonLabel: 'click' }, { buttonLabel: 'x', buttonUrl: 'javascript:alert(1)' }, { message: 'x'.repeat(1025), photoUrl: 'https://example.org/a' }]) assert.equal((await call('POST', input(extra))).status, 400)
  assert.equal(calls.length, 0)
})
test('snapshots all users and reports blocked and accepted deliveries', async () => {
  for (const id of [1, 2, 3]) sqlite.prepare('INSERT INTO users (id, telegram_id) VALUES (?, ?)').run(String(id), id)
  const record = await create(); assert.equal(record.total, 3)
  sqlite.prepare('INSERT INTO users (id, telegram_id) VALUES (?, ?)').run('4', 4)
  responder = ({ body }) => body.chat_id === '2' ? Response.json({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }, { status: 403 }) : Response.json({ ok: true, result: {} })
  const response = await call('PATCH', { id: record.id }); const result = (await response.json()).data
  assert.deepEqual([result.total, result.sent, result.failed, result.pending], [3, 2, 1, 0]); assert.equal(calls.length, 3)
  assert.equal((await call('GET')).status, 200)
})
test('photo and button payload for channel and unknown network outcomes', async () => {
  const record = await create({ audience: 'channel', target: '@test_channel', photoUrl: 'https://example.org/photo.jpg', buttonLabel: 'Open', buttonUrl: 'https://example.org' })
  responder = () => { throw new Error('offline') }
  const result = (await (await call('PATCH', { id: record.id })).json()).data
  assert.equal(result.unknown, 1); assert.equal(result.sent, 0)
  assert.match(calls[0].url, /sendPhoto$/); assert.equal(calls[0].body.chat_id, '@test_channel'); assert.equal(calls[0].body.caption, 'Hello'); assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].url, 'https://example.org')
  await call('PATCH', { id: record.id }); assert.equal(calls.length, 1)
})
test('rate limits retain recipient for safe continuation', async () => {
  const record = await create({ audience: 'channel', target: '-100123' })
  responder = () => Response.json({ ok: false, error_code: 429, parameters: { retry_after: 3 } }, { status: 429 })
  const first = await (await call('PATCH', { id: record.id })).json(); assert.equal(first.retryAfter, 3); assert.equal(first.data.pending, 1)
  responder = () => Response.json({ ok: true })
  const second = await (await call('PATCH', { id: record.id })).json(); assert.equal(second.data.sent, 1)
})
test('overlapping processing cannot send the same recipient twice', async () => {
  const record = await create({ audience: 'channel', target: '@test_channel' })
  let release
  responder = () => new Promise((resolve) => { release = () => resolve(Response.json({ ok: true })) })
  const first = call('PATCH', { id: record.id })
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1))
  const second = await call('PATCH', { id: record.id }); assert.equal(second.status, 409)
  release(); const completed = await first; assert.equal((await completed.json()).data.sent, 1); assert.equal(calls.length, 1)
})
test('bounded batches leave remaining users resumable', async () => {
  for (let id = 1; id <= 12; id++) sqlite.prepare('INSERT INTO users (id, telegram_id) VALUES (?, ?)').run(String(id), id)
  const record = await create(); const first = (await (await call('PATCH', { id: record.id })).json()).data
  assert.equal(first.sent, 10); assert.equal(first.pending, 2)
  const second = (await (await call('PATCH', { id: record.id })).json()).data
  assert.equal(second.sent, 12); assert.equal(second.pending, 0)
})
