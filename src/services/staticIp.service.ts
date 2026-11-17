import { apiGetProxy } from '@/services/apiClient'
import { endpoints } from '@/services/endpoints'
import { getTelegramInitData } from '@/services/telegram'
import type {
  Currency,
  PurchasedStaticIpService,
  StaticIpNode,
  VpnPlan,
  VpnServer,
} from '@/types'

/**
 * Static-IP storefront reads D1 through Pages Functions only:
 * - `GET /api/static-ip/nodes`    → admin-managed catalogue (enabled nodes),
 * - `GET /api/static-ip/services` → the customer's completed `vpn` orders.
 * There are no local fixtures behind this surface.
 */

interface NodesEnvelope {
  success?: boolean
  message?: string
  data?: StaticIpNode[]
}

interface ServicesEnvelope {
  success?: boolean
  message?: string
  data?: PurchasedStaticIpService[]
}

function authHeaders(): Record<string, string> | undefined {
  const initData = getTelegramInitData()
  return initData ? { 'X-Telegram-Init-Data': initData } : undefined
}

export async function listStaticIpNodes(): Promise<StaticIpNode[]> {
  const payload = await apiGetProxy<NodesEnvelope>(endpoints.staticIp.nodes)
  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error(payload?.message || 'خواندن نودهای آی‌پی ثابت از سرور انجام نشد.')
  }
  return payload.data
}

export async function listPurchasedServices(): Promise<PurchasedStaticIpService[]> {
  const payload = await apiGetProxy<ServicesEnvelope>(endpoints.staticIp.services, {
    headers: authHeaders(),
  })
  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error(payload?.message || 'خواندن سرویس‌های فعال از سرور انجام نشد.')
  }
  return payload.data
}

/** Admin node row → purchasable storefront plan. */
export function mapNodeToPlan(node: StaticIpNode): VpnPlan {
  const isActive = node.availability === 'in_stock'
  return {
    id: node.id,
    name: node.name,
    serverId: node.id,
    location: node.country,
    countryCode: node.countryCode,
    price: node.price,
    currency: node.currency as Currency,
    durationDays: node.durationDays,
    dataCapGb: node.dataCapGb,
    staticIp: true,
    stock: isActive ? 999 : 0,
    isActive,
    availability: node.availability,
    features: [
      `${node.dataCapGb} گیگابایت حجم`,
      `${node.durationDays} روز اعتبار`,
      'آی‌پی ثابت اختصاصی',
      'تونل امن OpenVPN (UDP)',
    ],
  }
}

/** Admin node row → node strip entry. */
export function mapNodeToServer(node: StaticIpNode): VpnServer {
  const slug = node.id.replace(/^node_/, '')
  return {
    id: node.id,
    name: node.name,
    hostname: `${slug}-01.ip.varnet.internal`,
    ip: node.ip,
    country: node.country,
    countryCode: node.countryCode,
    protocol: node.protocol,
    status:
      node.availability === 'in_stock'
        ? 'online'
        : node.availability === 'coming_soon'
          ? 'coming_soon'
          : 'offline',
    load: 0,
    activeClients: 0,
    maxClients: 200,
    createdAt: node.createdAt,
  }
}
