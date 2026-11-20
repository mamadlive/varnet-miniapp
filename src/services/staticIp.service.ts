import { ApiError, apiGetProxy, apiPostProxy } from '@/services/apiClient'
import { endpoints } from '@/services/endpoints'
import { getTelegramInitData } from '@/services/telegram'
import type {
  Currency,
  PurchasedStaticIpService,
  StaticIpNode,
  StaticIpPlan,
  VpnPlan,
  VpnServer,
} from '@/types'

/**
 * Static-IP storefront reads D1 through Pages Functions only:
 * - `GET /api/static-ip/plans`    → admin-managed selling plans,
 * - `GET /api/static-ip/nodes`    → admin-managed node catalogue (enabled nodes),
 * - `GET /api/static-ip/services` → the customer's pending/paid/completed `vpn` orders.
 * There are no local fixtures behind this surface.
 */

interface NodesEnvelope {
  success?: boolean
  message?: string
  data?: StaticIpNode[]
}

interface PlansEnvelope {
  success?: boolean
  message?: string
  data?: StaticIpPlan[]
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

export async function listStaticIpPlans(): Promise<StaticIpPlan[]> {
  const payload = await apiGetProxy<PlansEnvelope>(endpoints.staticIp.plans)
  if (!payload || payload.success !== true || !Array.isArray(payload.data)) {
    throw new Error(payload?.message || 'خواندن پلن‌های آی‌پی ثابت از سرور انجام نشد.')
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

export async function createConfigDownloadUrl(orderId: string): Promise<string> {
  const response = await apiPostProxy<{ success: boolean; data?: { token: string }; message?: string; code?: string }>(
    endpoints.staticIp.download, { orderId }, { headers: authHeaders() },
  )
  if (!response?.success || !response.data?.token) {
    throw new ApiError(response?.message || 'لینک دانلود ایجاد نشد.', { code: response?.code })
  }
  const url = new URL(endpoints.staticIp.download, window.location.origin)
  url.searchParams.set('orderId', orderId)
  url.searchParams.set('token', response.data.token)
  return url.toString()
}

export async function resendConfigToTelegram(orderId: string): Promise<void> {
  const response = await apiPostProxy<{ success: boolean; message?: string; code?: string }>(
    endpoints.staticIp.resend, { orderId }, { headers: authHeaders() },
  )
  if (!response?.success) {
    throw new ApiError(response?.message || 'ارسال فایل به تلگرام انجام نشد.', { code: response?.code })
  }
}

/** Admin plan row → purchasable storefront plan. */
export function mapPlanToVpnPlan(plan: StaticIpPlan): VpnPlan {
  const isActive = plan.enabled
  return {
    id: plan.id,
    name: plan.name,
    serverId: plan.nodeId,
    location: plan.country,
    countryCode: plan.countryCode,
    price: plan.price,
    currency: plan.currency as Currency,
    durationDays: plan.durationDays,
    dataCapGb: plan.dataCapGb,
    staticIp: true,
    stock: plan.availability === 'in_stock' ? 999 : 0,
    isActive,
    isFeatured: plan.isFeatured,
    availability: plan.availability,
    features: [
      `${plan.dataCapGb} گیگابایت حجم`,
      `${plan.durationDays} روز اعتبار`,
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
