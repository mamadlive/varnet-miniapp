import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios'
import { env } from '@/config/env'
import { getTelegramInitData } from '@/services/telegram'
import type { ApiEnvelope } from '@/types'

/**
 * VarNet HTTP client — the single axios instance for the live VPN backend.
 *
 * - `baseURL` comes from `VITE_API_BASE_URL` and defaults to the Linux RADIUS
 *   server root (`https://api-var.popserver.shop`); routes include `/v1`.
 * - Requests carry the Telegram `initData` (for WebApp session validation)
 *   and a `Bearer` token when one is stored.
 * - A 401 clears the stored token and notifies subscribers (the auth store
 *   uses this to drop an expired session) before the caller sees the error.
 * - Every failure is normalised into an `ApiError` with a Persian message, so
 *   UI code can render `error.message` directly.
 *
 * Digital accounts and the wallet are not served here yet — they stay on local
 * fixtures until the third-party provider proxy exists.
 */

const DEFAULT_API_BASE_URL = 'https://api-var.popserver.shop'
const AUTH_TOKEN_STORAGE_KEY = 'varnet.auth.token'

/** Resolved once at module load; trailing slashes are stripped for clean joins. */
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, '')

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class ApiError extends Error {
  readonly status: number | undefined
  readonly code: string | undefined
  readonly details: unknown

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: unknown } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/* -------------------------------------------------------------------------- */
/* Auth token (localStorage + in-memory mirror)                               */
/* -------------------------------------------------------------------------- */

let memoryToken: string | null = null

function readPersistedToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function getApiAuthToken(): string | null {
  return memoryToken ?? readPersistedToken()
}

export function setApiAuthToken(token: string | null): void {
  memoryToken = token?.trim() || null
  if (typeof window === 'undefined') return

  try {
    if (memoryToken) window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, memoryToken)
    else window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private mode / restricted WebViews).
    // The in-memory token still covers the current session.
  }
}

export function clearApiAuthToken(): void {
  setApiAuthToken(null)
}

/* -------------------------------------------------------------------------- */
/* 401 subscribers                                                            */
/* -------------------------------------------------------------------------- */

export type UnauthorizedHandler = (error: ApiError) => void

const unauthorizedHandlers = new Set<UnauthorizedHandler>()

/** Subscribe to expired/revoked sessions. Returns an unsubscribe function. */
export function onUnauthorized(handler: UnauthorizedHandler): () => void {
  unauthorizedHandlers.add(handler)
  return () => {
    unauthorizedHandlers.delete(handler)
  }
}

function notifyUnauthorized(error: ApiError): void {
  clearApiAuthToken()
  unauthorizedHandlers.forEach((handler) => {
    try {
      handler(error)
    } catch {
      // A subscriber failure must not mask the original HTTP error.
    }
  })
}

function isCredentialRequest(config?: AxiosRequestConfig): boolean {
  const url = config?.url ?? ''
  return url.includes('/auth/telegram') || url.includes('/auth/login')
}

/* -------------------------------------------------------------------------- */
/* Instance                                                                   */
/* -------------------------------------------------------------------------- */

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: env.apiTimeoutMs,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const initData = getTelegramInitData()
  if (initData && !config.headers.get('X-Telegram-Init-Data')) {
    config.headers.set('X-Telegram-Init-Data', initData)
  }

  const token = getApiAuthToken()
  if (token && !config.headers.get('Authorization')) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }

  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = normalizeApiError(error)
    const requestConfig = axios.isAxiosError(error) ? error.config : undefined

    // Failed credential exchanges are expected (wrong initData); only expire
    // the session when an authenticated request is rejected.
    if (apiError.status === 401 && !isCredentialRequest(requestConfig)) {
      notifyUnauthorized(apiError)
    }

    return Promise.reject(apiError)
  },
)

/* -------------------------------------------------------------------------- */
/* Error normalisation (FastAPI `detail` payloads)                            */
/* -------------------------------------------------------------------------- */

interface FastApiValidationDetail {
  loc?: Array<string | number>
  msg?: string
  type?: string
}

