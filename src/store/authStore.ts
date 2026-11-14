import { create } from 'zustand'
import { env } from '@/config/env'
import { mockTelegramUser, mockUsers } from '@/services/mocks'
import { getApiAuthToken, onUnauthorized, setApiAuthToken } from '@/services/apiClient'
import { getTelegramUser, isInsideTelegram, requestPhoneNumber } from '@/services/telegram'
import type { TelegramUser, User } from '@/types'

/**
 * Session store — who is using the app right now.
 *
 * Auth flow (real backend):
 *   1. `hydrateSession()` reads `Telegram.WebApp.initData`.
 *   2. `POST /auth/telegram` exchanges it for a JWT (`token`).
 *   3. `setSession(user, token)` stores both; axios then sends the token.
 *
 * Outside Telegram, `VITE_DEMO_MODE=true` seeds a demo user so all screens
 * remain reviewable in a desktop browser.
 */

export type SessionStatus = 'idle' | 'hydrating' | 'authenticated' | 'unauthenticated' | 'error'

interface AuthState {
  user: User | null
  token: string | null
  status: SessionStatus
  isAdmin: boolean
  error: string | null
  /** Populate the store from the Telegram WebApp context (called once at boot). */
  hydrateSession: () => void
  setSession: (payload: { user: User; token: string }) => void
  setUser: (user: User | null) => void
  setWalletBalance: (balance: number) => void
  /** Complete phone-based KYC (native Telegram contact sharing, or demo fallback). */
  verifyWithPhone: () => Promise<void>
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
    verified: false,
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  status: 'idle',
  isAdmin: false,
  error: null,

  hydrateSession: () => {
    if (get().status !== 'idle') return

    set({ status: 'hydrating', error: null })

    const telegramUser = getTelegramUser()
    if (telegramUser) {
      const sessionUser = mapTelegramUser(telegramUser)
      // `initData` authenticates via the X-Telegram-Init-Data header; only a
      // JWT from POST /auth/telegram belongs in the Bearer slot.
      const token = getApiAuthToken()
      set({ user: sessionUser, token, status: 'authenticated', isAdmin: false })
      return
    }

    if (env.demoMode) {
      // Browser preview: seed a session so the skeleton is fully clickable.
      const demoUser = buildDemoUser()
      set({ user: demoUser, token: getApiAuthToken(), status: 'authenticated', isAdmin: false })
      return
    }

    set({ status: 'unauthenticated' })
  },

  setSession: ({ user, token }) => {
    setApiAuthToken(token)
    set({ user, token, status: 'authenticated', isAdmin: user.role === 'admin', error: null })
  },

  setUser: (user) => {
    set({ user, isAdmin: user?.role === 'admin' })
  },

  setWalletBalance: (balance) => {
    const user = get().user
    if (!user) return
    set({ user: { ...user, balance } })
  },

  verifyWithPhone: async () => {
    const user = get().user
    if (!user) throw new Error('برای احراز هویت باید وارد حساب شوید.')
    if (user.verified) return

    const insideTelegram = isInsideTelegram()
    const result = await requestPhoneNumber()

    let phoneNumber: string | undefined
    if (result.status === 'sent') {
      phoneNumber = result.phoneNumber ?? 'ثبت‌شده در تلگرام'
    } else if (!insideTelegram && env.demoMode) {
      // Browser preview has no native contact dialog — simulate a verified
      // phone so the purchase gate can still be reviewed end to end.
      phoneNumber = '+98 912 555 0147'
    } else if (result.status === 'cancelled') {
      throw new Error('اشتراک‌گذاری شماره لغو شد. برای خرید، شماره خود را تأیید کنید.')
    } else {
      throw new Error('اشتراک‌گذاری شماره فقط داخل تلگرام ممکن است.')
    }

    set({
      user: {
        ...get().user!,
        verified: true,
        phoneNumber,
        verifiedAt: new Date().toISOString(),
      },
    })
  },

  clearSession: () => {
    setApiAuthToken(null)
    set({ user: null, token: null, status: 'unauthenticated', isAdmin: false, error: null })
  },
}))

// A rejected token (401) means the session is no longer valid — drop it once.
onUnauthorized(() => {
  if (useAuthStore.getState().status === 'unauthenticated') return
  useAuthStore.getState().clearSession()
})
