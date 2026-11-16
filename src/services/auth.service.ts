import { ApiError, apiPostProxy } from '@/services/apiClient'
import { endpoints } from '@/services/endpoints'
import type { User } from '@/types'

/**
 * Telegram Web App login.
 *
 * The server verifies `initData` with the bot token, upserts the Telegram
 * account into D1 and returns the authoritative user (including role). This
 * client never derives a role or session locally.
 */

interface TelegramAuthEnvelope {
  success?: boolean
  message?: string
  code?: string
  data?: {
    token?: string
    expiresAt?: string
    user?: User
  }
}

export interface TelegramSession {
  user: User
  token: string
  expiresAt?: string
}

export async function authenticateTelegram(initData: string): Promise<TelegramSession> {
  const payload = await apiPostProxy<TelegramAuthEnvelope>(endpoints.auth.telegram, { initData })

  if (!payload?.success || !payload.data?.token || !payload.data.user) {
    throw new ApiError(payload?.message || 'پاسخ سرور احراز هویت معتبر نبود.', {
      code: payload?.code,
      details: payload,
    })
  }

  return {
    user: payload.data.user,
    token: payload.data.token,
    expiresAt: payload.data.expiresAt,
  }
}
