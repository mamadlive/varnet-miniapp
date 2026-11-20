/**
 * Time-based one-time passwords (RFC 6238) implemented on the Web Crypto API.
 *
 * Delivered accounts and CDKs frequently carry a 2FA seed; customers need a
 * live 6-digit code without leaving the Mini App (no 2fa.live round-trip, no
 * network call — the seed never leaves the device).
 *
 * Only SHA-1 / 6 digits / 30 seconds is produced because that is what every
 * authenticator-compatible provider issues.
 */

export const TOTP_PERIOD_SECONDS = 30
export const TOTP_DIGITS = 6

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Keys under which a provider JSON payload exposes the shared secret. */
const SECRET_KEY_NAMES = new Set([
  'secret',
  'secretkey',
  'twofactor',
  'twofactorsecret',
  'twofa',
  '2fa',
  '2fasecret',
  'totp',
  'totpsecret',
  'otp',
  'otpsecret',
  'authenticator',
  'setupkey',
  'sharedsecret',
])

/** Uppercase, strip separators/padding — the canonical Base32 form. */
export function normalizeTotpSecret(secret: string): string {
  return secret.replace(/[\s_=-]/g, '').toUpperCase()
}

export function isValidTotpSecret(secret: string): boolean {
  const clean = normalizeTotpSecret(secret)
  return clean.length >= 8 && /^[A-Z2-7]+$/.test(clean)
}

/** Decodes a Base32 secret into raw key bytes (RFC 4648). */
function base32ToBytes(secret: string): Uint8Array<ArrayBuffer> {
  const clean = normalizeTotpSecret(secret)
  const bytes: number[] = []
  let buffer = 0
  let bits = 0

  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char)
    if (value === -1) continue
    buffer = (buffer << 5) | value
    bits += 5
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return new Uint8Array(bytes)
}

/** Seconds left in the current 30-second window, for the countdown ring. */
export function totpSecondsRemaining(timestamp = Date.now(), period = TOTP_PERIOD_SECONDS): number {
  const elapsed = Math.floor(timestamp / 1000) % period
  return period - elapsed
}

/** RFC 6238 code for `timestamp` (defaults to now). */
export async function generateTotpCode(
  secret: string,
  timestamp = Date.now(),
): Promise<string> {
  const keyBytes = base32ToBytes(secret)
  if (keyBytes.length === 0) throw new Error('کلید 2FA نامعتبر است.')

  const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS)
  const message = new Uint8Array(8)
  let remaining = counter
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = remaining & 0xff
    remaining = Math.floor(remaining / 256)
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))

  const offset = signature[signature.length - 1]! & 0x0f
  const binary =
    ((signature[offset]! & 0x7f) << 24) |
    ((signature[offset + 1]! & 0xff) << 16) |
    ((signature[offset + 2]! & 0xff) << 8) |
    (signature[offset + 3]! & 0xff)

  const code = binary % 10 ** TOTP_DIGITS
  return String(code).padStart(TOTP_DIGITS, '0')
}

function matchesSecretKey(key: string): boolean {
  return SECRET_KEY_NAMES.has(key.toLowerCase().replace(/[\s_-]/g, ''))
}

function findSecretInRecord(record: Record<string, unknown>, depth: number): string | null {
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== 'string' || !matchesSecretKey(key)) continue
    const candidate = normalizeTotpSecret(entry)
    if (isValidTotpSecret(candidate)) return candidate
  }

  if (depth >= 4) return null
  for (const entry of Object.values(record)) {
    if (!entry || typeof entry !== 'object') continue
    const found = Array.isArray(entry)
      ? findSecretInArray(entry, depth + 1)
      : findSecretInRecord(entry as Record<string, unknown>, depth + 1)
    if (found) return found
  }
  return null
}

function findSecretInArray(items: unknown[], depth: number): string | null {
  if (depth > 4) return null
  for (const item of items) {
    if (typeof item === 'string') {
      const candidate = normalizeTotpSecret(item)
      if (candidate.length >= 16 && isValidTotpSecret(candidate)) return candidate
      continue
    }
    if (!item || typeof item !== 'object') continue
    const found = Array.isArray(item)
      ? findSecretInArray(item, depth + 1)
      : findSecretInRecord(item as Record<string, unknown>, depth + 1)
    if (found) return found
  }
  return null
}

/**
 * Pulls the Base32 seed out of whatever the customer pasted: an
 * `otpauth://` URI, a provider JSON blob (`{"two_factor_secret":"…"}`), a
 * labelled line (`Secret: JBSWY…`) or a bare Base32 token.
 */
export function extractTotpSecret(input: string): string | null {
  const text = input?.trim()
  if (!text) return null

  const otpauth = text.match(/otpauth:\/\/[^\s]*[?&]secret=([A-Za-z2-7]+)/i)
  if (otpauth?.[1]) {
    const candidate = normalizeTotpSecret(otpauth[1])
    if (isValidTotpSecret(candidate)) return candidate
  }

  try {
    const parsed: unknown = JSON.parse(text)
    const fromJson =
      parsed && typeof parsed === 'object'
        ? Array.isArray(parsed)
          ? findSecretInArray(parsed, 0)
          : findSecretInRecord(parsed as Record<string, unknown>, 0)
        : null
    if (fromJson) return fromJson
  } catch {
    // Not JSON — fall through to the plain-text patterns.
  }

  const labelled = text.match(
    /(?:secret|2fa|totp|otp|two[\s_-]?factor|authenticator)[^A-Za-z2-7]{0,16}([A-Za-z2-7]{8,})/i,
  )
  if (labelled?.[1]) {
    const candidate = normalizeTotpSecret(labelled[1])
    if (isValidTotpSecret(candidate)) return candidate
  }

  const standalone = text.match(/\b([A-Za-z2-7]{16,})\b/)
  if (standalone?.[1]) {
    const candidate = normalizeTotpSecret(standalone[1])
    if (isValidTotpSecret(candidate)) return candidate
  }

  return null
}
