import { onRequestGet as __api_admin_settings_margins_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\settings\\margins.ts"
import { onRequestPost as __api_admin_settings_margins_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\settings\\margins.ts"
import { onRequestPost as __api_admin_wallet_adjust_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\wallet\\adjust.ts"
import { onRequestGet as __api_admin_users_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\admin\\users.ts"
import { onRequestGet as __api_provider_products_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\provider\\products.ts"
import { onRequestGet as __api_products_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\products.ts"
import { onRequestPost as __api_purchase_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\purchase.ts"
import { onRequestPost as __api_sync_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\sync.ts"
import { onRequestGet as __api_wallet_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\wallet.ts"

export const routes = [
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
      routePath: "/api/admin/users",
      mountPath: "/api/admin",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_users_ts_onRequestGet],
    },
  {
      routePath: "/api/provider/products",
      mountPath: "/api/provider",
      method: "GET",
      middlewares: [],
      modules: [__api_provider_products_ts_onRequestGet],
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