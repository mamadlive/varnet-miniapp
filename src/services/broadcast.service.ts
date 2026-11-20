import { getAdminSessionToken } from '@/services/adminAuth.service'
import { getTelegramInitData } from '@/services/telegram'

export interface BroadcastRecord {
  id: string
  message: string
  audience: 'all_users' | 'channel'
  target: string | null
  created_at: string
  total: number
  sent: number
  failed: number
  pending: number
  sending: number
  unknown: number
}
export interface BroadcastInput {
  message: string
  audience: 'all_users' | 'channel'
  target: string
  photoUrl: string
  buttonLabel: string
  buttonUrl: string
}
async function request<T>(method: string, body?: unknown): Promise<{ data: T; retryAfter?: number }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = getAdminSessionToken()
  const initData = getTelegramInitData()
  if (token) headers.Authorization = `Bearer ${token}`
  if (initData) headers['X-Telegram-Init-Data'] = initData
  const response = await fetch('/api/admin/broadcast', { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string; retryAfter?: number } | null
  if (!response.ok || payload?.success !== true || payload.data == null) throw new Error(payload?.message || 'پاسخ سرور نامعتبر بود.')
  return { data: payload.data, retryAfter: payload.retryAfter }
}
export async function listBroadcasts() { return (await request<BroadcastRecord[]>('GET')).data }
export async function createBroadcast(input: BroadcastInput) { return (await request<BroadcastRecord>('POST', input)).data }
export async function processBroadcast(id: string) { return request<BroadcastRecord>('PATCH', { id }) }
