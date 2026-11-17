import { onRequestPost as __api_admin_auth_request_otp_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\auth\\request-otp.ts"
import { onRequestGet as __api_admin_auth_session_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\auth\\session.ts"
import { onRequestPost as __api_admin_auth_verify_otp_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\auth\\verify-otp.ts"
import { onRequestPost as __api_admin_orders_action_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\orders\\action.ts"
import { onRequestPost as __api_admin_receipts_action_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\receipts\\action.ts"
import { onRequestGet as __api_admin_settings_bank_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\settings\\bank.ts"
import { onRequestPost as __api_admin_settings_bank_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\settings\\bank.ts"
import { onRequestGet as __api_admin_settings_margins_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\settings\\margins.ts"
import { onRequestPost as __api_admin_settings_margins_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\settings\\margins.ts"
import { onRequestPost as __api_admin_wallet_adjust_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\wallet\\adjust.ts"
import { onRequestGet as __api_admin_orders_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\orders.ts"
import { onRequestGet as __api_admin_receipts_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\receipts.ts"
import { onRequestGet as __api_admin_users_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\users.ts"
import { onRequestGet as __api_auth_session_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\auth\\session.ts"
import { onRequestPost as __api_auth_telegram_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\auth\\telegram.ts"
import { onRequestGet as __api_provider_products_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\provider\\products.ts"
import { onRequestPost as __api_wallet_receipt_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\wallet\\receipt.ts"
import { onRequestGet as __api_bank_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\bank.ts"
import { onRequestGet as __api_orders_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\orders.ts"
import { onRequestGet as __api_products_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\products.ts"
import { onRequestPost as __api_purchase_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\purchase.ts"
import { onRequestPost as __api_sync_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\sync.ts"
import { onRequestGet as __api_wallet_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\wallet.ts"

export const routes = [
    {
      routePath: "/api/admin/auth/request-otp",
      mountPath: "/api/admin/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_auth_request_otp_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/auth/session",
      mountPath: "/api/admin/auth",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_auth_session_ts_onRequestGet],
    },
  {
      routePath: "/api/admin/auth/verify-otp",
      mountPath: "/api/admin/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_auth_verify_otp_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/orders/action",
      mountPath: "/api/admin/orders",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_orders_action_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/receipts/action",
      mountPath: "/api/admin/receipts",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_receipts_action_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/settings/bank",
      mountPath: "/api/admin/settings",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_settings_bank_ts_onRequestGet],
    },
  {
      routePath: "/api/admin/settings/bank",
      mountPath: "/api/admin/settings",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_settings_bank_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/settings/margins",
      mountPath: "/api/admin/settings",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_settings_margins_ts_onRequestGet],
    },
  {
      routePath: "/api/admin/settings/margins",
      mountPath: "/api/admin/settings",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_settings_margins_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/wallet/adjust",
      mountPath: "/api/admin/wallet",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_wallet_adjust_ts_onRequestPost],
    },
  {
      routePath: "/api/admin/orders",
      mountPath: "/api/admin",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_orders_ts_onRequestGet],
    },
  {
      routePath: "/api/admin/receipts",
      mountPath: "/api/admin",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_receipts_ts_onRequestGet],
    },
  {
      routePath: "/api/admin/users",
      mountPath: "/api/admin",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_users_ts_onRequestGet],
    },
  {
      routePath: "/api/auth/session",
      mountPath: "/api/auth",
      method: "GET",
      middlewares: [],
      modules: [__api_auth_session_ts_onRequestGet],
    },
  {
      routePath: "/api/auth/telegram",
      mountPath: "/api/auth",
      method: "POST",
      middlewares: [],
      modules: [__api_auth_telegram_ts_onRequestPost],
    },
  {
      routePath: "/api/provider/products",
      mountPath: "/api/provider",
      method: "GET",
      middlewares: [],
      modules: [__api_provider_products_ts_onRequestGet],
    },
  {
      routePath: "/api/wallet/receipt",
      mountPath: "/api/wallet",
      method: "POST",
      middlewares: [],
      modules: [__api_wallet_receipt_ts_onRequestPost],
    },
  {
      routePath: "/api/bank",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_bank_ts_onRequestGet],
    },
  {
      routePath: "/api/orders",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_orders_ts_onRequestGet],
    },
  {
      routePath: "/api/products",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_products_ts_onRequestGet],
    },
  {
      routePath: "/api/purchase",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_purchase_ts_onRequestPost],
    },
  {
      routePath: "/api/sync",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_sync_ts_onRequestPost],
    },
  {
      routePath: "/api/wallet",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_wallet_ts_onRequestGet],
    },
  ]