import { onRequestGet as __api_provider_products_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\provider\\products.ts"
import { onRequestGet as __api_products_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\products.ts"
import { onRequestPost as __api_purchase_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\purchase.ts"
import { onRequestPost as __api_sync_ts_onRequestPost } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\sync.ts"
import { onRequestGet as __api_wallet_ts_onRequestGet } from "E:\\the last of Dl\\VarNetBot\\functions\\api\\wallet.ts"

export const routes = [
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