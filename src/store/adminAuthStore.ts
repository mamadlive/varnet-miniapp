import { create } from 'zustand'
import {
  clearAdminSessionToken,
  fetchAdminSession,
  getAdminSessionToken,
  requestAdminOtp,
  verifyAdminOtp,
  type AdminProfile,
  type RequestOtpResult,
} from '@/services/adminAuth.service'
import { isApiError } from '@/services/apiClient'

type AdminSessionStatus = 'idle' | 'checking' | 'authenticated' | 'unauthenticated'

interface AdminAuthState {
  token: string | null
  admin: AdminProfile | null
  status: AdminSessionStatus
  error: string | null
  errorCode: string | null
  /** Validate the stored token against the server (called by the guard). */
  hydrate: () => Promise<void>
  requestOtp: () => Promise<RequestOtpResult>
  verifyOtp: (code: string) => Promise<void>
  logout: () => void
}

/**
 * Desktop admin session store.
 *
 * Deliberately separate from the Mini App auth store: a browser visitor with
 * no Telegram `initData` can only become an admin through a valid OTP session.
 * `isAdmin` in the Mini App store never satisfies this store.
 */
export const useAdminAuthStore = create<AdminAuthState>((set, get) => ({
  token: getAdminSessionToken(),
  admin: null,
  status: 'idle',
  error: null,
  errorCode: null,

  hydrate: async () => {
    const token = getAdminSessionToken()
    if (!token) {
      set({ token: null, admin: null, status: 'unauthenticated', error: null, errorCode: null })
      return
    }
    if (get().status === 'checking') return

    set({ token, status: 'checking', error: null, errorCode: null })
    try {
      const admin = await fetchAdminSession()
      set({ admin, status: 'authenticated', error: null, errorCode: null })
    } catch (cause) {
      clearAdminSessionToken()
      set({
        token: null,
        admin: null,
        status: 'unauthenticated',
        error: cause instanceof Error ? cause.message : 'نشست مدیریتی معتبر نیست.',
        errorCode: isApiError(cause) ? (cause.code ?? null) : null,
      })
    }
  },

  requestOtp: async () => requestAdminOtp(),

  verifyOtp: async (code) => {
    try {
      const session = await verifyAdminOtp(code)
      set({
        token: session.token,
        admin: session.admin,
        status: 'authenticated',
        error: null,
        errorCode: null,
      })
    } catch (cause) {
      set({
        error: cause instanceof Error ? cause.message : 'بررسی کد تایید انجام نشد.',
        errorCode: isApiError(cause) ? (cause.code ?? null) : null,
      })
      throw cause
    }
  },

  logout: () => {
    clearAdminSessionToken()
    set({
      token: null,
      admin: null,
      status: 'unauthenticated',
      error: null,
      errorCode: null,
    })
  },
}))
