import { ApiError, apiGetProxy, apiPostProxy } from '@/services/apiClient'
import { endpoints } from '@/services/endpoints'
import { getTelegramInitData } from '@/services/telegram'
import type { SupportTicket, SupportTicketCategory } from '@/types'

/**
 * Customer support inbox — always the real D1-backed `/api/support` route.
 *
 * Identity (and therefore ticket ownership) comes from the signed Telegram
 * `initData` attached to every request; nothing here sends a `userId`.
 * Failures surface the server message and code so the UI can show the real
 * cause instead of a generic placeholder.
 */

interface SupportEnvelope<T> {
  success?: boolean
  message?: string
  code?: string
  data?: T
}

function authHeaders(): Record<string, string> | undefined {
  const initData = getTelegramInitData()
  return initData ? { 'X-Telegram-Init-Data': initData } : undefined
}

function supportFailure(payload: SupportEnvelope<unknown> | null | undefined, fallback: string): ApiError {
  const message = payload?.message?.trim()
  return new ApiError(message || fallback, { code: payload?.code })
}

export async function listSupportTickets(): Promise<SupportTicket[]> {
  const payload = await apiGetProxy<SupportEnvelope<SupportTicket[]>>(endpoints.support, {
    headers: authHeaders(),
  })
  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw supportFailure(payload, 'خواندن تیکت‌های پشتیبانی انجام نشد.')
  }
  return payload.data
}

export interface CreateSupportTicketInput {
  subject: string
  category: SupportTicketCategory
  body: string
  /** Optional order the ticket is opened for; the server verifies ownership. */
  orderId?: string | null
}

export async function createSupportTicket(input: CreateSupportTicketInput): Promise<SupportTicket> {
  const payload = await apiPostProxy<SupportEnvelope<SupportTicket>>(
    endpoints.support,
    {
      action: 'create',
      subject: input.subject,
      category: input.category,
      body: input.body,
      ...(input.orderId ? { orderId: input.orderId } : {}),
    },
    { headers: authHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw supportFailure(payload, 'ثبت درخواست پشتیبانی انجام نشد.')
  }
  return payload.data
}

export async function replyToSupportTicket(ticketId: string, body: string): Promise<SupportTicket> {
  const payload = await apiPostProxy<SupportEnvelope<SupportTicket>>(
    endpoints.support,
    { action: 'reply', ticketId, body },
    { headers: authHeaders() },
  )
  if (!payload || payload.success !== true || !payload.data) {
    throw supportFailure(payload, 'ارسال پاسخ پشتیبانی انجام نشد.')
  }
  return payload.data
}
