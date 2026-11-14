import { sleep } from '@/lib/utils'
import { mockOrders } from '@/services/mocks'
import type { Order } from '@/types'

/**
 * Digital-account orders will be issued by the third-party provider behind the
 * Cloudflare proxy; VPN purchases go straight to `POST /v1/provision` in
 * `vpn.service.ts`. Until the provider proxy exists, order history is local.
 */
export async function listOrders(): Promise<Order[]> {
  await sleep(240)
  return mockOrders
}

export async function getOrder(id: string): Promise<Order | null> {
  await sleep(180)
  return mockOrders.find((order) => order.id === id) ?? null
}
