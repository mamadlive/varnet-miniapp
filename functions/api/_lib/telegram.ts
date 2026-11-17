/**
 * Telegram Web App primitives shared by Pages Functions.
 *
 * - `verifyInitData` checks the HMAC-SHA256 signature from the Bot API spec.
 * - `configuredAdminIds` parses the `ADMIN_TELEGRAM_IDS` allow-list.
 * - `createSessionToken` / `verifySessionToken` issue and validate a stateless
 *   session token signed with a key derived from `TELEGRAM_BOT_TOKEN`.
 *
 * Files under a `_`-prefixed path are not routed by Cloudflare Pages.
 */

export interface TelegramMiniAppUser {
  id: number
  username?: string
  first_name?: string
  last_name?: string
  photo_url?: string
}

/** Reject replayed `initData` older than a day. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const SESSION_VERSION = 'v1'

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function hmacSha256(
  keyBytes: BufferSource,
  message: string,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

/** Verify `initData` and return the embedded user, or `null` when tampered/expired. */
export async function verifyInitData(
  initData: string,
  botToken: string,
): Promise<TelegramMiniAppUser | null> {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken)
  const signature = toHex(await hmacSha256(secretKey, dataCheckString))
  if (!timingSafeEqual(signature, hash.toLowerCase())) return null

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate) || authDate <= 0) return null
  if (Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SECONDS) return null

  const rawUser = params.get('user')
  if (!rawUser) return null

  try {
    const parsed = JSON.parse(rawUser) as {
      id?: unknown
      username?: unknown
      first_name?: unknown
      last_name?: unknown
      photo_url?: unknown
    }
    const id = Number(parsed.id)
    if (!Number.isInteger(id) || id <= 0) return null
    return {
      id,
      username: typeof parsed.username === 'string' ? parsed.username : undefined,
      first_name: typeof parsed.first_name === 'string' ? parsed.first_name : undefined,
      last_name: typeof parsed.last_name === 'string' ? parsed.last_name : undefined,
      photo_url: typeof parsed.photo_url === 'string' ? parsed.photo_url : undefined,
    }
  } catch {
    return null
  }
}

/** Canonical form for Telegram ids compared against `ADMIN_TELEGRAM_IDS`. */
export function telegramIdKey(id: string | number): string {
  return String(id).trim()
}

/** Parse the comma/space separated `ADMIN_TELEGRAM_IDS` allow-list. */
export function configuredAdminIds(env: { ADMIN_TELEGRAM_IDS?: string }): Set<string> {
  return new Set(
    (env.ADMIN_TELEGRAM_IDS ?? '')
      .split(/[\s,]+/)
      .map((value) => telegramIdKey(value))
      .filter((value) => /^\d+$/.test(value) && Number(value) > 0),
  )
}

async function sessionKey(botToken: string): Promise<ArrayBuffer> {
  return hmacSha256(new TextEncoder().encode('varnet-session-v1'), botToken)
}

export interface SessionToken {
  token: string
  expiresAt: string
}

