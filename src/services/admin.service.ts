import { sleep } from '@/lib/utils'
import {
  mockAdminStats,
  mockOrders,
  mockRevenueSeries,
  mockUsers,
  mockVpnServers,
} from '@/services/mocks'
import type { AdminStats, Order, RevenuePoint, User, VpnServer } from '@/types'

/**
 * The admin panel has no backend yet. All views render from local fixtures;
 * VPN provisioning data will come from the RADIUS API once admin routes are
 * defined there.
 */

export async function fetchAdminStats(): Promise<AdminStats> {
  await sleep(200)
  return mockAdminStats
}

export async function fetchRevenueSeries(): Promise<RevenuePoint[]> {
  await sleep(220)
  return mockRevenueSeries
}

export async function listUsers(): Promise<User[]> {
  await sleep(260)
  return mockUsers
}

export async function listAdminOrders(): Promise<Order[]> {
  await sleep(240)
  return mockOrders
}

export async function listAdminServers(): Promise<VpnServer[]> {
  await sleep(200)
  return mockVpnServers
}
