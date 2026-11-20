// Local-only integration tests: node --test tests/support-static-ip-access.test.mjs
// Esbuild bundles in memory; migrations run only against node:sqlite's in-memory database.
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
const ADMIN = 999, OWNER = 101, OTHER = 202
const NOTE = 'client\nremote vpn.example.test 1194\nsecret-password\n'
let support, adminSupport, access, services, orders, download, resend, sqlite, db, calls
const originalFetch = globalThis.fetch

class Statement {
  constructor(database, sql, values = []) { Object.assign(this, { database, sql, values }) }
  bind(...values) { return new Statement(this.database, this.sql, values) }
  async first() { return this.database.prepare(this.sql).get(...this.values) ?? null }
  async all() { return { success: true, results: this.database.prepare(this.sql).all(...this.values) } }
  async run() { return { success: true, meta: { changes: Number(this.database.prepare(this.sql).run(...this.values).changes) } } }
}
class FakeD1 {
  constructor(database) { this.database = database }
  prepare(sql) { return new Statement(this.database, sql) }
  async batch(statements) {
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
function env(database = db) { return { DB: database, TELEGRAM_BOT_TOKEN: BOT, ADMIN_TELEGRAM_IDS: String(ADMIN) } }
async function call(handler, method, body, user = OWNER, environment = env()) {
  const headers = { 'content-type': 'application/json' }
  if (user !== null) headers['X-Telegram-Init-Data'] = typeof user === 'number' ? initData(user) : user
  const request = new Request('https://local.test/api', { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  try {
    return await handler[`onRequest${method === 'GET' ? 'Get' : 'Post'}`]({ request, env: environment })
  } catch (error) {
    // Bundled data-URL stack traces otherwise print the entire base64 source.
    throw new Error(`${error.name}: ${error.message}`)
  }
}
function getDownload(orderId, token, environment = env()) {
  const query = new URLSearchParams({ orderId, token })
  return download.onRequestGet({ request: new Request(`https://local.test/api/static-ip/download?${query}`), env: environment })
}
async function result(response, status, code) {
  assert.equal(response.status, status, await response.clone().text())
  const json = await response.json()
  if (code) { assert.equal(json.success, false); assert.equal(json.code, code) }
  else assert.equal(json.success, true)
  return json
}
function addOrder(id, { owner = OWNER, kind = 'vpn', status = 'completed', note = NOTE } = {}) {
  sqlite.prepare('INSERT INTO orders (id,user_id,product_id,product_title,kind,subtotal,total,status,created_at,payment_method,delivery_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, `usr_tg_${owner}`, 'plan', 'Static IP', kind, 100, 100, status, '2025-01-01', 'card', note)
}
const ticketInput = (extra = {}) => ({ action: 'create', category: 'order', subject: 'Order issue', body: 'Please check my order', ...extra })
async function createTicket(extra = {}, user = OWNER) { return (await result(await call(support, 'POST', ticketInput(extra), user), 201)).data }

before(async () => {
  ;[support, adminSupport, access, services, orders, download, resend] = await Promise.all([
    load('functions/api/support.ts'), load('functions/api/admin/support.ts'),
    load('functions/api/admin/static-ip/services/access.ts'), load('functions/api/static-ip/services.ts'),
    load('functions/api/orders.ts'), load('functions/api/static-ip/download.ts'), load('functions/api/static-ip/resend.ts'),
  ])
  globalThis.fetch = async (url, options = {}) => {
    assert.match(String(url), /^https:\/\/api\.telegram\.org\/bot123456:local-test-secret-token\/(sendMessage|sendDocument)$/)
    calls.push({ url: String(url), ...options })
    return Response.json({ ok: true, result: { message_id: 1 } })
  }
})
beforeEach(() => {
  sqlite?.close()
  sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(resolve(root, 'migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve(root, 'migrations', file), 'utf8'))
  }
  db = new FakeD1(sqlite)
  for (const id of [OWNER, OTHER, ADMIN]) sqlite.prepare('INSERT INTO users (id,telegram_id,created_at,updated_at) VALUES (?,?,?,?)').run(`usr_tg_${id}`, id, '2025', '2025')
  calls = []
})
after(() => { globalThis.fetch = originalFetch; sqlite?.close() })

test('support and access endpoints require signed user or admin authorization', async () => {
  for (const [handler, method, body] of [[support, 'GET'], [support, 'POST', ticketInput()], [services, 'GET'], [download, 'POST', { orderId: 'x' }], [resend, 'POST', { orderId: 'x' }]]) {
    await result(await call(handler, method, body, null), 401, 'TELEGRAM_AUTH_REQUIRED')
    await result(await call(handler, method, body, 'invalid'), 401, 'TELEGRAM_AUTH_INVALID')
  }
  for (const [handler, method, body] of [[adminSupport, 'GET'], [adminSupport, 'POST', { action: 'status', ticketId: 'x', status: 'closed' }], [access, 'POST', { orderId: 'x', action: 'suspend', reason: 'test' }]]) {
    await result(await call(handler, method, body, null), 401, 'ADMIN_AUTH_REQUIRED')
    await result(await call(handler, method, body, OTHER), 403, 'ADMIN_FORBIDDEN')
  }
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM support_tickets').get().n, 0)
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM static_ip_service_access').get().n, 0)
  assert.equal(calls.length, 0)
})

test('order-linked tickets enforce ownership and ignore client identity and authorship', async () => {
  addOrder('owned')
  addOrder('other-order', { owner: OTHER })
  for (const orderId of ['other-order', 'missing']) await result(await call(support, 'POST', ticketInput({ orderId })), 403, 'ORDER_NOT_OWNED')
  const ticket = await createTicket({ orderId: 'owned', userId: `usr_tg_${OTHER}`, author: 'support', subject: '  Order   issue  ', body: '  Please check my order  ' })
  assert.equal(ticket.userId, `usr_tg_${OWNER}`)
  assert.equal(ticket.telegramId, OWNER)
  assert.equal(ticket.orderId, 'owned')
  assert.equal(ticket.subject, 'Order issue')
  assert.equal(ticket.status, 'open')
  assert.equal(ticket.messages.length, 1)
  assert.equal(ticket.messages[0].author, 'user')
  assert.equal(ticket.messages[0].body, 'Please check my order')
  const otherTicket = await createTicket({}, OTHER)
  const mine = (await result(await call(support, 'GET'), 200)).data
  assert.deepEqual(mine.map(t => t.id), [ticket.id])
  assert.deepEqual((await result(await call(support, 'GET', undefined, OTHER), 200)).data.map(t => t.id), [otherTicket.id])
  await result(await call(support, 'POST', { action: 'reply', ticketId: ticket.id, body: 'Intrusion' }, OTHER), 404, 'TICKET_NOT_FOUND')
  await result(await call(support, 'POST', { action: 'reply', ticketId: 'missing', body: 'Intrusion' }, OTHER), 404, 'TICKET_NOT_FOUND')
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM support_ticket_messages WHERE ticket_id = ?').get(ticket.id).n, 1)
  const adminList = (await result(await call(adminSupport, 'GET', undefined, ADMIN), 200)).data
  assert.deepEqual(new Set(adminList.map(t => t.id)), new Set([ticket.id, otherTicket.id]))
})

test('support replies, notifications, close and reopen preserve thread and status transitions', async () => {
  addOrder('owned')
  const ticket = await createTicket({ orderId: 'owned' })
  const reply = await result(await call(adminSupport, 'POST', { action: 'reply', ticketId: ticket.id, body: 'We are investigating', author: 'user' }, ADMIN), 200)
  assert.equal(reply.data.status, 'answered')
  assert.equal(reply.data.messages.find(m => m.body === 'We are investigating').author, 'support')
  assert.equal(reply.notification.sent, true)
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /\/sendMessage$/)
  assert.equal(String(JSON.parse(calls[0].body).chat_id), String(OWNER))
  const customerReply = (await result(await call(support, 'POST', { action: 'reply', ticketId: ticket.id, body: 'Thank you', author: 'support' }), 200)).data
  assert.equal(customerReply.status, 'open')
  assert.equal(customerReply.messages.find(m => m.body === 'Thank you').author, 'user')
  await result(await call(adminSupport, 'POST', { action: 'status', ticketId: ticket.id, status: 'closed' }, ADMIN), 200)
  for (const [handler, user] of [[support, OWNER], [adminSupport, ADMIN]]) await result(await call(handler, 'POST', { action: 'reply', ticketId: ticket.id, body: 'No reply' }, user), 409, 'TICKET_CLOSED')
  await result(await call(adminSupport, 'POST', { action: 'status', ticketId: ticket.id, status: 'invalid' }, ADMIN), 400, 'INVALID_STATUS')
  await result(await call(adminSupport, 'POST', { action: 'status', ticketId: 'missing', status: 'open' }, ADMIN), 404, 'TICKET_NOT_FOUND')
  await result(await call(adminSupport, 'POST', { action: 'status', ticketId: ticket.id, status: 'open' }, ADMIN), 200)
  const reopened = (await result(await call(support, 'POST', { action: 'reply', ticketId: ticket.id, body: 'Reopened' }), 200)).data
  assert.equal(reopened.status, 'open')
  assert.equal(reopened.messages.length, 4)
  assert.equal(calls.length, 1)
})

test('suspension blocks old and new download links and resend; reactivation restores access', async () => {
  addOrder('owned')
  addOrder('other', { owner: OTHER })
  const originalOrder = sqlite.prepare('SELECT status,total,delivery_note FROM orders WHERE id = ?').get('owned')
  const token = (await result(await call(download, 'POST', { orderId: 'owned' }), 200)).data.token
  assert.equal(await (await getDownload('owned', token)).text(), NOTE)
  const suspended = (await result(await call(access, 'POST', { orderId: 'owned', action: 'suspend', reason: '  abuse review  ' }, ADMIN), 200)).data
  assert.equal(suspended.access.state, 'suspended')
  assert.equal(suspended.access.reason, 'abuse review')
  assert.equal(suspended.networkRevoked, false)
  assert.equal(suspended.notification.sent, true)
  assert.deepEqual(sqlite.prepare('SELECT status,total,delivery_note FROM orders WHERE id = ?').get('owned'), originalOrder)
  const stored = sqlite.prepare('SELECT * FROM static_ip_service_access WHERE order_id = ?').get('owned')
  assert.equal(stored.user_id, `usr_tg_${OWNER}`)
  assert.equal(stored.suspended_by, ADMIN)
  assert.ok(stored.suspended_at)
  await result(await call(download, 'POST', { orderId: 'owned' }), 403, 'SERVICE_SUSPENDED')
  await result(await getDownload('owned', token), 403, 'SERVICE_SUSPENDED')
  await result(await call(resend, 'POST', { orderId: 'owned' }), 403, 'SERVICE_SUSPENDED')
  await result(await call(download, 'POST', { orderId: 'owned' }, OTHER), 503, 'DB_UNAVAILABLE')
  await result(await call(resend, 'POST', { orderId: 'owned' }, OTHER), 503, 'DB_UNAVAILABLE')
  assert.equal(calls.length, 1, 'suspended resend must not send a document')
  await result(await call(access, 'POST', { orderId: 'owned', action: 'suspend', reason: 'again' }, ADMIN), 409, 'ALREADY_SUSPENDED')
  const active = (await result(await call(access, 'POST', { orderId: 'owned', action: 'reactivate' }, ADMIN), 200)).data
  assert.equal(active.access.state, 'active')
  assert.equal(active.access.reason, null)
  assert.equal(active.networkRevoked, false)
  const resumed = sqlite.prepare('SELECT * FROM static_ip_service_access WHERE order_id = ?').get('owned')
  assert.equal(resumed.state, 'active')
  assert.equal(resumed.reason, null)
  assert.equal(resumed.resumed_by, ADMIN)
  assert.ok(resumed.resumed_at)
  assert.deepEqual(sqlite.prepare('SELECT status,total,delivery_note FROM orders WHERE id = ?').get('owned'), originalOrder)
  assert.equal(await (await getDownload('owned', token)).text(), NOTE)
  await result(await call(download, 'POST', { orderId: 'owned' }), 200)
  await result(await call(resend, 'POST', { orderId: 'owned' }), 200)
  assert.equal(calls.length, 3)
  assert.match(calls[2].url, /\/sendDocument$/)
  assert.equal(calls[2].body.get('chat_id'), String(OWNER))
  assert.equal(await calls[2].body.get('document').text(), NOTE)
})

test('access validates service type, completion, reason and idempotent activation', async () => {
  addOrder('pending', { status: 'pending' })
  addOrder('account', { kind: 'account' })
  addOrder('active')
  for (const [body, status, code] of [
    [{ orderId: 'missing', action: 'suspend', reason: 'test' }, 404, 'ORDER_NOT_FOUND'],
    [{ orderId: 'account', action: 'suspend', reason: 'test' }, 409, 'NOT_VPN_SERVICE'],
    [{ orderId: 'pending', action: 'suspend', reason: 'test' }, 409, 'SERVICE_NOT_COMPLETED'],
    [{ orderId: 'active', action: 'suspend', reason: 'x' }, 400, 'REASON_REQUIRED'],
    [{ orderId: 'active', action: 'unknown' }, 400, 'INVALID_ACTION'],
  ]) await result(await call(access, 'POST', body, ADMIN), status, code)
  const activated = (await result(await call(access, 'POST', { orderId: 'active', action: 'reactivate' }, ADMIN), 200)).data
  assert.equal(activated.access.state, 'active')
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM static_ip_service_access').get().n, 0)
  assert.equal(calls.length, 0)
})

test('service listing hides suspended notes and remains owner-scoped after reactivation', async () => {
  addOrder('owned')
  addOrder('other', { owner: OTHER })
  await result(await call(access, 'POST', { orderId: 'owned', action: 'suspend', reason: 'abuse review' }, ADMIN), 200)
  const listed = (await result(await call(services, 'GET'), 200)).data
  assert.equal(listed.length, 1)
  assert.equal(listed[0].deliveryNote, null)
  const orderList = (await result(await call(orders, 'GET'), 200)).data
  assert.equal(orderList.length, 1)
  assert.equal(orderList[0].deliveryNote, undefined)
  assert.equal(listed[0].access.state, 'suspended')
  assert.equal(listed[0].access.reason, 'abuse review')
  assert.ok(listed[0].access.suspendedAt)
  assert.deepEqual((await result(await call(services, 'GET', undefined, OTHER), 200)).data.map(s => s.id), ['other'])
  await result(await call(access, 'POST', { orderId: 'owned', action: 'reactivate' }, ADMIN), 200)
  const restored = (await result(await call(services, 'GET'), 200)).data[0]
  assert.equal(restored.deliveryNote, NOTE)
  assert.equal(restored.access.state, 'active')
})

test('admin access updates fail closed if the current access state cannot be read', async () => {
  addOrder('owned')
  const brokenDb = {
    prepare(sql) { if (/FROM static_ip_service_access/i.test(sql)) throw new Error('simulated D1 failure'); return db.prepare(sql) },
    batch: (...args) => db.batch(...args),
  }
  await result(await call(access, 'POST', { orderId: 'owned', action: 'suspend', reason: 'review' }, ADMIN, env(brokenDb)), 503, 'DB_UNAVAILABLE')
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM static_ip_service_access').get().n, 0)
  assert.equal(calls.length, 0)
})

test('service listing fails closed if access lookup fails', async () => {
  addOrder('owned')
  const brokenDb = { prepare(sql) { if (/FROM static_ip_service_access/i.test(sql)) throw new Error('simulated D1 failure'); return db.prepare(sql) } }
  await result(await call(services, 'GET', undefined, OWNER, env(brokenDb)), 503, 'DB_UNAVAILABLE')
})

test('access lookup failure is fail-closed for download and resend', async () => {
  addOrder('owned')
  const token = (await result(await call(download, 'POST', { orderId: 'owned' }), 200)).data.token
  const brokenDb = { prepare(sql) { if (/FROM static_ip_service_access/i.test(sql)) throw new Error('simulated D1 failure'); return db.prepare(sql) }, batch: (...args) => db.batch(...args) }
  const brokenEnv = env(brokenDb)
  await result(await call(download, 'POST', { orderId: 'owned' }, OWNER, brokenEnv), 503, 'DB_UNAVAILABLE')
  await result(await getDownload('owned', token, brokenEnv), 503, 'DB_UNAVAILABLE')
  await result(await call(resend, 'POST', { orderId: 'owned' }, OWNER, brokenEnv), 503, 'DB_UNAVAILABLE')
  assert.equal(calls.length, 0)
})