function extractMessage(error: AxiosError): string {
  const data = error.response?.data

  if (typeof data === 'string' && data.trim().length > 0) return data

  if (data && typeof data === 'object') {
    const payload = data as { detail?: unknown; message?: unknown; error?: unknown }
    if (typeof payload.message === 'string') return payload.message
    if (typeof payload.error === 'string') return payload.error
    if (payload.error && typeof payload.error === 'object') {
      const nested = payload.error as { message?: unknown }
      if (typeof nested.message === 'string' && nested.message.trim()) return nested.message
    }
    if (typeof payload.detail === 'string') return payload.detail
    if (Array.isArray(payload.detail)) {
      const first = payload.detail[0] as FastApiValidationDetail | undefined
      if (first?.msg) return first.msg
    }
  }

  if (error.code === 'ECONNABORTED') return 'زمان درخواست به پایان رسید. دوباره تلاش کنید.'
  if (error.code === 'ERR_NETWORK') return 'خطای شبکه — ارتباط با سرور برقرار نشد.'

  // Gateway-level failures (Cloudflare 502/504) carry no JSON body; never show
  // the raw "Request failed with status code 502" axios text to the user.
  const status = error.response?.status
  if (status === 502) {
    return 'سرور پاسخ معتبری برنگرداند (۵۰۲). چند لحظه بعد دوباره تلاش کنید.'
  }
  if (status === 504) return 'پاسخی از سرور دریافت نشد (۵۰۴). دوباره تلاش کنید.'
  if (typeof status === 'number' && status >= 500) {
    return `خطای داخلی سرور (کد ${status}). دوباره تلاش کنید.`
  }
  if (status === 429) return 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد تلاش کنید.'

  return error.message || 'خطای شبکه‌ای غیرمنتظره رخ داد.'
}

export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data as { code?: unknown } | undefined
    return new ApiError(extractMessage(error), {
      status: error.response?.status,
      code: typeof responseData?.code === 'string' ? responseData.code : error.code,
      details: error.response?.data,
    })
  }

  if (error instanceof Error) return new ApiError(error.message)
  return new ApiError('خطای غیرمنتظره رخ داد.')
}

/* -------------------------------------------------------------------------- */
/* Typed request helpers                                                      */
/* -------------------------------------------------------------------------- */

/** Unwrap `{ success, data }` envelopes while still supporting bare payloads. */
export function unwrapApiEnvelope<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data
  }
  return payload as T
}

export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const { data } = await apiClient.get<T>(url, config)
  return data
}

/**
 * Call a same-origin Cloudflare Pages Function (`/api/...`).
 *
 * Relative URLs are resolved against the app origin — never against the RADIUS
 * `baseURL` — and no auth token/initData is attached, so provider credentials
 * must stay in the Pages environment.
 */
export async function apiGetProxy<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  try {
    const { data } = await axios.get<T>(url, { timeout: env.apiTimeoutMs, ...config })
    return data
  } catch (error) {
    throw normalizeApiError(error)
  }
}

/** POST counterpart of `apiGetProxy` for same-origin Pages Functions. */
export async function apiPostProxy<T, TBody = unknown>(
  url: string,
  body?: TBody,
  config?: AxiosRequestConfig,
): Promise<T> {
  try {
    const { data } = await axios.post<T>(url, body, { timeout: env.apiTimeoutMs, ...config })
    return data
  } catch (error) {
    throw normalizeApiError(error)
  }
}

export async function apiGetData<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  return unwrapApiEnvelope(await apiGet<ApiEnvelope<T> | T>(url, config))
}

export async function apiPost<T, TBody = unknown>(
  url: string,
  body?: TBody,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.post<T>(url, body, config)
  return data
}

export async function apiPostData<T, TBody = unknown>(
  url: string,
  body?: TBody,
  config?: AxiosRequestConfig,
): Promise<T> {
  return unwrapApiEnvelope(await apiPost<ApiEnvelope<T> | T, TBody>(url, body, config))
}

export async function apiPatchData<T, TBody = unknown>(
  url: string,
  body?: TBody,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.patch<ApiEnvelope<T> | T>(url, body, config)
  return unwrapApiEnvelope(data)
}

export async function apiDelete(url: string, config?: AxiosRequestConfig): Promise<void> {
  await apiClient.delete(url, config)
}

export default apiClient