/** Issue a stateless session token bound to a Telegram user id. */
export async function createSessionToken(
  telegramId: number,
  botToken: string,
  ttlSeconds = SESSION_TTL_SECONDS,
): Promise<SessionToken> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + ttlSeconds
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ sub: telegramId, iat: issuedAt, exp: expiresAt })),
  )
  const signature = base64UrlEncode(
    new Uint8Array(await hmacSha256(await sessionKey(botToken), payload)),
  )
  return {
    token: `${SESSION_VERSION}.${payload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

/** Return the Telegram id from a valid session token, or `null`. */
export async function verifySessionToken(
  token: string,
  botToken: string,
): Promise<number | null> {
  const [version, payload, signature, extra] = token.split('.')
  if (version !== SESSION_VERSION || !payload || !signature || extra) return null

  const payloadBytes = base64UrlDecode(payload)
  if (!payloadBytes) return null

  const expected = base64UrlEncode(
    new Uint8Array(await hmacSha256(await sessionKey(botToken), payload)),
  )
  if (!timingSafeEqual(expected, signature)) return null

  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      sub?: unknown
      exp?: unknown
    }
    const telegramId = Number(parsed.sub)
    const expiresAt = Number(parsed.exp)
    if (!Number.isInteger(telegramId) || telegramId <= 0) return null
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) return null
    return telegramId
  } catch {
    return null
  }
}

export async function createStaticIpDownloadToken(
  telegramId: number,
  orderId: string,
  botToken: string,
): Promise<string> {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    sub: telegramId,
    orderId,
    exp: Math.floor(Date.now() / 1000) + 120,
  })))
  const signature = base64UrlEncode(new Uint8Array(await hmacSha256(
    new TextEncoder().encode(botToken),
    `varnet-static-ip-download-v1.${payload}`,
  )))
  return `${payload}.${signature}`
}

export async function verifyStaticIpDownloadToken(
  token: string,
  orderId: string,
  botToken: string,
): Promise<number | null> {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra || token.length > 2048) return null
  const expected = base64UrlEncode(new Uint8Array(await hmacSha256(
    new TextEncoder().encode(botToken),
    `varnet-static-ip-download-v1.${payload}`,
  )))
  if (!timingSafeEqual(expected, signature)) return null
  const bytes = base64UrlDecode(payload)
  if (!bytes) return null
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes)) as {
      sub?: unknown; orderId?: unknown; exp?: unknown
    }
    const now = Math.floor(Date.now() / 1000)
    if (!Number.isSafeInteger(data.sub) || Number(data.sub) <= 0 || data.orderId !== orderId ||
        !Number.isInteger(data.exp) || Number(data.exp) <= now || Number(data.exp) > now + 120) {
      return null
    }
    return Number(data.sub)
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Admin web session (Telegram OTP login)                                     */
/* -------------------------------------------------------------------------- */

const ADMIN_SESSION_VERSION = 'a1'
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60

async function adminSessionKey(botToken: string): Promise<ArrayBuffer> {
  return hmacSha256(new TextEncoder().encode('varnet-admin-session-v1'), botToken)
}

/** Issue a signed session for the desktop admin panel. */
export async function createAdminSessionToken(
  telegramId: number,
  botToken: string,
  ttlSeconds = ADMIN_SESSION_TTL_SECONDS,
): Promise<SessionToken> {
  const issuedAt = Math.floor(Date.now() / 1000)
  const expiresAt = issuedAt + ttlSeconds
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ sub: telegramId, scope: 'admin', iat: issuedAt, exp: expiresAt }),
    ),
  )
  const signature = base64UrlEncode(
    new Uint8Array(await hmacSha256(await adminSessionKey(botToken), payload)),
  )
  return {
    token: `${ADMIN_SESSION_VERSION}.${payload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  }
}

/** Return the Telegram id from a valid admin session token, or `null`. */
export async function verifyAdminSessionToken(
  token: string,
  botToken: string,
): Promise<number | null> {
  const [version, payload, signature, extra] = token.split('.')
  if (version !== ADMIN_SESSION_VERSION || !payload || !signature || extra) return null

  const payloadBytes = base64UrlDecode(payload)
  if (!payloadBytes) return null

  const expected = base64UrlEncode(
    new Uint8Array(await hmacSha256(await adminSessionKey(botToken), payload)),
  )
  if (!timingSafeEqual(expected, signature)) return null

  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      sub?: unknown
      scope?: unknown
      exp?: unknown
    }
    if (parsed.scope !== 'admin') return null
    const telegramId = Number(parsed.sub)
    const expiresAt = Number(parsed.exp)
    if (!Number.isInteger(telegramId) || telegramId <= 0) return null
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1000) return null
    return telegramId
  } catch {
    return null
  }
}
