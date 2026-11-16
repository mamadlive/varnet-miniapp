import { env } from '@/config/env'
import { ApiError, apiGetProxy, apiPostProxy, isApiError } from '@/services/apiClient'

/**
 * Desktop admin session — a signed token issued by the Telegram-OTP login.
 *
 * The token lives in localStorage (as required for the web panel) and is sent
 * as `Authorization: Bearer …` on every `/api/admin/*` request. There is no
 * demo or initData fallback here: a valid admin token or a real Telegram admin
 * session is the only way into `/admin`.
 */

const ADMIN_TOKEN_STORAGE_KEY = 'varnet.admin.token'

let memoryToken: string | null | undefined

export function getAdminSessionToken(): string | null {
  if (memoryToken !== undefined) return memoryToken
  if (typeof window === 'undefined') return null
  try {
    memoryToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)
  } catch {
    memoryToken = null
  }
  return memoryToken
}

export function setAdminSessionToken(token: string | null): void {
  memoryToken = token?.trim() || null
  if (typeof window === 'undefined') return
  try {
    if (memoryToken) window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, memoryToken)
    else window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  } catch {
    // Private mode: the in-memory token still covers this tab.
  }
}

export function clearAdminSessionToken(): void {
  setAdminSessionToken(null)
}

export interface AdminProfile {
  telegramId: number
  firstName: string
  lastName?: string
  username?: string
  role: 'admin'
}

interface AdminEnvelope<T> {
  success?: boolean
  message?: string
  code?: string
  data?: T
}

function unwrap<T>(payload: AdminEnvelope<T> | null, fallback: string): T {
  if (!payload || payload.success !== true || payload.data === undefined) {
    throw new ApiError(payload?.message || fallback, { code: payload?.code })
  }
  return payload.data
}

export interface RequestOtpResult {
  expiresAt: string
  expiresInSeconds: number
  cooldownSeconds: number
}

export async function requestAdminOtp(): Promise<RequestOtpResult> {
  const payload = await apiPostProxy<AdminEnvelope<RequestOtpResult>>(
    '/api/admin/auth/request-otp',
    {},
    { timeout: env.apiTimeoutMs },
  )
  return unwrap(payload, 'ارسال کد تایید به تلگرام انجام نشد.')
}

export interface AdminSession {
  token: string
  expiresAt: string
  admin: AdminProfile
}

export async function verifyAdminOtp(code: string): Promise<AdminSession> {
  const payload = await apiPostProxy<AdminEnvelope<AdminSession>>(
    '/api/admin/auth/verify-otp',
    { code },
    { timeout: env.apiTimeoutMs },
  )
  const session = unwrap(payload, 'بررسی کد تایید انجام نشد.')
  setAdminSessionToken(session.token)
  return session
}

export async function fetchAdminSession(): Promise<AdminProfile> {
  const token = getAdminSessionToken()
  if (!token) {
    throw new ApiError('نشست مدیریتی یافت نشد. با کد تایید وارد شوید.', {
      code: 'ADMIN_AUTH_REQUIRED',
      status: 401,
    })
  }

  try {
    const payload = await apiGetProxy<AdminEnvelope<{ admin: AdminProfile }>>(
      '/api/admin/auth/session',
      { timeout: env.apiTimeoutMs, headers: { Authorization: `Bearer ${token}` } },
    )
    return unwrap(payload, 'نشست مدیریتی معتبر نیست.').admin
  } catch (error) {
    if (isApiError(error) && (error.status === 401 || error.status === 403)) {
      clearAdminSessionToken()
    }
    throw error
  }
}

export function logoutAdmin(): void {
  clearAdminSessionToken()
}
