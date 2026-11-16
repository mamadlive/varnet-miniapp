import { create } from 'zustand'
import { env } from '@/config/env'
import { mockTelegramUser, mockUsers } from '@/services/mocks'
import { setApiAuthToken, onUnauthorized, isApiError } from '@/services/apiClient'
import { authenticateTelegram } from '@/services/auth.service'
import { getTelegramInitData, isInsideTelegram } from '@/services/telegram'
import type { TelegramUser, User } from '@/types'

/**
 * Session store — who is using the app right now.
 *
 * Auth flow (real backend):
 *   1. `hydrateSession()` reads `Telegram.WebApp.initData`.
 *   2. `POST /api/auth/telegram` verifies it server-side, upserts the user in
 *      D1 and returns the authoritative user (role included) plus a token.
 *   3. The real user is stored; demo state is never used inside Telegram.
 *
 * A valid signed `initData` is the only identity proof — there is no phone or
 * KYC step, so every authenticated Telegram account can buy immediately.
 *
 * Only when the app is opened in a plain browser (no Telegram context) does
 * `VITE_DEMO_MODE=true` seed a limited demo session.
 */

export type SessionStatus = 'idle' | 'hydrating' | 'authenticated' | 'unauthenticated' | 'error'

interface AuthState {
  user: User | null
  token: string | null
  status: SessionStatus
  isAdmin: boolean
  /** True only for the browser preview session; always false inside Telegram. */
  isDemo: boolean
  error: string | null
  errorCode: string | null
  /** Populate the store from the Telegram WebApp context (called once at boot). */
  hydrateSession: () => Promise<void>
  setSession: (payload: { user: User; token: string }) => void
  setUser: (user: User | null) => void
  setWalletBalance: (balance: number) => void
  clearSession: () => void
}

export function mapTelegramUser(telegramUser: TelegramUser, role: User['role'] = 'user'): User {
  return {
    id: `usr_tg_${telegramUser.id}`,
    telegramId: telegramUser.id,
    username: telegramUser.username,
    firstName: telegramUser.first_name,
    lastName: telegramUser.last_name,
    photoUrl: telegramUser.photo_url,
    role,
    balance: 0,
    currency: 'IRT',
    createdAt: new Date().toISOString(),
  }
}

function buildDemoUser(): User {
  return {
    ...mockUsers[0]!,
    firstName: mockTelegramUser.first_name,
    lastName: mockTelegramUser.last_name,
    username: mockTelegramUser.username,
    photoUrl: mockTelegramUser.photo_url,
  }
}

function describeAuthError(cause: unknown): { message: string; code: string | null } {
  if (isApiError(cause)) {
    return { message: cause.message, code: cause.code ?? null }
  }
  if (cause instanceof Error) return { message: cause.message, code: null }
  return { message: 'ورود به حساب تلگرام انجام نشد. دوباره تلاش کنید.', code: null }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  status: 'idle',
  isAdmin: false,
  isDemo: false,
  error: null,
  errorCode: null,

  hydrateSession: async () => {
    const current = get().status
    if (current === 'hydrating' || current === 'authenticated') return

    set({ status: 'hydrating', error: null, errorCode: null })

    const initData = getTelegramInitData()

    if (!initData) {
      if (isInsideTelegram()) {
        // A Telegram context without signed initData cannot be verified. Never
        // fall back to demo data inside the client.
        set({
          user: null,
          token: null,
          status: 'error',
          isAdmin: false,
          isDemo: false,
          error: 'داده احراز هویت تلگرام در دسترس نیست. مینی‌اپ را دوباره باز کنید.',
          errorCode: 'TELEGRAM_AUTH_REQUIRED',
        })
        return
      }

      if (env.demoMode) {
        setApiAuthToken(null)
        set({
          user: buildDemoUser(),
          token: null,
          status: 'authenticated',
          isAdmin: false,
          isDemo: true,
          error: null,
          errorCode: null,
        })
        return
      }

      set({
        user: null,
        token: null,
        status: 'unauthenticated',
        isAdmin: false,
        isDemo: false,
        error: null,
        errorCode: null,
      })
      return
    }

    try {
      const session = await authenticateTelegram(initData)
      setApiAuthToken(session.token)
      set({
        user: session.user,
        token: session.token,
        status: 'authenticated',
        isAdmin: session.user.role === 'admin',
        isDemo: false,
        error: null,
        errorCode: null,
      })
    } catch (cause) {
      const { message, code } = describeAuthError(cause)
      setApiAuthToken(null)
      set({
        user: null,
        token: null,
        status: 'error',
        isAdmin: false,
        isDemo: false,
        error: message,
        errorCode: code,
      })
    }
  },

  setSession: ({ user, token }) => {
    setApiAuthToken(token)
    set({
      user,
      token,
      status: 'authenticated',
      isAdmin: user.role === 'admin',
      isDemo: false,
      error: null,
      errorCode: null,
    })
  },

  setUser: (user) => {
    set({ user, isAdmin: user?.role === 'admin' })
  },

  setWalletBalance: (balance) => {
    const user = get().user
    if (!user) return
    set({ user: { ...user, balance } })
  },

  clearSession: () => {
    setApiAuthToken(null)
    set({
      user: null,
      token: null,
      status: 'unauthenticated',
      isAdmin: false,
      isDemo: false,
      error: null,
      errorCode: null,
    })
  },
}))

// A rejected token (401) means the session is no longer valid — drop it once.
// The browser demo session is exempt so a rejected preview API call does not
// kick the reviewer back to the "open in Telegram" screen.
onUnauthorized(() => {
  const state = useAuthStore.getState()
  if (state.isDemo || state.status === 'unauthenticated') return
  state.clearSession()
})
