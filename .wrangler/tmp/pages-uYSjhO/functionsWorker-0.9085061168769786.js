var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/_lib/telegram.ts
var INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
var SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
var SESSION_VERSION = "v1";
function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(toHex, "toHex");
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual, "timingSafeEqual");
async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}
__name(hmacSha256, "hmacSha256");
function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(value) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}
__name(base64UrlDecode, "base64UrlDecode");
async function verifyInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = await hmacSha256(new TextEncoder().encode("WebAppData"), botToken);
  const signature = toHex(await hmacSha256(secretKey, dataCheckString));
  if (!timingSafeEqual(signature, hash.toLowerCase())) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  if (Date.now() / 1e3 - authDate > INIT_DATA_MAX_AGE_SECONDS) return null;
  const rawUser = params.get("user");
  if (!rawUser) return null;
  try {
    const parsed = JSON.parse(rawUser);
    const id = Number(parsed.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      id,
      username: typeof parsed.username === "string" ? parsed.username : void 0,
      first_name: typeof parsed.first_name === "string" ? parsed.first_name : void 0,
      last_name: typeof parsed.last_name === "string" ? parsed.last_name : void 0,
      photo_url: typeof parsed.photo_url === "string" ? parsed.photo_url : void 0
    };
  } catch {
    return null;
  }
}
__name(verifyInitData, "verifyInitData");
function telegramIdKey(id) {
  return String(id).trim();
}
__name(telegramIdKey, "telegramIdKey");
function configuredAdminIds(env) {
  return new Set(
    (env.ADMIN_TELEGRAM_IDS ?? "").split(/[\s,]+/).map((value) => telegramIdKey(value)).filter((value) => /^\d+$/.test(value) && Number(value) > 0)
  );
}
__name(configuredAdminIds, "configuredAdminIds");
async function sessionKey(botToken) {
  return hmacSha256(new TextEncoder().encode("varnet-session-v1"), botToken);
}
__name(sessionKey, "sessionKey");
async function createSessionToken(telegramId, botToken, ttlSeconds = SESSION_TTL_SECONDS) {
  const issuedAt = Math.floor(Date.now() / 1e3);
  const expiresAt = issuedAt + ttlSeconds;
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ sub: telegramId, iat: issuedAt, exp: expiresAt }))
  );
  const signature = base64UrlEncode(
    new Uint8Array(await hmacSha256(await sessionKey(botToken), payload))
  );
  return {
    token: `${SESSION_VERSION}.${payload}.${signature}`,
    expiresAt: new Date(expiresAt * 1e3).toISOString()
  };
}
__name(createSessionToken, "createSessionToken");
async function verifySessionToken(token, botToken) {
  const [version, payload, signature, extra] = token.split(".");
  if (version !== SESSION_VERSION || !payload || !signature || extra) return null;
  const payloadBytes = base64UrlDecode(payload);
  if (!payloadBytes) return null;
  const expected = base64UrlEncode(
    new Uint8Array(await hmacSha256(await sessionKey(botToken), payload))
  );
  if (!timingSafeEqual(expected, signature)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
    const telegramId = Number(parsed.sub);
    const expiresAt = Number(parsed.exp);
    if (!Number.isInteger(telegramId) || telegramId <= 0) return null;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1e3) return null;
    return telegramId;
  } catch {
    return null;
  }
}
__name(verifySessionToken, "verifySessionToken");
async function createStaticIpDownloadToken(telegramId, orderId, botToken) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({
    sub: telegramId,
    orderId,
    exp: Math.floor(Date.now() / 1e3) + 120
  })));
  const signature = base64UrlEncode(new Uint8Array(await hmacSha256(
    new TextEncoder().encode(botToken),
    `varnet-static-ip-download-v1.${payload}`
  )));
  return `${payload}.${signature}`;
}
__name(createStaticIpDownloadToken, "createStaticIpDownloadToken");
async function verifyStaticIpDownloadToken(token, orderId, botToken) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || token.length > 2048) return null;
  const expected = base64UrlEncode(new Uint8Array(await hmacSha256(
    new TextEncoder().encode(botToken),
    `varnet-static-ip-download-v1.${payload}`
  )));
  if (!timingSafeEqual(expected, signature)) return null;
  const bytes = base64UrlDecode(payload);
  if (!bytes) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const now = Math.floor(Date.now() / 1e3);
    if (!Number.isSafeInteger(data.sub) || Number(data.sub) <= 0 || data.orderId !== orderId || !Number.isInteger(data.exp) || Number(data.exp) <= now || Number(data.exp) > now + 120) {
      return null;
    }
    return Number(data.sub);
  } catch {
    return null;
  }
}
__name(verifyStaticIpDownloadToken, "verifyStaticIpDownloadToken");
var ADMIN_SESSION_VERSION = "a1";
var ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
async function adminSessionKey(botToken) {
  return hmacSha256(new TextEncoder().encode("varnet-admin-session-v1"), botToken);
}
__name(adminSessionKey, "adminSessionKey");
async function createAdminSessionToken(telegramId, botToken, ttlSeconds = ADMIN_SESSION_TTL_SECONDS) {
  const issuedAt = Math.floor(Date.now() / 1e3);
  const expiresAt = issuedAt + ttlSeconds;
  const payload = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ sub: telegramId, scope: "admin", iat: issuedAt, exp: expiresAt })
    )
  );
  const signature = base64UrlEncode(
    new Uint8Array(await hmacSha256(await adminSessionKey(botToken), payload))
  );
  return {
    token: `${ADMIN_SESSION_VERSION}.${payload}.${signature}`,
    expiresAt: new Date(expiresAt * 1e3).toISOString()
  };
}
__name(createAdminSessionToken, "createAdminSessionToken");
async function verifyAdminSessionToken(token, botToken) {
  const [version, payload, signature, extra] = token.split(".");
  if (version !== ADMIN_SESSION_VERSION || !payload || !signature || extra) return null;
  const payloadBytes = base64UrlDecode(payload);
  if (!payloadBytes) return null;
  const expected = base64UrlEncode(
    new Uint8Array(await hmacSha256(await adminSessionKey(botToken), payload))
  );
  if (!timingSafeEqual(expected, signature)) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (parsed.scope !== "admin") return null;
    const telegramId = Number(parsed.sub);
    const expiresAt = Number(parsed.exp);
    if (!Number.isInteger(telegramId) || telegramId <= 0) return null;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() / 1e3) return null;
    return telegramId;
  } catch {
    return null;
  }
}
__name(verifyAdminSessionToken, "verifyAdminSessionToken");

// api/admin/_shared.ts
var DEFAULT_MARGIN_TIERS = [
  { upToUsd: 1, percent: 70 },
  { upToUsd: 2, percent: 60 },
  { upToUsd: 3, percent: 50 },
  { upToUsd: 4, percent: 45 },
  { upToUsd: 5, percent: 40 },
  { upToUsd: 6, percent: 30 },
  { upToUsd: 7, percent: 25 },
  { upToUsd: 8, percent: 20 },
  { upToUsd: null, percent: 15 }
];
var MARGIN_TIERS_KEY = "margin_tiers";
var RESPONSE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });
}
__name(jsonResponse, "jsonResponse");
function failure(status, code, message, extra) {
  return jsonResponse({ success: false, code, message, ...extra ? { data: extra } : {} }, status);
}
__name(failure, "failure");
function describeCause(cause) {
  if (cause === void 0 || cause === null) return null;
  if (cause instanceof Error) return cause.message || cause.name;
  if (typeof cause === "string") return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
}
__name(describeCause, "describeCause");
function internalFailure(cause, code = "INTERNAL_ERROR") {
  const message = cause instanceof Error && cause.message ? cause.message : "\u062E\u0637\u0627\u06CC \u062F\u0627\u062E\u0644\u06CC \u0633\u0631\u0648\u0631 \u0631\u062E \u062F\u0627\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.";
  return jsonResponse(
    {
      success: false,
      code,
      message,
      error: {
        message: cause instanceof Error ? cause.message || cause.name : String(cause),
        cause: cause instanceof Error ? describeCause(cause.cause) : null
      }
    },
    500
  );
}
__name(internalFailure, "internalFailure");
async function hasAdminRole(db, telegramId) {
  try {
    const row = await db.prepare("SELECT role FROM users WHERE telegram_id = ?").bind(telegramId).first();
    return row?.role === "admin";
  } catch {
    return false;
  }
}
__name(hasAdminRole, "hasAdminRole");
async function isAdminAllowed(db, env, telegramId) {
  return configuredAdminIds(env).has(telegramIdKey(telegramId)) || await hasAdminRole(db, telegramId);
}
__name(isAdminAllowed, "isAdminAllowed");
function bearerToken(request) {
  const header = request.headers.get("Authorization") ?? "";
  return /^Bearer\s+(.+)$/i.exec(header.trim())?.[1]?.trim() ?? "";
}
__name(bearerToken, "bearerToken");
async function loadTelegramProfile(db, telegramId) {
  try {
    const row = await db.prepare(
      "SELECT username, first_name, last_name FROM users WHERE telegram_id = ?"
    ).bind(telegramId).first();
    return {
      id: telegramId,
      username: row?.username ?? void 0,
      first_name: row?.first_name ?? "\u0645\u062F\u06CC\u0631",
      last_name: row?.last_name ?? void 0
    };
  } catch {
    return { id: telegramId, first_name: "\u0645\u062F\u06CC\u0631" };
  }
}
__name(loadTelegramProfile, "loadTelegramProfile");
async function authenticateAdmin(request, env) {
  if (!env.DB) {
    return {
      ok: false,
      status: 500,
      code: "DB_NOT_CONFIGURED",
      message: "\u0627\u062A\u0635\u0627\u0644 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 D1 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A."
    };
  }
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  let user = null;
  const token = bearerToken(request);
  if (token) {
    if (!botToken) {
      return {
        ok: false,
        status: 500,
        code: "SERVER_NOT_CONFIGURED",
        message: "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A."
      };
    }
    const telegramId = await verifyAdminSessionToken(token, botToken);
    if (telegramId === null) {
      return {
        ok: false,
        status: 401,
        code: "ADMIN_SESSION_INVALID",
        message: "\u0646\u0634\u0633\u062A \u0645\u062F\u06CC\u0631\u06CC\u062A\u06CC \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A \u06CC\u0627 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F."
      };
    }
    user = await loadTelegramProfile(env.DB, telegramId);
  } else {
    const initData = request.headers.get("X-Telegram-Init-Data")?.trim();
    if (initData) {
      if (!botToken) {
        return {
          ok: false,
          status: 500,
          code: "SERVER_NOT_CONFIGURED",
          message: "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A."
        };
      }
      user = await verifyInitData(initData, botToken);
      if (!user) {
        return {
          ok: false,
          status: 401,
          code: "TELEGRAM_AUTH_INVALID",
          message: "\u0646\u0634\u0633\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
        };
      }
    }
  }
  if (!user) {
    return {
      ok: false,
      status: 401,
      code: "ADMIN_AUTH_REQUIRED",
      message: "\u0628\u0631\u0627\u06CC \u0639\u0645\u0644\u06CC\u0627\u062A \u0645\u062F\u06CC\u0631\u06CC\u062A\u06CC \u0628\u0627 \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u062A\u0644\u06AF\u0631\u0627\u0645 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F \u06CC\u0627 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u0627\u0632 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
    };
  }
  const allowed = await isAdminAllowed(env.DB, env, user.id);
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      code: "ADMIN_FORBIDDEN",
      message: "\u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u0627\u062C\u0627\u0632\u0647 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0639\u0645\u0644\u06CC\u0627\u062A \u0645\u062F\u06CC\u0631\u06CC\u062A\u06CC \u0631\u0627 \u0646\u062F\u0627\u0631\u062F."
    };
  }
  return { ok: true, user };
}
__name(authenticateAdmin, "authenticateAdmin");
function parseMarginTiers(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
  const tiers = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const record = raw;
    const percent = Number(record.percent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 500) return null;
    const isLast = index === value.length - 1;
    if (record.upToUsd === null) {
      if (!isLast) return null;
      tiers.push({ upToUsd: null, percent });
      continue;
    }
    const upToUsd = Number(record.upToUsd);
    if (!Number.isFinite(upToUsd) || upToUsd <= 0) return null;
    const previous = tiers[index - 1];
    if (previous && previous.upToUsd !== null && upToUsd <= previous.upToUsd) return null;
    tiers.push({ upToUsd, percent });
  }
  return tiers[tiers.length - 1].upToUsd === null ? tiers : null;
}
__name(parseMarginTiers, "parseMarginTiers");

// api/admin/static-ip/nodes.ts
function toAdminNode(row) {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    country: row.country,
    countryCode: row.country_code,
    protocol: row.protocol,
    price: Number(row.price),
    currency: "IRT",
    durationDays: Number(row.duration_days),
    dataCapGb: Number(row.data_cap_gb),
    availability: row.availability,
    enabled: Number(row.is_enabled) === 1,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(toAdminNode, "toAdminNode");
async function onRequestGet(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) return failure(auth.status, auth.code, auth.message);
    const db = context.env.DB;
    const result = await db.prepare(
      `SELECT id, name, ip, country, country_code, protocol, price, currency,
                duration_days, data_cap_gb, availability, is_enabled, sort_order,
                created_at, updated_at
         FROM static_ip_nodes
         ORDER BY sort_order ASC, created_at ASC`
    ).all();
    const rows = result.results ?? [];
    return jsonResponse({
      success: true,
      data: rows.map(toAdminNode),
      meta: { count: rows.length }
    });
  } catch (cause) {
    return internalFailure(cause, "STATIC_IP_NODES_READ_FAILED");
  }
}
__name(onRequestGet, "onRequestGet");

// api/admin/static-ip/nodes/action.ts
var MAX_PRICE = 1e8;
var AVAILABILITY = /* @__PURE__ */ new Set(["in_stock", "coming_soon", "sold_out"]);
var IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
var SELECT_COLUMNS = `id, name, ip, country, country_code, protocol, price, currency,
  duration_days, data_cap_gb, availability, is_enabled, sort_order, created_at, updated_at`;
async function readNode(db, id) {
  return db.prepare(`SELECT ${SELECT_COLUMNS} FROM static_ip_nodes WHERE id = ?`).bind(id).first();
}
__name(readNode, "readNode");
function intInRange(value, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
__name(intInRange, "intInRange");
async function onRequestPost(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) return failure(auth.status, auth.code, auth.message);
    let raw;
    try {
      raw = await context.request.text();
    } catch {
      return failure(400, "INVALID_BODY", "\u0628\u062F\u0646\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0627\u0628\u0644 \u062E\u0648\u0627\u0646\u062F\u0646 \u0646\u0628\u0648\u062F.");
    }
    if (raw.length > 8192) return failure(413, "INVALID_BODY", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0632\u0631\u06AF \u0627\u0633\u062A.");
    let body;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return failure(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
      }
      body = parsed;
    } catch {
      return failure(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const db = context.env.DB;
    const action = typeof body.action === "string" ? body.action : "";
    const nodeId = typeof body.nodeId === "string" ? body.nodeId.trim() : "";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (action === "toggle") {
      if (!nodeId) return failure(400, "INVALID_NODE", "\u0634\u0646\u0627\u0633\u0647 \u0646\u0648\u062F \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
      const existing2 = await readNode(db, nodeId);
      if (!existing2) return failure(404, "NODE_NOT_FOUND", "\u0646\u0648\u062F \u0645\u0648\u0631\u062F\u0646\u0638\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
      const nextEnabled = Number(existing2.is_enabled) === 1 ? 0 : 1;
      await db.prepare("UPDATE static_ip_nodes SET is_enabled = ?, updated_at = ? WHERE id = ?").bind(nextEnabled, now, nodeId).run();
      const updated = await readNode(db, nodeId);
      return jsonResponse({
        success: true,
        message: nextEnabled === 1 ? "\u0646\u0648\u062F \u0641\u0639\u0627\u0644 \u0634\u062F \u0648 \u062F\u0631 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0646\u0645\u0627\u06CC\u0634 \u062F\u0627\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F." : "\u0646\u0648\u062F \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0634\u062F \u0648 \u0627\u0632 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0645\u062E\u0641\u06CC \u0634\u062F.",
        data: updated ? toAdminNode(updated) : null
      });
    }
    if (action !== "save") {
      return failure(400, "INVALID_ACTION", "\u0639\u0645\u0644\u06CC\u0627\u062A \u062F\u0631\u062E\u0648\u0627\u0633\u062A\u06CC \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.");
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const ip = typeof body.ip === "string" ? body.ip.trim() : "";
    const country = typeof body.country === "string" ? body.country.trim() : "";
    const countryCode = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : "";
    const price = intInRange(body.price, 0, MAX_PRICE);
    const durationDays = intInRange(body.durationDays, 1, 3650);
    const dataCapGb = intInRange(body.dataCapGb, 1, 1e5);
    const availability = typeof body.availability === "string" ? body.availability : "";
    const sortOrder = body.sortOrder === void 0 ? 100 : intInRange(body.sortOrder, 0, 1e5);
    const enabled = body.enabled === void 0 ? true : body.enabled === true;
    if (name.length < 2 || name.length > 80) {
      return failure(400, "INVALID_NAME", "\u0646\u0627\u0645 \u0646\u0648\u062F \u0628\u0627\u06CC\u062F \u0628\u06CC\u0646 \u06F2 \u062A\u0627 \u06F8\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0628\u0627\u0634\u062F.");
    }
    if (!IPV4.test(ip)) {
      return failure(400, "INVALID_IP", "\u0646\u0634\u0627\u0646\u06CC IPv4 \u0646\u0648\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    }
    if (country.length < 2 || country.length > 60) {
      return failure(400, "INVALID_COUNTRY", "\u0646\u0627\u0645 \u06A9\u0634\u0648\u0631 \u0631\u0627 \u06A9\u0627\u0645\u0644 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      return failure(400, "INVALID_COUNTRY_CODE", "\u06A9\u062F \u06A9\u0634\u0648\u0631 \u0628\u0627\u06CC\u062F \u062F\u0648 \u062D\u0631\u0641 \u0644\u0627\u062A\u06CC\u0646 \u0628\u0627\u0634\u062F (\u0645\u062B\u0644\u0627\u064B DE).");
    }
    if (price === null) {
      return failure(400, "INVALID_PRICE", "\u0642\u06CC\u0645\u062A \u0646\u0648\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    }
    if (durationDays === null) {
      return failure(400, "INVALID_DURATION", "\u0645\u062F\u062A \u0627\u0639\u062A\u0628\u0627\u0631 \u0628\u0627\u06CC\u062F \u0628\u06CC\u0646 \u06F1 \u062A\u0627 \u06F3\u06F6\u06F5\u06F0 \u0631\u0648\u0632 \u0628\u0627\u0634\u062F.");
    }
    if (dataCapGb === null) {
      return failure(400, "INVALID_QUOTA", "\u062D\u062C\u0645 \u0633\u0631\u0648\u06CC\u0633 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    }
    if (!AVAILABILITY.has(availability)) {
      return failure(400, "INVALID_AVAILABILITY", "\u0648\u0636\u0639\u06CC\u062A \u0646\u0648\u062F \u0628\u0627\u06CC\u062F \xAB\u0645\u0648\u062C\u0648\u062F\xBB\u060C \xAB\u0628\u0647\u200C\u0632\u0648\u062F\u06CC\xBB \u06CC\u0627 \xAB\u0646\u0627\u0645\u0648\u062C\u0648\u062F\xBB \u0628\u0627\u0634\u062F.");
    }
    if (sortOrder === null) {
      return failure(400, "INVALID_SORT", "\u062A\u0631\u062A\u06CC\u0628 \u0646\u0645\u0627\u06CC\u0634 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    }
    const id = nodeId || `node_${crypto.randomUUID()}`;
    const existing = nodeId ? await readNode(db, nodeId) : null;
    if (nodeId && !existing) return failure(404, "NODE_NOT_FOUND", "\u0646\u0648\u062F \u0645\u0648\u0631\u062F\u0646\u0638\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    if (existing) {
      await db.prepare(
        `UPDATE static_ip_nodes
           SET name = ?, ip = ?, country = ?, country_code = ?, price = ?,
               duration_days = ?, data_cap_gb = ?, availability = ?, is_enabled = ?,
               sort_order = ?, updated_at = ?
           WHERE id = ?`
      ).bind(
        name,
        ip,
        country,
        countryCode,
        price,
        durationDays,
        dataCapGb,
        availability,
        enabled ? 1 : 0,
        sortOrder,
        now,
        id
      ).run();
    } else {
      await db.prepare(
        `INSERT INTO static_ip_nodes
             (id, name, ip, country, country_code, protocol, price, currency,
              duration_days, data_cap_gb, availability, is_enabled, sort_order,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'OpenVPN (UDP)', ?, 'IRT', ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        name,
        ip,
        country,
        countryCode,
        price,
        durationDays,
        dataCapGb,
        availability,
        enabled ? 1 : 0,
        sortOrder,
        now,
        now
      ).run();
    }
    const saved = await readNode(db, id);
    return jsonResponse({
      success: true,
      message: existing ? "\u062A\u063A\u06CC\u06CC\u0631\u0627\u062A \u0646\u0648\u062F \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F." : "\u0646\u0648\u062F \u062C\u062F\u06CC\u062F \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.",
      data: saved ? toAdminNode(saved) : null
    });
  } catch (cause) {
    return internalFailure(cause, "STATIC_IP_NODE_WRITE_FAILED");
  }
}
__name(onRequestPost, "onRequestPost");

// api/admin/static-ip/plans.ts
var PLAN_SELECT = `SELECT p.id, p.node_id, p.name, p.data_cap_gb, p.duration_days,
    p.price, p.currency, p.is_enabled, p.sort_order, p.created_at, p.updated_at,
    n.name AS node_name, n.country, n.country_code, n.protocol, n.availability
  FROM static_ip_plans p
  JOIN static_ip_nodes n ON n.id = p.node_id`;
function toAdminPlan(row) {
  return {
    id: row.id,
    nodeId: row.node_id,
    name: row.name,
    dataCapGb: Number(row.data_cap_gb),
    durationDays: Number(row.duration_days),
    price: Number(row.price),
    currency: "IRT",
    enabled: Number(row.is_enabled) === 1,
    sortOrder: Number(row.sort_order),
    nodeName: row.node_name,
    country: row.country,
    countryCode: row.country_code,
    protocol: row.protocol,
    availability: row.availability,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(toAdminPlan, "toAdminPlan");
async function onRequestGet2(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) return failure(auth.status, auth.code, auth.message);
    const db = context.env.DB;
    const result = await db.prepare(`${PLAN_SELECT} ORDER BY p.sort_order ASC, p.created_at ASC`).all();
    const rows = result.results ?? [];
    return jsonResponse({
      success: true,
      data: rows.map(toAdminPlan),
      meta: { count: rows.length }
    });
  } catch (cause) {
    return internalFailure(cause, "STATIC_IP_PLANS_READ_FAILED");
  }
}
__name(onRequestGet2, "onRequestGet");

// api/admin/static-ip/plans/action.ts
var MAX_PRICE2 = 1e8;
async function readPlan(db, id) {
  return db.prepare(`${PLAN_SELECT} WHERE p.id = ?`).bind(id).first();
}
__name(readPlan, "readPlan");
function intInRange2(value, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
__name(intInRange2, "intInRange");
async function onRequestPost2(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) return failure(auth.status, auth.code, auth.message);
    let raw;
    try {
      raw = await context.request.text();
    } catch {
      return failure(400, "INVALID_BODY", "\u0628\u062F\u0646\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0627\u0628\u0644 \u062E\u0648\u0627\u0646\u062F\u0646 \u0646\u0628\u0648\u062F.");
    }
    if (raw.length > 8192) return failure(413, "INVALID_BODY", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0632\u0631\u06AF \u0627\u0633\u062A.");
    let body;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return failure(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
      }
      body = parsed;
    } catch {
      return failure(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const db = context.env.DB;
    const action = typeof body.action === "string" ? body.action : "";
    const planId = typeof body.planId === "string" ? body.planId.trim() : "";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (action === "toggle") {
      if (!planId) return failure(400, "INVALID_PLAN", "\u0634\u0646\u0627\u0633\u0647 \u067E\u0644\u0646 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
      const existing2 = await readPlan(db, planId);
      if (!existing2) return failure(404, "PLAN_NOT_FOUND", "\u067E\u0644\u0646 \u0645\u0648\u0631\u062F\u0646\u0638\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
      const nextEnabled = Number(existing2.is_enabled) === 1 ? 0 : 1;
      await db.prepare("UPDATE static_ip_plans SET is_enabled = ?, updated_at = ? WHERE id = ?").bind(nextEnabled, now, planId).run();
      const updated = await readPlan(db, planId);
      return jsonResponse({
        success: true,
        message: nextEnabled === 1 ? "\u067E\u0644\u0646 \u0641\u0639\u0627\u0644 \u0634\u062F \u0648 \u062F\u0631 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0642\u0627\u0628\u0644 \u0641\u0631\u0648\u0634 \u0627\u0633\u062A." : "\u067E\u0644\u0646 \u063A\u06CC\u0631\u0641\u0639\u0627\u0644 \u0634\u062F \u0648 \u0627\u0632 \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0645\u062E\u0641\u06CC \u0634\u062F.",
        data: updated ? toAdminPlan(updated) : null
      });
    }
    if (action === "delete") {
      if (!planId) return failure(400, "INVALID_PLAN", "\u0634\u0646\u0627\u0633\u0647 \u067E\u0644\u0646 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
      const existing2 = await readPlan(db, planId);
      if (!existing2) return failure(404, "PLAN_NOT_FOUND", "\u067E\u0644\u0646 \u0645\u0648\u0631\u062F\u0646\u0638\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
      const result = await db.prepare("DELETE FROM static_ip_plans WHERE id = ?").bind(planId).run();
      if ((result.meta?.changes ?? 0) !== 1) {
        return failure(409, "PLAN_STATE_CHANGED", "\u0627\u06CC\u0646 \u067E\u0644\u0646 \u062F\u06CC\u06AF\u0631 \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F\u061B \u0641\u0647\u0631\u0633\u062A \u0631\u0627 \u0628\u0647\u200C\u0631\u0648\u0632 \u06A9\u0646\u06CC\u062F.");
      }
      return jsonResponse({
        success: true,
        message: "\u067E\u0644\u0646 \u062D\u0630\u0641 \u0634\u062F. \u0633\u0641\u0627\u0631\u0634\u200C\u0647\u0627\u06CC \u0642\u0628\u0644\u06CC \u0628\u0627 \u0639\u0646\u0648\u0627\u0646 \u062B\u0628\u062A\u200C\u0634\u062F\u0647 \u0628\u0627\u0642\u06CC \u0645\u06CC\u200C\u0645\u0627\u0646\u0646\u062F.",
        data: { id: planId }
      });
    }
    if (action !== "save") {
      return failure(400, "INVALID_ACTION", "\u0639\u0645\u0644\u06CC\u0627\u062A \u062F\u0631\u062E\u0648\u0627\u0633\u062A\u06CC \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.");
    }
    const existing = planId ? await readPlan(db, planId) : null;
    if (planId && !existing) return failure(404, "PLAN_NOT_FOUND", "\u067E\u0644\u0646 \u0645\u0648\u0631\u062F\u0646\u0638\u0631 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const nodeId = typeof body.nodeId === "string" ? body.nodeId.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const dataCapGb = intInRange2(body.dataCapGb, 1, 1e5);
    const durationDays = intInRange2(body.durationDays, 1, 3650);
    const price = intInRange2(body.price, 0, MAX_PRICE2);
    const sortOrder = body.sortOrder === void 0 ? existing?.sort_order ?? 100 : intInRange2(body.sortOrder, 0, 1e5);
    const enabled = body.enabled === void 0 ? true : body.enabled === true;
    if (!nodeId) return failure(400, "INVALID_NODE", "\u0646\u0648\u062F \u0645\u062A\u0635\u0644 \u0628\u0647 \u067E\u0644\u0646 \u0631\u0627 \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.");
    if (name.length < 2 || name.length > 80) {
      return failure(400, "INVALID_NAME", "\u0646\u0627\u0645 \u067E\u0644\u0646 \u0628\u0627\u06CC\u062F \u0628\u06CC\u0646 \u06F2 \u062A\u0627 \u06F8\u06F0 \u0646\u0648\u06CC\u0633\u0647 \u0628\u0627\u0634\u062F.");
    }
    if (dataCapGb === null) {
      return failure(400, "INVALID_QUOTA", "\u062D\u062C\u0645 \u067E\u0644\u0646 \u0628\u0627\u06CC\u062F \u0628\u06CC\u0646 \u06F1 \u062A\u0627 \u06F1\u06F0\u06F0\u06F0\u06F0\u06F0 \u06AF\u06CC\u06AF\u0627\u0628\u0627\u06CC\u062A \u0628\u0627\u0634\u062F.");
    }
    if (durationDays === null) {
      return failure(400, "INVALID_DURATION", "\u0645\u062F\u062A \u067E\u0644\u0646 \u0628\u0627\u06CC\u062F \u0628\u06CC\u0646 \u06F1 \u062A\u0627 \u06F3\u06F6\u06F5\u06F0 \u0631\u0648\u0632 \u0628\u0627\u0634\u062F.");
    }
    if (price === null) {
      return failure(400, "INVALID_PRICE", "\u0642\u06CC\u0645\u062A \u067E\u0644\u0646 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    }
    if (sortOrder === null) {
      return failure(400, "INVALID_SORT", "\u062A\u0631\u062A\u06CC\u0628 \u0646\u0645\u0627\u06CC\u0634 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
    }
    const node = await db.prepare("SELECT id FROM static_ip_nodes WHERE id = ?").bind(nodeId).first();
    if (!node) return failure(404, "NODE_NOT_FOUND", "\u0646\u0648\u062F \u0627\u0646\u062A\u062E\u0627\u0628\u200C\u0634\u062F\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const id = planId || `plan_${crypto.randomUUID()}`;
    if (existing) {
      await db.prepare(
        `UPDATE static_ip_plans
           SET node_id = ?, name = ?, data_cap_gb = ?, duration_days = ?, price = ?,
               is_enabled = ?, sort_order = ?, updated_at = ?
           WHERE id = ?`
      ).bind(
        nodeId,
        name,
        dataCapGb,
        durationDays,
        price,
        enabled ? 1 : 0,
        sortOrder,
        now,
        id
      ).run();
    } else {
      await db.prepare(
        `INSERT INTO static_ip_plans
             (id, node_id, name, data_cap_gb, duration_days, price, currency,
              is_enabled, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'IRT', ?, ?, ?, ?)`
      ).bind(id, nodeId, name, dataCapGb, durationDays, price, enabled ? 1 : 0, sortOrder, now, now).run();
    }
    const saved = await readPlan(db, id);
    return jsonResponse({
      success: true,
      message: existing ? "\u062A\u063A\u06CC\u06CC\u0631\u0627\u062A \u067E\u0644\u0646 \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F." : "\u067E\u0644\u0646 \u062C\u062F\u06CC\u062F \u0633\u0627\u062E\u062A\u0647 \u0634\u062F.",
      data: saved ? toAdminPlan(saved) : null
    });
  } catch (cause) {
    return internalFailure(cause, "STATIC_IP_PLAN_WRITE_FAILED");
  }
}
__name(onRequestPost2, "onRequestPost");

// api/admin/auth/_otp.ts
var OTP_TTL_SECONDS = 5 * 60;
var OTP_COOLDOWN_SECONDS = 45;
var OTP_MAX_ATTEMPTS = 8;
var OTP_FAILURE_WINDOW_SECONDS = 10 * 60;
function toHex2(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(toHex2, "toHex");
function normalizeOtp(input) {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
__name(normalizeOtp, "normalizeOtp");
function generateOtp() {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return String(random[0] % 1e6).padStart(6, "0");
}
__name(generateOtp, "generateOtp");
async function hashOtp(code, botToken) {
  const key = new TextEncoder().encode(`varnet-admin-otp:${botToken}`);
  return toHex2(await hmacSha256(key, code));
}
__name(hashOtp, "hashOtp");
function clientIp(request) {
  return request.headers.get("CF-Connecting-IP")?.trim() || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "unknown";
}
__name(clientIp, "clientIp");
var TelegramSendError = class extends Error {
  static {
    __name(this, "TelegramSendError");
  }
  description;
  errorCode;
  constructor(description, errorCode = null) {
    super(description);
    this.name = "TelegramSendError";
    this.description = description;
    this.errorCode = errorCode;
  }
};
async function sendTelegramMessage(botToken, chatId, text) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new TelegramSendError(
      payload?.description?.trim() || `Telegram HTTP ${response.status}`,
      payload?.error_code ?? response.status
    );
  }
  if (payload?.ok !== true) {
    throw new TelegramSendError(
      payload?.description?.trim() || "\u067E\u0627\u0633\u062E \u062A\u0644\u06AF\u0631\u0627\u0645 \u062A\u0623\u06CC\u06CC\u062F \u0627\u0631\u0633\u0627\u0644 \u067E\u06CC\u0627\u0645 \u0631\u0627 \u0646\u062F\u0627\u0634\u062A.",
      payload?.error_code ?? null
    );
  }
}
__name(sendTelegramMessage, "sendTelegramMessage");
function otpMessage(code) {
  return [
    "\u06A9\u062F \u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644 \u0645\u062F\u06CC\u0631\u06CC\u062A \u0648\u0631\u0646\u062A:",
    code,
    "",
    "\u0627\u06CC\u0646 \u06A9\u062F \u062A\u0627 \u06F5 \u062F\u0642\u06CC\u0642\u0647 \u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A \u0648 \u0641\u0642\u0637 \u06CC\u06A9 \u0628\u0627\u0631 \u0642\u0627\u0628\u0644 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0627\u0633\u062A.",
    "\u0627\u06AF\u0631 \u0634\u0645\u0627 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u062F\u0627\u062F\u0647\u200C\u0627\u06CC\u062F\u060C \u0627\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u0631\u0627 \u0646\u0627\u062F\u06CC\u062F\u0647 \u0628\u06AF\u06CC\u0631\u06CC\u062F."
  ].join("\n");
}
__name(otpMessage, "otpMessage");
async function cleanupOtps(db, now) {
  const cutoff = new Date(now - 24 * 60 * 60 * 1e3).toISOString();
  try {
    await db.prepare("DELETE FROM admin_otps WHERE created_at < ?").bind(cutoff).run();
  } catch {
  }
}
__name(cleanupOtps, "cleanupOtps");

// api/admin/auth/request-otp.ts
async function issueOtp(context) {
  const env = context.env ?? {};
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return failure(
      500,
      "TELEGRAM_CONFIG_MISSING",
      "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0631\u0648\u06CC \u0633\u0631\u0648\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F: TELEGRAM_BOT_TOKEN \u062A\u0639\u0631\u06CC\u0641 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A."
    );
  }
  if (!env.DB) {
    return failure(
      503,
      "DB_NOT_CONFIGURED",
      "\u0627\u062A\u0635\u0627\u0644 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 D1 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A (binding \u0628\u0627 \u0646\u0627\u0645 DB)."
    );
  }
  const adminIds = [...configuredAdminIds(env)];
  if (adminIds.length === 0) {
    return failure(
      503,
      "ADMIN_LIST_NOT_CONFIGURED",
      "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0631\u0648\u06CC \u0633\u0631\u0648\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F: ADMIN_TELEGRAM_IDS \u062E\u0627\u0644\u06CC \u06CC\u0627 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A."
    );
  }
  const db = env.DB;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresAt = new Date(now + OTP_TTL_SECONDS * 1e3).toISOString();
  await cleanupOtps(db, now);
  const cooldownCutoff = new Date(now - OTP_COOLDOWN_SECONDS * 1e3).toISOString();
  let cooling = /* @__PURE__ */ new Set();
  try {
    const recent = await db.prepare(
      "SELECT DISTINCT telegram_id FROM admin_otps WHERE created_at > ?"
    ).bind(cooldownCutoff).all();
    cooling = new Set((recent.results ?? []).map((row) => telegramIdKey(row.telegram_id)));
  } catch {
    cooling = /* @__PURE__ */ new Set();
  }
  const recipients = adminIds.filter((id) => !cooling.has(id));
  if (recipients.length === 0) {
    return failure(
      429,
      "OTP_COOLDOWN",
      "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0647\u0645\u06CC\u0646 \u0686\u0646\u062F \u0644\u062D\u0638\u0647 \u067E\u06CC\u0634 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F\u0647 \u0627\u0633\u062A. \u06A9\u0645\u06CC \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.",
      { retryAfterSeconds: OTP_COOLDOWN_SECONDS }
    );
  }
  let sent = 0;
  let sendFailed = 0;
  let dbFailed = 0;
  let lastDbError = "";
  let lastSendError = "";
  let lastTelegramCode = null;
  for (const telegramId of recipients) {
    const code = generateOtp();
    const codeHash = await hashOtp(code, botToken);
    const rowId = `otp_${crypto.randomUUID()}`;
    try {
      await db.prepare(
        `INSERT INTO admin_otps
             (id, telegram_id, code, expires_at, attempts, consumed_at, created_at)
           VALUES (?, ?, ?, ?, 0, NULL, ?)`
      ).bind(rowId, telegramId, codeHash, expiresAt, nowIso).run();
    } catch (cause) {
      dbFailed += 1;
      lastDbError = cause instanceof Error ? cause.message : String(cause);
      continue;
    }
    try {
      await sendTelegramMessage(botToken, telegramId, otpMessage(code));
      sent += 1;
    } catch (cause) {
      sendFailed += 1;
      if (cause instanceof TelegramSendError) {
        lastSendError = cause.description;
        lastTelegramCode = cause.errorCode;
      } else {
        lastSendError = cause instanceof Error ? cause.message : String(cause);
      }
      try {
        await db.prepare("DELETE FROM admin_otps WHERE id = ?").bind(rowId).run();
      } catch {
      }
    }
  }
  if (sent === 0) {
    if (sendFailed > 0) {
      return failure(
        502,
        "TELEGRAM_SEND_FAILED",
        `\u0627\u0631\u0633\u0627\u0644 \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0628\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F: ${lastSendError || "\u062E\u0637\u0627\u06CC \u0646\u0627\u0645\u0634\u062E\u0635"}`,
        {
          telegramError: lastSendError || null,
          telegramErrorCode: lastTelegramCode
        }
      );
    }
    return failure(
      503,
      "DB_UNAVAILABLE",
      `\u062B\u0628\u062A \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F: ${lastDbError || "\u062E\u0637\u0627\u06CC \u0646\u0627\u0645\u0634\u062E\u0635"}`,
      { dbError: lastDbError || null }
    );
  }
  return jsonResponse({
    success: true,
    message: sendFailed + dbFailed > 0 ? "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0628\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F\u060C \u0627\u0645\u0627 \u0627\u0631\u0633\u0627\u0644 \u0628\u0647 \u0628\u0631\u062E\u06CC \u0645\u062F\u06CC\u0631\u0627\u0646 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F." : "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0628\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u062F\u06CC\u0631 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F.",
    data: {
      sent,
      failed: sendFailed + dbFailed,
      expiresAt,
      expiresInSeconds: OTP_TTL_SECONDS,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
      ...dbFailed > 0 ? { dbError: lastDbError || null } : {},
      ...sendFailed > 0 ? { telegramError: lastSendError || null } : {}
    }
  });
}
__name(issueOtp, "issueOtp");
async function onRequestPost3(context) {
  try {
    return await issueOtp(context);
  } catch (cause) {
    return internalFailure(cause, "REQUEST_OTP_FAILED");
  }
}
__name(onRequestPost3, "onRequestPost");

// api/admin/auth/session.ts
async function onRequestGet3(context) {
  const auth = await authenticateAdmin(context.request, context.env);
  if (!auth.ok) return failure(auth.status, auth.code, auth.message);
  return jsonResponse({
    success: true,
    data: {
      admin: {
        telegramId: auth.user.id,
        firstName: auth.user.first_name || "\u0645\u062F\u06CC\u0631",
        lastName: auth.user.last_name ?? void 0,
        username: auth.user.username ?? void 0,
        role: "admin"
      }
    }
  });
}
__name(onRequestGet3, "onRequestGet");

// api/admin/auth/verify-otp.ts
async function recordFailure(context, ip, now) {
  const db = context.env.DB;
  const nowIso = new Date(now).toISOString();
  try {
    const row = await db.prepare("SELECT attempts, window_start FROM admin_otp_failures WHERE ip = ?").bind(ip).first();
    const windowMs = OTP_FAILURE_WINDOW_SECONDS * 1e3;
    const fresh = row && now - Date.parse(row.window_start) < windowMs;
    if (!fresh) {
      await db.prepare(
        `INSERT INTO admin_otp_failures (ip, attempts, window_start)
           VALUES (?, 1, ?)
           ON CONFLICT(ip) DO UPDATE SET attempts = 1, window_start = excluded.window_start`
      ).bind(ip, nowIso).run();
      return;
    }
    await db.prepare("UPDATE admin_otp_failures SET attempts = attempts + 1 WHERE ip = ?").bind(ip).run();
  } catch {
  }
}
__name(recordFailure, "recordFailure");
async function isThrottled(context, ip, now) {
  try {
    const row = await context.env.DB.prepare(
      "SELECT attempts, window_start FROM admin_otp_failures WHERE ip = ?"
    ).bind(ip).first();
    if (!row) return false;
    const windowMs = OTP_FAILURE_WINDOW_SECONDS * 1e3;
    if (now - Date.parse(row.window_start) >= windowMs) return false;
    return row.attempts >= OTP_MAX_ATTEMPTS;
  } catch {
    return false;
  }
}
__name(isThrottled, "isThrottled");
async function handleVerifyOtp(context) {
  const env = context.env ?? {};
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return failure(
      500,
      "TELEGRAM_CONFIG_MISSING",
      "\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0631\u0648\u06CC \u0633\u0631\u0648\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F: TELEGRAM_BOT_TOKEN \u062A\u0639\u0631\u06CC\u0641 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A."
    );
  }
  if (!env.DB) {
    return failure(
      503,
      "DB_NOT_CONFIGURED",
      "\u0627\u062A\u0635\u0627\u0644 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 D1 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A (binding \u0628\u0627 \u0646\u0627\u0645 DB)."
    );
  }
  let body = {};
  try {
    const raw = await context.request.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return failure(400, "OTP_VALIDATION", "\u0628\u062F\u0646\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  const code = normalizeOtp(body.code);
  if (!code) {
    return failure(400, "OTP_VALIDATION", "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0628\u0627\u06CC\u062F \u06CC\u06A9 \u0639\u062F\u062F \u06F6 \u0631\u0642\u0645\u06CC \u0628\u0627\u0634\u062F.");
  }
  const now = Date.now();
  const ip = clientIp(context.request);
  if (await isThrottled(context, ip, now)) {
    return failure(
      429,
      "OTP_THROTTLED",
      "\u062A\u0644\u0627\u0634\u200C\u0647\u0627\u06CC \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632. \u0686\u0646\u062F \u062F\u0642\u06CC\u0642\u0647 \u0628\u0639\u062F \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0645\u062A\u062D\u0627\u0646 \u06A9\u0646\u06CC\u062F.",
      { retryAfterSeconds: OTP_FAILURE_WINDOW_SECONDS }
    );
  }
  const db = env.DB;
  const codeHash = await hashOtp(code, botToken);
  let row = null;
  try {
    row = await db.prepare(
      "SELECT id, telegram_id, expires_at, attempts, consumed_at FROM admin_otps WHERE code = ?"
    ).bind(codeHash).first();
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u0628\u0631\u0631\u0633\u06CC \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  if (!row) {
    await recordFailure(context, ip, now);
    return failure(401, "OTP_INVALID", "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.");
  }
  if (row.consumed_at) {
    return failure(401, "OTP_USED", "\u0627\u06CC\u0646 \u06A9\u062F \u0642\u0628\u0644\u0627\u064B \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0634\u062F\u0647 \u0627\u0633\u062A. \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u062C\u062F\u06CC\u062F \u0628\u06AF\u06CC\u0631\u06CC\u062F.");
  }
  if ((row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    return failure(429, "OTP_LOCKED", "\u0627\u06CC\u0646 \u06A9\u062F \u0642\u0641\u0644 \u0634\u062F\u0647 \u0627\u0633\u062A. \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u062C\u062F\u06CC\u062F \u0628\u06AF\u06CC\u0631\u06CC\u062F.");
  }
  const expiresAtMs = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) {
    await db.prepare("UPDATE admin_otps SET consumed_at = ? WHERE id = ?").bind(new Date(now).toISOString(), row.id).run().catch(() => void 0);
    return failure(401, "OTP_EXPIRED", "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A. \u06A9\u062F \u062C\u062F\u06CC\u062F \u0628\u06AF\u06CC\u0631\u06CC\u062F.");
  }
  const telegramId = Number(row.telegram_id);
  if (!Number.isInteger(telegramId) || telegramId <= 0) {
    return failure(401, "OTP_INVALID", "\u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A. \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0631\u0631\u0633\u06CC \u06A9\u0646\u06CC\u062F.");
  }
  if (!await isAdminAllowed(db, env, telegramId)) {
    await db.prepare("UPDATE admin_otps SET consumed_at = ? WHERE id = ?").bind(new Date(now).toISOString(), row.id).run().catch(() => void 0);
    return failure(403, "ADMIN_FORBIDDEN", "\u0627\u06CC\u0646 \u062D\u0633\u0627\u0628 \u0627\u062C\u0627\u0632\u0647 \u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644 \u0645\u062F\u06CC\u0631\u06CC\u062A \u0631\u0627 \u0646\u062F\u0627\u0631\u062F.");
  }
  try {
    const consumed = await db.prepare("UPDATE admin_otps SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(new Date(now).toISOString(), row.id).run();
    if (consumed.meta?.changes === 0) {
      return failure(401, "OTP_USED", "\u0627\u06CC\u0646 \u06A9\u062F \u0642\u0628\u0644\u0627\u064B \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0634\u062F\u0647 \u0627\u0633\u062A. \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u062C\u062F\u06CC\u062F \u0628\u06AF\u06CC\u0631\u06CC\u062F.");
    }
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u0645\u0635\u0631\u0641 \u06A9\u062F \u062A\u0627\u06CC\u06CC\u062F \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  try {
    await db.prepare("DELETE FROM admin_otp_failures WHERE ip = ?").bind(ip).run();
  } catch {
  }
  const session = await createAdminSessionToken(telegramId, botToken);
  const profile = await loadTelegramProfile(db, telegramId);
  return jsonResponse({
    success: true,
    message: "\u0648\u0631\u0648\u062F \u0628\u0647 \u067E\u0646\u0644 \u0645\u062F\u06CC\u0631\u06CC\u062A \u062A\u0623\u06CC\u06CC\u062F \u0634\u062F.",
    data: {
      token: session.token,
      expiresAt: session.expiresAt,
      expiresInSeconds: ADMIN_SESSION_TTL_SECONDS,
      admin: {
        telegramId,
        firstName: profile.first_name || "\u0645\u062F\u06CC\u0631",
        lastName: profile.last_name ?? void 0,
        username: profile.username ?? void 0,
        role: "admin"
      }
    }
  });
}
__name(handleVerifyOtp, "handleVerifyOtp");
async function onRequestPost4(context) {
  try {
    return await handleVerifyOtp(context);
  } catch (cause) {
    return internalFailure(cause, "VERIFY_OTP_FAILED");
  }
}
__name(onRequestPost4, "onRequestPost");

// api/_lib/staticIpDelivery.ts
async function findOwnedConfig(db, orderId, userId) {
  const row = await db.prepare(
    `SELECT delivery_note FROM orders
     WHERE id = ? AND user_id = ? AND kind = 'vpn' AND status = 'completed'`
  ).bind(orderId, userId).first();
  return row?.delivery_note?.trim() ? row.delivery_note : null;
}
__name(findOwnedConfig, "findOwnedConfig");
async function sendVpnDocument(botToken, telegramId, content) {
  botToken = botToken?.trim();
  if (!botToken) {
    return { sent: false, code: "TELEGRAM_NOT_CONFIGURED", message: "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A. (TELEGRAM_NOT_CONFIGURED)" };
  }
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    return { sent: false, code: "TELEGRAM_USER_NOT_FOUND", message: "\u0634\u0646\u0627\u0633\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0634\u062A\u0631\u06CC \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F. (TELEGRAM_USER_NOT_FOUND)" };
  }
  const form = new FormData();
  form.set("chat_id", String(telegramId));
  form.set("document", new Blob([content], { type: "application/x-openvpn-profile" }), "varnet-config.ovpn");
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(1e4)
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok === true) return { sent: true };
    const code = `TELEGRAM_${result?.error_code || response.status}`;
    const detail = typeof result?.description === "string" ? result.description.replaceAll(botToken, "[redacted]").slice(0, 300) : "\u067E\u0627\u0633\u062E \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0632 \u062A\u0644\u06AF\u0631\u0627\u0645";
    return { sent: false, code, message: `${detail} (${code})` };
  } catch {
    return { sent: false, code: "TELEGRAM_UNAVAILABLE", message: "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F. (TELEGRAM_UNAVAILABLE)" };
  }
}
__name(sendVpnDocument, "sendVpnDocument");

// api/admin/orders/action.ts
var MAX_BODY_BYTES = 8192;
var MAX_NOTE_LENGTH = 4e3;
var MAX_REASON_LENGTH = 1e3;
var MIN_REASON_LENGTH = 3;
var OPENVPN_PORT = 1194;
async function readBody(context) {
  let raw;
  try {
    raw = await context.request.text();
  } catch {
    return null;
  }
  if (raw.length > MAX_BODY_BYTES) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
__name(readBody, "readBody");
function safeHost(value) {
  return value.replace(/[^a-zA-Z0-9.:-]/g, "");
}
__name(safeHost, "safeHost");
function configUsername(order) {
  const base = order.id.replace(/[^a-zA-Z0-9]/g, "");
  return (base ? `vpn_${base}` : "vpn_user").slice(0, 48);
}
__name(configUsername, "configUsername");
function buildOpenVpnProfile(order, node) {
  const host = safeHost(node.ip);
  if (!host) return null;
  const username = configUsername(order);
  const password = crypto.randomUUID().replace(/-/g, "");
  const protocol = /tcp/i.test(node.protocol) ? "tcp" : "udp";
  const lines = [
    "# VarNet static-IP profile",
    `# Node: ${node.name.replace(/[\r\n]+/g, " ").trim() || "static-ip"}`,
    `# Account: ${username}`,
    "client",
    "dev tun",
    `proto ${protocol}`,
    `remote ${host} ${OPENVPN_PORT}`,
    "resolv-retry infinite",
    "nobind",
    "persist-key",
    "persist-tun",
    "remote-cert-tls server",
    "auth-nocache",
    "verb 3",
    "<auth-user-pass>",
    username,
    password,
    "</auth-user-pass>"
  ];
  return `${lines.join("\n")}
`;
}
__name(buildOpenVpnProfile, "buildOpenVpnProfile");
async function loadNodeInfo(db, productId) {
  try {
    const planNode = await db.prepare(
      `SELECT n.ip AS ip, n.protocol AS protocol, n.name AS name
         FROM static_ip_plans p
         JOIN static_ip_nodes n ON n.id = p.node_id
         WHERE p.id = ?`
    ).bind(productId).first();
    if (planNode) return planNode;
  } catch {
  }
  try {
    const node = await db.prepare("SELECT ip, protocol, name FROM static_ip_nodes WHERE id = ?").bind(productId).first();
    return node ?? null;
  } catch {
    return null;
  }
}
__name(loadNodeInfo, "loadNodeInfo");
async function resolveDeliveryNote(db, order, adminNote) {
  if (adminNote) return adminNote;
  if (order.kind === "vpn") {
    const node = await loadNodeInfo(db, order.product_id);
    if (node) {
      const profile = buildOpenVpnProfile(order, node);
      if (profile) return profile;
    }
  }
  return order.product_title;
}
__name(resolveDeliveryNote, "resolveDeliveryNote");
async function completeOrder(context, order, adminNote) {
  const db = context.env.DB;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (order.status !== "pending" && order.status !== "paid" && order.status !== "provisioning") {
    return failure(409, "ORDER_NOT_PAYABLE", "\u0641\u0642\u0637 \u0633\u0641\u0627\u0631\u0634 \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631 \u06CC\u0627 \u067E\u0631\u062F\u0627\u062E\u062A\u200C\u0634\u062F\u0647 \u0642\u0627\u0628\u0644 \u062A\u0627\u06CC\u06CC\u062F \u0648 \u062A\u062D\u0648\u06CC\u0644 \u0627\u0633\u062A.");
  }
  const deliveryNote = await resolveDeliveryNote(db, order, adminNote);
  if (deliveryNote.length > MAX_NOTE_LENGTH) {
    return failure(400, "INVALID_NOTE", "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u062A\u062D\u0648\u06CC\u0644 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0637\u0648\u0644\u0627\u0646\u06CC \u0627\u0633\u062A.");
  }
  const batch = [
    db.prepare(
      `UPDATE orders
         SET status = 'completed', delivery_note = ?
         WHERE id = ? AND status IN ('pending', 'paid', 'provisioning')`
    ).bind(deliveryNote, order.id),
    // Delivering a pending card-to-card order is the admin's approval of its receipt.
    db.prepare(
      `UPDATE payment_receipts
         SET status = 'APPROVED', reviewed_at = ?
         WHERE order_id = ? AND purpose = 'product_purchase' AND status = 'PENDING'`
    ).bind(now, order.id)
  ];
  const results = await db.batch(batch);
  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    return failure(409, "ORDER_STATE_CHANGED", "\u0648\u0636\u0639\u06CC\u062A \u0633\u0641\u0627\u0631\u0634 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F\u0647 \u0627\u0633\u062A\u061B \u0641\u0647\u0631\u0633\u062A \u0631\u0627 \u0628\u0647\u200C\u0631\u0648\u0632 \u06A9\u0646\u06CC\u062F.");
  }
  let telegramDelivery;
  if (order.kind === "vpn") {
    try {
      const user = await db.prepare("SELECT telegram_id FROM users WHERE id = ?").bind(order.user_id).first();
      telegramDelivery = await sendVpnDocument(context.env.TELEGRAM_BOT_TOKEN, Number(user?.telegram_id), deliveryNote);
    } catch {
      telegramDelivery = { sent: false, code: "TELEGRAM_USER_LOOKUP_FAILED", message: "\u062E\u0648\u0627\u0646\u062F\u0646 \u0634\u0646\u0627\u0633\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0634\u062A\u0631\u06CC \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. (TELEGRAM_USER_LOOKUP_FAILED)" };
    }
  }
  return jsonResponse({
    success: true,
    message: "\u0633\u0641\u0627\u0631\u0634 \u062A\u06A9\u0645\u06CC\u0644 \u0634\u062F \u0648 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u062A\u062D\u0648\u06CC\u0644 \u0628\u0631\u0627\u06CC \u06A9\u0627\u0631\u0628\u0631 \u062B\u0628\u062A \u06AF\u0631\u062F\u06CC\u062F.",
    data: {
      orderId: order.id,
      status: "completed",
      deliveryNote,
      updatedAt: now,
      telegramDelivery
    }
  });
}
__name(completeOrder, "completeOrder");
async function rejectOrder(context, order, reason) {
  const db = context.env.DB;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const refundTotal = order.status === "paid" || order.status === "provisioning" ? Number(order.total) : 0;
  const refundTxId = `txn_${crypto.randomUUID()}`;
  const rejectionNote = `\u062F\u0644\u06CC\u0644 \u0631\u062F \u0633\u0641\u0627\u0631\u0634: ${reason}`;
  const batch = [
    db.prepare(
      `UPDATE orders
         SET status = 'refunded', delivery_note = ?
         WHERE id = ? AND status IN ('pending', 'paid', 'provisioning')`
    ).bind(rejectionNote, order.id)
  ];
  if (refundTotal > 0) {
    batch.push(
      db.prepare(
        `UPDATE users SET balance = balance + ?, updated_at = ?
           WHERE id = ?
             AND NOT EXISTS (
               SELECT 1 FROM wallet_transactions WHERE type = 'refund' AND reference = ?
             )`
      ).bind(refundTotal, now, order.user_id, order.id),
      db.prepare(
        `INSERT INTO wallet_transactions
             (id, user_id, type, amount, balance_after, currency, description, reference, created_at)
           SELECT ?, ?, 'refund', ?, balance, 'IRT', ?, ?, ?
           FROM users
           WHERE id = ?
             AND NOT EXISTS (
               SELECT 1 FROM wallet_transactions WHERE type = 'refund' AND reference = ?
             )`
      ).bind(
        refundTxId,
        order.user_id,
        refundTotal,
        `\u0628\u0627\u0632\u06AF\u0634\u062A \u0648\u062C\u0647 \u0633\u0641\u0627\u0631\u0634 ${order.product_title}`,
        order.id,
        now,
        order.user_id,
        order.id
      )
    );
  }
  const results = await db.batch(batch);
  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    return failure(409, "ORDER_STATE_CHANGED", "\u0627\u06CC\u0646 \u0633\u0641\u0627\u0631\u0634 \u062F\u06CC\u06AF\u0631 \u0642\u0627\u0628\u0644 \u0631\u062F \u0646\u06CC\u0633\u062A\u061B \u0641\u0647\u0631\u0633\u062A \u0631\u0627 \u0628\u0647\u200C\u0631\u0648\u0632 \u06A9\u0646\u06CC\u062F.");
  }
  let balance = null;
  try {
    const row = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(order.user_id).first();
    balance = row ? Number(row.balance) : null;
  } catch {
    balance = null;
  }
  const refunded = refundTotal > 0 && (results[1]?.meta?.changes ?? 0) === 1 ? refundTotal : 0;
  const result = { refunded, balance };
  return jsonResponse({
    success: true,
    message: refunded > 0 ? `\u0633\u0641\u0627\u0631\u0634 \u0631\u062F \u0634\u062F \u0648 ${refunded.toLocaleString("en-US")} \u062A\u0648\u0645\u0627\u0646 \u0628\u0647 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u06A9\u0627\u0631\u0628\u0631 \u0628\u0631\u06AF\u0634\u062A.` : "\u0633\u0641\u0627\u0631\u0634 \u0631\u062F \u0634\u062F. \u0627\u06CC\u0646 \u0633\u0641\u0627\u0631\u0634 \u067E\u0631\u062F\u0627\u062E\u062A\u06CC \u0646\u062F\u0627\u0634\u062A \u0648 \u0645\u0628\u0644\u063A\u06CC \u0628\u0647 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0628\u0631\u0646\u06AF\u0634\u062A.",
    data: { orderId: order.id, status: "refunded", reason, ...result }
  });
}
__name(rejectOrder, "rejectOrder");
async function onRequestPost5(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) return failure(auth.status, auth.code, auth.message);
    const body = await readBody(context);
    if (!body) return failure(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0627\u0642\u062F\u0627\u0645 \u0633\u0641\u0627\u0631\u0634 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!orderId || orderId.length > 128) {
      return failure(400, "INVALID_ORDER", "\u0634\u0646\u0627\u0633\u0647 \u0633\u0641\u0627\u0631\u0634 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const action = body.action;
    if (action !== "complete" && action !== "reject") {
      return failure(400, "INVALID_ACTION", "\u0627\u0642\u062F\u0627\u0645 \u0633\u0641\u0627\u0631\u0634 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const deliveryNote = typeof body.deliveryNote === "string" ? body.deliveryNote.trim() : "";
    if (deliveryNote.length > MAX_NOTE_LENGTH) {
      return failure(400, "INVALID_NOTE", "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u062A\u062D\u0648\u06CC\u0644 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0637\u0648\u0644\u0627\u0646\u06CC \u0627\u0633\u062A.");
    }
    const rejectReason = typeof body.rejectReason === "string" ? body.rejectReason.trim() : "";
    if (rejectReason.length > MAX_REASON_LENGTH) {
      return failure(400, "INVALID_REASON", "\u062F\u0644\u06CC\u0644 \u0631\u062F \u0633\u0641\u0627\u0631\u0634 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0637\u0648\u0644\u0627\u0646\u06CC \u0627\u0633\u062A.");
    }
    if (action === "reject" && rejectReason.length < MIN_REASON_LENGTH) {
      return failure(400, "REJECT_REASON_REQUIRED", "\u062F\u0644\u06CC\u0644 \u0631\u062F \u0633\u0641\u0627\u0631\u0634 \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
    }
    const db = context.env.DB;
    let order;
    try {
      order = await db.prepare(
        `SELECT id, user_id, product_id, product_title, kind, total, status, payment_method
           FROM orders WHERE id = ?`
      ).bind(orderId).first();
    } catch {
      return failure(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u0633\u0641\u0627\u0631\u0634 \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
    }
    if (!order) return failure(404, "ORDER_NOT_FOUND", "\u0633\u0641\u0627\u0631\u0634 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    return action === "complete" ? await completeOrder(context, order, deliveryNote) : await rejectOrder(context, order, rejectReason);
  } catch (cause) {
    return internalFailure(cause, "ORDER_ACTION_FAILED");
  }
}
__name(onRequestPost5, "onRequestPost");

// api/admin/products/delete.ts
var MAX_PRODUCT_IDS = 100;
async function onRequestPost6(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) {
      return failure(auth.status, "ADMIN_AUTH_FAILED", "\u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0639\u0645\u0644\u06CC\u0627\u062A \u0645\u062F\u06CC\u0631\u06CC\u062A\u06CC \u0627\u0645\u06A9\u0627\u0646\u200C\u067E\u0630\u06CC\u0631 \u0646\u06CC\u0633\u062A.");
    }
    let body;
    try {
      body = await context.request.json();
    } catch {
      return failure(400, "PRODUCT_DELETE_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return failure(400, "PRODUCT_DELETE_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const { productIds } = body;
    if (!Array.isArray(productIds) || productIds.length === 0 || productIds.length > MAX_PRODUCT_IDS || productIds.some((id) => typeof id !== "string" || id.trim() === "" || id !== id.trim())) {
      return failure(400, "PRODUCT_DELETE_INVALID_IDS", "\u0641\u0647\u0631\u0633\u062A \u0634\u0646\u0627\u0633\u0647\u200C\u0647\u0627\u06CC \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const ids = [...new Set(productIds)];
    const db = context.env.DB;
    try {
      const placeholders = ids.map(() => "?").join(", ");
      const result = await db.prepare(`SELECT id FROM products WHERE id IN (${placeholders})`).bind(...ids).all();
      if (result.results.length !== ids.length) {
        return failure(404, "PRODUCT_DELETE_NOT_FOUND", "\u06CC\u06A9 \u06CC\u0627 \u0686\u0646\u062F \u0645\u062D\u0635\u0648\u0644 \u0645\u0648\u0631\u062F \u0646\u0638\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.");
      }
    } catch {
      return failure(503, "PRODUCT_DELETE_READ_FAILED", "\u0628\u0631\u0631\u0633\u06CC \u0645\u062D\u0635\u0648\u0644\u0627\u062A \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
    }
    try {
      const statements = ids.map((id) => db.prepare(
        `INSERT INTO product_overrides (product_id, is_deleted) VALUES (?, 1)
         ON CONFLICT(product_id) DO UPDATE SET is_deleted = 1`
      ).bind(id));
      const results = await db.batch(statements);
      if (results.length !== statements.length || results.some((result) => !result.success)) {
        return failure(503, "PRODUCT_DELETE_SAVE_FAILED", "\u062D\u0630\u0641 \u0645\u062D\u0635\u0648\u0644\u0627\u062A \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
      }
    } catch {
      return failure(503, "PRODUCT_DELETE_SAVE_FAILED", "\u062D\u0630\u0641 \u0645\u062D\u0635\u0648\u0644\u0627\u062A \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
    }
    return jsonResponse({ success: true, data: { productIds: ids } });
  } catch {
    return failure(500, "PRODUCT_DELETE_FAILED", "\u0639\u0645\u0644\u06CC\u0627\u062A \u062D\u0630\u0641 \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
  }
}
__name(onRequestPost6, "onRequestPost");

// ../src/lib/productCategories.ts
var PRODUCT_CATEGORIES = [
  "ai",
  "design",
  "os",
  "office",
  "security",
  "streaming",
  "dev",
  "social",
  "gaming",
  "other"
];
var CATEGORY_KEYWORDS = [
  ["ai", ["claude", "chatgpt", "gpt", "gemini", "grok", "perplexity", "elevenlabs", "muse ai", "openart", "leonardo", "suno", "ripple", "cursor", "krea ai", "gamma", "midjourney", "copilot", "wispr flow", "manus", "minimax", "antigravity", "higgsfield", "pangram", "chatprd", "lovable", "magic patterns"]],
  ["design", ["adobe", "photoshop", "illustrator", "acrobat", "canva", "figma", "framer", "corel", "coreldraw", "capcut", "alight motion", "meitu", "wink", "xingtu", "mobbin", "autodesk"]],
  ["os", ["windows", "win 10", "win 11", "windows server"]],
  ["office", ["office", "microsoft 365", "ms365", "notion", "zoom", "grammarly", "quizlet", "coursera", "udemy", "granola", "intercom", "dropbox", "google drive"]],
  ["security", ["kaspersky", "nordvpn", "expressvpn", "surfshark", "purevpn", "proton", "vpn", "antivirus"]],
  ["streaming", ["netflix", "spotify", "youtube", "amazon prime", "hbo", "crunchyroll", "apple music", "apple tv", "tv360", "brain.fm"]],
  ["dev", ["visual studio", "jetbrains", "posthog", "railway", "resend", "warp", "n8n", "linear", "api", "sql"]],
  ["social", ["facebook", "linkedin", "x premium", "twitter", "discord nitro"]],
  ["gaming", ["xbox", "exitlag", "game", "steam"]]
];
function classifyProduct(title) {
  const name = title.trim().toLowerCase();
  return CATEGORY_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => name.includes(keyword)))?.[0] ?? "other";
}
__name(classifyProduct, "classifyProduct");

// api/admin/products/override.ts
async function onRequestPost7(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) {
      return failure(auth.status, "ADMIN_AUTH_FAILED", "\u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0639\u0645\u0644\u06CC\u0627\u062A \u0645\u062F\u06CC\u0631\u06CC\u062A\u06CC \u0627\u0645\u06A9\u0627\u0646\u200C\u067E\u0630\u06CC\u0631 \u0646\u06CC\u0633\u062A.");
    }
    let body;
    try {
      body = await context.request.json();
    } catch {
      return failure(400, "OVERRIDE_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return failure(400, "OVERRIDE_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const { productId, faDescription, customCategory, isFeatured, isBestseller } = body;
    if (typeof productId !== "string" || productId.trim() === "") {
      return failure(400, "OVERRIDE_INVALID_PRODUCT_ID", "\u0634\u0646\u0627\u0633\u0647 \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    if (faDescription !== null && typeof faDescription !== "string") {
      return failure(400, "OVERRIDE_INVALID_DESCRIPTION", "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    if (customCategory !== null && (typeof customCategory !== "string" || !PRODUCT_CATEGORIES.includes(customCategory))) {
      return failure(400, "OVERRIDE_INVALID_CATEGORY", "\u062F\u0633\u062A\u0647\u200C\u0628\u0646\u062F\u06CC \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    if (typeof isFeatured !== "boolean" || typeof isBestseller !== "boolean") {
      return failure(400, "OVERRIDE_INVALID_FLAGS", "\u0648\u0636\u0639\u06CC\u062A \u0648\u06CC\u0698\u0647 \u06CC\u0627 \u067E\u0631\u0641\u0631\u0648\u0634 \u0628\u0648\u062F\u0646 \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const db = context.env.DB;
    try {
      const product = await db.prepare("SELECT id FROM products WHERE id = ?").bind(productId).first();
      if (!product) return failure(404, "OVERRIDE_PRODUCT_NOT_FOUND", "\u0645\u062D\u0635\u0648\u0644 \u0645\u0648\u0631\u062F \u0646\u0638\u0631 \u06CC\u0627\u0641\u062A \u0646\u0634\u062F.");
    } catch {
      return failure(503, "OVERRIDE_PRODUCT_READ_FAILED", "\u0628\u0631\u0631\u0633\u06CC \u0645\u062D\u0635\u0648\u0644 \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
    }
    try {
      const result = await db.prepare(
        `INSERT INTO product_overrides (product_id, fa_description, custom_category, is_featured, is_bestseller)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(product_id) DO UPDATE SET
           fa_description = excluded.fa_description,
           custom_category = excluded.custom_category,
           is_featured = excluded.is_featured,
           is_bestseller = excluded.is_bestseller`
      ).bind(productId, faDescription, customCategory, Number(isFeatured), Number(isBestseller)).run();
      if (!result.success) {
        return failure(503, "OVERRIDE_SAVE_FAILED", "\u0630\u062E\u06CC\u0631\u0647 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
      }
    } catch {
      return failure(503, "OVERRIDE_SAVE_FAILED", "\u0630\u062E\u06CC\u0631\u0647 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
    }
    return jsonResponse({
      success: true,
      data: { productId, faDescription, customCategory, isFeatured, isBestseller }
    });
  } catch {
    return failure(500, "OVERRIDE_FAILED", "\u0639\u0645\u0644\u06CC\u0627\u062A \u062A\u0646\u0638\u06CC\u0645 \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.");
  }
}
__name(onRequestPost7, "onRequestPost");

// api/admin/receipts/action.ts
var MAX_BODY_BYTES2 = 4096;
async function readBody2(context) {
  let raw;
  try {
    raw = await context.request.text();
  } catch {
    return null;
  }
  if (raw.length > MAX_BODY_BYTES2) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
__name(readBody2, "readBody");
async function approveReceipt(context, receipt) {
  const db = context.env.DB;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const amount = Number(receipt.amount);
  if (receipt.purpose === "product_purchase") {
    if (!receipt.order_id) {
      return failure(400, "RECEIPT_NO_ORDER", "\u0627\u06CC\u0646 \u0641\u06CC\u0634 \u0628\u0647 \u0633\u0641\u0627\u0631\u0634\u06CC \u0645\u062A\u0635\u0644 \u0646\u06CC\u0633\u062A.");
    }
    const results2 = await db.batch([
      db.prepare(
        `UPDATE orders SET status = 'paid'
           WHERE id = ? AND status = 'pending'`
      ).bind(receipt.order_id),
      db.prepare(
        `UPDATE payment_receipts SET status = 'APPROVED', reviewed_at = ?
           WHERE id = ? AND status = 'PENDING'
             AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')`
      ).bind(now, receipt.id, receipt.order_id)
    ]);
    if ((results2[0]?.meta?.changes ?? 0) !== 1) {
      return failure(409, "ORDER_NOT_PENDING", "\u0627\u06CC\u0646 \u0633\u0641\u0627\u0631\u0634 \u0642\u0628\u0644\u0627\u064B \u067E\u0631\u062F\u0627\u062E\u062A \u06CC\u0627 \u0644\u063A\u0648 \u0634\u062F\u0647 \u0627\u0633\u062A.");
    }
    return jsonResponse({
      success: true,
      message: "\u0641\u06CC\u0634 \u062A\u0627\u06CC\u06CC\u062F \u0634\u062F \u0648 \u0633\u0641\u0627\u0631\u0634 \u0628\u0647 \u0648\u0636\u0639\u06CC\u062A \u067E\u0631\u062F\u0627\u062E\u062A\u200C\u0634\u062F\u0647 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F.",
      data: { receiptId: receipt.id, status: "APPROVED", orderId: receipt.order_id }
    });
  }
  const transactionId = `txn_${crypto.randomUUID()}`;
  const results = await db.batch([
    db.prepare(
      `UPDATE payment_receipts SET status = 'APPROVED', reviewed_at = ?
         WHERE id = ? AND status = 'PENDING'`
    ).bind(now, receipt.id),
    db.prepare(
      `UPDATE users SET balance = balance + ?, updated_at = ?
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM wallet_transactions WHERE type = 'deposit' AND reference = ?
           )`
    ).bind(amount, now, receipt.user_id, receipt.id),
    db.prepare(
      `INSERT INTO wallet_transactions
           (id, user_id, type, amount, balance_after, currency, description, reference, created_at)
         SELECT ?, ?, 'deposit', ?, balance, 'IRT', ?, ?, ?
         FROM users
         WHERE id = ?
           AND NOT EXISTS (
             SELECT 1 FROM wallet_transactions WHERE type = 'deposit' AND reference = ?
           )`
    ).bind(
      transactionId,
      receipt.user_id,
      amount,
      "\u0634\u0627\u0631\u0698 \u06A9\u06CC\u0641 \u067E\u0648\u0644 (\u06A9\u0627\u0631\u062A \u0628\u0647 \u06A9\u0627\u0631\u062A)",
      receipt.id,
      now,
      receipt.user_id,
      receipt.id
    )
  ]);
  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    return failure(409, "RECEIPT_ALREADY_REVIEWED", "\u0627\u06CC\u0646 \u0641\u06CC\u0634 \u0642\u0628\u0644\u0627\u064B \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A.");
  }
  let balance = null;
  try {
    const row = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(receipt.user_id).first();
    balance = row ? Number(row.balance) : null;
  } catch {
    balance = null;
  }
  return jsonResponse({
    success: true,
    message: "\u0641\u06CC\u0634 \u062A\u0627\u06CC\u06CC\u062F \u0634\u062F \u0648 \u0645\u0648\u062C\u0648\u062F\u06CC \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u06A9\u0627\u0631\u0628\u0631 \u0627\u0641\u0632\u0627\u06CC\u0634 \u06CC\u0627\u0641\u062A.",
    data: { receiptId: receipt.id, status: "APPROVED", amount, balance }
  });
}
__name(approveReceipt, "approveReceipt");
async function rejectReceipt(context, receipt) {
  const db = context.env.DB;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const statements = [
    db.prepare(
      `UPDATE payment_receipts SET status = 'REJECTED', reviewed_at = ?
         WHERE id = ? AND status = 'PENDING'`
    ).bind(now, receipt.id)
  ];
  if (receipt.purpose === "product_purchase" && receipt.order_id) {
    statements.push(
      db.prepare(
        `UPDATE orders SET status = 'cancelled'
           WHERE id = ? AND status = 'pending'`
      ).bind(receipt.order_id)
    );
  }
  const results = await db.batch(statements);
  if ((results[0]?.meta?.changes ?? 0) !== 1) {
    return failure(409, "RECEIPT_ALREADY_REVIEWED", "\u0627\u06CC\u0646 \u0641\u06CC\u0634 \u0642\u0628\u0644\u0627\u064B \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A.");
  }
  return jsonResponse({
    success: true,
    message: "\u0641\u06CC\u0634 \u0631\u062F \u0634\u062F \u0648 \u062F\u0631 \u0635\u0648\u0631\u062A \u0648\u062C\u0648\u062F \u0633\u0641\u0627\u0631\u0634 \u062F\u0631 \u0627\u0646\u062A\u0638\u0627\u0631\u060C \u0644\u063A\u0648 \u06AF\u0631\u062F\u06CC\u062F.",
    data: { receiptId: receipt.id, status: "REJECTED" }
  });
}
__name(rejectReceipt, "rejectReceipt");
async function onRequestPost8(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) return failure(auth.status, auth.code, auth.message);
    const body = await readBody2(context);
    if (!body) return failure(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    const receiptId = typeof body.receiptId === "string" ? body.receiptId.trim() : "";
    if (!receiptId || receiptId.length > 128) {
      return failure(400, "INVALID_RECEIPT", "\u0634\u0646\u0627\u0633\u0647 \u0641\u06CC\u0634 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    if (body.action !== "approve" && body.action !== "reject") {
      return failure(400, "INVALID_ACTION", "\u0627\u0642\u062F\u0627\u0645 \u0641\u06CC\u0634 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const db = context.env.DB;
    let receipt;
    try {
      receipt = await db.prepare(
        `SELECT id, user_id, purpose, order_id, amount, status, reference
           FROM payment_receipts WHERE id = ?`
      ).bind(receiptId).first();
    } catch {
      return failure(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u0641\u06CC\u0634 \u0648\u0627\u0631\u06CC\u0632 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
    }
    if (!receipt) return failure(404, "RECEIPT_NOT_FOUND", "\u0641\u06CC\u0634 \u0648\u0627\u0631\u06CC\u0632 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    if (receipt.status !== "PENDING") {
      return failure(409, "RECEIPT_ALREADY_REVIEWED", "\u0627\u06CC\u0646 \u0641\u06CC\u0634 \u0642\u0628\u0644\u0627\u064B \u0628\u0631\u0631\u0633\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A.");
    }
    return body.action === "approve" ? await approveReceipt(context, receipt) : await rejectReceipt(context, receipt);
  } catch (cause) {
    return internalFailure(cause, "RECEIPT_ACTION_FAILED");
  }
}
__name(onRequestPost8, "onRequestPost");

// api/admin/settings/bank.ts
function normalizeCard(value) {
  return value.replace(/[^\d]/g, "");
}
__name(normalizeCard, "normalizeCard");
async function readSettings(db) {
  const result = await db.prepare(
    `SELECT key, value, updated_at FROM settings
       WHERE key IN ('bank_card_number', 'bank_account_holder', 'bank_name')`
  ).all();
  const map = new Map((result.results ?? []).map((row) => [row.key, row]));
  return {
    cardNumber: map.get("bank_card_number")?.value ?? "",
    accountHolder: map.get("bank_account_holder")?.value ?? "",
    bankName: map.get("bank_name")?.value || void 0,
    updatedAt: map.get("bank_card_number")?.updated_at ?? map.get("bank_account_holder")?.updated_at ?? null
  };
}
__name(readSettings, "readSettings");
async function onRequestGet4(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) return failure(auth.status, auth.code, auth.message);
    const db = context.env.DB;
    return jsonResponse({ success: true, data: await readSettings(db) });
  } catch (cause) {
    return internalFailure(cause, "BANK_SETTINGS_READ_FAILED");
  }
}
__name(onRequestGet4, "onRequestGet");
async function onRequestPost9(context) {
  try {
    const auth = await authenticateAdmin(context.request, context.env);
    if (!auth.ok) return failure(auth.status, auth.code, auth.message);
    let raw;
    try {
      raw = await context.request.text();
    } catch {
      return failure(400, "INVALID_BODY", "\u0628\u062F\u0646\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0627\u0628\u0644 \u062E\u0648\u0627\u0646\u062F\u0646 \u0646\u0628\u0648\u062F.");
    }
    if (raw.length > 4096) return failure(413, "INVALID_BODY", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0632\u0631\u06AF \u0627\u0633\u062A.");
    let body;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return failure(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
      }
      body = parsed;
    } catch {
      return failure(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const cardNumber = normalizeCard(typeof body.cardNumber === "string" ? body.cardNumber : "");
    const accountHolder = typeof body.accountHolder === "string" ? body.accountHolder.trim() : "";
    const bankName = typeof body.bankName === "string" ? body.bankName.trim() : "";
    if (cardNumber.length !== 16) {
      return failure(400, "INVALID_CARD", "\u0634\u0645\u0627\u0631\u0647 \u06A9\u0627\u0631\u062A \u0628\u0627\u06CC\u062F \u06F1\u06F6 \u0631\u0642\u0645 \u0628\u0627\u0634\u062F.");
    }
    if (accountHolder.length < 3 || accountHolder.length > 80) {
      return failure(400, "INVALID_HOLDER", "\u0646\u0627\u0645 \u0635\u0627\u062D\u0628 \u062D\u0633\u0627\u0628 \u0631\u0627 \u06A9\u0627\u0645\u0644 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
    }
    if (bankName.length > 80) {
      return failure(400, "INVALID_BANK", "\u0646\u0627\u0645 \u0628\u0627\u0646\u06A9 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0637\u0648\u0644\u0627\u0646\u06CC \u0627\u0633\u062A.");
    }
    const db = context.env.DB;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const values = [
      ["bank_card_number", cardNumber],
      ["bank_account_holder", accountHolder],
      ["bank_name", bankName]
    ];
    try {
      await db.batch(
        values.map(
          ([key, value]) => db.prepare(
            `INSERT INTO settings (key, value, updated_at)
               VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          ).bind(key, value, now)
        )
      );
    } catch {
      return failure(503, "DB_UNAVAILABLE", "\u0630\u062E\u06CC\u0631\u0647 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0631\u062A \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
    }
    return jsonResponse({
      success: true,
      message: "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0631\u062A \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F.",
      data: await readSettings(db)
    });
  } catch (cause) {
    return internalFailure(cause, "BANK_SETTINGS_WRITE_FAILED");
  }
}
__name(onRequestPost9, "onRequestPost");

// api/admin/settings/margins.ts
async function readTiers(context) {
  const db = context.env.DB;
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(MARGIN_TIERS_KEY).first().catch(() => null);
  if (!row?.value) return DEFAULT_MARGIN_TIERS;
  try {
    return parseMarginTiers(JSON.parse(row.value)) ?? DEFAULT_MARGIN_TIERS;
  } catch {
    return DEFAULT_MARGIN_TIERS;
  }
}
__name(readTiers, "readTiers");
async function onRequestGet5(context) {
  const auth = await authenticateAdmin(context.request, context.env);
  if (!auth.ok) return failure(auth.status, auth.code, auth.message);
  return jsonResponse({
    success: true,
    data: { tiers: await readTiers(context) }
  });
}
__name(onRequestGet5, "onRequestGet");
async function onRequestPost10(context) {
  const auth = await authenticateAdmin(context.request, context.env);
  if (!auth.ok) return failure(auth.status, auth.code, auth.message);
  const rawBody = await context.request.text();
  let body;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return failure(400, "MARGINS_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    body = parsed;
  } catch {
    return failure(400, "MARGINS_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
  }
  const tiers = parseMarginTiers(body.tiers);
  if (!tiers) {
    return failure(
      400,
      "MARGINS_VALIDATION",
      "\u067E\u0644\u06A9\u0627\u0646 \u0633\u0648\u062F \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A\u061B \u0628\u0627\u0632\u0647\u200C\u0647\u0627 \u0628\u0627\u06CC\u062F \u0635\u0639\u0648\u062F\u06CC \u0648 \u0622\u062E\u0631\u06CC\u0646 \u0628\u0627\u0632\u0647 \xAB\u0628\u06CC\u0634\u062A\u0631 \u0627\u0632\xBB \u0628\u0627\u0634\u062F."
    );
  }
  try {
    await context.env.DB.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(MARGIN_TIERS_KEY, JSON.stringify(tiers), (/* @__PURE__ */ new Date()).toISOString()).run();
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u0630\u062E\u06CC\u0631\u0647 \u0633\u0648\u062F \u067E\u0644\u06A9\u0627\u0646\u06CC \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
  }
  return jsonResponse({ success: true, data: { tiers } });
}
__name(onRequestPost10, "onRequestPost");

// api/admin/wallet/adjust.ts
var MAX_ADJUSTMENT = 1e9;
var MAX_NOTE_LENGTH2 = 200;
function validateBody(body) {
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId || userId.length > 100) {
    return { ok: false, message: "\u0634\u0646\u0627\u0633\u0647 \u06A9\u0627\u0631\u0628\u0631 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." };
  }
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    return { ok: false, message: "\u0645\u0628\u0644\u063A \u0628\u0627\u06CC\u062F \u06CC\u06A9 \u0639\u062F\u062F \u0635\u062D\u06CC\u062D \u0648 \u063A\u06CC\u0631 \u0635\u0641\u0631 (\u062A\u0648\u0645\u0627\u0646) \u0628\u0627\u0634\u062F." };
  }
  if (Math.abs(amount) > MAX_ADJUSTMENT) {
    return { ok: false, message: "\u0645\u0628\u0644\u063A \u062A\u0639\u062F\u06CC\u0644 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0645\u062C\u0627\u0632 \u0627\u0633\u062A." };
  }
  const rawNote = typeof body.note === "string" ? body.note.trim() : "";
  if (rawNote.length > MAX_NOTE_LENGTH2) {
    return { ok: false, message: "\u062A\u0648\u0636\u06CC\u062D \u062A\u0631\u0627\u06A9\u0646\u0634 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0637\u0648\u0644\u0627\u0646\u06CC \u0627\u0633\u062A." };
  }
  return { ok: true, value: { userId, amount, note: rawNote || null } };
}
__name(validateBody, "validateBody");
async function onRequestPost11(context) {
  const auth = await authenticateAdmin(context.request, context.env);
  if (!auth.ok) return failure(auth.status, auth.code, auth.message);
  const db = context.env.DB;
  const rawBody = await context.request.text();
  let body;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return failure(400, "ADJUST_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    body = parsed;
  } catch {
    return failure(400, "ADJUST_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
  }
  const validated = validateBody(body);
  if (!validated.ok) return failure(400, "ADJUST_VALIDATION", validated.message);
  const { userId, amount, note } = validated.value;
  const user = await db.prepare("SELECT id, balance FROM users WHERE id = ?").bind(userId).first().catch(() => null);
  if (!user) {
    return failure(404, "USER_NOT_FOUND", "\u06A9\u0627\u0631\u0628\u0631\u06CC \u0628\u0627 \u0627\u06CC\u0646 \u0634\u0646\u0627\u0633\u0647 \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  }
  const currentBalance = Number(user.balance);
  const nextBalance = currentBalance + amount;
  if (nextBalance < 0) {
    return failure(
      422,
      "INSUFFICIENT_BALANCE",
      "\u0645\u0648\u062C\u0648\u062F\u06CC \u06A9\u0627\u0631\u0628\u0631 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u06A9\u0633\u0631 \u06A9\u0627\u0641\u06CC \u0646\u06CC\u0633\u062A.",
      { balance: currentBalance }
    );
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const transactionId = `txn_${crypto.randomUUID()}`;
  const description = note ? `\u062A\u0639\u062F\u06CC\u0644 \u062F\u0633\u062A\u06CC \u062A\u0648\u0633\u0637 \u0645\u062F\u06CC\u0631 \u2014 ${note}` : amount > 0 ? "\u0634\u0627\u0631\u0698 \u062F\u0633\u062A\u06CC \u062A\u0648\u0633\u0637 \u0645\u062F\u06CC\u0631" : "\u06A9\u0633\u0631 \u062F\u0633\u062A\u06CC \u062A\u0648\u0633\u0637 \u0645\u062F\u06CC\u0631";
  let changes = 0;
  try {
    const [update] = await db.batch([
      db.prepare(
        "UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ? AND balance + ? >= 0"
      ).bind(amount, now, userId, amount),
      db.prepare(
        `INSERT INTO wallet_transactions
             (id, user_id, type, amount, balance_after, currency, description, reference, created_at)
           VALUES (?, ?, 'ADMIN_ADJUSTMENT', ?, ?, 'IRT', ?, NULL, ?)`
      ).bind(transactionId, userId, amount, nextBalance, description, now)
    ]);
    changes = update?.meta?.changes ?? 0;
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u062B\u0628\u062A \u062A\u0639\u062F\u06CC\u0644 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
  }
  if (changes !== 1) {
    return failure(
      409,
      "BALANCE_CONFLICT",
      "\u0645\u0648\u062C\u0648\u062F\u06CC \u06A9\u0627\u0631\u0628\u0631 \u0647\u0645\u200C\u0632\u0645\u0627\u0646 \u062A\u063A\u06CC\u06CC\u0631 \u06A9\u0631\u062F\u061B \u0641\u0647\u0631\u0633\u062A \u0631\u0627 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u06A9\u0646\u06CC\u062F \u0648 \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F."
    );
  }
  return jsonResponse({
    success: true,
    data: {
      userId,
      balance: nextBalance,
      currency: "IRT",
      transactionId,
      amount,
      type: "ADMIN_ADJUSTMENT"
    }
  });
}
__name(onRequestPost11, "onRequestPost");

// api/admin/orders.ts
var ORDER_LIMIT = 500;
async function onRequestGet6(context) {
  const auth = await authenticateAdmin(context.request, context.env);
  if (!auth.ok) return failure(auth.status, auth.code, auth.message);
  const db = context.env.DB;
  let rows;
  try {
    const result = await db.prepare(
      `SELECT o.id, o.user_id, o.product_id, o.product_title, o.kind, o.quantity,
                o.subtotal, o.discount, o.total, o.status, o.payment_method,
                o.delivery_note, o.created_at,
                u.first_name, u.last_name, u.username, u.telegram_id
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         ORDER BY o.created_at DESC
         LIMIT ?`
    ).bind(ORDER_LIMIT).all();
    rows = result.results ?? [];
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u0633\u0641\u0627\u0631\u0634\u200C\u0647\u0627 \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  return jsonResponse({
    success: true,
    data: rows.map((row) => {
      const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
      return {
        id: row.id,
        userId: row.user_id,
        userName: fullName || row.username || (row.telegram_id ? `\u06A9\u0627\u0631\u0628\u0631 ${row.telegram_id}` : void 0),
        telegramId: row.telegram_id ?? void 0,
        items: [
          {
            productId: row.product_id,
            title: row.product_title,
            kind: row.kind === "vpn" ? "vpn" : "account",
            quantity: Number(row.quantity ?? 1),
            unitPrice: Number(row.subtotal)
          }
        ],
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        currency: "IRT",
        status: row.status,
        kind: row.kind === "vpn" ? "vpn" : "account",
        paymentMethod: row.payment_method === "card" ? "card" : "wallet",
        deliveryNote: row.delivery_note ?? void 0,
        createdAt: row.created_at,
        updatedAt: row.created_at
      };
    }),
    meta: { count: rows.length, limit: ORDER_LIMIT }
  });
}
__name(onRequestGet6, "onRequestGet");

// api/admin/receipts.ts
var RECEIPT_LIMIT = 300;
var STATUSES = /* @__PURE__ */ new Set(["PENDING", "APPROVED", "REJECTED"]);
async function onRequestGet7(context) {
  const auth = await authenticateAdmin(context.request, context.env);
  if (!auth.ok) return failure(auth.status, auth.code, auth.message);
  const url = new URL(context.request.url);
  const requested = (url.searchParams.get("status") ?? "PENDING").toUpperCase();
  const status = STATUSES.has(requested) ? requested : null;
  const db = context.env.DB;
  try {
    const sql = `SELECT r.id, r.user_id, r.telegram_id, r.purpose, r.order_id, r.amount,
                        r.currency, r.reference, r.status, r.note, r.created_at, r.reviewed_at,
                        u.first_name, u.last_name, u.username, o.product_title
                 FROM payment_receipts r
                 LEFT JOIN users u ON u.id = r.user_id
                 LEFT JOIN orders o ON o.id = r.order_id
                 ${status ? "WHERE r.status = ?" : ""}
                 ORDER BY r.created_at DESC
                 LIMIT ?`;
    const statement = db.prepare(sql);
    const result = status ? await statement.bind(status, RECEIPT_LIMIT).all() : await statement.bind(RECEIPT_LIMIT).all();
    const rows = result.results ?? [];
    return jsonResponse({
      success: true,
      data: rows.map((row) => {
        const fullName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
        return {
          id: row.id,
          userId: row.user_id,
          telegramId: row.telegram_id,
          userName: fullName || row.username || `\u06A9\u0627\u0631\u0628\u0631 ${row.telegram_id}`,
          purpose: row.purpose,
          orderId: row.order_id ?? void 0,
          productTitle: row.product_title ?? void 0,
          amount: Number(row.amount),
          currency: row.currency,
          reference: row.reference,
          status: row.status,
          note: row.note ?? void 0,
          createdAt: row.created_at,
          reviewedAt: row.reviewed_at ?? void 0
        };
      }),
      meta: { count: rows.length, limit: RECEIPT_LIMIT, status: status ?? "all" }
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u0641\u06CC\u0634\u200C\u0647\u0627\u06CC \u0648\u0627\u0631\u06CC\u0632 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
}
__name(onRequestGet7, "onRequestGet");

// api/admin/users.ts
var USER_LIMIT = 500;
async function onRequestGet8(context) {
  const auth = await authenticateAdmin(context.request, context.env);
  if (!auth.ok) return failure(auth.status, auth.code, auth.message);
  const db = context.env.DB;
  const selfId = `usr_tg_${auth.user.id}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await db.prepare(
      `INSERT INTO users (id, telegram_id, username, first_name, last_name, balance, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 'IRT', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = COALESCE(excluded.username, users.username),
           first_name = COALESCE(excluded.first_name, users.first_name),
           last_name = COALESCE(excluded.last_name, users.last_name),
           updated_at = excluded.updated_at`
    ).bind(
      selfId,
      auth.user.id,
      auth.user.username?.trim() || null,
      auth.user.first_name?.trim() || null,
      auth.user.last_name?.trim() || null,
      now,
      now
    ).run();
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u062B\u0628\u062A \u062D\u0633\u0627\u0628 \u0645\u062F\u06CC\u0631 \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  let rows;
  try {
    const result = await db.prepare(
      `SELECT id, telegram_id, username, first_name, last_name, role, balance, currency, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT ?`
    ).bind(USER_LIMIT).all();
    rows = result.results ?? [];
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u06A9\u0627\u0631\u0628\u0631\u0627\u0646 \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  return jsonResponse({
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      telegramId: Number(row.telegram_id),
      username: row.username ?? void 0,
      firstName: row.first_name ?? "\u06A9\u0627\u0631\u0628\u0631",
      lastName: row.last_name ?? void 0,
      // Access is already verified above, so the caller's own row is presented
      // as an admin without persisting a role change.
      role: row.id === selfId || row.role === "admin" ? "admin" : "user",
      balance: Number(row.balance ?? 0),
      currency: row.currency ?? "IRT",
      createdAt: row.created_at
    })),
    meta: { count: rows.length, limit: USER_LIMIT }
  });
}
__name(onRequestGet8, "onRequestGet");

// api/auth/session.ts
function bearerToken2(request) {
  const header = request.headers.get("Authorization") ?? "";
  const match2 = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match2?.[1]?.trim() ?? "";
}
__name(bearerToken2, "bearerToken");
async function onRequestGet9(context) {
  const { request, env } = context;
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return failure(500, "SERVER_NOT_CONFIGURED", "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A.");
  }
  if (!env.DB) {
    return failure(503, "DB_NOT_CONFIGURED", "\u0627\u062A\u0635\u0627\u0644 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 D1 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  }
  let telegramId = null;
  const token = bearerToken2(request);
  if (token) {
    telegramId = await verifySessionToken(token, botToken);
    if (telegramId === null) {
      return failure(401, "SESSION_INVALID", "\u0646\u0634\u0633\u062A \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.");
    }
  } else {
    const initData = request.headers.get("X-Telegram-Init-Data")?.trim();
    if (!initData) {
      return failure(401, "TELEGRAM_AUTH_REQUIRED", "\u0628\u0631\u0627\u06CC \u062E\u0648\u0627\u0646\u062F\u0646 \u0646\u0634\u0633\u062A \u0628\u0627\u06CC\u062F \u062F\u0627\u062E\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0648\u0627\u0631\u062F \u0634\u0648\u06CC\u062F.");
    }
    const telegramUser = await verifyInitData(initData, botToken);
    if (!telegramUser) {
      return failure(
        401,
        "TELEGRAM_AUTH_INVALID",
        "\u0646\u0634\u0633\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A \u06CC\u0627 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
      );
    }
    telegramId = telegramUser.id;
  }
  try {
    const row = await env.DB.prepare(
      `SELECT id, telegram_id, username, first_name, last_name, role, balance, currency, created_at
       FROM users WHERE telegram_id = ?`
    ).bind(telegramId).first();
    if (!row) {
      return failure(401, "USER_NOT_FOUND", "\u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627\u0641\u062A \u0646\u0634\u062F. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F.");
    }
    return jsonResponse({
      success: true,
      data: {
        user: {
          id: row.id,
          telegramId: Number(row.telegram_id),
          username: row.username ?? void 0,
          firstName: row.first_name || "\u06A9\u0627\u0631\u0628\u0631 \u062A\u0644\u06AF\u0631\u0627\u0645",
          lastName: row.last_name ?? void 0,
          role: row.role === "admin" ? "admin" : "user",
          balance: Number(row.balance ?? 0),
          currency: row.currency || "IRT",
          createdAt: row.created_at
        }
      }
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631 \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
}
__name(onRequestGet9, "onRequestGet");

// api/auth/telegram.ts
var MAX_INIT_DATA_LENGTH = 8192;
function readInitData(request, body) {
  const fromBody = typeof body.initData === "string" ? body.initData : "";
  const fromHeader = request.headers.get("X-Telegram-Init-Data") ?? "";
  return (fromBody || fromHeader).trim();
}
__name(readInitData, "readInitData");
async function loadRole(db, userId, allowListed) {
  const existing = await db.prepare("SELECT role FROM users WHERE id = ?").bind(userId).first();
  return allowListed || existing?.role === "admin" ? "admin" : "user";
}
__name(loadRole, "loadRole");
async function onRequestPost12(context) {
  const { request, env } = context;
  let body = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return failure(400, "AUTH_BAD_REQUEST", "\u0628\u062F\u0646\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.");
  }
  const initData = readInitData(request, body);
  if (!initData) {
    return failure(400, "AUTH_VALIDATION", "\u062F\u0627\u062F\u0647 \u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  }
  if (initData.length > MAX_INIT_DATA_LENGTH) {
    return failure(400, "AUTH_VALIDATION", "\u062F\u0627\u062F\u0647 \u0627\u062D\u0631\u0627\u0632 \u0647\u0648\u06CC\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0632\u0631\u06AF \u0627\u0633\u062A.");
  }
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return failure(500, "SERVER_NOT_CONFIGURED", "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A.");
  }
  if (!env.DB) {
    return failure(503, "DB_NOT_CONFIGURED", "\u0627\u062A\u0635\u0627\u0644 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 D1 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  }
  const db = env.DB;
  const telegramUser = await verifyInitData(initData, botToken);
  if (!telegramUser) {
    return failure(
      401,
      "TELEGRAM_AUTH_INVALID",
      "\u0646\u0634\u0633\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A \u06CC\u0627 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
    );
  }
  const userId = `usr_tg_${telegramUser.id}`;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const role = await loadRole(
      db,
      userId,
      configuredAdminIds(env).has(telegramIdKey(telegramUser.id))
    );
    await db.prepare(
      `INSERT INTO users
          (id, telegram_id, username, first_name, last_name, role, balance, currency, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'IRT', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           telegram_id = excluded.telegram_id,
           username = COALESCE(excluded.username, users.username),
           first_name = COALESCE(excluded.first_name, users.first_name),
           last_name = COALESCE(excluded.last_name, users.last_name),
           role = excluded.role,
           updated_at = excluded.updated_at`
    ).bind(
      userId,
      telegramUser.id,
      telegramUser.username?.trim() || null,
      telegramUser.first_name?.trim() || null,
      telegramUser.last_name?.trim() || null,
      role,
      now,
      now
    ).run();
    const row = await db.prepare(
      `SELECT id, telegram_id, username, first_name, last_name, role, balance, currency, created_at
         FROM users WHERE id = ?`
    ).bind(userId).first();
    if (!row) {
      return failure(503, "DB_UNAVAILABLE", "\u062B\u0628\u062A \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631 \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
    }
    const session = await createSessionToken(telegramUser.id, botToken);
    return jsonResponse({
      success: true,
      data: {
        token: session.token,
        expiresAt: session.expiresAt,
        user: {
          id: row.id,
          telegramId: Number(row.telegram_id ?? telegramUser.id),
          username: row.username ?? void 0,
          firstName: row.first_name || telegramUser.first_name || "\u06A9\u0627\u0631\u0628\u0631 \u062A\u0644\u06AF\u0631\u0627\u0645",
          lastName: row.last_name ?? void 0,
          photoUrl: telegramUser.photo_url,
          role: row.role === "admin" ? "admin" : "user",
          balance: Number(row.balance ?? 0),
          currency: row.currency || "IRT",
          createdAt: row.created_at
        }
      }
    });
  } catch {
    return failure(503, "DB_UNAVAILABLE", "\u062B\u0628\u062A \u06CC\u0627 \u062E\u0648\u0627\u0646\u062F\u0646 \u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631 \u062F\u0631 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
}
__name(onRequestPost12, "onRequestPost");

// api/provider/products.ts
var DEFAULT_PROVIDER_URL = "https://api.dummy-provider.com/v1/products";
var PROVIDER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var UPSTREAM_TIMEOUT_MS = 1e4;
var MAX_PAYLOAD_BYTES = 2e6;
var DEFAULT_USDT_RATE_TOMAN = 7e4;
var RESPONSE_HEADERS2 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
var CATEGORY_STYLES = {
  streaming: { gradient: "from-rose-500 via-red-500 to-orange-500", emoji: "\u{1F3AC}" },
  ai: { gradient: "from-violet-500 via-purple-500 to-indigo-500", emoji: "\u{1F916}" },
  gaming: { gradient: "from-sky-500 via-blue-500 to-indigo-500", emoji: "\u{1F3AE}" },
  design: { gradient: "from-fuchsia-500 via-pink-500 to-rose-500", emoji: "\u{1F3A8}" },
  social: { gradient: "from-sky-400 via-cyan-400 to-blue-500", emoji: "\u2708\uFE0F" },
  other: { gradient: "from-brand-500 to-brand-700", emoji: "\u{1F6CD}\uFE0F" }
};
var CATEGORY_ALIASES = {
  streaming: "streaming",
  video: "streaming",
  music: "streaming",
  "video-streaming": "streaming",
  ai: "ai",
  "artificial-intelligence": "ai",
  ml: "ai",
  chat: "ai",
  gaming: "gaming",
  game: "gaming",
  games: "gaming",
  design: "design",
  creative: "design",
  graphics: "design",
  social: "social",
  "social-media": "social",
  messaging: "social"
};
function jsonResponse2(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS2 });
}
__name(jsonResponse2, "jsonResponse");
function firstString(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return void 0;
}
__name(firstString, "firstString");
function firstNumber(record, keys) {
  for (const key of keys) {
    const raw = record[key];
    const value = typeof raw === "string" ? Number(raw) : raw;
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return void 0;
}
__name(firstNumber, "firstNumber");
function firstStringArray(record, keys) {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    const items = value.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 8);
    if (items.length > 0) return items;
  }
  return void 0;
}
__name(firstStringArray, "firstStringArray");
function resolveUsdtRate(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_USDT_RATE_TOMAN;
}
__name(resolveUsdtRate, "resolveUsdtRate");
function normalizeAmount(record, keys, currency, usdtRate) {
  const amount = firstNumber(record, keys);
  if (amount === void 0 || amount < 0) return null;
  if (currency === "USDT") return Math.round(amount * usdtRate);
  if (currency === "IRR") return Math.round(amount / 10);
  if (currency === "IRT" || currency === "TOMAN") return Math.round(amount);
  return null;
}
__name(normalizeAmount, "normalizeAmount");
function normalizeCategory(raw) {
  if (!raw) return "other";
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return CATEGORY_ALIASES[key] ?? "other";
}
__name(normalizeCategory, "normalizeCategory");
function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
__name(slugify, "slugify");
function normalizeProduct(raw, usdtRate) {
  if (!raw || typeof raw !== "object") return null;
  const record = raw;
  const title = firstString(record, ["title", "name", "display_name"]);
  const currency = (firstString(record, ["currency", "price_currency"]) ?? "IRT").toUpperCase();
  const providerPrice = firstNumber(record, ["price", "price_amount", "amount"]);
  const price = normalizeAmount(record, ["price", "price_amount", "amount"], currency, usdtRate);
  if (!title || price === null || providerPrice === void 0 || providerPrice < 0) return null;
  const id = firstString(record, ["id", "product_id", "sku"]) ?? `prov_${slugify(title) || "product"}`;
  const category = normalizeCategory(firstString(record, ["category", "type", "group"]));
  const style = CATEGORY_STYLES[category];
  const providerOldPrice = firstNumber(record, [
    "old_price",
    "oldPrice",
    "original_price",
    "compare_at_price"
  ]);
  const oldPriceRaw = normalizeAmount(
    record,
    ["old_price", "oldPrice", "original_price", "compare_at_price"],
    currency,
    usdtRate
  );
  const stock = Math.max(0, Math.floor(firstNumber(record, ["stock", "quantity", "inventory"]) ?? 0));
  const rating = firstNumber(record, ["rating", "score"]);
  const reviewCount = firstNumber(record, ["review_count", "reviewCount", "reviews"]);
  return {
    id,
    title,
    subtitle: firstString(record, ["subtitle", "short_description", "tagline"]),
    category,
    price,
    oldPrice: oldPriceRaw !== null && oldPriceRaw > price ? oldPriceRaw : void 0,
    providerPrice,
    providerOldPrice: providerOldPrice !== void 0 && providerOldPrice > providerPrice ? providerOldPrice : void 0,
    providerCurrency: currency,
    currency: "IRT",
    stock,
    rating: rating === void 0 ? void 0 : Math.min(5, Math.max(0, Math.round(rating * 10) / 10)),
    reviewCount: reviewCount === void 0 ? void 0 : Math.max(0, Math.round(reviewCount)),
    badge: firstString(record, ["badge", "tag"]),
    deliveryTime: firstString(record, ["delivery_time", "deliveryTime"]),
    description: firstString(record, ["description", "long_description"]),
    features: firstStringArray(record, ["features", "bullets"]),
    gradient: style.gradient,
    emoji: firstString(record, ["emoji", "icon"]) ?? style.emoji
  };
}
__name(normalizeProduct, "normalizeProduct");
function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return null;
  const record = payload;
  for (const key of ["data", "products", "items", "results"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const nested = value.items;
      if (Array.isArray(nested)) return nested;
    }
  }
  return null;
}
__name(extractRows, "extractRows");
async function onRequestGet10(context) {
  const apiKey = context.env.ACCOUNTS_PROVIDER_API_KEY?.trim();
  if (!apiKey) {
    return jsonResponse2(
      {
        success: false,
        code: "PROVIDER_KEY_MISSING",
        message: "\u06A9\u0644\u06CC\u062F API \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u062F\u0631 \u0645\u062D\u06CC\u0637 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A."
      },
      500
    );
  }
  let providerUrl;
  try {
    providerUrl = new URL(
      context.env.ACCOUNTS_PROVIDER_BASE_URL?.trim() || DEFAULT_PROVIDER_URL
    );
  } catch {
    providerUrl = new URL(DEFAULT_PROVIDER_URL);
  }
  if (providerUrl.protocol !== "https:") {
    return jsonResponse2(
      {
        success: false,
        code: "PROVIDER_URL_INVALID",
        message: "\u0646\u0634\u0627\u0646\u06CC \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0628\u0627\u06CC\u062F \u0628\u0627 https \u0622\u063A\u0627\u0632 \u0634\u0648\u062F."
      },
      500
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(providerUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": PROVIDER_USER_AGENT
      },
      signal: controller.signal
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return jsonResponse2(
      {
        success: false,
        code: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
        message: timedOut ? "\u0632\u0645\u0627\u0646 \u067E\u0627\u0633\u062E \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0628\u0647 \u067E\u0627\u06CC\u0627\u0646 \u0631\u0633\u06CC\u062F." : "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F."
      },
      timedOut ? 504 : 502
    );
  } finally {
    clearTimeout(timeout);
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return jsonResponse2(
      {
        success: false,
        code: "PROVIDER_AUTH_FAILED",
        message: "\u06A9\u0644\u06CC\u062F API \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A \u06CC\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0644\u0627\u0632\u0645 \u0631\u0627 \u0646\u062F\u0627\u0631\u062F."
      },
      502
    );
  }
  if (!upstream.ok) {
    return jsonResponse2(
      {
        success: false,
        code: "PROVIDER_UNAVAILABLE",
        message: "\u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u06A9\u0627\u062A\u0627\u0644\u0648\u06AF \u0631\u0627 \u0628\u0631\u0646\u06AF\u0631\u062F\u0627\u0646\u062F."
      },
      502
    );
  }
  const text = await upstream.text();
  if (text.length > MAX_PAYLOAD_BYTES) {
    return jsonResponse2(
      { success: false, code: "PROVIDER_BAD_PAYLOAD", message: "\u067E\u0627\u0633\u062E \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0632\u0631\u06AF \u0627\u0633\u062A." },
      502
    );
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return jsonResponse2(
      { success: false, code: "PROVIDER_BAD_PAYLOAD", message: "\u067E\u0627\u0633\u062E \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0642\u0627\u0628\u0644 \u062E\u0648\u0627\u0646\u062F\u0646 \u0646\u0628\u0648\u062F." },
      502
    );
  }
  const rows = extractRows(payload);
  if (!rows) {
    return jsonResponse2(
      { success: false, code: "PROVIDER_BAD_PAYLOAD", message: "\u0633\u0627\u062E\u062A\u0627\u0631 \u06A9\u0627\u062A\u0627\u0644\u0648\u06AF \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." },
      502
    );
  }
  const usdtRate = resolveUsdtRate(context.env.USDT_RATE_TOMAN);
  const products = [];
  const seen = /* @__PURE__ */ new Set();
  let skipped = 0;
  for (const row of rows) {
    const product = normalizeProduct(row, usdtRate);
    if (!product || seen.has(product.id)) {
      skipped += 1;
      continue;
    }
    seen.add(product.id);
    products.push(product);
  }
  return jsonResponse2({
    success: true,
    data: products,
    meta: {
      count: products.length,
      skipped,
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      // Surfaced so the admin settings page can show the server rate and the
      // client can convert Toman bases back to USDT for the margin tiers.
      usdtRate
    }
  });
}
__name(onRequestGet10, "onRequestGet");

// api/_lib/userAuth.ts
async function authenticateUser(request, env) {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const initData = request.headers.get("X-Telegram-Init-Data")?.trim();
  if (initData) {
    if (!botToken) {
      return {
        ok: false,
        status: 500,
        code: "SERVER_NOT_CONFIGURED",
        message: "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A."
      };
    }
    const user = await verifyInitData(initData, botToken);
    if (!user) {
      return {
        ok: false,
        status: 401,
        code: "TELEGRAM_AUTH_INVALID",
        message: "\u0646\u0634\u0633\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
      };
    }
    return { ok: true, user };
  }
  const demoTelegramId = Number(env.PURCHASE_DEMO_TELEGRAM_ID);
  if (Number.isInteger(demoTelegramId) && demoTelegramId > 0) {
    return { ok: true, user: { id: demoTelegramId, first_name: "\u06A9\u0627\u0631\u0628\u0631 \u0622\u0632\u0645\u0627\u06CC\u0634\u06CC" } };
  }
  return {
    ok: false,
    status: 401,
    code: "TELEGRAM_AUTH_REQUIRED",
    message: "\u0628\u0631\u0627\u06CC \u0645\u0634\u0627\u0647\u062F\u0647 \u0627\u06CC\u0646 \u0628\u062E\u0634 \u0628\u0627\u06CC\u062F \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u0627\u0632 \u062F\u0627\u062E\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
  };
}
__name(authenticateUser, "authenticateUser");
function userIdFor(user) {
  return `usr_tg_${user.id}`;
}
__name(userIdFor, "userIdFor");

// api/static-ip/download.ts
var headers = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff"
};
function failure2(status, code, message) {
  return Response.json({ success: false, code, message }, { status, headers });
}
__name(failure2, "failure");
async function onRequestPost13(context) {
  const auth = await authenticateUser(context.request, context.env);
  if (!auth.ok) return failure2(auth.status, auth.code, auth.message);
  const db = context.env.DB;
  const botToken = context.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!db) return failure2(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  if (!botToken) return failure2(503, "TELEGRAM_NOT_CONFIGURED", "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  let body;
  try {
    body = await context.request.json();
  } catch {
    return failure2(400, "INVALID_BODY", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
  }
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId || orderId.length > 128) return failure2(400, "INVALID_ORDER", "\u0634\u0646\u0627\u0633\u0647 \u0633\u0641\u0627\u0631\u0634 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
  try {
    const note = await findOwnedConfig(db, orderId, userIdFor(auth.user));
    if (!note) return failure2(404, "CONFIG_NOT_FOUND", "\u06A9\u0627\u0646\u0641\u06CC\u06AF \u062A\u062D\u0648\u06CC\u0644\u200C\u0634\u062F\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    const token = await createStaticIpDownloadToken(auth.user.id, orderId, botToken);
    return Response.json({ success: true, data: { token } }, { headers });
  } catch {
    return failure2(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u06A9\u0627\u0646\u0641\u06CC\u06AF \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
}
__name(onRequestPost13, "onRequestPost");
async function onRequestGet11(context) {
  const db = context.env.DB;
  const botToken = context.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!db) return failure2(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  if (!botToken) return failure2(503, "TELEGRAM_NOT_CONFIGURED", "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const params = new URL(context.request.url).searchParams;
  const orderId = params.get("orderId")?.trim() ?? "";
  const token = params.get("token") ?? "";
  if (!orderId || orderId.length > 128 || !token) return failure2(400, "INVALID_REQUEST", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
  const telegramId = await verifyStaticIpDownloadToken(token, orderId, botToken);
  if (!telegramId) return failure2(401, "DOWNLOAD_TOKEN_INVALID", "\u0644\u06CC\u0646\u06A9 \u062F\u0627\u0646\u0644\u0648\u062F \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A \u06CC\u0627 \u0645\u0646\u0642\u0636\u06CC \u0634\u062F\u0647 \u0627\u0633\u062A.");
  try {
    const note = await findOwnedConfig(db, orderId, `usr_tg_${telegramId}`);
    if (!note) return failure2(404, "CONFIG_NOT_FOUND", "\u06A9\u0627\u0646\u0641\u06CC\u06AF \u062A\u062D\u0648\u06CC\u0644\u200C\u0634\u062F\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
    return new Response(note, { headers: {
      ...headers,
      "content-type": "application/x-openvpn-profile",
      "content-disposition": 'attachment; filename="varnet-config.ovpn"'
    } });
  } catch {
    return failure2(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u06A9\u0627\u0646\u0641\u06CC\u06AF \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
}
__name(onRequestGet11, "onRequestGet");

// api/static-ip/nodes.ts
var RESPONSE_HEADERS3 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function jsonResponse3(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS3 });
}
__name(jsonResponse3, "jsonResponse");
function failure3(status, code, message) {
  return jsonResponse3({ success: false, code, message }, status);
}
__name(failure3, "failure");
function toNode(row) {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    country: row.country,
    countryCode: row.country_code,
    protocol: row.protocol,
    price: Number(row.price),
    currency: "IRT",
    durationDays: Number(row.duration_days),
    dataCapGb: Number(row.data_cap_gb),
    availability: row.availability,
    enabled: Number(row.is_enabled) === 1,
    sortOrder: Number(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(toNode, "toNode");
async function onRequestGet12(context) {
  const db = context.env.DB;
  if (!db) return failure3(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0646\u0648\u062F\u0647\u0627 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  let rows;
  try {
    const result = await db.prepare(
      `SELECT id, name, ip, country, country_code, protocol, price, currency,
                duration_days, data_cap_gb, availability, is_enabled, sort_order,
                created_at, updated_at
         FROM static_ip_nodes
         WHERE is_enabled = 1
         ORDER BY sort_order ASC, created_at ASC`
    ).all();
    rows = result.results ?? [];
  } catch {
    return failure3(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u0646\u0648\u062F\u0647\u0627\u06CC \u0622\u06CC\u200C\u067E\u06CC \u062B\u0627\u0628\u062A \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  return jsonResponse3({
    success: true,
    data: rows.map(toNode),
    meta: { count: rows.length }
  });
}
__name(onRequestGet12, "onRequestGet");

// api/static-ip/plans.ts
var RESPONSE_HEADERS4 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function jsonResponse4(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS4 });
}
__name(jsonResponse4, "jsonResponse");
function failure4(status, code, message) {
  return jsonResponse4({ success: false, code, message }, status);
}
__name(failure4, "failure");
function toPlan(row) {
  return {
    id: row.id,
    nodeId: row.node_id,
    name: row.name,
    dataCapGb: Number(row.data_cap_gb),
    durationDays: Number(row.duration_days),
    price: Number(row.price),
    currency: "IRT",
    enabled: Number(row.is_enabled) === 1,
    sortOrder: Number(row.sort_order),
    nodeName: row.node_name,
    country: row.country,
    countryCode: row.country_code,
    protocol: row.protocol,
    availability: row.availability,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(toPlan, "toPlan");
async function onRequestGet13(context) {
  const db = context.env.DB;
  if (!db) return failure4(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u067E\u0644\u0646\u200C\u0647\u0627 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  let rows;
  try {
    const result = await db.prepare(
      `SELECT p.id, p.node_id, p.name, p.data_cap_gb, p.duration_days, p.price,
                p.currency, p.is_enabled, p.sort_order, p.created_at, p.updated_at,
                n.name AS node_name, n.country, n.country_code, n.protocol, n.availability
         FROM static_ip_plans p
         JOIN static_ip_nodes n ON n.id = p.node_id
         WHERE p.is_enabled = 1 AND n.is_enabled = 1
         ORDER BY p.sort_order ASC, p.created_at ASC`
    ).all();
    rows = result.results ?? [];
  } catch {
    return failure4(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u067E\u0644\u0646\u200C\u0647\u0627\u06CC \u0622\u06CC\u200C\u067E\u06CC \u062B\u0627\u0628\u062A \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  return jsonResponse4({
    success: true,
    data: rows.map(toPlan),
    meta: { count: rows.length }
  });
}
__name(onRequestGet13, "onRequestGet");

// api/static-ip/resend.ts
function failure5(status, code, message) {
  return Response.json({ success: false, code, message }, { status, headers: { "cache-control": "no-store" } });
}
__name(failure5, "failure");
async function onRequestPost14(context) {
  const auth = await authenticateUser(context.request, context.env);
  if (!auth.ok) return failure5(auth.status, auth.code, auth.message);
  const db = context.env.DB;
  if (!db) return failure5(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  let body;
  try {
    body = await context.request.json();
  } catch {
    return failure5(400, "INVALID_BODY", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
  }
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  if (!orderId || orderId.length > 128) return failure5(400, "INVALID_ORDER", "\u0634\u0646\u0627\u0633\u0647 \u0633\u0641\u0627\u0631\u0634 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
  let note;
  try {
    note = await findOwnedConfig(db, orderId, userIdFor(auth.user));
  } catch {
    return failure5(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u06A9\u0627\u0646\u0641\u06CC\u06AF \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  if (!note) return failure5(404, "CONFIG_NOT_FOUND", "\u06A9\u0627\u0646\u0641\u06CC\u06AF \u062A\u062D\u0648\u06CC\u0644\u200C\u0634\u062F\u0647 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F.");
  const result = await sendVpnDocument(context.env.TELEGRAM_BOT_TOKEN, auth.user.id, note);
  if (!result.sent) return failure5(502, result.code, result.message);
  return Response.json({ success: true, message: "\u0641\u0627\u06CC\u0644 \u0628\u0647 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0634\u0645\u0627 \u0627\u0631\u0633\u0627\u0644 \u0634\u062F." }, { headers: { "cache-control": "no-store" } });
}
__name(onRequestPost14, "onRequestPost");

// api/static-ip/services.ts
var SERVICE_LIMIT = 50;
var RESPONSE_HEADERS5 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function jsonResponse5(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS5 });
}
__name(jsonResponse5, "jsonResponse");
function failure6(status, code, message) {
  return jsonResponse5({ success: false, code, message }, status);
}
__name(failure6, "failure");
async function onRequestGet14(context) {
  const auth = await authenticateUser(context.request, context.env);
  if (!auth.ok) return failure6(auth.status, auth.code, auth.message);
  const db = context.env.DB;
  if (!db) return failure6(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  let rows;
  try {
    const result = await db.prepare(
      `SELECT id, product_title, total, currency, status, delivery_note, created_at
         FROM orders
         WHERE user_id = ? AND kind = 'vpn'
           AND status IN ('pending', 'paid', 'completed')
         ORDER BY created_at DESC
         LIMIT ?`
    ).bind(userIdFor(auth.user), SERVICE_LIMIT).all();
    rows = result.results ?? [];
  } catch {
    return failure6(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627\u06CC \u0641\u0639\u0627\u0644 \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  return jsonResponse5({
    success: true,
    data: rows.map((row) => ({
      id: row.id,
      orderId: row.id,
      planName: row.product_title,
      status: row.status,
      deliveryNote: row.delivery_note,
      amount: Number(row.total),
      currency: "IRT",
      purchasedAt: row.created_at,
      completedAt: row.created_at
    })),
    meta: { count: rows.length, limit: SERVICE_LIMIT }
  });
}
__name(onRequestGet14, "onRequestGet");

// api/wallet/receipt.ts
var MIN_AMOUNT = 1e4;
var MAX_AMOUNT = 1e7;
var MAX_BODY_BYTES3 = 4096;
var RESPONSE_HEADERS6 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function jsonResponse6(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS6 });
}
__name(jsonResponse6, "jsonResponse");
function failure7(status, code, message) {
  return jsonResponse6({ success: false, code, message }, status);
}
__name(failure7, "failure");
async function authenticate(request, env) {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const initData = request.headers.get("X-Telegram-Init-Data")?.trim();
  if (initData) {
    if (!botToken) {
      return { ok: false, status: 500, code: "SERVER_NOT_CONFIGURED", message: "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A." };
    }
    const user = await verifyInitData(initData, botToken);
    if (!user) {
      return {
        ok: false,
        status: 401,
        code: "TELEGRAM_AUTH_INVALID",
        message: "\u0646\u0634\u0633\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
      };
    }
    return { ok: true, user };
  }
  const demoTelegramId = Number(env.PURCHASE_DEMO_TELEGRAM_ID);
  if (Number.isInteger(demoTelegramId) && demoTelegramId > 0) {
    return { ok: true, user: { id: demoTelegramId, first_name: "\u06A9\u0627\u0631\u0628\u0631 \u0622\u0632\u0645\u0627\u06CC\u0634\u06CC" } };
  }
  return {
    ok: false,
    status: 401,
    code: "TELEGRAM_AUTH_REQUIRED",
    message: "\u0628\u0631\u0627\u06CC \u062B\u0628\u062A \u0641\u06CC\u0634 \u0648\u0627\u0631\u06CC\u0632 \u0628\u0627\u06CC\u062F \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u0627\u0632 \u062F\u0627\u062E\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
  };
}
__name(authenticate, "authenticate");
function userIdFor2(user) {
  return `usr_tg_${user.id}`;
}
__name(userIdFor2, "userIdFor");
async function onRequestPost15(context) {
  try {
    const auth = await authenticate(context.request, context.env);
    if (!auth.ok) return failure7(auth.status, auth.code, auth.message);
    const db = context.env.DB;
    if (!db) return failure7(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
    let raw;
    try {
      raw = await context.request.text();
    } catch {
      return failure7(400, "INVALID_BODY", "\u0628\u062F\u0646\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0627\u0628\u0644 \u062E\u0648\u0627\u0646\u062F\u0646 \u0646\u0628\u0648\u062F.");
    }
    if (raw.length > MAX_BODY_BYTES3) return failure7(413, "INVALID_BODY", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0632\u0631\u06AF \u0627\u0633\u062A.");
    let body;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return failure7(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
      }
      body = parsed;
    } catch {
      return failure7(400, "INVALID_BODY", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    const amount = typeof body.amount === "number" ? body.amount : Number.NaN;
    if (!Number.isInteger(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return failure7(400, "INVALID_AMOUNT", "\u0645\u0628\u0644\u063A \u0648\u0627\u0631\u06CC\u0632 \u062E\u0627\u0631\u062C \u0627\u0632 \u0645\u062D\u062F\u0648\u062F\u0647 \u0645\u062C\u0627\u0632 \u0627\u0633\u062A.");
    }
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    if (reference.length < 4 || reference.length > 64) {
      return failure7(400, "INVALID_REFERENCE", "\u0634\u0645\u0627\u0631\u0647 \u067E\u06CC\u06AF\u06CC\u0631\u06CC \u0648\u0627\u0631\u06CC\u0632 \u0631\u0627 \u06A9\u0627\u0645\u0644 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
    }
    const userId = userIdFor2(auth.user);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const receiptId = `rcp_${crypto.randomUUID()}`;
    try {
      await db.prepare(
        `INSERT INTO payment_receipts
             (id, user_id, telegram_id, purpose, order_id, amount, currency, reference, status, created_at)
           VALUES (?, ?, ?, 'wallet_topup', NULL, ?, 'IRT', ?, 'PENDING', ?)`
      ).bind(receiptId, userId, auth.user.id, amount, reference, now).run();
    } catch {
      return failure7(503, "DB_UNAVAILABLE", "\u062B\u0628\u062A \u0641\u06CC\u0634 \u0648\u0627\u0631\u06CC\u0632 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
    }
    return jsonResponse6({
      success: true,
      message: "\u0641\u06CC\u0634 \u0648\u0627\u0631\u06CC\u0632 \u062B\u0628\u062A \u0634\u062F \u0648 \u067E\u0633 \u0627\u0632 \u062A\u0627\u06CC\u06CC\u062F \u0627\u062F\u0645\u06CC\u0646 \u0628\u0647 \u0645\u0648\u062C\u0648\u062F\u06CC \u0634\u0645\u0627 \u0627\u0636\u0627\u0641\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F.",
      data: { receiptId, amount, status: "PENDING", createdAt: now }
    });
  } catch (cause) {
    return jsonResponse6(
      {
        success: false,
        code: "RECEIPT_FAILED",
        message: cause instanceof Error && cause.message ? cause.message : "\u062B\u0628\u062A \u0641\u06CC\u0634 \u0648\u0627\u0631\u06CC\u0632 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F."
      },
      500
    );
  }
}
__name(onRequestPost15, "onRequestPost");

// api/bank.ts
var RESPONSE_HEADERS7 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
async function onRequestGet15(context) {
  const db = context.env.DB;
  if (!db) {
    return new Response(
      JSON.stringify({ success: false, code: "DB_NOT_CONFIGURED", message: "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u062F\u0631 \u0633\u0631\u0648\u0631 \u0622\u0645\u0627\u062F\u0647 \u0646\u06CC\u0633\u062A." }),
      { status: 503, headers: RESPONSE_HEADERS7 }
    );
  }
  try {
    const result = await db.prepare(
      `SELECT key, value, updated_at FROM settings
         WHERE key IN ('bank_card_number', 'bank_account_holder', 'bank_name')`
    ).all();
    const values = new Map((result.results ?? []).map((row) => [row.key, row]));
    const card = values.get("bank_card_number");
    const holder = values.get("bank_account_holder");
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          cardNumber: card?.value ?? "",
          accountHolder: holder?.value ?? "",
          bankName: values.get("bank_name")?.value || void 0,
          updatedAt: card?.updated_at ?? holder?.updated_at ?? null
        }
      }),
      { headers: RESPONSE_HEADERS7 }
    );
  } catch {
    return new Response(
      JSON.stringify({ success: false, code: "DB_UNAVAILABLE", message: "\u062E\u0648\u0627\u0646\u062F\u0646 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0627\u0631\u062A \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F." }),
      { status: 503, headers: RESPONSE_HEADERS7 }
    );
  }
}
__name(onRequestGet15, "onRequestGet");

// api/orders.ts
var ORDER_LIMIT2 = 100;
var RESPONSE_HEADERS8 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function jsonResponse7(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS8 });
}
__name(jsonResponse7, "jsonResponse");
function failure8(status, code, message) {
  return jsonResponse7({ success: false, code, message }, status);
}
__name(failure8, "failure");
async function authenticate2(request, env) {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const initData = request.headers.get("X-Telegram-Init-Data")?.trim();
  if (initData) {
    if (!botToken) {
      return {
        ok: false,
        status: 500,
        code: "SERVER_NOT_CONFIGURED",
        message: "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A."
      };
    }
    const user = await verifyInitData(initData, botToken);
    if (!user) {
      return {
        ok: false,
        status: 401,
        code: "TELEGRAM_AUTH_INVALID",
        message: "\u0646\u0634\u0633\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
      };
    }
    return { ok: true, user };
  }
  const demoTelegramId = Number(env.PURCHASE_DEMO_TELEGRAM_ID);
  if (Number.isInteger(demoTelegramId) && demoTelegramId > 0) {
    return { ok: true, user: { id: demoTelegramId, first_name: "\u06A9\u0627\u0631\u0628\u0631 \u0622\u0632\u0645\u0627\u06CC\u0634\u06CC" } };
  }
  return {
    ok: false,
    status: 401,
    code: "TELEGRAM_AUTH_REQUIRED",
    message: "\u0628\u0631\u0627\u06CC \u062F\u06CC\u062F\u0646 \u0633\u0641\u0627\u0631\u0634\u200C\u0647\u0627 \u0628\u0627\u06CC\u062F \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u0627\u0632 \u062F\u0627\u062E\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
  };
}
__name(authenticate2, "authenticate");
function userIdFor3(user) {
  return `usr_tg_${user.id}`;
}
__name(userIdFor3, "userIdFor");
function toOrder(row) {
  return {
    id: row.id,
    userId: row.user_id,
    items: [
      {
        productId: row.product_id,
        title: row.product_title,
        kind: row.kind === "vpn" ? "vpn" : "account",
        quantity: Number(row.quantity ?? 1),
        unitPrice: Number(row.total)
      }
    ],
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    total: Number(row.total),
    currency: "IRT",
    status: row.status,
    kind: row.kind === "vpn" ? "vpn" : "account",
    paymentMethod: row.payment_method === "card" ? "card" : "wallet",
    deliveryNote: row.delivery_note ?? void 0,
    createdAt: row.created_at,
    updatedAt: row.created_at
  };
}
__name(toOrder, "toOrder");
async function onRequestGet16(context) {
  const auth = await authenticate2(context.request, context.env);
  if (!auth.ok) return failure8(auth.status, auth.code, auth.message);
  const db = context.env.DB;
  if (!db) return failure8(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0633\u0641\u0627\u0631\u0634\u200C\u0647\u0627 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  let rows;
  try {
    const result = await db.prepare(
      `SELECT id, user_id, product_id, product_title, kind, quantity, subtotal, discount,
                total, currency, status, payment_method, delivery_note, created_at
         FROM orders
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
    ).bind(userIdFor3(auth.user), ORDER_LIMIT2).all();
    rows = result.results ?? [];
  } catch {
    return failure8(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u0633\u0641\u0627\u0631\u0634\u200C\u0647\u0627 \u0627\u0632 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F.");
  }
  return jsonResponse7({
    success: true,
    data: rows.map(toOrder),
    meta: { count: rows.length, limit: ORDER_LIMIT2 }
  });
}
__name(onRequestGet16, "onRequestGet");

// api/products.ts
var ProductsError = class extends Error {
  static {
    __name(this, "ProductsError");
  }
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "ProductsError";
    this.code = code;
  }
};
var RESPONSE_HEADERS9 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function jsonResponse8(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS9 });
}
__name(jsonResponse8, "jsonResponse");
function describeCause2(value, depth = 0) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    const record = value;
    const name = typeof record.name === "string" ? record.name : void 0;
    const message = typeof record.message === "string" ? record.message : void 0;
    if (name || message) {
      const nested = depth < 3 ? describeCause2(record.cause, depth + 1) : void 0;
      return {
        ...name ? { name } : {},
        ...message ? { message } : {},
        ...nested !== void 0 ? { cause: nested } : {}
      };
    }
    if (depth >= 3) return String(value);
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return String(value);
}
__name(describeCause2, "describeCause");
function failureResponse(error) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : String(error));
  return jsonResponse8(
    {
      success: false,
      code: error instanceof ProductsError ? error.code : "PRODUCTS_UNEXPECTED",
      message: err.message,
      error: { name: err.name, message: err.message, cause: describeCause2(err.cause) ?? null }
    },
    500
  );
}
__name(failureResponse, "failureResponse");
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
__name(finiteNumber, "finiteNumber");
function parseFeatures(raw) {
  if (!raw) return void 0;
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return void 0;
    const items = value.filter((item) => typeof item === "string" && item.trim() !== "");
    return items.length > 0 ? items : void 0;
  } catch {
    return void 0;
  }
}
__name(parseFeatures, "parseFeatures");
function toProduct(row) {
  return {
    id: row.id,
    title: row.title,
    providerTitle: row.provider_title ?? row.title,
    subtitle: row.subtitle ?? void 0,
    category: row.custom_category ?? row.category ?? "other",
    customCategory: row.custom_category ?? void 0,
    faDescription: row.fa_description ?? void 0,
    price: finiteNumber(row.price) ?? 0,
    oldPrice: finiteNumber(row.old_price),
    providerPrice: finiteNumber(row.provider_price),
    providerOldPrice: finiteNumber(row.provider_old_price),
    providerCurrency: row.provider_currency ?? void 0,
    currency: "IRT",
    stock: Math.max(0, Math.trunc(finiteNumber(row.stock) ?? 0)),
    rating: finiteNumber(row.rating),
    reviewCount: finiteNumber(row.review_count),
    badge: row.badge ?? void 0,
    deliveryTime: row.delivery_time ?? void 0,
    description: row.fa_description ?? row.description ?? void 0,
    providerDescription: row.provider_description ?? void 0,
    features: parseFeatures(row.features),
    gradient: row.gradient ?? void 0,
    emoji: row.emoji ?? void 0,
    brandKey: row.brand_key ?? void 0,
    logoUrl: row.logo_url ?? void 0,
    ...row.override_product_id !== null ? { isFeatured: row.is_featured === 1, isBestseller: row.is_bestseller === 1 } : {}
  };
}
__name(toProduct, "toProduct");
async function onRequestGet17(context) {
  try {
    const db = context.env.DB;
    if (!db) {
      throw new ProductsError(
        "PRODUCTS_DB_NOT_CONFIGURED",
        "\u0627\u062A\u0635\u0627\u0644 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 D1 (binding \xABDB\xBB) \u062F\u0631 \u0645\u062D\u06CC\u0637 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A."
      );
    }
    let rows;
    try {
      const result = await db.prepare(`SELECT products.id, products.title, products.provider_title, products.subtitle,
                         products.category, products.price, products.old_price,
                         products.provider_price, products.provider_old_price, products.provider_currency,
                         products.stock, products.rating, products.review_count, products.badge,
                         products.delivery_time, products.description, products.provider_description,
                         products.features, products.gradient, products.emoji, products.brand_key,
                         products.logo_url, product_overrides.product_id AS override_product_id,
                         product_overrides.fa_description, product_overrides.custom_category,
                         product_overrides.is_featured, product_overrides.is_bestseller
                  FROM products
                  LEFT JOIN product_overrides ON product_overrides.product_id = products.id
                  WHERE COALESCE(product_overrides.is_deleted, 0) = 0
                  ORDER BY products.title COLLATE NOCASE`).all();
      if (result.success === false || !Array.isArray(result.results)) {
        throw new Error("D1 did not return catalogue results");
      }
      rows = result.results;
    } catch (cause) {
      throw new ProductsError("PRODUCTS_READ_FAILED", "\u062E\u0648\u0627\u0646\u062F\u0646 \u06A9\u0627\u062A\u0627\u0644\u0648\u06AF \u0627\u0632 D1 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.", {
        cause
      });
    }
    let usdtRate;
    try {
      const rateRow = await db.prepare("SELECT value FROM sync_meta WHERE key = 'usdt_rate'").bind().first();
      const parsed = Number(rateRow?.value);
      if (Number.isFinite(parsed) && parsed > 0) usdtRate = parsed;
    } catch {
    }
    let marginTiers;
    try {
      const tiersRow = await db.prepare("SELECT value FROM settings WHERE key = 'margin_tiers'").bind().first();
      const parsed = tiersRow?.value ? JSON.parse(tiersRow.value) : void 0;
      if (Array.isArray(parsed)) {
        marginTiers = parsed;
      }
    } catch {
    }
    const products = rows.map(toProduct);
    return jsonResponse8({
      success: true,
      data: products,
      meta: {
        count: products.length,
        fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        ...usdtRate !== void 0 ? { usdtRate } : {},
        ...marginTiers ? { marginTiers } : {}
      }
    });
  } catch (error) {
    return failureResponse(error);
  }
}
__name(onRequestGet17, "onRequestGet");

// api/purchase.ts
var MAX_BODY_BYTES4 = 8192;
var MAX_AMOUNT_TOMAN = 1e8;
var INIT_DATA_MAX_AGE_SECONDS2 = 24 * 60 * 60;
var RESPONSE_HEADERS10 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function jsonResponse9(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS10 });
}
__name(jsonResponse9, "jsonResponse");
function failure9(status, code, message, data) {
  return jsonResponse9({ success: false, code, message, data }, status);
}
__name(failure9, "failure");
function toHex3(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(toHex3, "toHex");
function timingSafeEqual2(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual2, "timingSafeEqual");
async function hmacSha2562(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}
__name(hmacSha2562, "hmacSha256");
async function verifyInitData2(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = await hmacSha2562(new TextEncoder().encode("WebAppData"), botToken);
  const signature = toHex3(await hmacSha2562(secretKey, dataCheckString));
  if (!timingSafeEqual2(signature, hash.toLowerCase())) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  if (Date.now() / 1e3 - authDate > INIT_DATA_MAX_AGE_SECONDS2) return null;
  const rawUser = params.get("user");
  if (!rawUser) return null;
  try {
    const parsed = JSON.parse(rawUser);
    const id = Number(parsed.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      id,
      username: typeof parsed.username === "string" ? parsed.username : void 0,
      first_name: typeof parsed.first_name === "string" ? parsed.first_name : void 0,
      last_name: typeof parsed.last_name === "string" ? parsed.last_name : void 0
    };
  } catch {
    return null;
  }
}
__name(verifyInitData2, "verifyInitData");
async function authenticate3(request, env) {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const initData = request.headers.get("X-Telegram-Init-Data")?.trim();
  if (initData) {
    if (!botToken) {
      return {
        ok: false,
        status: 500,
        code: "SERVER_NOT_CONFIGURED",
        message: "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A."
      };
    }
    const user = await verifyInitData2(initData, botToken);
    if (!user) {
      return {
        ok: false,
        status: 401,
        code: "TELEGRAM_AUTH_INVALID",
        message: "\u0646\u0634\u0633\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
      };
    }
    return { ok: true, user };
  }
  const demoTelegramId = Number(env.PURCHASE_DEMO_TELEGRAM_ID);
  if (Number.isInteger(demoTelegramId) && demoTelegramId > 0) {
    return { ok: true, user: { id: demoTelegramId, first_name: "\u06A9\u0627\u0631\u0628\u0631 \u0622\u0632\u0645\u0627\u06CC\u0634\u06CC" } };
  }
  return {
    ok: false,
    status: 401,
    code: "TELEGRAM_AUTH_REQUIRED",
    message: "\u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0628\u0627\u06CC\u062F \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u0627\u0632 \u062F\u0627\u062E\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
  };
}
__name(authenticate3, "authenticate");
function userIdFor4(user) {
  return `usr_tg_${user.id}`;
}
__name(userIdFor4, "userIdFor");
async function ensureUser(db, user, now) {
  await db.prepare(
    `INSERT INTO users (id, telegram_id, username, first_name, last_name, balance, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 'IRT', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         updated_at = excluded.updated_at`
  ).bind(
    userIdFor4(user),
    user.id,
    user.username ?? null,
    user.first_name ?? null,
    user.last_name ?? null,
    now,
    now
  ).run();
}
__name(ensureUser, "ensureUser");
async function readBalance(db, userId) {
  const row = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(userId).first();
  return row ? Number(row.balance) : null;
}
__name(readBalance, "readBalance");
function readString(value, maxLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}
__name(readString, "readString");
function readInteger(value) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
__name(readInteger, "readInteger");
function validateBody2(body) {
  const productId = readString(body.productId, 128);
  const title = readString(body.title, 200);
  if (!productId || !title) return { ok: false, message: "\u0634\u0646\u0627\u0633\u0647 \u06CC\u0627 \u0639\u0646\u0648\u0627\u0646 \u0645\u062D\u0635\u0648\u0644 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." };
  const kind = body.kind === "vpn" ? "vpn" : "account";
  const subtotal = readInteger(body.subtotal);
  const discount = readInteger(body.discount ?? 0);
  const total = readInteger(body.total);
  if (subtotal === null || discount === null || total === null) {
    return { ok: false, message: "\u0645\u0628\u0644\u063A \u0633\u0641\u0627\u0631\u0634 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." };
  }
  if (subtotal < 0 || subtotal > MAX_AMOUNT_TOMAN) {
    return { ok: false, message: "\u0645\u0628\u0644\u063A \u0645\u062D\u0635\u0648\u0644 \u062E\u0627\u0631\u062C \u0627\u0632 \u0645\u062D\u062F\u0648\u062F\u0647 \u0645\u062C\u0627\u0632 \u0627\u0633\u062A." };
  }
  if (discount < 0 || discount > subtotal) {
    return { ok: false, message: "\u0645\u0628\u0644\u063A \u062A\u062E\u0641\u06CC\u0641 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." };
  }
  if (total <= 0 || total !== subtotal - discount) {
    return { ok: false, message: "\u0645\u0628\u0644\u063A \u0642\u0627\u0628\u0644 \u067E\u0631\u062F\u0627\u062E\u062A \u0628\u0627 \u062C\u0645\u0639 \u0633\u0641\u0627\u0631\u0634 \u0647\u0645\u200C\u062E\u0648\u0627\u0646\u06CC \u0646\u062F\u0627\u0631\u062F." };
  }
  if (body.currency !== void 0 && body.currency !== "IRT") {
    return { ok: false, message: "\u0648\u0627\u062D\u062F \u067E\u0648\u0644 \u0633\u0641\u0627\u0631\u0634 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0646\u0645\u06CC\u200C\u0634\u0648\u062F." };
  }
  let couponCode;
  if (body.couponCode !== void 0) {
    const parsedCoupon = readString(body.couponCode, 64);
    if (!parsedCoupon) return { ok: false, message: "\u06A9\u062F \u062A\u062E\u0641\u06CC\u0641 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A." };
    couponCode = parsedCoupon;
  }
  const paymentMethod = body.paymentMethod === "card" ? "card" : "wallet";
  let receiptReference;
  if (paymentMethod === "card") {
    const reference = readString(body.receiptReference, 64);
    if (!reference || reference.length < 4) {
      return { ok: false, message: "\u0634\u0645\u0627\u0631\u0647 \u067E\u06CC\u06AF\u06CC\u0631\u06CC \u0648\u0627\u0631\u06CC\u0632 \u0631\u0627 \u06A9\u0627\u0645\u0644 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F." };
    }
    receiptReference = reference;
  }
  return {
    ok: true,
    value: { productId, title, kind, subtotal, discount, total, couponCode, paymentMethod, receiptReference }
  };
}
__name(validateBody2, "validateBody");
async function onRequestPost16(context) {
  const { env } = context;
  const auth = await authenticate3(context.request, env);
  if (!auth.ok) return failure9(auth.status, auth.code, auth.message);
  const db = env.DB;
  if (!db) {
    return failure9(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0633\u0641\u0627\u0631\u0634\u200C\u0647\u0627 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  }
  let rawBody;
  try {
    rawBody = await context.request.text();
  } catch {
    return failure9(400, "PURCHASE_BAD_REQUEST", "\u0628\u062F\u0646\u0647 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u0642\u0627\u0628\u0644 \u062E\u0648\u0627\u0646\u062F\u0646 \u0646\u0628\u0648\u062F.");
  }
  if (rawBody.length > MAX_BODY_BYTES4) {
    return failure9(413, "PURCHASE_BAD_REQUEST", "\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062E\u0631\u06CC\u062F \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0632\u0631\u06AF \u0627\u0633\u062A.");
  }
  let body;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return failure9(400, "PURCHASE_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062E\u0631\u06CC\u062F \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
    }
    body = parsed;
  } catch {
    return failure9(400, "PURCHASE_BAD_REQUEST", "\u0633\u0627\u062E\u062A\u0627\u0631 \u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062E\u0631\u06CC\u062F \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A.");
  }
  const validated = validateBody2(body);
  if (!validated.ok) return failure9(400, "PURCHASE_VALIDATION", validated.message);
  const {
    productId,
    title,
    kind,
    subtotal,
    discount,
    total,
    couponCode,
    paymentMethod,
    receiptReference
  } = validated.value;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const userId = userIdFor4(auth.user);
  try {
    await ensureUser(db, auth.user, now);
  } catch {
    return failure9(503, "DB_UNAVAILABLE", "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
  }
  const balance = await readBalance(db, userId);
  if (balance === null) {
    return failure9(500, "USER_NOT_FOUND", "\u062D\u0633\u0627\u0628 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
  }
  if (paymentMethod === "card") {
    const orderId2 = `ord_${crypto.randomUUID()}`;
    const receiptId = `rcp_${crypto.randomUUID()}`;
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO orders
               (id, user_id, product_id, product_title, kind, quantity, subtotal, discount, total, currency, coupon_code, status, payment_method, created_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'IRT', ?, 'pending', 'card', ?)`
        ).bind(
          orderId2,
          userId,
          productId,
          title,
          kind,
          subtotal,
          discount,
          total,
          couponCode ?? null,
          now
        ),
        db.prepare(
          `INSERT INTO payment_receipts
               (id, user_id, telegram_id, purpose, order_id, amount, currency, reference, status, created_at)
             VALUES (?, ?, ?, 'product_purchase', ?, ?, 'IRT', ?, 'PENDING', ?)`
        ).bind(receiptId, userId, auth.user.id, orderId2, total, receiptReference ?? "", now)
      ]);
    } catch {
      return failure9(500, "ORDER_WRITE_FAILED", "\u062B\u0628\u062A \u0633\u0641\u0627\u0631\u0634 \u06A9\u0627\u0631\u062A \u0628\u0647 \u06A9\u0627\u0631\u062A \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
    }
    return jsonResponse9({
      success: true,
      message: "\u0633\u0641\u0627\u0631\u0634 \u062B\u0628\u062A \u0634\u062F \u0648 \u067E\u0633 \u0627\u0632 \u062A\u0627\u06CC\u06CC\u062F \u0641\u06CC\u0634 \u0648\u0627\u0631\u06CC\u0632 \u062A\u0648\u0633\u0637 \u0627\u062F\u0645\u06CC\u0646 \u062A\u06A9\u0645\u06CC\u0644 \u0645\u06CC\u200C\u0634\u0648\u062F.",
      data: {
        order: {
          id: orderId2,
          status: "pending",
          kind,
          productId,
          title,
          subtotal,
          discount,
          total,
          currency: "IRT",
          paymentMethod: "card",
          createdAt: now
        },
        balance,
        receipt: { id: receiptId, status: "PENDING" }
      }
    });
  }
  if (balance < total) {
    return failure9(402, "INSUFFICIENT_FUNDS", "\u0645\u0648\u062C\u0648\u062F\u06CC \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u062E\u0631\u06CC\u062F \u06A9\u0627\u0641\u06CC \u0646\u06CC\u0633\u062A.", {
      balance,
      required: total
    });
  }
  let debitChanges = 0;
  try {
    const debit = await db.prepare("UPDATE users SET balance = balance - ?, updated_at = ? WHERE id = ? AND balance >= ?").bind(total, now, userId, total).run();
    debitChanges = debit.meta?.changes ?? 0;
  } catch {
    return failure9(503, "DB_UNAVAILABLE", "\u062B\u0628\u062A \u067E\u0631\u062F\u0627\u062E\u062A \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
  }
  if (debitChanges !== 1) {
    const latest = await readBalance(db, userId);
    return failure9(402, "INSUFFICIENT_FUNDS", "\u0645\u0648\u062C\u0648\u062F\u06CC \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u062E\u0631\u06CC\u062F \u06A9\u0627\u0641\u06CC \u0646\u06CC\u0633\u062A.", {
      balance: latest ?? 0,
      required: total
    });
  }
  const remainingBalance = balance - total;
  const orderId = `ord_${crypto.randomUUID()}`;
  const transactionId = `txn_${crypto.randomUUID()}`;
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO orders
             (id, user_id, product_id, product_title, kind, quantity, subtotal, discount, total, currency, coupon_code, status, payment_method, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'IRT', ?, 'paid', 'wallet', ?)`
      ).bind(
        orderId,
        userId,
        productId,
        title,
        kind,
        subtotal,
        discount,
        total,
        couponCode ?? null,
        now
      ),
      db.prepare(
        `INSERT INTO wallet_transactions
             (id, user_id, type, amount, balance_after, currency, description, reference, created_at)
           VALUES (?, ?, 'purchase', ?, ?, 'IRT', ?, ?, ?)`
      ).bind(
        transactionId,
        userId,
        -total,
        remainingBalance,
        `\u062E\u0631\u06CC\u062F ${title}`,
        orderId,
        now
      )
    ]);
  } catch {
    try {
      await db.prepare("UPDATE users SET balance = balance + ?, updated_at = ? WHERE id = ?").bind(total, (/* @__PURE__ */ new Date()).toISOString(), userId).run();
    } catch {
    }
    return failure9(500, "ORDER_WRITE_FAILED", "\u062B\u0628\u062A \u0633\u0641\u0627\u0631\u0634 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F\u061B \u0645\u0628\u0644\u063A \u0628\u0647 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0628\u0627\u0632\u06AF\u0631\u062F\u0627\u0646\u062F\u0647 \u0634\u062F.");
  }
  return jsonResponse9({
    success: true,
    data: {
      order: {
        id: orderId,
        status: "paid",
        kind,
        productId,
        title,
        subtotal,
        discount,
        total,
        currency: "IRT",
        createdAt: now
      },
      balance: remainingBalance
    }
  });
}
__name(onRequestPost16, "onRequestPost");

// ../src/lib/format.ts
var PERSIAN_DIGITS = ["\u06F0", "\u06F1", "\u06F2", "\u06F3", "\u06F4", "\u06F5", "\u06F6", "\u06F7", "\u06F8", "\u06F9"];
function toPersianDigits(value) {
  return value.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}
__name(toPersianDigits, "toPersianDigits");

// ../src/lib/providerMapper.ts
var PERSIAN_RE = /[\u0600-\u06FF]/;
var LATIN_RE = /[A-Za-z]/;
var CATEGORY_TITLES = {
  streaming: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0627\u0633\u062A\u0631\u06CC\u0645",
  ai: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC",
  gaming: "\u0645\u062D\u0635\u0648\u0644 \u06AF\u06CC\u0645\u06CC\u0646\u06AF",
  design: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0637\u0631\u0627\u062D\u06CC",
  os: "\u0633\u06CC\u0633\u062A\u0645\u200C\u0639\u0627\u0645\u0644",
  office: "\u0627\u0628\u0632\u0627\u0631 \u0628\u0647\u0631\u0647\u200C\u0648\u0631\u06CC",
  security: "\u0627\u0628\u0632\u0627\u0631 \u0627\u0645\u0646\u06CC\u062A\u06CC",
  dev: "\u0627\u0628\u0632\u0627\u0631 \u062A\u0648\u0633\u0639\u0647",
  social: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0634\u0628\u06A9\u0647 \u0627\u062C\u062A\u0645\u0627\u0639\u06CC",
  other: "\u0645\u062D\u0635\u0648\u0644 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644"
};
var CATEGORY_DESCRIPTIONS = {
  streaming: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0627\u0633\u062A\u0631\u06CC\u0645 \u0628\u0627 \u06A9\u06CC\u0641\u06CC\u062A \u0628\u0627\u0644\u0627\u061B \u062A\u0645\u0627\u0634\u0627\u06CC \u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644 \u0631\u0648\u06CC \u062A\u0644\u0648\u06CC\u0632\u06CC\u0648\u0646\u060C \u0645\u0648\u0628\u0627\u06CC\u0644 \u0648 \u0645\u0631\u0648\u0631\u06AF\u0631 \u0628\u0627 \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0631\u0648\u06CC \u062D\u0633\u0627\u0628 \u0634\u062E\u0635\u06CC.",
  ai: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u067E\u0631\u0645\u06CC\u0648\u0645 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0628\u0631\u0627\u06CC \u062A\u0648\u0644\u06CC\u062F \u0645\u062A\u0646 \u0648 \u06A9\u062F\u060C \u062A\u062D\u0644\u06CC\u0644 \u062F\u0627\u062F\u0647 \u0648 \u0627\u0641\u0632\u0627\u06CC\u0634 \u0633\u0631\u0639\u062A \u06A9\u0627\u0631\u061B \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0633\u0631\u06CC\u0639 \u0631\u0648\u06CC \u062D\u0633\u0627\u0628 \u0634\u062E\u0635\u06CC.",
  gaming: "\u0645\u062D\u0635\u0648\u0644 \u06AF\u06CC\u0645\u06CC\u0646\u06AF \u0627\u0648\u0631\u062C\u06CC\u0646\u0627\u0644 \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0628\u0627\u0632\u06CC\u060C \u0627\u0639\u062A\u0628\u0627\u0631 \u062F\u0631\u0648\u0646\u200C\u0628\u0627\u0632\u06CC \u0648 \u0627\u0634\u062A\u0631\u0627\u06A9 \u0622\u0646\u0644\u0627\u06CC\u0646\u061B \u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC \u0628\u0627 \u0636\u0645\u0627\u0646\u062A \u0627\u0635\u0627\u0644\u062A.",
  design: "\u0646\u0631\u0645\u200C\u0627\u0641\u0632\u0627\u0631 \u0642\u062F\u0631\u062A\u0645\u0646\u062F \u0637\u0631\u0627\u062D\u06CC \u0648 \u06AF\u0631\u0627\u0641\u06CC\u06A9 \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u062A\u0635\u0648\u06CC\u0631\u060C \u0648\u06CC\u062F\u06CC\u0648 \u0648 \u0631\u0627\u0628\u0637 \u06A9\u0627\u0631\u0628\u0631\u06CC\u061B \u062F\u0633\u062A\u0631\u0633\u06CC \u06A9\u0627\u0645\u0644 \u0628\u0627 \u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC.",
  os: "\u0633\u06CC\u0633\u062A\u0645\u200C\u0639\u0627\u0645\u0644 \u0648 \u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u0645\u062F\u06CC\u0631\u06CC\u062A \u062F\u0633\u062A\u06AF\u0627\u0647 \u0628\u0627 \u062A\u062D\u0648\u06CC\u0644 \u0633\u0631\u06CC\u0639.",
  office: "\u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u0627\u062F\u0627\u0631\u06CC \u0648 \u0628\u0647\u0631\u0647\u200C\u0648\u0631\u06CC \u0628\u0631\u0627\u06CC \u06A9\u0627\u0631 \u0648 \u06CC\u0627\u062F\u06AF\u06CC\u0631\u06CC.",
  security: "\u0627\u0628\u0632\u0627\u0631 \u0627\u0645\u0646\u06CC\u062A \u0648 \u062D\u0641\u0638 \u062D\u0631\u06CC\u0645 \u062E\u0635\u0648\u0635\u06CC \u0628\u0627 \u062A\u062D\u0648\u06CC\u0644 \u0633\u0631\u06CC\u0639.",
  dev: "\u0627\u0628\u0632\u0627\u0631 \u062A\u0648\u0633\u0639\u0647 \u0646\u0631\u0645\u200C\u0627\u0641\u0632\u0627\u0631 \u0648 \u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0631\u0648\u0698\u0647.",
  social: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0634\u0628\u06A9\u0647 \u0627\u062C\u062A\u0645\u0627\u0639\u06CC \u0628\u0627 \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0641\u0648\u0631\u06CC \u0631\u0648\u06CC \u062D\u0633\u0627\u0628 \u0634\u062E\u0635\u06CC \u0648 \u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u0648\u06CC\u0698\u0647 \u0645\u0627\u0646\u0646\u062F \u062A\u06CC\u06A9 \u0622\u0628\u06CC \u0648 \u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u062D\u0631\u0641\u0647\u200C\u0627\u06CC.",
  other: "\u0645\u062D\u0635\u0648\u0644 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0627\u0648\u0631\u062C\u06CC\u0646\u0627\u0644 \u0628\u0627 \u0644\u0627\u06CC\u0633\u0646\u0633 \u0645\u0639\u062A\u0628\u0631\u060C \u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC \u0648 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644\u061B \u0645\u0646\u0627\u0633\u0628 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0634\u062E\u0635\u06CC \u0648 \u062D\u0631\u0641\u0647\u200C\u0627\u06CC."
};
var CATEGORY_SUBTITLES = {
  streaming: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0631\u0633\u0645\u06CC \u0628\u0627 \u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC",
  ai: "\u062F\u0633\u062A\u0631\u0633\u06CC \u062D\u0631\u0641\u0647\u200C\u0627\u06CC \u0628\u0647 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC",
  gaming: "\u0645\u062D\u0635\u0648\u0644 \u0627\u0648\u0631\u062C\u06CC\u0646\u0627\u0644 \u0628\u0627 \u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC",
  design: "\u0627\u0628\u0632\u0627\u0631 \u062D\u0631\u0641\u0647\u200C\u0627\u06CC \u0637\u0631\u0627\u062D\u06CC \u0648 \u062E\u0644\u0627\u0642\u06CC\u062A",
  os: "\u0633\u06CC\u0633\u062A\u0645\u200C\u0639\u0627\u0645\u0644 \u0648 \u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u0631\u0627\u06CC\u0627\u0646\u0647",
  office: "\u0627\u0628\u0632\u0627\u0631 \u0627\u062F\u0627\u0631\u06CC \u0648 \u0628\u0647\u0631\u0647\u200C\u0648\u0631\u06CC",
  security: "\u0627\u0645\u0646\u06CC\u062A \u0648 \u062D\u0631\u06CC\u0645 \u062E\u0635\u0648\u0635\u06CC",
  dev: "\u0627\u0628\u0632\u0627\u0631 \u062A\u0648\u0633\u0639\u0647 \u0648 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0646\u0648\u06CC\u0633\u06CC",
  social: "\u0627\u0631\u062A\u0642\u0627\u06CC \u062D\u0633\u0627\u0628 \u0628\u0627 \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0641\u0648\u0631\u06CC",
  other: "\u0645\u062D\u0635\u0648\u0644 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0628\u0627 \u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC"
};
var CATEGORY_FEATURES = {
  streaming: ["\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC", "\u06A9\u06CC\u0641\u06CC\u062A \u0628\u0627\u0644\u0627", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644"],
  ai: ["\u062F\u0633\u062A\u0631\u0633\u06CC \u0627\u0648\u0644\u0648\u06CC\u062A\u200C\u062F\u0627\u0631", "\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0633\u0631\u06CC\u0639", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644"],
  gaming: ["\u06A9\u062F \u0627\u0648\u0631\u062C\u06CC\u0646\u0627\u0644", "\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC", "\u0636\u0645\u0627\u0646\u062A \u0627\u0635\u0627\u0644\u062A"],
  design: ["\u062F\u0633\u062A\u0631\u0633\u06CC \u06A9\u0627\u0645\u0644", "\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0641\u0646\u06CC"],
  os: ["\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644"],
  office: ["\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644"],
  security: ["\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644"],
  dev: ["\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644"],
  social: ["\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0641\u0648\u0631\u06CC", "\u062D\u0633\u0627\u0628 \u0634\u062E\u0635\u06CC", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644"],
  other: ["\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC", "\u0636\u0645\u0627\u0646\u062A \u0627\u0635\u0627\u0644\u062A", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644"]
};
var CATEGORY_STYLE = {
  streaming: { emoji: "\u{1F3AC}", gradient: "from-rose-500 via-red-500 to-orange-500" },
  ai: { emoji: "\u{1F916}", gradient: "from-violet-500 via-purple-500 to-indigo-500" },
  gaming: { emoji: "\u{1F3AE}", gradient: "from-sky-500 via-blue-500 to-indigo-500" },
  design: { emoji: "\u{1F3A8}", gradient: "from-fuchsia-500 via-pink-500 to-rose-500" },
  os: { emoji: "\u{1F4BB}", gradient: "from-sky-500 to-blue-700" },
  office: { emoji: "\u{1F4CB}", gradient: "from-orange-500 to-amber-600" },
  security: { emoji: "\u{1F6E1}\uFE0F", gradient: "from-emerald-500 to-teal-700" },
  dev: { emoji: "\u2328\uFE0F", gradient: "from-indigo-500 to-slate-700" },
  social: { emoji: "\u2708\uFE0F", gradient: "from-sky-400 via-cyan-400 to-blue-500" },
  other: { emoji: "\u{1F4BB}", gradient: "from-brand-500 to-brand-700" }
};
var GENERIC_GRADIENTS = new Set(Object.values(CATEGORY_STYLE).map((style) => style.gradient));
var VPN_BLURB = "VPN \u067E\u0631\u0633\u0631\u0639\u062A \u0628\u0627 \u0631\u0645\u0632\u0646\u06AF\u0627\u0631\u06CC \u0642\u0648\u06CC \u0628\u0631\u0627\u06CC \u062A\u063A\u06CC\u06CC\u0631 \u0645\u0648\u0642\u0639\u06CC\u062A \u0648 \u062D\u0641\u0638 \u062D\u0631\u06CC\u0645 \u062E\u0635\u0648\u0635\u06CC.";
var ANTIVIRUS_BLURB = "\u0622\u0646\u062A\u06CC\u200C\u0648\u06CC\u0631\u0648\u0633 \u0648 \u0627\u0645\u0646\u06CC\u062A \u062F\u0633\u062A\u06AF\u0627\u0647 \u062F\u0631 \u0628\u0631\u0627\u0628\u0631 \u0648\u06CC\u0631\u0648\u0633\u060C \u0628\u0627\u062C\u200C\u06AF\u06CC\u0631 \u0648 \u062A\u0647\u062F\u06CC\u062F\u0647\u0627\u06CC \u0622\u0646\u0644\u0627\u06CC\u0646.";
var PASSWORD_BLURB = "\u0645\u062F\u06CC\u0631\u06CC\u062A \u0627\u0645\u0646 \u0631\u0645\u0632\u0647\u0627\u06CC \u0639\u0628\u0648\u0631 \u0648 \u062F\u0627\u062F\u0647\u200C\u0647\u0627\u06CC \u062D\u0633\u0627\u0633 \u0631\u0648\u06CC \u0647\u0645\u0647 \u062F\u0633\u062A\u06AF\u0627\u0647\u200C\u0647\u0627.";
var BRAND_LOGO_DOMAINS = {
  "netflix": "netflix.com",
  "spotify": "spotify.com",
  "youtube premium": "youtube.com",
  "youtube music": "youtube.com",
  "youtube": "youtube.com",
  "disney plus": "disneyplus.com",
  "amazon prime": "amazon.com",
  "hbo max": "hbomax.com",
  "paramount plus": "paramountplus.com",
  "crunchyroll": "crunchyroll.com",
  "apple tv plus": "apple.com",
  "apple music": "apple.com",
  "apple": "apple.com",
  "hulu": "hulu.com",
  "peacock": "peacocktv.com",
  "starz": "starz.com",
  "showtime": "showtime.com",
  "tidal": "tidal.com",
  "deezer": "deezer.com",
  "audible": "audible.com",
  "kindle unlimited": "amazon.com",
  "shahid": "shahid.mbc.net",
  "filimo": "filimo.com",
  "namava": "namava.ir",
  "osn": "osn.com",
  "starzplay": "starzplay.com",
  "tod tv": "tod.tv",
  "anghami": "anghami.com",
  "rakuten viki": "viki.com",
  "mubi": "mubi.com",
  "discovery plus": "discoveryplus.com",
  "britbox": "britbox.com",
  "zee5": "zee5.com",
  "iqiyi": "iqiyi.com",
  "wetv": "wetv.vip",
  "tubi": "tubitv.com",
  "vix": "vix.com",
  "twitch": "twitch.tv",
  "kick": "kick.com",
  "chatgpt": "openai.com",
  "claude": "anthropic.com",
  "gemini": "gemini.google.com",
  "grok": "x.ai",
  "microsoft copilot": "microsoft.com",
  "github copilot": "github.com",
  "perplexity": "perplexity.ai",
  "deepseek": "deepseek.com",
  "poe": "poe.com",
  "character.ai": "character.ai",
  "jasper": "jasper.ai",
  "copy.ai": "copy.ai",
  "writesonic": "writesonic.com",
  "grammarly": "grammarly.com",
  "quillbot": "quillbot.com",
  "midjourney": "midjourney.com",
  "leonardo ai": "leonardo.ai",
  "ideogram": "ideogram.ai",
  "stable diffusion": "stability.ai",
  "kling ai": "klingai.com",
  "luma ai": "lumalabs.ai",
  "pika": "pika.art",
  "heygen": "heygen.com",
  "synthesia": "synthesia.io",
  "suno": "suno.com",
  "udio": "udio.com",
  "elevenlabs": "elevenlabs.io",
  "runway": "runwayml.com",
  "descript": "descript.com",
  "cursor": "cursor.com",
  "replit": "replit.com",
  "adobe creative cloud": "adobe.com",
  "adobe photoshop": "adobe.com",
  "adobe illustrator": "adobe.com",
  "adobe premiere": "adobe.com",
  "adobe after effects": "adobe.com",
  "adobe lightroom": "adobe.com",
  "adobe acrobat": "adobe.com",
  "adobe indesign": "adobe.com",
  "canva": "canva.com",
  "figma": "figma.com",
  "capcut": "capcut.com",
  "framer": "framer.com",
  "procreate": "procreate.art",
  "affinity designer": "affinity.serif.com",
  "sketch": "sketch.com",
  "envato elements": "envato.com",
  "freepik": "freepik.com",
  "shutterstock": "shutterstock.com",
  "blender": "blender.org",
  "autocad": "autodesk.com",
  "steam wallet": "steampowered.com",
  "steam": "steampowered.com",
  "playstation plus": "playstation.com",
  "playstation": "playstation.com",
  "xbox game pass": "xbox.com",
  "nintendo switch online": "nintendo.com",
  "discord nitro": "discord.com",
  "roblox": "roblox.com",
  "minecraft": "minecraft.net",
  "fortnite": "epicgames.com",
  "valorant": "riotgames.com",
  "riot points": "riotgames.com",
  "league of legends": "leagueoflegends.com",
  "genshin impact": "hoyoverse.com",
  "epic games": "epicgames.com",
  "ea play": "ea.com",
  "ubisoft plus": "ubisoft.com",
  "battle.net": "blizzard.com",
  "razer gold": "razer.com",
  "pubg mobile": "pubg.com",
  "free fire": "garena.com",
  "mobile legends": "mobilelegends.com",
  "clash of clans": "supercell.com",
  "brawl stars": "supercell.com",
  "telegram premium": "telegram.org",
  "instagram": "instagram.com",
  "tiktok": "tiktok.com",
  "facebook": "facebook.com",
  "snapchat": "snapchat.com",
  "x premium": "x.com",
  "linkedin premium": "linkedin.com",
  "linkedin learning": "linkedin.com",
  "reddit": "reddit.com",
  "pinterest": "pinterest.com",
  "threads": "threads.net",
  "whatsapp business": "whatsapp.com",
  "tinder gold": "tinder.com",
  "bumble premium": "bumble.com",
  "bluesky": "bsky.app",
  "duolingo": "duolingo.com",
  "coursera": "coursera.org",
  "udemy": "udemy.com",
  "edx": "edx.org",
  "skillshare": "skillshare.com",
  "masterclass": "masterclass.com",
  "babbel": "babbel.com",
  "rosetta stone": "rosettastone.com",
  "chegg": "chegg.com",
  "turnitin": "turnitin.com",
  "brilliant": "brilliant.org",
  "datacamp": "datacamp.com",
  "udacity": "udacity.com",
  "microsoft 365": "microsoft.com",
  "office 2021": "microsoft.com",
  "office 2019": "microsoft.com",
  "windows 11": "microsoft.com",
  "windows 10": "microsoft.com",
  "windows server": "microsoft.com",
  "windows": "microsoft.com",
  "visual studio": "visualstudio.com",
  "notion": "notion.so",
  "evernote": "evernote.com",
  "todoist": "todoist.com",
  "trello": "trello.com",
  "asana": "asana.com",
  "monday.com": "monday.com",
  "clickup": "clickup.com",
  "airtable": "airtable.com",
  "miro": "miro.com",
  "slack": "slack.com",
  "zoom": "zoom.us",
  "google workspace": "google.com",
  "google one": "google.com",
  "google play": "google.com",
  "dropbox": "dropbox.com",
  "onedrive": "microsoft.com",
  "icloud": "apple.com",
  "mega.nz": "mega.nz",
  "pcloud": "pcloud.com",
  "box": "box.com",
  "apple gift card": "apple.com",
  "amazon gift card": "amazon.com",
  "ebay gift card": "ebay.com",
  "visa gift card": "visa.com",
  "scribd": "scribd.com",
  "storytel": "storytel.com",
  "blinkist": "blinkist.com",
  "marvel unlimited": "marvel.com",
  "dc universe infinite": "dc.com",
  "comixology": "amazon.com",
  "tradingview": "tradingview.com",
  "binance": "binance.com",
  "bybit": "bybit.com",
  "coinbase": "coinbase.com",
  "kucoin": "kucoin.com",
  "okx": "okx.com",
  "mexc": "mexc.com",
  "bitget": "bitget.com",
  "kraken": "kraken.com",
  "etoro": "etoro.com",
  "quotex": "quotex.io",
  "pocket option": "pocketoption.com",
  "iq option": "iqoption.com",
  "metatrader": "metatrader5.com",
  "ftmo": "ftmo.com",
  "fundednext": "fundednext.com",
  "nordvpn": "nordvpn.com",
  "expressvpn": "expressvpn.com",
  "surfshark": "surfshark.com",
  "proton vpn": "proton.me",
  "cyberghost": "cyberghostvpn.com",
  "ipvanish": "ipvanish.com",
  "private internet access": "privateinternetaccess.com",
  "mullvad": "mullvad.net",
  "windscribe": "windscribe.com",
  "vyprvpn": "vyprvpn.com",
  "tunnelbear": "tunnelbear.com",
  "hide.me": "hide.me",
  "purevpn": "purevpn.com",
  "astrill": "astrill.com",
  "kaspersky": "kaspersky.com",
  "norton 360": "norton.com",
  "mcafee": "mcafee.com",
  "bitdefender": "bitdefender.com",
  "eset": "eset.com",
  "avast": "avast.com",
  "avg": "avg.com",
  "avira": "avira.com",
  "malwarebytes": "malwarebytes.com",
  "trend micro": "trendmicro.com",
  "totalav": "totalav.com",
  "sophos": "sophos.com",
  "panda security": "pandasecurity.com",
  "f-secure": "f-secure.com",
  "1password": "1password.com",
  "bitwarden": "bitwarden.com",
  "dashlane": "dashlane.com",
  "nordpass": "nordpass.com",
  "lastpass": "lastpass.com",
  "keeper security": "keepersecurity.com",
  "adguard": "adguard.com"
};
function brandLogoUrl(domain) {
  const clean = domain?.trim();
  return clean ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(clean)}` : void 0;
}
__name(brandLogoUrl, "brandLogoUrl");
var BRAND_RULES = [
  /* ------------------------------- Streaming ------------------------------ */
  {
    aliases: ["netflix", "\u0646\u062A\u0641\u0644\u06CC\u06A9\u0633"],
    key: "netflix",
    name: "\u0646\u062A\u0641\u0644\u06CC\u06A9\u0633",
    category: "streaming",
    emoji: "\u{1F3AC}",
    gradient: "from-red-600 via-rose-600 to-neutral-900",
    blurb: "\u067E\u062E\u0634 \u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644 \u0628\u0627 \u06A9\u06CC\u0641\u06CC\u062A \u06F4K \u0631\u0648\u06CC \u062A\u0644\u0648\u06CC\u0632\u06CC\u0648\u0646\u060C \u0645\u0648\u0628\u0627\u06CC\u0644 \u0648 \u0645\u0631\u0648\u0631\u06AF\u0631."
  },
  {
    aliases: ["spotify", "\u0627\u0633\u067E\u0627\u062A\u06CC\u0641\u0627\u06CC"],
    key: "spotify",
    name: "\u0627\u0633\u067E\u0627\u062A\u06CC\u0641\u0627\u06CC",
    tier: "\u067E\u0631\u06CC\u0645\u06CC\u0648\u0645",
    category: "streaming",
    emoji: "\u{1F3A7}",
    gradient: "from-emerald-500 via-green-500 to-neutral-900",
    blurb: "\u067E\u062E\u0634 \u0645\u0648\u0633\u06CC\u0642\u06CC \u0648 \u067E\u0627\u062F\u06A9\u0633\u062A \u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A \u0647\u0645\u0631\u0627\u0647 \u0628\u0627 \u062F\u0627\u0646\u0644\u0648\u062F \u0622\u0641\u0644\u0627\u06CC\u0646."
  },
  {
    aliases: ["youtube premium", "youtube red", "\u06CC\u0648\u062A\u06CC\u0648\u0628 \u067E\u0631\u06CC\u0645\u06CC\u0648\u0645"],
    key: "youtube-premium",
    name: "\u06CC\u0648\u062A\u06CC\u0648\u0628 \u067E\u0631\u06CC\u0645\u06CC\u0648\u0645",
    category: "streaming",
    emoji: "\u25B6\uFE0F",
    gradient: "from-red-500 via-red-600 to-rose-700",
    blurb: "\u062A\u0645\u0627\u0634\u0627\u06CC \u06CC\u0648\u062A\u06CC\u0648\u0628 \u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A \u0628\u0627 \u067E\u062E\u0634 \u067E\u0633\u200C\u0632\u0645\u06CC\u0646\u0647 \u0648 \u062F\u0627\u0646\u0644\u0648\u062F \u0622\u0641\u0644\u0627\u06CC\u0646."
  },
  {
    aliases: ["youtube music", "\u06CC\u0648\u062A\u06CC\u0648\u0628 \u0645\u0648\u0632\u06CC\u06A9"],
    name: "\u06CC\u0648\u062A\u06CC\u0648\u0628 \u0645\u0648\u0632\u06CC\u06A9",
    category: "streaming",
    emoji: "\u{1F3B5}",
    blurb: "\u067E\u062E\u0634 \u0645\u0648\u0633\u06CC\u0642\u06CC \u0648 \u067E\u0627\u062F\u06A9\u0633\u062A \u06CC\u0648\u062A\u06CC\u0648\u0628 \u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A."
  },
  {
    aliases: ["youtube", "\u06CC\u0648\u062A\u06CC\u0648\u0628"],
    name: "\u06CC\u0648\u062A\u06CC\u0648\u0628",
    category: "streaming",
    emoji: "\u25B6\uFE0F",
    blurb: "\u062A\u0645\u0627\u0634\u0627\u06CC \u0648\u06CC\u062F\u06CC\u0648\u0647\u0627\u06CC \u06CC\u0648\u062A\u06CC\u0648\u0628 \u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A \u0628\u0627 \u067E\u062E\u0634 \u067E\u0633\u200C\u0632\u0645\u06CC\u0646\u0647."
  },
  {
    aliases: ["disney plus", "disney+", "disney", "\u062F\u06CC\u0632\u0646\u06CC \u067E\u0644\u0627\u0633"],
    key: "disney-plus",
    name: "\u062F\u06CC\u0632\u0646\u06CC \u067E\u0644\u0627\u0633",
    category: "streaming",
    emoji: "\u{1F3F0}",
    gradient: "from-blue-600 via-indigo-600 to-purple-700",
    blurb: "\u0641\u06CC\u0644\u0645\u200C\u0647\u0627 \u0648 \u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627\u06CC \u062F\u06CC\u0632\u0646\u06CC\u060C \u067E\u06CC\u06A9\u0633\u0627\u0631\u060C \u0645\u0627\u0631\u0648\u0644 \u0648 \u0627\u0633\u062A\u0627\u0631 \u0648\u0627\u0631\u0632."
  },
  {
    aliases: ["amazon prime", "prime video", "amazon", "\u0622\u0645\u0627\u0632\u0648\u0646 \u067E\u0631\u0627\u06CC\u0645", "\u0622\u0645\u0627\u0632\u0648\u0646"],
    name: "\u0622\u0645\u0627\u0632\u0648\u0646 \u067E\u0631\u0627\u06CC\u0645",
    category: "streaming",
    emoji: "\u{1F4E6}",
    gradient: "from-sky-500 via-blue-600 to-cyan-500",
    blurb: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0622\u0645\u0627\u0632\u0648\u0646 \u0634\u0627\u0645\u0644 \u067E\u0631\u0627\u06CC\u0645 \u0648\u06CC\u062F\u06CC\u0648\u060C \u0645\u0648\u0632\u06CC\u06A9 \u0648 \u0627\u0631\u0633\u0627\u0644 \u0631\u0627\u06CC\u06AF\u0627\u0646."
  },
  {
    aliases: ["hbo max", "hbo", "\u0627\u0686\u200C\u0628\u06CC\u200C\u0627\u0648 \u0645\u06A9\u0633", "\u0627\u0686 \u0628\u06CC \u0627\u0648 \u0645\u06A9\u0633"],
    name: "\u0627\u0686\u200C\u0628\u06CC\u200C\u0627\u0648 \u0645\u06A9\u0633",
    category: "streaming",
    emoji: "\u{1F3AD}",
    gradient: "from-purple-600 via-violet-700 to-neutral-900",
    blurb: "\u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627 \u0648 \u0641\u06CC\u0644\u0645\u200C\u0647\u0627\u06CC \u0627\u0686\u200C\u0628\u06CC\u200C\u0627\u0648 \u0648 \u0628\u0631\u0627\u062F\u0631\u0627\u0646 \u0648\u0627\u0631\u0646\u0631."
  },
  {
    aliases: ["paramount plus", "paramount+", "paramount", "\u067E\u0627\u0631\u0627\u0645\u0648\u0646\u062A \u067E\u0644\u0627\u0633"],
    name: "\u067E\u0627\u0631\u0627\u0645\u0648\u0646\u062A \u067E\u0644\u0627\u0633",
    category: "streaming",
    emoji: "\u26F0\uFE0F",
    blurb: "\u0641\u06CC\u0644\u0645\u200C\u0647\u0627 \u0648 \u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627\u06CC \u067E\u0627\u0631\u0627\u0645\u0648\u0646\u062A\u060C \u0633\u06CC\u200C\u0628\u06CC\u200C\u0627\u0633 \u0648 \u0634\u0648\u062A\u0627\u06CC\u0645."
  },
  {
    aliases: ["crunchyroll"],
    name: "\u06A9\u0631\u0627\u0646\u0686\u06CC\u200C\u0631\u0648\u0644",
    category: "streaming",
    emoji: "\u{1F365}",
    gradient: "from-orange-500 via-amber-500 to-rose-500",
    blurb: "\u062A\u0645\u0627\u0634\u0627\u06CC \u0627\u0646\u06CC\u0645\u0647 \u0648 \u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627\u06CC \u0698\u0627\u067E\u0646\u06CC \u0628\u0627 \u0632\u06CC\u0631\u0646\u0648\u06CC\u0633."
  },
  {
    aliases: ["apple tv plus", "apple tv+", "apple tv", "\u0627\u067E\u0644 \u062A\u06CC\u200C\u0648\u06CC"],
    name: "\u0627\u067E\u0644 \u062A\u06CC\u200C\u0648\u06CC",
    category: "streaming",
    emoji: "\u{1F34E}",
    blurb: "\u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627 \u0648 \u0641\u06CC\u0644\u0645\u200C\u0647\u0627\u06CC \u0627\u062E\u062A\u0635\u0627\u0635\u06CC \u0627\u067E\u0644 \u062A\u06CC\u200C\u0648\u06CC \u067E\u0644\u0627\u0633."
  },
  {
    aliases: ["apple music", "\u0627\u067E\u0644 \u0645\u0648\u0632\u06CC\u06A9"],
    name: "\u0627\u067E\u0644 \u0645\u0648\u0632\u06CC\u06A9",
    category: "streaming",
    emoji: "\u{1F3B5}",
    blurb: "\u0627\u0633\u062A\u0631\u06CC\u0645 \u0645\u0648\u0633\u06CC\u0642\u06CC \u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A \u0628\u0627 \u06A9\u06CC\u0641\u06CC\u062A Lossless \u0648 Spatial Audio."
  },
  {
    aliases: ["apple", "\u0627\u067E\u0644"],
    name: "\u0627\u067E\u0644",
    category: "other",
    emoji: "\u{1F34E}",
    blurb: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0633\u0631\u0648\u06CC\u0633\u200C\u0647\u0627 \u0648 \u0645\u062D\u0635\u0648\u0644\u0627\u062A \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0627\u067E\u0644."
  },
  {
    aliases: ["hulu", "\u0647\u0648\u0644\u0648"],
    name: "\u0647\u0648\u0644\u0648",
    category: "streaming",
    emoji: "\u{1F49A}",
    blurb: "\u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627 \u0648 \u0641\u06CC\u0644\u0645\u200C\u0647\u0627\u06CC \u0647\u0648\u0644\u0648\u060C \u0627\u0641\u200C\u0627\u06CC\u06A9\u0633 \u0648 \u0634\u0628\u06A9\u0647\u200C\u0647\u0627\u06CC \u0622\u0645\u0631\u06CC\u06A9\u0627\u06CC\u06CC."
  },
  {
    aliases: ["peacock"],
    name: "\u067E\u06CC\u06A9\u0627\u06A9",
    category: "streaming",
    emoji: "\u{1F99A}",
    blurb: "\u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627 \u0648 \u0641\u06CC\u0644\u0645\u200C\u0647\u0627\u06CC \u067E\u06CC\u06A9\u0627\u06A9 \u0648 \u0627\u0646\u200C\u0628\u06CC\u200C\u0633\u06CC."
  },
  {
    aliases: ["starz"],
    name: "\u0627\u0633\u062A\u0627\u0631\u0632",
    category: "streaming",
    emoji: "\u2B50",
    blurb: "\u0641\u06CC\u0644\u0645\u200C\u0647\u0627 \u0648 \u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627\u06CC \u0627\u0648\u0631\u062C\u06CC\u0646\u0627\u0644 \u0627\u0633\u062A\u0627\u0631\u0632."
  },
  {
    aliases: ["showtime"],
    name: "\u0634\u0648\u062A\u0627\u06CC\u0645",
    category: "streaming",
    emoji: "\u{1F3AA}",
    blurb: "\u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627 \u0648 \u0641\u06CC\u0644\u0645\u200C\u0647\u0627\u06CC \u0634\u0648\u062A\u0627\u06CC\u0645."
  },
  {
    aliases: ["tidal"],
    name: "\u062A\u0627\u06CC\u062F\u0627\u0644",
    category: "streaming",
    emoji: "\u{1F30A}",
    blurb: "\u0627\u0633\u062A\u0631\u06CC\u0645 \u0645\u0648\u0633\u06CC\u0642\u06CC \u0628\u0627 \u06A9\u06CC\u0641\u06CC\u062A \u0628\u0627\u0644\u0627 \u0648 \u0635\u062F\u0627\u06CC \u0628\u062F\u0648\u0646 \u0627\u0641\u062A."
  },
  {
    aliases: ["deezer"],
    name: "\u062F\u06CC\u0632\u0631",
    category: "streaming",
    emoji: "\u{1F3B6}",
    blurb: "\u067E\u062E\u0634 \u0645\u0648\u0633\u06CC\u0642\u06CC \u0648 \u067E\u0627\u062F\u06A9\u0633\u062A \u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A."
  },
  {
    aliases: ["audible"],
    name: "\u0622\u062F\u06CC\u0628\u0644",
    category: "streaming",
    emoji: "\u{1F399}\uFE0F",
    blurb: "\u06A9\u062A\u0627\u0628 \u0635\u0648\u062A\u06CC \u0648 \u067E\u0627\u062F\u06A9\u0633\u062A \u0628\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u0627\u0645\u062D\u062F\u0648\u062F."
  },
  {
    aliases: ["kindle unlimited", "kindle"],
    name: "\u06A9\u06CC\u0646\u062F\u0644",
    category: "streaming",
    emoji: "\u{1F4D6}",
    blurb: "\u06A9\u062A\u0627\u0628\u062E\u0627\u0646\u0647 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0628\u0627 \u0645\u06CC\u0644\u06CC\u0648\u0646\u200C\u0647\u0627 \u06A9\u062A\u0627\u0628 \u0648 \u0645\u062C\u0644\u0647."
  },
  {
    aliases: ["shahid"],
    name: "\u0634\u0627\u0647\u062F",
    category: "streaming",
    emoji: "\u{1F4FD}\uFE0F",
    blurb: "\u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644 \u0639\u0631\u0628\u06CC \u0648 \u0646\u0645\u0627\u06CC\u0634 \u062E\u0627\u0646\u06AF\u06CC."
  },
  {
    aliases: ["filimo"],
    name: "\u0641\u06CC\u0644\u06CC\u0645\u0648",
    category: "streaming",
    emoji: "\u{1F37F}",
    blurb: "\u062A\u0645\u0627\u0634\u0627\u06CC \u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644 \u0627\u06CC\u0631\u0627\u0646\u06CC \u0648 \u062E\u0627\u0631\u062C\u06CC."
  },
  {
    aliases: ["namava"],
    name: "\u0646\u0645\u0627\u0648\u0627",
    category: "streaming",
    emoji: "\u{1F3A5}",
    blurb: "\u0633\u0631\u0648\u06CC\u0633 \u0646\u0645\u0627\u06CC\u0634 \u062E\u0627\u0646\u06AF\u06CC \u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644."
  },
  {
    aliases: ["osn"],
    name: "\u0627\u0648\u200C\u0627\u0633\u200C\u0627\u0646",
    category: "streaming",
    emoji: "\u{1F4FA}",
    blurb: "\u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644 \u0647\u0627\u0644\u06CC\u0648\u0648\u062F\u06CC \u0648 \u0639\u0631\u0628\u06CC."
  },
  {
    aliases: ["starzplay"],
    name: "\u0627\u0633\u062A\u0627\u0631\u0632\u067E\u0644\u06CC",
    category: "streaming",
    emoji: "\u{1F31F}",
    blurb: "\u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627 \u0648 \u0641\u06CC\u0644\u0645\u200C\u0647\u0627\u06CC \u0627\u0633\u062A\u0631\u06CC\u0645 \u062E\u0627\u0648\u0631\u0645\u06CC\u0627\u0646\u0647."
  },
  {
    aliases: ["tod tv", "tod"],
    name: "\u062A\u0627\u062F",
    category: "streaming",
    emoji: "\u{1F3DF}\uFE0F",
    blurb: "\u067E\u062E\u0634 \u0632\u0646\u062F\u0647 \u0645\u0633\u0627\u0628\u0642\u0627\u062A \u0648\u0631\u0632\u0634\u06CC \u0648 \u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644."
  },
  {
    aliases: ["anghami"],
    name: "\u0627\u0646\u063A\u0627\u0645\u06CC",
    category: "streaming",
    emoji: "\u{1F3BC}",
    blurb: "\u0627\u0633\u062A\u0631\u06CC\u0645 \u0645\u0648\u0633\u06CC\u0642\u06CC \u0639\u0631\u0628\u06CC \u0648 \u0628\u06CC\u0646\u200C\u0627\u0644\u0645\u0644\u0644\u06CC."
  },
  {
    aliases: ["rakuten viki", "viki"],
    name: "\u0648\u06CC\u06A9\u06CC",
    category: "streaming",
    emoji: "\u{1F30F}",
    blurb: "\u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627\u06CC \u0622\u0633\u06CC\u0627\u06CC\u06CC \u0628\u0627 \u0632\u06CC\u0631\u0646\u0648\u06CC\u0633 \u0686\u0646\u062F\u0632\u0628\u0627\u0646\u0647."
  },
  {
    aliases: ["mubi"],
    name: "\u0645\u0648\u0628\u06CC",
    category: "streaming",
    emoji: "\u{1F39F}\uFE0F",
    blurb: "\u0641\u06CC\u0644\u0645\u200C\u0647\u0627\u06CC \u0647\u0646\u0631\u06CC \u0648 \u062C\u0634\u0646\u0648\u0627\u0631\u0647\u200C\u0627\u06CC \u0645\u0646\u062A\u062E\u0628."
  },
  {
    aliases: ["discovery plus", "discovery+", "discovery"],
    name: "\u062F\u06CC\u0633\u06A9\u0627\u0648\u0631\u06CC \u067E\u0644\u0627\u0633",
    category: "streaming",
    emoji: "\u{1F30D}",
    blurb: "\u0645\u0633\u062A\u0646\u062F\u0647\u0627\u06CC \u0637\u0628\u06CC\u0639\u062A\u060C \u0639\u0644\u0645 \u0648 \u0633\u0628\u06A9 \u0632\u0646\u062F\u06AF\u06CC."
  },
  {
    aliases: ["britbox"],
    name: "\u0628\u0631\u06CC\u062A\u200C\u0628\u0627\u06A9\u0633",
    category: "streaming",
    emoji: "\u{1F1EC}\u{1F1E7}",
    blurb: "\u0633\u0631\u06CC\u0627\u0644\u200C\u0647\u0627\u06CC \u0628\u0631\u06CC\u062A\u0627\u0646\u06CC\u0627\u06CC\u06CC \u0628\u06CC\u200C\u0628\u06CC\u200C\u0633\u06CC \u0648 \u0622\u06CC\u200C\u062A\u06CC\u200C\u0648\u06CC."
  },
  {
    aliases: ["zee5", "zee 5"],
    name: "\u0632\u06CC\u06F5",
    category: "streaming",
    emoji: "\u{1F7E3}",
    blurb: "\u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644 \u0647\u0646\u062F\u06CC \u0648 \u0628\u0648\u0644\u06CC\u0648\u0648\u062F."
  },
  {
    aliases: ["iqiyi"],
    name: "\u0622\u06CC\u200C\u0686\u06CC\u200C\u06CC\u06CC",
    category: "streaming",
    emoji: "\u{1F004}",
    blurb: "\u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644 \u0686\u06CC\u0646\u06CC \u0648 \u0622\u0633\u06CC\u0627\u06CC\u06CC."
  },
  {
    aliases: ["wetv", "we tv"],
    name: "\u0648\u06CC\u200C\u062A\u06CC\u200C\u0648\u06CC",
    category: "streaming",
    emoji: "\u{1F409}",
    blurb: "\u062F\u0631\u0627\u0645\u200C\u0647\u0627 \u0648 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627\u06CC \u0686\u06CC\u0646\u06CC \u0628\u0627 \u0632\u06CC\u0631\u0646\u0648\u06CC\u0633."
  },
  {
    aliases: ["tubi"],
    name: "\u062A\u0648\u0628\u06CC",
    category: "streaming",
    emoji: "\u{1F39E}\uFE0F",
    blurb: "\u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644 \u0631\u0627\u06CC\u06AF\u0627\u0646 \u0628\u0627 \u062A\u0628\u0644\u06CC\u063A\u0627\u062A \u0645\u062D\u062F\u0648\u062F."
  },
  {
    aliases: ["vix"],
    name: "\u0648\u06CC\u06A9\u0633",
    category: "streaming",
    emoji: "\u{1F336}\uFE0F",
    blurb: "\u0641\u06CC\u0644\u0645 \u0648 \u0633\u0631\u06CC\u0627\u0644 \u0627\u0633\u067E\u0627\u0646\u06CC\u0627\u06CC\u06CC\u200C\u0632\u0628\u0627\u0646."
  },
  {
    aliases: ["twitch"],
    name: "\u062A\u0648\u06CC\u06CC\u0686",
    category: "streaming",
    emoji: "\u{1F4E1}",
    gradient: "from-violet-500 via-purple-600 to-indigo-700",
    blurb: "\u067E\u062E\u0634 \u0632\u0646\u062F\u0647 \u0628\u0627\u0632\u06CC \u0648 \u062F\u0646\u0628\u0627\u0644 \u06A9\u0631\u062F\u0646 \u0627\u0633\u062A\u0631\u06CC\u0645\u0631\u0647\u0627."
  },
  {
    aliases: ["kick"],
    name: "\u06A9\u06CC\u06A9",
    category: "streaming",
    emoji: "\u{1F7E9}",
    blurb: "\u067E\u0644\u062A\u0641\u0631\u0645 \u067E\u062E\u0634 \u0632\u0646\u062F\u0647 \u0628\u0627\u0632\u06CC \u0648 \u0633\u0631\u06AF\u0631\u0645\u06CC."
  },
  /* ----------------------------- Artificial AI ---------------------------- */
  {
    aliases: ["chatgpt", "chat gpt", "gpt plus", "openai", "\u0686\u062A\u200C\u062C\u06CC\u200C\u067E\u06CC\u200C\u062A\u06CC", "\u0686\u062A \u062C\u06CC \u067E\u06CC \u062A\u06CC"],
    key: "chatgpt",
    name: "\u0686\u062A\u200C\u062C\u06CC\u200C\u067E\u06CC\u200C\u062A\u06CC",
    tier: "\u067E\u0644\u0627\u0633",
    category: "ai",
    emoji: "\u{1F916}",
    gradient: "from-emerald-400 via-teal-500 to-cyan-600",
    blurb: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u067E\u0631\u0645\u06CC\u0648\u0645 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0628\u0631\u0627\u06CC \u062A\u0648\u0644\u06CC\u062F \u0645\u062A\u0646 \u0648 \u06A9\u062F \u0648 \u067E\u0627\u0633\u062E \u0628\u0647 \u067E\u0631\u0633\u0634\u200C\u0647\u0627."
  },
  {
    aliases: ["claude", "anthropic", "\u06A9\u0644\u0648\u062F"],
    key: "claude",
    name: "\u06A9\u0644\u0648\u062F",
    category: "ai",
    emoji: "\u{1F9E0}",
    gradient: "from-orange-400 via-amber-500 to-rose-500",
    blurb: "\u062F\u0633\u062A\u06CC\u0627\u0631 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0628\u0631\u0627\u06CC \u0646\u0648\u0634\u062A\u0646\u060C \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0646\u0648\u06CC\u0633\u06CC \u0648 \u062A\u062D\u0644\u06CC\u0644 \u0627\u0633\u0646\u0627\u062F \u0637\u0648\u0644\u0627\u0646\u06CC."
  },
  {
    aliases: ["gemini", "google ai", "bard", "\u062C\u0645\u06CC\u0646\u0627\u06CC"],
    name: "\u062C\u0645\u06CC\u0646\u0627\u06CC",
    category: "ai",
    emoji: "\u264A",
    gradient: "from-blue-500 via-indigo-500 to-purple-600",
    blurb: "\u062F\u0633\u062A\u06CC\u0627\u0631 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u06AF\u0648\u06AF\u0644 \u0628\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0645\u062F\u0644\u200C\u0647\u0627\u06CC Gemini."
  },
  {
    aliases: ["grok", "xai", "x.ai", "\u06AF\u0631\u0648\u06A9"],
    name: "\u06AF\u0631\u0648\u06A9",
    category: "ai",
    emoji: "\u{1F680}",
    gradient: "from-neutral-700 via-neutral-800 to-black",
    blurb: "\u062F\u0633\u062A\u06CC\u0627\u0631 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC xAI \u0628\u0627 \u067E\u0627\u0633\u062E\u200C\u0647\u0627\u06CC \u0644\u062D\u0638\u0647\u200C\u0627\u06CC \u0648 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u062F\u0627\u062F\u0647\u200C\u0647\u0627\u06CC \u0627\u06CC\u06A9\u0633."
  },
  {
    aliases: ["microsoft copilot", "copilot"],
    name: "\u06A9\u0648\u067E\u0627\u06CC\u0644\u0648\u062A",
    category: "ai",
    emoji: "\u{1FA84}",
    blurb: "\u062F\u0633\u062A\u06CC\u0627\u0631 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0645\u0627\u06CC\u06A9\u0631\u0648\u0633\u0627\u0641\u062A \u0628\u0631\u0627\u06CC \u0622\u0641\u06CC\u0633 \u0648 \u06A9\u062F\u0646\u0648\u06CC\u0633\u06CC."
  },
  {
    aliases: ["github copilot"],
    name: "\u06AF\u06CC\u062A\u200C\u0647\u0627\u0628 \u06A9\u0648\u067E\u0627\u06CC\u0644\u0648\u062A",
    category: "ai",
    emoji: "\u{1F419}",
    blurb: "\u062A\u06A9\u0645\u06CC\u0644 \u06A9\u062F \u0648 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0646\u0648\u06CC\u0633\u06CC \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062F\u0627\u062E\u0644 \u0627\u062F\u06CC\u062A\u0648\u0631."
  },
  {
    aliases: ["perplexity", "\u067E\u0631\u067E\u0644\u06A9\u0633\u06CC\u062A\u06CC"],
    name: "\u067E\u0631\u067E\u0644\u06A9\u0633\u06CC\u062A\u06CC",
    category: "ai",
    emoji: "\u{1F50E}",
    blurb: "\u0645\u0648\u062A\u0648\u0631 \u062C\u0633\u062A\u062C\u0648\u06CC \u0647\u0648\u0634\u0645\u0646\u062F \u0628\u0627 \u067E\u0627\u0633\u062E\u200C\u0647\u0627\u06CC \u0645\u0633\u062A\u0646\u062F \u0648 \u0645\u0646\u0627\u0628\u0639 \u0645\u0639\u062A\u0628\u0631."
  },
  {
    aliases: ["deepseek", "deep seek", "\u062F\u06CC\u067E\u200C\u0633\u06CC\u06A9", "\u062F\u06CC\u067E \u0633\u06CC\u06A9"],
    name: "\u062F\u06CC\u067E\u200C\u0633\u06CC\u06A9",
    category: "ai",
    emoji: "\u{1F40B}",
    blurb: "\u0645\u062F\u0644 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u067E\u06CC\u0634\u0631\u0641\u062A\u0647 \u0628\u0631\u0627\u06CC \u06A9\u062F\u0646\u0648\u06CC\u0633\u06CC \u0648 \u0627\u0633\u062A\u062F\u0644\u0627\u0644."
  },
  {
    aliases: ["poe"],
    name: "\u067E\u0648",
    category: "ai",
    emoji: "\u{1F5E8}\uFE0F",
    blurb: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0647\u0645\u200C\u0632\u0645\u0627\u0646 \u0628\u0647 \u0686\u0646\u062F \u0645\u062F\u0644 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u062F\u0631 \u06CC\u06A9 \u0628\u0631\u0646\u0627\u0645\u0647."
  },
  {
    aliases: ["character.ai", "character ai"],
    name: "\u06A9\u0627\u0631\u0627\u06A9\u062A\u0631 \u0627\u06CC\u200C\u0622\u06CC",
    category: "ai",
    emoji: "\u{1F465}",
    blurb: "\u0633\u0627\u062E\u062A \u0648 \u06AF\u0641\u062A\u06AF\u0648 \u0628\u0627 \u0634\u062E\u0635\u06CC\u062A\u200C\u0647\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["jasper"],
    name: "\u062C\u0627\u0633\u067E\u0631",
    category: "ai",
    emoji: "\u2728",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u0645\u062D\u062A\u0648\u0627\u06CC \u0628\u0627\u0632\u0627\u0631\u06CC\u0627\u0628\u06CC \u0648 \u062A\u0628\u0644\u06CC\u063A\u0627\u062A\u06CC \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["copy.ai", "copy ai"],
    name: "\u06A9\u0627\u067E\u06CC \u0627\u06CC\u200C\u0622\u06CC",
    category: "ai",
    emoji: "\u{1F4DD}",
    blurb: "\u0646\u0648\u0634\u062A\u0646 \u0645\u062A\u0646 \u062A\u0628\u0644\u06CC\u063A\u0627\u062A\u06CC \u0648 \u0645\u062D\u062A\u0648\u0627\u06CC \u0648\u0628 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["writesonic"],
    name: "\u0631\u0627\u06CC\u062A\u200C\u0633\u0648\u0646\u06CC\u06A9",
    category: "ai",
    emoji: "\u2712\uFE0F",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u0645\u0642\u0627\u0644\u0647 \u0648 \u0645\u062D\u062A\u0648\u0627\u06CC \u0633\u0626\u0648 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["grammarly"],
    name: "\u06AF\u0631\u0627\u0645\u0631\u0644\u06CC",
    category: "ai",
    emoji: "\u270D\uFE0F",
    gradient: "from-emerald-500 via-green-600 to-teal-700",
    blurb: "\u0627\u0635\u0644\u0627\u062D \u06AF\u0631\u0627\u0645\u0631 \u0648 \u0628\u0627\u0632\u0646\u0648\u06CC\u0633\u06CC \u0645\u062A\u0646 \u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["quillbot"],
    name: "\u06A9\u0648\u0626\u06CC\u0644\u200C\u0628\u0627\u062A",
    category: "ai",
    emoji: "\u{1FAB6}",
    blurb: "\u0628\u0627\u0632\u0646\u0648\u06CC\u0633\u06CC\u060C \u062E\u0644\u0627\u0635\u0647\u200C\u0633\u0627\u0632\u06CC \u0648 \u0628\u0631\u0631\u0633\u06CC \u0645\u062A\u0646."
  },
  {
    aliases: ["midjourney", "\u0645\u06CC\u062F\u062C\u0631\u0646\u06CC"],
    name: "\u0645\u06CC\u062F\u062C\u0631\u0646\u06CC",
    category: "ai",
    emoji: "\u{1F3A8}",
    gradient: "from-indigo-500 via-purple-500 to-pink-500",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u062A\u0635\u0648\u06CC\u0631 \u0647\u0646\u0631\u06CC \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0628\u0631\u0627\u06CC \u0637\u0631\u0627\u062D\u0627\u0646 \u0648 \u06A9\u0627\u0646\u0633\u067E\u062A \u0622\u0631\u062A."
  },
  {
    aliases: ["leonardo ai", "leonardo"],
    name: "\u0644\u0626\u0648\u0646\u0627\u0631\u062F\u0648",
    category: "ai",
    emoji: "\u{1F30C}",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u062A\u0635\u0648\u06CC\u0631 \u0648 \u062F\u0627\u0631\u0627\u06CC\u06CC \u0628\u0627\u0632\u06CC \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["ideogram"],
    name: "\u0622\u06CC\u062F\u06CC\u0648\u06AF\u0631\u0627\u0645",
    category: "ai",
    emoji: "\u{1F4A1}",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u062A\u0635\u0648\u06CC\u0631 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC \u0648 \u0645\u062A\u0646 \u062E\u0648\u0627\u0646\u0627."
  },
  {
    aliases: ["stable diffusion", "stability ai"],
    name: "\u0627\u0633\u062A\u06CC\u0628\u0644 \u062F\u06CC\u0641\u06CC\u0648\u0698\u0646",
    category: "ai",
    emoji: "\u{1F300}",
    blurb: "\u0645\u062F\u0644 \u0645\u062A\u0646\u200C\u0628\u0627\u0632 \u062A\u0648\u0644\u06CC\u062F \u062A\u0635\u0648\u06CC\u0631 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["kling ai", "kling"],
    name: "\u06A9\u0644\u06CC\u0646\u06AF",
    category: "ai",
    emoji: "\u{1F3A5}",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u0648\u06CC\u062F\u06CC\u0648 \u0627\u0632 \u0645\u062A\u0646 \u06CC\u0627 \u062A\u0635\u0648\u06CC\u0631 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["luma ai", "luma"],
    name: "\u0644\u0648\u0645\u0627",
    category: "ai",
    emoji: "\u{1F319}",
    blurb: "\u0633\u0627\u062E\u062A \u0648\u06CC\u062F\u06CC\u0648 \u0648 \u0645\u062F\u0644 \u0633\u0647\u200C\u0628\u0639\u062F\u06CC \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["pika"],
    name: "\u067E\u06CC\u06A9\u0627",
    category: "ai",
    emoji: "\u26A1",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u0648\u06CC\u062F\u06CC\u0648\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["heygen", "heygen ai"],
    name: "\u0647\u06CC\u200C\u062C\u0646",
    category: "ai",
    emoji: "\u{1F5E3}\uFE0F",
    blurb: "\u0633\u0627\u062E\u062A \u0648\u06CC\u062F\u06CC\u0648\u06CC \u06AF\u0648\u06CC\u0646\u062F\u0647 \u0645\u062C\u0627\u0632\u06CC \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["synthesia"],
    name: "\u0633\u06CC\u0646\u062A\u0632\u06CC\u0627",
    category: "ai",
    emoji: "\u{1F9D1}\u200D\u{1F3EB}",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u0648\u06CC\u062F\u06CC\u0648\u06CC \u0622\u0645\u0648\u0632\u0634\u06CC \u0628\u0627 \u0622\u0648\u0627\u062A\u0627\u0631 \u0648 \u0635\u062F\u0627\u06CC \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["suno"],
    name: "\u0633\u0648\u0646\u0648",
    category: "ai",
    emoji: "\u{1F3BC}",
    blurb: "\u0633\u0627\u062E\u062A \u0645\u0648\u0633\u06CC\u0642\u06CC \u0648 \u0622\u0647\u0646\u06AF \u0627\u0632 \u0631\u0648\u06CC \u0645\u062A\u0646 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["udio"],
    name: "\u0627\u0648\u062F\u06CC\u0648",
    category: "ai",
    emoji: "\u{1F3B9}",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u0645\u0648\u0633\u06CC\u0642\u06CC \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["elevenlabs", "eleven labs"],
    name: "\u0627\u0644\u0648\u0646\u200C\u0644\u0628\u0632",
    category: "ai",
    emoji: "\u{1F50A}",
    blurb: "\u062A\u0628\u062F\u06CC\u0644 \u0645\u062A\u0646 \u0628\u0647 \u06AF\u0641\u062A\u0627\u0631 \u0648 \u062F\u0648\u0628\u0644\u0647 \u0628\u0627 \u0635\u062F\u0627\u06CC \u0637\u0628\u06CC\u0639\u06CC."
  },
  {
    aliases: ["runway"],
    name: "\u0631\u0627\u0646\u200C\u0648\u06CC",
    category: "ai",
    emoji: "\u{1F3AC}",
    blurb: "\u062A\u0648\u0644\u06CC\u062F \u0648 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u0648\u06CC\u062F\u06CC\u0648 \u0628\u0627 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["descript"],
    name: "\u062F\u06CC\u0633\u06A9\u0631\u06CC\u067E\u062A",
    category: "ai",
    emoji: "\u{1F39A}\uFE0F",
    blurb: "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u067E\u0627\u062F\u06A9\u0633\u062A \u0648 \u0648\u06CC\u062F\u06CC\u0648 \u0628\u0627 \u0645\u062A\u0646 \u0648 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["cursor"],
    name: "\u06A9\u0631\u0633\u0631",
    category: "ai",
    emoji: "\u2328\uFE0F",
    blurb: "\u0627\u062F\u06CC\u062A\u0648\u0631 \u06A9\u062F \u0647\u0648\u0634\u0645\u0646\u062F \u0628\u0627 \u062A\u06A9\u0645\u06CC\u0644 \u0648 \u0628\u0627\u0632\u0646\u0648\u06CC\u0633\u06CC \u062E\u0648\u062F\u06A9\u0627\u0631."
  },
  {
    aliases: ["replit"],
    name: "\u0631\u06CC\u067E\u0644\u06CC\u062A",
    category: "ai",
    emoji: "\u{1F9D1}\u200D\u{1F4BB}",
    blurb: "\u0645\u062D\u06CC\u0637 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0646\u0648\u06CC\u0633\u06CC \u0622\u0646\u0644\u0627\u06CC\u0646 \u0628\u0627 \u062F\u0633\u062A\u06CC\u0627\u0631 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  /* --------------------------------- Design ------------------------------- */
  {
    aliases: ["adobe creative cloud", "creative cloud", "adobe", "\u0627\u062F\u0648\u0628\u06CC \u06A9\u0631\u06CC\u062A\u06CC\u0648 \u06A9\u0644\u0648\u062F", "\u0627\u062F\u0648\u0628\u06CC"],
    key: "adobe-cc",
    name: "\u0627\u062F\u0648\u0628\u06CC \u06A9\u0631\u06CC\u062A\u06CC\u0648 \u06A9\u0644\u0648\u062F",
    category: "design",
    emoji: "\u{1F170}\uFE0F",
    gradient: "from-red-500 via-rose-600 to-neutral-900",
    blurb: "\u0646\u0631\u0645\u200C\u0627\u0641\u0632\u0627\u0631 \u0642\u062F\u0631\u062A\u0645\u0646\u062F \u0637\u0631\u0627\u062D\u06CC \u0648 \u06AF\u0631\u0627\u0641\u06CC\u06A9 \u0634\u0627\u0645\u0644 \u0641\u062A\u0648\u0634\u0627\u067E\u060C \u0627\u06CC\u0644\u0627\u0633\u062A\u0631\u06CC\u062A\u0648\u0631 \u0648 \u067E\u0631\u06CC\u0645\u06CC\u0631."
  },
  {
    aliases: ["adobe photoshop", "photoshop", "\u0627\u062F\u0648\u0628\u06CC \u0641\u062A\u0648\u0634\u0627\u067E"],
    name: "\u0627\u062F\u0648\u0628\u06CC \u0641\u062A\u0648\u0634\u0627\u067E",
    category: "design",
    emoji: "\u{1F58C}\uFE0F",
    gradient: "from-sky-500 via-blue-600 to-indigo-700",
    blurb: "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0648 \u0631\u0648\u062A\u0648\u0634 \u062A\u0635\u0648\u06CC\u0631 \u0648 \u0633\u0627\u062E\u062A \u0637\u0631\u062D\u200C\u0647\u0627\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC."
  },
  {
    aliases: ["adobe illustrator", "illustrator", "\u0627\u062F\u0648\u0628\u06CC \u0627\u06CC\u0644\u0627\u0633\u062A\u0631\u06CC\u062A\u0648\u0631"],
    name: "\u0627\u062F\u0648\u0628\u06CC \u0627\u06CC\u0644\u0627\u0633\u062A\u0631\u06CC\u062A\u0648\u0631",
    category: "design",
    emoji: "\u2712\uFE0F",
    gradient: "from-orange-500 via-amber-600 to-yellow-700",
    blurb: "\u0637\u0631\u0627\u062D\u06CC \u0648\u06A9\u062A\u0648\u0631\u060C \u0644\u0648\u06AF\u0648 \u0648 \u062A\u0635\u0648\u06CC\u0631\u0633\u0627\u0632\u06CC \u062D\u0631\u0641\u0647\u200C\u0627\u06CC."
  },
  {
    aliases: ["adobe premiere", "premiere pro", "premiere", "\u0627\u062F\u0648\u0628\u06CC \u067E\u0631\u06CC\u0645\u06CC\u0631"],
    name: "\u0627\u062F\u0648\u0628\u06CC \u067E\u0631\u06CC\u0645\u06CC\u0631",
    category: "design",
    emoji: "\u{1F3AC}",
    gradient: "from-violet-500 via-purple-600 to-indigo-700",
    blurb: "\u062A\u062F\u0648\u06CC\u0646 \u0648\u06CC\u062F\u06CC\u0648 \u062D\u0631\u0641\u0647\u200C\u0627\u06CC \u0628\u0631\u0627\u06CC \u0641\u06CC\u0644\u0645 \u0648 \u0634\u0628\u06A9\u0647\u200C\u0647\u0627\u06CC \u0627\u062C\u062A\u0645\u0627\u0639\u06CC."
  },
  {
    aliases: ["adobe after effects", "after effects", "\u0627\u062F\u0648\u0628\u06CC \u0627\u0641\u062A\u0631\u0627\u0641\u06A9\u062A"],
    name: "\u0627\u062F\u0648\u0628\u06CC \u0627\u0641\u062A\u0631\u0627\u0641\u06A9\u062A",
    category: "design",
    emoji: "\u{1F39E}\uFE0F",
    gradient: "from-indigo-500 via-violet-600 to-purple-700",
    blurb: "\u0633\u0627\u062E\u062A \u0645\u0648\u0634\u0646\u200C\u06AF\u0631\u0627\u0641\u06CC\u06A9 \u0648 \u062C\u0644\u0648\u0647\u200C\u0647\u0627\u06CC \u0648\u06CC\u0698\u0647 \u0648\u06CC\u062F\u06CC\u0648."
  },
  {
    aliases: ["adobe lightroom", "lightroom", "\u0627\u062F\u0648\u0628\u06CC \u0644\u0627\u06CC\u062A\u0631\u0648\u0645"],
    name: "\u0627\u062F\u0648\u0628\u06CC \u0644\u0627\u06CC\u062A\u0631\u0648\u0645",
    category: "design",
    emoji: "\u{1F4F7}",
    blurb: "\u0648\u06CC\u0631\u0627\u06CC\u0634\u060C \u0631\u0648\u062A\u0648\u0634 \u0648 \u0645\u062F\u06CC\u0631\u06CC\u062A \u0639\u06A9\u0633\u200C\u0647\u0627\u06CC \u062D\u0631\u0641\u0647\u200C\u0627\u06CC."
  },
  {
    aliases: ["adobe acrobat", "acrobat", "\u0627\u062F\u0648\u0628\u06CC \u0622\u06A9\u0631\u0648\u0628\u0627\u062A"],
    name: "\u0627\u062F\u0648\u0628\u06CC \u0622\u06A9\u0631\u0648\u0628\u0627\u062A",
    category: "design",
    emoji: "\u{1F4C4}",
    blurb: "\u0648\u06CC\u0631\u0627\u06CC\u0634\u060C \u0627\u0645\u0636\u0627\u06CC \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0648 \u0645\u062F\u06CC\u0631\u06CC\u062A \u0641\u0627\u06CC\u0644\u200C\u0647\u0627\u06CC PDF."
  },
  {
    aliases: ["adobe indesign", "indesign", "\u0627\u062F\u0648\u0628\u06CC \u0627\u06CC\u0646\u062F\u06CC\u0632\u0627\u06CC\u0646"],
    name: "\u0627\u062F\u0648\u0628\u06CC \u0627\u06CC\u0646\u062F\u06CC\u0632\u0627\u06CC\u0646",
    category: "design",
    emoji: "\u{1F4D0}",
    blurb: "\u0635\u0641\u062D\u0647\u200C\u0622\u0631\u0627\u06CC\u06CC \u0645\u062C\u0644\u0647\u060C \u06A9\u062A\u0627\u0628 \u0648 \u0628\u0631\u0648\u0634\u0648\u0631."
  },
  {
    aliases: ["canva", "\u06A9\u0627\u0646\u0648\u0627"],
    key: "canva",
    name: "\u06A9\u0627\u0646\u0648\u0627",
    category: "design",
    emoji: "\u{1F5BC}\uFE0F",
    gradient: "from-cyan-400 via-sky-500 to-violet-500",
    blurb: "\u0637\u0631\u0627\u062D\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9 \u0622\u0633\u0627\u0646 \u0628\u0627 \u0642\u0627\u0644\u0628\u200C\u0647\u0627\u06CC \u0622\u0645\u0627\u062F\u0647 \u0628\u0631\u0627\u06CC \u0634\u0628\u06A9\u0647\u200C\u0647\u0627\u06CC \u0627\u062C\u062A\u0645\u0627\u0639\u06CC."
  },
  {
    aliases: ["figma", "\u0641\u06CC\u06AF\u0645\u0627"],
    name: "\u0641\u06CC\u06AF\u0645\u0627",
    category: "design",
    emoji: "\u{1F9E9}",
    gradient: "from-fuchsia-500 via-purple-500 to-orange-400",
    blurb: "\u0637\u0631\u0627\u062D\u06CC \u0631\u0627\u0628\u0637 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0648 \u0647\u0645\u06A9\u0627\u0631\u06CC \u062A\u06CC\u0645\u06CC \u0631\u0648\u06CC \u067E\u0631\u0648\u0698\u0647\u200C\u0647\u0627\u06CC \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644."
  },
  {
    aliases: ["capcut", "\u06A9\u067E\u200C\u06A9\u0627\u062A", "\u06A9\u067E \u06A9\u0627\u062A"],
    name: "\u06A9\u067E\u200C\u06A9\u0627\u062A",
    category: "design",
    emoji: "\u2702\uFE0F",
    gradient: "from-neutral-700 via-slate-800 to-black",
    blurb: "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0648\u06CC\u062F\u06CC\u0648 \u0648 \u062A\u062F\u0648\u06CC\u0646 \u0628\u0631\u0627\u06CC \u0634\u0628\u06A9\u0647\u200C\u0647\u0627\u06CC \u0627\u062C\u062A\u0645\u0627\u0639\u06CC."
  },
  {
    aliases: ["framer"],
    name: "\u0641\u0631\u06CC\u0645\u0631",
    category: "design",
    emoji: "\u{1F5A5}\uFE0F",
    blurb: "\u0633\u0627\u062E\u062A \u0648\u0628\u200C\u0633\u0627\u06CC\u062A \u0648 \u0646\u0645\u0648\u0646\u0647 \u0627\u0648\u0644\u06CC\u0647 \u062A\u0639\u0627\u0645\u0644\u06CC \u0628\u062F\u0648\u0646 \u06A9\u062F\u0646\u0648\u06CC\u0633\u06CC."
  },
  {
    aliases: ["procreate"],
    name: "\u067E\u0631\u0648\u06A9\u0631\u06CC\u062A",
    category: "design",
    emoji: "\u{1F58D}\uFE0F",
    blurb: "\u0646\u0642\u0627\u0634\u06CC \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0648 \u062A\u0635\u0648\u06CC\u0631\u0633\u0627\u0632\u06CC \u0631\u0648\u06CC \u0622\u06CC\u067E\u062F."
  },
  {
    aliases: ["affinity designer", "affinity photo", "affinity"],
    name: "\u0627\u0641\u06CC\u0646\u06CC\u062A\u06CC",
    category: "design",
    emoji: "\u{1F39B}\uFE0F",
    blurb: "\u0645\u062C\u0645\u0648\u0639\u0647 \u0637\u0631\u0627\u062D\u06CC \u0648 \u0648\u06CC\u0631\u0627\u06CC\u0634 \u062A\u0635\u0648\u06CC\u0631 \u062D\u0631\u0641\u0647\u200C\u0627\u06CC."
  },
  {
    aliases: ["sketch"],
    name: "\u0627\u0633\u06A9\u0686",
    category: "design",
    emoji: "\u270F\uFE0F",
    blurb: "\u0637\u0631\u0627\u062D\u06CC \u0631\u0627\u0628\u0637 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0648 \u0622\u06CC\u06A9\u0648\u0646 \u0628\u0631\u0627\u06CC \u0645\u06A9."
  },
  {
    aliases: ["envato elements", "envato"],
    name: "\u0627\u0646\u0648\u0627\u062A\u0648 \u0627\u0644\u0645\u0646\u062A\u0633",
    category: "design",
    emoji: "\u{1F5C3}\uFE0F",
    blurb: "\u062F\u0627\u0646\u0644\u0648\u062F \u0646\u0627\u0645\u062D\u062F\u0648\u062F \u0642\u0627\u0644\u0628\u060C \u0641\u0648\u0646\u062A \u0648 \u062F\u0627\u0631\u0627\u06CC\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC."
  },
  {
    aliases: ["freepik"],
    name: "\u0641\u0631\u06CC\u067E\u06CC\u06A9",
    category: "design",
    emoji: "\u{1F9FF}",
    blurb: "\u062A\u0635\u0627\u0648\u06CC\u0631\u060C \u0648\u06A9\u062A\u0648\u0631 \u0648 \u0642\u0627\u0644\u0628\u200C\u0647\u0627\u06CC \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC \u0622\u0645\u0627\u062F\u0647."
  },
  {
    aliases: ["shutterstock"],
    name: "\u0634\u0627\u062A\u0631\u0627\u0633\u062A\u0627\u06A9",
    category: "design",
    emoji: "\u{1F4F8}",
    blurb: "\u0639\u06A9\u0633\u060C \u0648\u06CC\u062F\u06CC\u0648 \u0648 \u0645\u0648\u0633\u06CC\u0642\u06CC \u0627\u0633\u062A\u0648\u06A9 \u0628\u0627 \u0644\u0627\u06CC\u0633\u0646\u0633 \u062A\u062C\u0627\u0631\u06CC."
  },
  {
    aliases: ["blender"],
    name: "\u0628\u0644\u0646\u062F\u0631",
    category: "design",
    emoji: "\u{1F9CA}",
    blurb: "\u0645\u062F\u0644\u200C\u0633\u0627\u0632\u06CC \u0633\u0647\u200C\u0628\u0639\u062F\u06CC\u060C \u0627\u0646\u06CC\u0645\u06CC\u0634\u0646 \u0648 \u0631\u0646\u062F\u0631."
  },
  {
    aliases: ["autocad"],
    name: "\u0627\u062A\u0648\u06A9\u062F",
    category: "design",
    emoji: "\u{1F3D7}\uFE0F",
    blurb: "\u0637\u0631\u0627\u062D\u06CC \u0646\u0642\u0634\u0647\u200C\u0647\u0627\u06CC \u062F\u0648\u0628\u0639\u062F\u06CC \u0648 \u0633\u0647\u200C\u0628\u0639\u062F\u06CC \u0645\u0647\u0646\u062F\u0633\u06CC."
  },
  /* --------------------------------- Gaming ------------------------------- */
  {
    aliases: ["steam wallet", "steam gift card"],
    name: "\u0627\u0633\u062A\u06CC\u0645 \u0648\u0627\u0644\u062A",
    category: "gaming",
    emoji: "\u{1F3AE}",
    gradient: "from-slate-700 via-slate-800 to-blue-900",
    blurb: "\u0634\u0627\u0631\u0698 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0627\u0633\u062A\u06CC\u0645 \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0628\u0627\u0632\u06CC \u0648 \u0622\u06CC\u062A\u0645."
  },
  {
    aliases: ["steam"],
    name: "\u0627\u0633\u062A\u06CC\u0645",
    category: "gaming",
    emoji: "\u{1F3AE}",
    gradient: "from-slate-700 via-slate-800 to-blue-900",
    blurb: "\u067E\u0644\u062A\u0641\u0631\u0645 \u062E\u0631\u06CC\u062F \u0648 \u0627\u062C\u0631\u0627\u06CC \u0628\u0627\u0632\u06CC\u200C\u0647\u0627\u06CC \u0631\u0627\u06CC\u0627\u0646\u0647\u200C\u0627\u06CC."
  },
  {
    aliases: ["playstation plus", "ps plus", "psn", "playstation network", "\u067E\u0644\u06CC\u200C\u0627\u0633\u062A\u06CC\u0634\u0646 \u067E\u0644\u0627\u0633"],
    name: "\u067E\u0644\u06CC\u200C\u0627\u0633\u062A\u06CC\u0634\u0646 \u067E\u0644\u0627\u0633",
    category: "gaming",
    emoji: "\u{1F579}\uFE0F",
    gradient: "from-blue-600 via-indigo-700 to-slate-900",
    blurb: "\u0628\u0627\u0632\u06CC \u0622\u0646\u0644\u0627\u06CC\u0646\u060C \u0628\u0627\u0632\u06CC\u200C\u0647\u0627\u06CC \u0645\u0627\u0647\u0627\u0646\u0647 \u0648 \u062A\u062E\u0641\u06CC\u0641\u200C\u0647\u0627\u06CC \u067E\u0644\u06CC\u200C\u0627\u0633\u062A\u06CC\u0634\u0646."
  },
  {
    aliases: ["playstation", "\u067E\u0644\u06CC\u200C\u0627\u0633\u062A\u06CC\u0634\u0646"],
    name: "\u067E\u0644\u06CC\u200C\u0627\u0633\u062A\u06CC\u0634\u0646",
    category: "gaming",
    emoji: "\u{1F579}\uFE0F",
    gradient: "from-blue-600 via-indigo-700 to-slate-900",
    blurb: "\u0634\u0627\u0631\u0698 \u0648 \u062E\u0631\u06CC\u062F \u0627\u0632 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647 \u067E\u0644\u06CC\u200C\u0627\u0633\u062A\u06CC\u0634\u0646."
  },
  {
    aliases: ["xbox game pass", "xbox live", "xbox", "\u0627\u06CC\u06A9\u0633\u200C\u0628\u0627\u06A9\u0633"],
    name: "\u0627\u06CC\u06A9\u0633\u200C\u0628\u0627\u06A9\u0633",
    category: "gaming",
    emoji: "\u{1F7E9}",
    gradient: "from-green-500 via-emerald-600 to-green-800",
    blurb: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0628\u0627\u0632\u06CC \u0627\u06CC\u06A9\u0633\u200C\u0628\u0627\u06A9\u0633 \u0648 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u06A9\u062A\u0627\u0628\u062E\u0627\u0646\u0647 \u06AF\u06CC\u0645\u200C\u067E\u0633."
  },
  {
    aliases: ["nintendo switch online", "nintendo eshop", "nintendo"],
    name: "\u0646\u06CC\u0646\u062A\u0646\u062F\u0648",
    category: "gaming",
    emoji: "\u{1F344}",
    blurb: "\u0628\u0627\u0632\u06CC \u0622\u0646\u0644\u0627\u06CC\u0646 \u0648 \u062E\u0631\u06CC\u062F \u0627\u0632 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647 \u0646\u06CC\u0646\u062A\u0646\u062F\u0648."
  },
  {
    aliases: ["discord nitro", "discord", "\u062F\u06CC\u0633\u06A9\u0648\u0631\u062F \u0646\u06CC\u062A\u0631\u0648", "\u062F\u06CC\u0633\u06A9\u0648\u0631\u062F"],
    name: "\u062F\u06CC\u0633\u06A9\u0648\u0631\u062F \u0646\u06CC\u062A\u0631\u0648",
    category: "gaming",
    emoji: "\u{1F4AC}",
    gradient: "from-indigo-500 via-violet-600 to-purple-700",
    blurb: "\u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u0648\u06CC\u0698\u0647 \u062F\u06CC\u0633\u06A9\u0648\u0631\u062F \u0634\u0627\u0645\u0644 \u0622\u067E\u0644\u0648\u062F \u0628\u0632\u0631\u06AF\u200C\u062A\u0631 \u0648 \u0627\u06CC\u0645\u0648\u062C\u06CC \u0633\u0641\u0627\u0631\u0634\u06CC."
  },
  {
    aliases: ["roblox", "robux"],
    name: "\u0631\u0627\u0628\u0644\u0627\u06A9\u0633",
    category: "gaming",
    emoji: "\u{1F9F1}",
    blurb: "\u062E\u0631\u06CC\u062F \u0631\u0648\u0628\u0627\u06A9\u0633 \u0648 \u0622\u06CC\u062A\u0645 \u0628\u0631\u0627\u06CC \u0628\u0627\u0632\u06CC \u0631\u0627\u0628\u0644\u0627\u06A9\u0633."
  },
  {
    aliases: ["minecraft"],
    name: "\u0645\u0627\u06CC\u0646\u06A9\u0631\u0641\u062A",
    category: "gaming",
    emoji: "\u26CF\uFE0F",
    blurb: "\u0644\u0627\u06CC\u0633\u0646\u0633 \u0628\u0627\u0632\u06CC \u0645\u0627\u06CC\u0646\u06A9\u0631\u0641\u062A \u0628\u0631\u0627\u06CC \u0633\u0627\u062E\u062A \u0648 \u06A9\u0627\u0648\u0634."
  },
  {
    aliases: ["fortnite", "v-bucks", "vbucks"],
    name: "\u0641\u0648\u0631\u062A\u0646\u0627\u06CC\u062A",
    category: "gaming",
    emoji: "\u{1F3D7}\uFE0F",
    blurb: "\u0634\u0627\u0631\u0698 \u0648\u06CC\u200C\u0628\u0627\u06A9\u0633 \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0627\u0633\u06A9\u06CC\u0646 \u0648 \u0628\u062A\u0644\u200C\u067E\u0633."
  },
  {
    aliases: ["valorant"],
    name: "\u0648\u0627\u0644\u0648\u0631\u0627\u0646\u062A",
    category: "gaming",
    emoji: "\u{1F3AF}",
    blurb: "\u0634\u0627\u0631\u0698 \u0648\u0627\u0644\u0648\u0631\u0627\u0646\u062A \u067E\u0648\u06CC\u0646\u062A \u0628\u0631\u0627\u06CC \u0627\u0633\u06A9\u06CC\u0646 \u0648 \u0628\u062A\u0644\u200C\u067E\u0633."
  },
  {
    aliases: ["riot points"],
    name: "\u0631\u06CC\u0648\u062A \u067E\u0648\u06CC\u0646\u062A",
    category: "gaming",
    emoji: "\u{1F4A0}",
    blurb: "\u0627\u0639\u062A\u0628\u0627\u0631 \u0631\u06CC\u0648\u062A \u0628\u0631\u0627\u06CC \u0628\u0627\u0632\u06CC\u200C\u0647\u0627\u06CC \u0644\u06CC\u06AF \u0622\u0648 \u0644\u062C\u0646\u062F\u0632 \u0648 \u0648\u0627\u0644\u0648\u0631\u0627\u0646\u062A."
  },
  {
    aliases: ["league of legends"],
    name: "\u0644\u06CC\u06AF \u0622\u0648 \u0644\u062C\u0646\u062F\u0632",
    category: "gaming",
    emoji: "\u2694\uFE0F",
    blurb: "\u0634\u0627\u0631\u0698 \u062D\u0633\u0627\u0628 \u0648 \u062E\u0631\u06CC\u062F \u0627\u0633\u06A9\u06CC\u0646 \u0644\u06CC\u06AF \u0622\u0648 \u0644\u062C\u0646\u062F\u0632."
  },
  {
    aliases: ["genshin impact", "genshin"],
    name: "\u06AF\u0646\u0634\u06CC\u0646 \u0627\u06CC\u0645\u067E\u06A9\u062A",
    category: "gaming",
    emoji: "\u{1F338}",
    blurb: "\u0634\u0627\u0631\u0698 \u06A9\u0631\u06CC\u0633\u062A\u0627\u0644 \u0628\u0631\u0627\u06CC \u0628\u0627\u0632\u06CC \u06AF\u0646\u0634\u06CC\u0646 \u0627\u06CC\u0645\u067E\u06A9\u062A."
  },
  {
    aliases: ["epic games"],
    name: "\u0627\u067E\u06CC\u06A9 \u06AF\u06CC\u0645\u0632",
    category: "gaming",
    emoji: "\u{1F3AE}",
    blurb: "\u0634\u0627\u0631\u0698 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0627\u067E\u06CC\u06A9 \u06AF\u06CC\u0645\u0632 \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0628\u0627\u0632\u06CC."
  },
  {
    aliases: ["ea play", "ea sports"],
    name: "\u0627\u06CC\u200C\u0627\u06CC \u067E\u0644\u06CC",
    category: "gaming",
    emoji: "\u26BD",
    blurb: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0628\u0627\u0632\u06CC\u200C\u0647\u0627\u06CC \u0627\u0644\u06A9\u062A\u0631\u0648\u0646\u06CC\u06A9 \u0622\u0631\u062A\u0633."
  },
  {
    aliases: ["ubisoft plus", "ubisoft+", "ubisoft"],
    name: "\u06CC\u0648\u0628\u06CC\u200C\u0633\u0627\u0641\u062A",
    category: "gaming",
    emoji: "\u{1F3AE}",
    blurb: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0648 \u062E\u0631\u06CC\u062F \u0628\u0627\u0632\u06CC\u200C\u0647\u0627\u06CC \u06CC\u0648\u0628\u06CC\u200C\u0633\u0627\u0641\u062A."
  },
  {
    aliases: ["battle.net", "blizzard"],
    name: "\u0628\u0644\u06CC\u0632\u0627\u0631\u062F",
    category: "gaming",
    emoji: "\u2744\uFE0F",
    blurb: "\u0634\u0627\u0631\u0698 \u062D\u0633\u0627\u0628 \u0628\u062A\u0644\u200C\u0646\u062A \u0648 \u0628\u0627\u0632\u06CC\u200C\u0647\u0627\u06CC \u0628\u0644\u06CC\u0632\u0627\u0631\u062F."
  },
  {
    aliases: ["razer gold", "razer"],
    name: "\u0631\u06CC\u0632\u0631 \u06AF\u0644\u062F",
    category: "gaming",
    emoji: "\u{1F40D}",
    blurb: "\u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0631\u06CC\u0632\u0631 \u06AF\u0644\u062F \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0628\u0627\u0632\u06CC \u0648 \u0622\u06CC\u062A\u0645."
  },
  {
    aliases: ["pubg mobile", "pubg uc", "pubg"],
    name: "\u067E\u0627\u0628\u062C\u06CC",
    category: "gaming",
    emoji: "\u{1FA82}",
    blurb: "\u0634\u0627\u0631\u0698 \u06CC\u0648\u0633\u06CC \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0627\u0633\u06A9\u06CC\u0646 \u0648 \u0628\u062A\u0644\u200C\u067E\u0633 \u067E\u0627\u0628\u062C\u06CC."
  },
  {
    aliases: ["free fire"],
    name: "\u0641\u0631\u06CC \u0641\u0627\u06CC\u0631",
    category: "gaming",
    emoji: "\u{1F525}",
    blurb: "\u0634\u0627\u0631\u0698 \u062C\u0645 \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0627\u0633\u06A9\u06CC\u0646 \u0648 \u0622\u06CC\u062A\u0645 \u0641\u0631\u06CC \u0641\u0627\u06CC\u0631."
  },
  {
    aliases: ["mobile legends"],
    name: "\u0645\u0648\u0628\u0627\u06CC\u0644 \u0644\u062C\u0646\u062F\u0632",
    category: "gaming",
    emoji: "\u{1F48E}",
    blurb: "\u0634\u0627\u0631\u0698 \u0627\u0644\u0645\u0627\u0633 \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0642\u0647\u0631\u0645\u0627\u0646 \u0648 \u0627\u0633\u06A9\u06CC\u0646."
  },
  {
    aliases: ["clash of clans"],
    name: "\u06A9\u0644\u0634 \u0622\u0648 \u06A9\u0644\u0646\u0632",
    category: "gaming",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: "\u0634\u0627\u0631\u0698 \u062C\u0645 \u0628\u0631\u0627\u06CC \u0627\u0631\u062A\u0642\u0627\u06CC \u067E\u0627\u06CC\u06AF\u0627\u0647 \u0648 \u0642\u0647\u0631\u0645\u0627\u0646\u200C\u0647\u0627."
  },
  {
    aliases: ["brawl stars"],
    name: "\u0628\u0631\u0627\u0648\u0644 \u0627\u0633\u062A\u0627\u0631\u0632",
    category: "gaming",
    emoji: "\u{1F31F}",
    blurb: "\u0634\u0627\u0631\u0698 \u062C\u0645 \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0628\u0631\u0627\u0648\u0644\u0631 \u0648 \u0627\u0633\u06A9\u06CC\u0646."
  },
  /* --------------------------------- Social ------------------------------- */
  {
    aliases: ["telegram premium", "telegram", "\u062A\u0644\u06AF\u0631\u0627\u0645 \u067E\u0631\u06CC\u0645\u06CC\u0648\u0645", "\u062A\u0644\u06AF\u0631\u0627\u0645"],
    name: "\u062A\u0644\u06AF\u0631\u0627\u0645 \u067E\u0631\u06CC\u0645\u06CC\u0648\u0645",
    category: "social",
    emoji: "\u2708\uFE0F",
    gradient: "from-sky-400 via-blue-500 to-cyan-500",
    blurb: "\u0627\u0631\u062A\u0642\u0627\u06CC \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0627 \u0627\u0633\u062A\u06CC\u06A9\u0631 \u0627\u062E\u062A\u0635\u0627\u0635\u06CC\u060C \u0622\u067E\u0644\u0648\u062F \u0628\u0632\u0631\u06AF\u200C\u062A\u0631 \u0648 \u0633\u0631\u0639\u062A \u0628\u06CC\u0634\u062A\u0631."
  },
  {
    aliases: ["instagram", "meta verified", "insta", "\u0627\u06CC\u0646\u0633\u062A\u0627\u06AF\u0631\u0627\u0645"],
    name: "\u0627\u06CC\u0646\u0633\u062A\u0627\u06AF\u0631\u0627\u0645",
    category: "social",
    emoji: "\u{1F4F8}",
    gradient: "from-pink-500 via-rose-500 to-amber-400",
    blurb: "\u0627\u0631\u062A\u0642\u0627\u06CC \u062D\u0633\u0627\u0628 \u0627\u06CC\u0646\u0633\u062A\u0627\u06AF\u0631\u0627\u0645 \u0648 \u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u0648\u06CC\u0698\u0647 \u0633\u0627\u0632\u0646\u062F\u06AF\u0627\u0646 \u0645\u062D\u062A\u0648\u0627."
  },
  {
    aliases: ["tiktok", "tik tok", "\u062A\u06CC\u06A9\u200C\u062A\u0627\u06A9", "\u062A\u06CC\u06A9 \u062A\u0627\u06A9"],
    name: "\u062A\u06CC\u06A9\u200C\u062A\u0627\u06A9",
    category: "social",
    emoji: "\u{1F57A}",
    gradient: "from-neutral-900 via-rose-500 to-cyan-400",
    blurb: "\u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u062D\u0631\u0641\u0647\u200C\u0627\u06CC \u062A\u0648\u0644\u06CC\u062F \u0648 \u062A\u062D\u0644\u06CC\u0644 \u0645\u062D\u062A\u0648\u0627\u06CC \u062A\u06CC\u06A9\u200C\u062A\u0627\u06A9."
  },
  {
    aliases: ["facebook"],
    name: "\u0641\u06CC\u0633\u0628\u0648\u06A9",
    category: "social",
    emoji: "\u{1F44D}",
    blurb: "\u0627\u0631\u062A\u0642\u0627\u06CC \u0635\u0641\u062D\u0647 \u0648 \u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u062A\u0628\u0644\u06CC\u063A\u0627\u062A\u06CC \u0641\u06CC\u0633\u0628\u0648\u06A9."
  },
  {
    aliases: ["snapchat"],
    name: "\u0627\u0633\u0646\u067E\u200C\u0686\u062A",
    category: "social",
    emoji: "\u{1F47B}",
    blurb: "\u0642\u0627\u0628\u0644\u06CC\u062A\u200C\u0647\u0627\u06CC \u0648\u06CC\u0698\u0647 \u0627\u0633\u0646\u067E\u200C\u0686\u062A \u0648 \u0627\u0633\u0646\u067E\u200C\u0686\u062A \u067E\u0644\u0627\u0633."
  },
  {
    aliases: ["x premium", "twitter blue", "twitter"],
    name: "\u0627\u06CC\u06A9\u0633 \u067E\u0631\u06CC\u0645\u06CC\u0648\u0645",
    category: "social",
    emoji: "\u{1F426}",
    gradient: "from-neutral-700 via-neutral-800 to-black",
    blurb: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0627\u06CC\u06A9\u0633 \u0628\u0627 \u062A\u06CC\u06A9 \u0622\u0628\u06CC\u060C \u0648\u06CC\u0631\u0627\u06CC\u0634 \u067E\u0633\u062A \u0648 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0647\u0648\u0634 \u0645\u0635\u0646\u0648\u0639\u06CC."
  },
  {
    aliases: ["linkedin premium", "linkedin"],
    name: "\u0644\u06CC\u0646\u06A9\u062F\u06CC\u0646",
    category: "social",
    emoji: "\u{1F4BC}",
    blurb: "\u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u062D\u0631\u0641\u0647\u200C\u0627\u06CC \u0644\u06CC\u0646\u06A9\u062F\u06CC\u0646 \u0628\u0631\u0627\u06CC \u062C\u0630\u0628 \u0641\u0631\u0635\u062A \u0634\u063A\u0644\u06CC \u0648 \u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646."
  },
  {
    aliases: ["linkedin learning"],
    name: "\u0644\u06CC\u0646\u06A9\u062F\u06CC\u0646 \u0644\u0631\u0646\u06CC\u0646\u06AF",
    category: "other",
    emoji: "\u{1F4BC}",
    blurb: "\u062F\u0648\u0631\u0647\u200C\u0647\u0627\u06CC \u0622\u0645\u0648\u0632\u0634\u06CC \u062D\u0631\u0641\u0647\u200C\u0627\u06CC \u0628\u0631\u0627\u06CC \u0645\u0647\u0627\u0631\u062A\u200C\u0647\u0627\u06CC \u0634\u063A\u0644\u06CC."
  },
  {
    aliases: ["reddit"],
    name: "\u0631\u062F\u06CC\u062A",
    category: "social",
    emoji: "\u{1F47D}",
    blurb: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0631\u062F\u06CC\u062A \u0648 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0627\u0646\u062C\u0645\u0646\u200C\u0647\u0627\u06CC \u062A\u062E\u0635\u0635\u06CC."
  },
  {
    aliases: ["pinterest"],
    name: "\u067E\u06CC\u0646\u062A\u0631\u0633\u062A",
    category: "social",
    emoji: "\u{1F4CC}",
    blurb: "\u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u062D\u0631\u0641\u0647\u200C\u0627\u06CC \u067E\u06CC\u0646\u062A\u0631\u0633\u062A \u0628\u0631\u0627\u06CC \u0627\u06CC\u062F\u0647 \u0648 \u0628\u0627\u0632\u0627\u0631\u06CC\u0627\u0628\u06CC."
  },
  {
    aliases: ["threads"],
    name: "\u062A\u0631\u062F\u0632",
    category: "social",
    emoji: "\u{1F9F5}",
    blurb: "\u0627\u0631\u062A\u0642\u0627\u06CC \u062D\u0633\u0627\u0628 \u062A\u0631\u062F\u0632 \u0648 \u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u0633\u0627\u0632\u0646\u062F\u06AF\u0627\u0646 \u0645\u062D\u062A\u0648\u0627."
  },
  {
    aliases: ["whatsapp business", "whatsapp"],
    name: "\u0648\u0627\u062A\u0633\u200C\u0627\u067E",
    category: "social",
    emoji: "\u{1F4F1}",
    blurb: "\u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u062A\u062C\u0627\u0631\u06CC \u0648\u0627\u062A\u0633\u200C\u0627\u067E \u0628\u0631\u0627\u06CC \u06A9\u0633\u0628\u200C\u0648\u06A9\u0627\u0631."
  },
  {
    aliases: ["tinder gold", "tinder plus", "tinder"],
    name: "\u062A\u06CC\u0646\u062F\u0631",
    category: "social",
    emoji: "\u{1F498}",
    blurb: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u062A\u06CC\u0646\u062F\u0631 \u0628\u0627 \u0644\u0627\u06CC\u06A9 \u0646\u0627\u0645\u062D\u062F\u0648\u062F \u0648 \u062F\u06CC\u062F\u0647\u200C\u0634\u062F\u0646 \u0628\u06CC\u0634\u062A\u0631."
  },
  {
    aliases: ["bumble premium", "bumble"],
    name: "\u0628\u0627\u0645\u0628\u0644",
    category: "social",
    emoji: "\u{1F41D}",
    blurb: "\u0627\u0634\u062A\u0631\u0627\u06A9 \u0628\u0627\u0645\u0628\u0644 \u0628\u0627 \u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u0648\u06CC\u0698\u0647 \u0622\u0634\u0646\u0627\u06CC\u06CC."
  },
  {
    aliases: ["bluesky"],
    name: "\u0628\u0644\u0648\u0627\u0633\u06A9\u0627\u06CC",
    category: "social",
    emoji: "\u{1F98B}",
    blurb: "\u0634\u0628\u06A9\u0647 \u0627\u062C\u062A\u0645\u0627\u0639\u06CC \u0628\u0644\u0648\u0627\u0633\u06A9\u0627\u06CC \u0648 \u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u062D\u0631\u0641\u0647\u200C\u0627\u06CC."
  },
  /* ------------------------------- Education ------------------------------ */
  {
    aliases: ["duolingo", "super duolingo", "\u062F\u0648\u0644\u06CC\u0646\u06AF\u0648"],
    name: "\u062F\u0648\u0644\u06CC\u0646\u06AF\u0648",
    category: "other",
    emoji: "\u{1F989}",
    gradient: "from-lime-400 via-green-500 to-emerald-600",
    blurb: "\u06CC\u0627\u062F\u06AF\u06CC\u0631\u06CC \u0632\u0628\u0627\u0646 \u0628\u0627 \u062A\u0645\u0631\u06CC\u0646\u200C\u0647\u0627\u06CC \u06A9\u0648\u062A\u0627\u0647 \u0648 \u0628\u0627\u0632\u06CC\u200C\u0648\u0627\u0631 \u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A."
  },
  {
    aliases: ["coursera", "\u06A9\u0648\u0631\u0633\u0631\u0627"],
    name: "\u06A9\u0648\u0631\u0633\u0631\u0627",
    category: "other",
    emoji: "\u{1F393}",
    blurb: "\u062F\u0648\u0631\u0647\u200C\u0647\u0627\u06CC \u062F\u0627\u0646\u0634\u06AF\u0627\u0647\u06CC \u0648 \u06AF\u0648\u0627\u0647\u06CC\u200C\u0646\u0627\u0645\u0647 \u0645\u0639\u062A\u0628\u0631."
  },
  {
    aliases: ["udemy"],
    name: "\u06CC\u0648\u062F\u0645\u06CC",
    category: "other",
    emoji: "\u{1F393}",
    blurb: "\u0647\u0632\u0627\u0631\u0627\u0646 \u062F\u0648\u0631\u0647 \u0622\u0645\u0648\u0632\u0634\u06CC \u0645\u0647\u0627\u0631\u062A\u06CC \u0648 \u062D\u0631\u0641\u0647\u200C\u0627\u06CC."
  },
  {
    aliases: ["edx"],
    name: "\u0627\u06CC\u062F\u06CC\u06A9\u0633",
    category: "other",
    emoji: "\u{1F393}",
    blurb: "\u062F\u0648\u0631\u0647\u200C\u0647\u0627\u06CC \u062F\u0627\u0646\u0634\u06AF\u0627\u0647\u06CC \u0622\u0646\u0644\u0627\u06CC\u0646 \u0627\u0632 \u0628\u0631\u062A\u0631\u06CC\u0646 \u0645\u0648\u0633\u0633\u0627\u062A."
  },
  {
    aliases: ["skillshare"],
    name: "\u0627\u0633\u06A9\u06CC\u0644\u200C\u0634\u06CC\u0631",
    category: "other",
    emoji: "\u{1F393}",
    blurb: "\u06A9\u0644\u0627\u0633\u200C\u0647\u0627\u06CC \u062E\u0644\u0627\u0642\u06CC\u062A\u060C \u0637\u0631\u0627\u062D\u06CC \u0648 \u0645\u0647\u0627\u0631\u062A\u200C\u0647\u0627\u06CC \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644."
  },
  {
    aliases: ["masterclass"],
    name: "\u0645\u0633\u062A\u0631\u06A9\u0644\u0627\u0633",
    category: "other",
    emoji: "\u{1F3DB}\uFE0F",
    blurb: "\u06A9\u0644\u0627\u0633\u200C\u0647\u0627\u06CC \u062A\u062E\u0635\u0635\u06CC \u0627\u0632 \u0627\u0633\u062A\u0627\u062F\u0627\u0646 \u0645\u0634\u0647\u0648\u0631 \u062C\u0647\u0627\u0646."
  },
  {
    aliases: ["babbel"],
    name: "\u0628\u0627\u0628\u0644",
    category: "other",
    emoji: "\u{1F5E8}\uFE0F",
    blurb: "\u06CC\u0627\u062F\u06AF\u06CC\u0631\u06CC \u0632\u0628\u0627\u0646 \u0628\u0627 \u062A\u0645\u0631\u06CC\u0646 \u0645\u06A9\u0627\u0644\u0645\u0647 \u0648 \u062F\u0631\u0633\u200C\u0647\u0627\u06CC \u06A9\u0648\u062A\u0627\u0647."
  },
  {
    aliases: ["rosetta stone"],
    name: "\u0631\u0632\u062A\u0627 \u0627\u0633\u062A\u0648\u0646",
    category: "other",
    emoji: "\u{1F5FF}",
    blurb: "\u06CC\u0627\u062F\u06AF\u06CC\u0631\u06CC \u0632\u0628\u0627\u0646 \u0628\u0627 \u0631\u0648\u0634 \u063A\u0648\u0637\u0647\u200C\u0648\u0631\u06CC \u0648 \u062A\u06A9\u0631\u0627\u0631."
  },
  {
    aliases: ["chegg"],
    name: "\u0686\u06AF",
    category: "other",
    emoji: "\u{1F4DA}",
    blurb: "\u06A9\u0645\u06A9\u200C\u0622\u0645\u0648\u0632\u0634\u06CC \u0648 \u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u062D\u0644 \u062A\u0645\u0631\u06CC\u0646 \u062F\u0631\u0633\u06CC."
  },
  {
    aliases: ["turnitin"],
    name: "\u062A\u0631\u0646\u06CC\u062A\u06CC\u0646",
    category: "other",
    emoji: "\u{1F4CB}",
    blurb: "\u0628\u0631\u0631\u0633\u06CC \u0627\u0635\u0627\u0644\u062A \u0648 \u0647\u0645\u0627\u0646\u0646\u062F\u062C\u0648\u06CC\u06CC \u0645\u062A\u0648\u0646 \u062F\u0627\u0646\u0634\u06AF\u0627\u0647\u06CC."
  },
  {
    aliases: ["brilliant"],
    name: "\u0628\u0631\u06CC\u0644\u06CC\u0627\u0646\u062A",
    category: "other",
    emoji: "\u{1F522}",
    blurb: "\u06CC\u0627\u062F\u06AF\u06CC\u0631\u06CC \u062A\u0639\u0627\u0645\u0644\u06CC \u0631\u06CC\u0627\u0636\u06CC\u060C \u0639\u0644\u0645 \u0648 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0646\u0648\u06CC\u0633\u06CC."
  },
  {
    aliases: ["datacamp"],
    name: "\u062F\u06CC\u062A\u0627\u06A9\u0645\u067E",
    category: "other",
    emoji: "\u{1F9EA}",
    blurb: "\u062F\u0648\u0631\u0647\u200C\u0647\u0627\u06CC \u062A\u0639\u0627\u0645\u0644\u06CC \u062F\u0627\u062F\u0647\u060C \u0622\u0645\u0627\u0631 \u0648 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0646\u0648\u06CC\u0633\u06CC."
  },
  {
    aliases: ["udacity"],
    name: "\u06CC\u0648\u062F\u0627\u0633\u06CC\u062A\u06CC",
    category: "other",
    emoji: "\u{1F393}",
    blurb: "\u062F\u0648\u0631\u0647\u200C\u0647\u0627\u06CC \u062A\u062E\u0635\u0635\u06CC \u0641\u0646\u0627\u0648\u0631\u06CC \u0648 \u0646\u0627\u0646\u0648\u062F\u0631\u0627\u06AF\u0631\u0647."
  },
  /* ---------------------------- Work & systems ---------------------------- */
  {
    aliases: ["microsoft 365", "office 365", "microsoft office", "microsoft"],
    name: "\u0645\u0627\u06CC\u06A9\u0631\u0648\u0633\u0627\u0641\u062A \u06F3\u06F6\u06F5",
    category: "other",
    emoji: "\u{1F4CA}",
    gradient: "from-red-500 via-orange-500 to-amber-500",
    blurb: "\u0645\u062C\u0645\u0648\u0639\u0647 \u0622\u0641\u06CC\u0633 \u0634\u0627\u0645\u0644 Word\u060C Excel \u0648 PowerPoint \u0628\u0627 \u0641\u0636\u0627\u06CC \u0627\u0628\u0631\u06CC."
  },
  {
    aliases: ["office 2021"],
    name: "\u0622\u0641\u06CC\u0633 \u06F2\u06F0\u06F2\u06F1",
    category: "other",
    emoji: "\u{1F4CA}",
    gradient: "from-red-500 via-orange-500 to-amber-500",
    blurb: "\u0644\u0627\u06CC\u0633\u0646\u0633 \u0645\u0627\u062F\u0627\u0645\u200C\u0627\u0644\u0639\u0645\u0631 \u0622\u0641\u06CC\u0633 \u06F2\u06F0\u06F2\u06F1 \u0628\u0631\u0627\u06CC \u0648\u06CC\u0646\u062F\u0648\u0632 \u06CC\u0627 \u0645\u06A9."
  },
  {
    aliases: ["office 2019"],
    name: "\u0622\u0641\u06CC\u0633 \u06F2\u06F0\u06F1\u06F9",
    category: "other",
    emoji: "\u{1F4CA}",
    gradient: "from-red-500 via-orange-500 to-amber-500",
    blurb: "\u0644\u0627\u06CC\u0633\u0646\u0633 \u0645\u0627\u062F\u0627\u0645\u200C\u0627\u0644\u0639\u0645\u0631 \u0622\u0641\u06CC\u0633 \u06F2\u06F0\u06F1\u06F9."
  },
  {
    aliases: ["windows 11", "win 11", "\u0648\u06CC\u0646\u062F\u0648\u0632 \u06F1\u06F1", "\u0648\u06CC\u0646\u062F\u0648\u0632 11"],
    name: "\u0648\u06CC\u0646\u062F\u0648\u0632 \u06F1\u06F1",
    category: "other",
    emoji: "\u{1FA9F}",
    gradient: "from-sky-400 via-blue-500 to-indigo-600",
    blurb: "\u0644\u0627\u06CC\u0633\u0646\u0633 \u0627\u0648\u0631\u062C\u06CC\u0646\u0627\u0644 \u0648\u06CC\u0646\u062F\u0648\u0632 \u06F1\u06F1 \u0628\u0627 \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0645\u0627\u062F\u0627\u0645\u200C\u0627\u0644\u0639\u0645\u0631."
  },
  {
    aliases: ["windows 10", "win 10", "\u0648\u06CC\u0646\u062F\u0648\u0632 \u06F1\u06F0", "\u0648\u06CC\u0646\u062F\u0648\u0632 10"],
    name: "\u0648\u06CC\u0646\u062F\u0648\u0632 \u06F1\u06F0",
    category: "other",
    emoji: "\u{1FA9F}",
    gradient: "from-sky-400 via-blue-500 to-indigo-600",
    blurb: "\u0644\u0627\u06CC\u0633\u0646\u0633 \u0627\u0648\u0631\u062C\u06CC\u0646\u0627\u0644 \u0648\u06CC\u0646\u062F\u0648\u0632 \u06F1\u06F0 \u0628\u0627 \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0645\u0627\u062F\u0627\u0645\u200C\u0627\u0644\u0639\u0645\u0631."
  },
  {
    aliases: ["windows server", "\u0648\u06CC\u0646\u062F\u0648\u0632 \u0633\u0631\u0648\u0631"],
    name: "\u0648\u06CC\u0646\u062F\u0648\u0632 \u0633\u0631\u0648\u0631",
    category: "other",
    emoji: "\u{1F5A5}\uFE0F",
    blurb: "\u0644\u0627\u06CC\u0633\u0646\u0633 \u0648\u06CC\u0646\u062F\u0648\u0632 \u0633\u0631\u0648\u0631 \u0628\u0631\u0627\u06CC \u0645\u062D\u06CC\u0637\u200C\u0647\u0627\u06CC \u0633\u0627\u0632\u0645\u0627\u0646\u06CC."
  },
  {
    aliases: ["windows", "\u0648\u06CC\u0646\u062F\u0648\u0632"],
    name: "\u0648\u06CC\u0646\u062F\u0648\u0632",
    category: "other",
    emoji: "\u{1FA9F}",
    gradient: "from-sky-400 via-blue-500 to-indigo-600",
    blurb: "\u0644\u0627\u06CC\u0633\u0646\u0633 \u0627\u0648\u0631\u062C\u06CC\u0646\u0627\u0644 \u0648\u06CC\u0646\u062F\u0648\u0632 \u0628\u0627 \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0645\u0627\u062F\u0627\u0645\u200C\u0627\u0644\u0639\u0645\u0631."
  },
  {
    aliases: ["visual studio"],
    name: "\u0648\u06CC\u0698\u0648\u0627\u0644 \u0627\u0633\u062A\u0648\u062F\u06CC\u0648",
    category: "other",
    emoji: "\u{1F468}\u200D\u{1F4BB}",
    blurb: "\u0645\u062D\u06CC\u0637 \u062A\u0648\u0633\u0639\u0647 \u06CC\u06A9\u067E\u0627\u0631\u0686\u0647 \u0645\u0627\u06CC\u06A9\u0631\u0648\u0633\u0627\u0641\u062A \u0628\u0631\u0627\u06CC \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0646\u0648\u06CC\u0633\u06CC."
  },
  {
    aliases: ["notion"],
    name: "\u0646\u0648\u0634\u0646",
    category: "other",
    emoji: "\u{1F4DD}",
    blurb: "\u0641\u0636\u0627\u06CC \u06A9\u0627\u0631\u06CC \u0647\u0648\u0634\u0645\u0646\u062F \u0628\u0631\u0627\u06CC \u06CC\u0627\u062F\u062F\u0627\u0634\u062A\u060C \u067E\u0631\u0648\u0698\u0647 \u0648 \u0645\u062F\u06CC\u0631\u06CC\u062A \u062A\u06CC\u0645."
  },
  {
    aliases: ["evernote"],
    name: "\u0627\u0648\u0631\u0646\u0648\u062A",
    category: "other",
    emoji: "\u{1F418}",
    blurb: "\u06CC\u0627\u062F\u062F\u0627\u0634\u062A\u200C\u0628\u0631\u062F\u0627\u0631\u06CC \u0648 \u0633\u0627\u0632\u0645\u0627\u0646\u200C\u062F\u0647\u06CC \u0627\u0637\u0644\u0627\u0639\u0627\u062A."
  },
  {
    aliases: ["todoist"],
    name: "\u062A\u0648\u062F\u0648\u06CC\u0633\u062A",
    category: "other",
    emoji: "\u2705",
    blurb: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u06A9\u0627\u0631\u0647\u0627 \u0648 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0631\u06CC\u0632\u06CC \u0631\u0648\u0632\u0627\u0646\u0647."
  },
  {
    aliases: ["trello"],
    name: "\u062A\u0631\u0644\u0648",
    category: "other",
    emoji: "\u{1F5C2}\uFE0F",
    blurb: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0631\u0648\u0698\u0647 \u0628\u0627 \u0628\u0631\u062F\u0647\u0627\u06CC \u06A9\u0627\u0646\u0628\u0627\u0646."
  },
  {
    aliases: ["asana"],
    name: "\u0622\u0633\u0627\u0646\u0627",
    category: "other",
    emoji: "\u{1F9ED}",
    blurb: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u0648\u0638\u0627\u06CC\u0641 \u0648 \u0647\u0645\u06A9\u0627\u0631\u06CC \u062A\u06CC\u0645\u06CC."
  },
  {
    aliases: ["monday.com", "monday"],
    name: "\u0645\u0627\u0646\u062F\u06CC",
    category: "other",
    emoji: "\u{1F4C5}",
    blurb: "\u067E\u0644\u062A\u0641\u0631\u0645 \u0645\u062F\u06CC\u0631\u06CC\u062A \u06A9\u0627\u0631 \u0648 \u06AF\u0631\u062F\u0634\u200C\u06A9\u0627\u0631 \u062A\u06CC\u0645\u06CC."
  },
  {
    aliases: ["clickup"],
    name: "\u06A9\u0644\u06CC\u06A9\u200C\u0622\u067E",
    category: "other",
    emoji: "\u{1F7E3}",
    blurb: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u067E\u0631\u0648\u0698\u0647 \u0648 \u0628\u0647\u0631\u0647\u200C\u0648\u0631\u06CC \u062A\u06CC\u0645 \u062F\u0631 \u06CC\u06A9 \u0628\u0631\u0646\u0627\u0645\u0647."
  },
  {
    aliases: ["airtable"],
    name: "\u0627\u06CC\u0631\u062A\u06CC\u0628\u0644",
    category: "other",
    emoji: "\u{1F5C3}\uFE0F",
    blurb: "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0648 \u0645\u062F\u06CC\u0631\u06CC\u062A \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u062A\u06CC\u0645\u06CC."
  },
  {
    aliases: ["miro"],
    name: "\u0645\u06CC\u0631\u0648",
    category: "other",
    emoji: "\u{1F587}\uFE0F",
    blurb: "\u062A\u062E\u062A\u0647 \u0633\u0641\u06CC\u062F \u062A\u0639\u0627\u0645\u0644\u06CC \u0628\u0631\u0627\u06CC \u0637\u0648\u0641\u0627\u0646 \u0641\u06A9\u0631\u06CC \u0648 \u0637\u0631\u0627\u062D\u06CC."
  },
  {
    aliases: ["slack"],
    name: "\u0627\u0633\u0644\u06A9",
    category: "other",
    emoji: "#\uFE0F\u20E3",
    blurb: "\u067E\u06CC\u0627\u0645\u200C\u0631\u0633\u0627\u0646 \u062A\u06CC\u0645\u06CC \u0648 \u0647\u0645\u06A9\u0627\u0631\u06CC \u062F\u0631 \u0645\u062D\u06CC\u0637 \u06A9\u0627\u0631."
  },
  {
    aliases: ["zoom"],
    name: "\u0632\u0648\u0645",
    category: "other",
    emoji: "\u{1F4F9}",
    blurb: "\u062A\u0645\u0627\u0633 \u0648\u06CC\u062F\u06CC\u0648\u06CC\u06CC \u0648 \u062C\u0644\u0633\u0627\u062A \u0622\u0646\u0644\u0627\u06CC\u0646 \u0628\u0627 \u06A9\u06CC\u0641\u06CC\u062A \u0628\u0627\u0644\u0627."
  },
  {
    aliases: ["google workspace", "gsuite"],
    name: "\u06AF\u0648\u06AF\u0644 \u0648\u0631\u06A9\u200C\u0627\u0633\u067E\u06CC\u0633",
    category: "other",
    emoji: "\u{1F4C1}",
    blurb: "\u0627\u06CC\u0645\u06CC\u0644 \u0633\u0627\u0632\u0645\u0627\u0646\u06CC \u0648 \u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u0647\u0645\u06A9\u0627\u0631\u06CC \u06AF\u0648\u06AF\u0644."
  },
  {
    aliases: ["google one"],
    name: "\u06AF\u0648\u06AF\u0644 \u0648\u0627\u0646",
    category: "other",
    emoji: "\u2601\uFE0F",
    blurb: "\u0641\u0636\u0627\u06CC \u0630\u062E\u06CC\u0631\u0647\u200C\u0633\u0627\u0632\u06CC \u0627\u0628\u0631\u06CC \u06AF\u0648\u06AF\u0644 \u0648 \u0627\u0645\u06A9\u0627\u0646\u0627\u062A \u0648\u06CC\u0698\u0647."
  },
  {
    aliases: ["google play"],
    name: "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A \u06AF\u0648\u06AF\u0644 \u067E\u0644\u06CC",
    category: "other",
    emoji: "\u{1F381}",
    blurb: "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A \u062E\u0631\u06CC\u062F \u0628\u0631\u0646\u0627\u0645\u0647\u060C \u0628\u0627\u0632\u06CC \u0648 \u0645\u062D\u062A\u0648\u0627 \u0627\u0632 \u06AF\u0648\u06AF\u0644 \u067E\u0644\u06CC."
  },
  {
    aliases: ["dropbox"],
    name: "\u062F\u0631\u0627\u067E\u200C\u0628\u0627\u06A9\u0633",
    category: "other",
    emoji: "\u{1F5C2}\uFE0F",
    blurb: "\u0630\u062E\u06CC\u0631\u0647\u200C\u0633\u0627\u0632\u06CC \u0648 \u0627\u0634\u062A\u0631\u0627\u06A9 \u0641\u0627\u06CC\u0644 \u062F\u0631 \u0641\u0636\u0627\u06CC \u0627\u0628\u0631\u06CC."
  },
  {
    aliases: ["onedrive"],
    name: "\u0648\u0627\u0646\u200C\u062F\u0631\u0627\u06CC\u0648",
    category: "other",
    emoji: "\u2601\uFE0F",
    blurb: "\u0641\u0636\u0627\u06CC \u0630\u062E\u06CC\u0631\u0647\u200C\u0633\u0627\u0632\u06CC \u0627\u0628\u0631\u06CC \u0645\u0627\u06CC\u06A9\u0631\u0648\u0633\u0627\u0641\u062A."
  },
  {
    aliases: ["icloud", "apple one", "\u0622\u06CC\u200C\u06A9\u0644\u0627\u062F", "\u0622\u06CC \u06A9\u0644\u0627\u062F", "\u0627\u067E\u0644 \u0648\u0627\u0646"],
    name: "\u0622\u06CC\u200C\u06A9\u0644\u0627\u062F",
    category: "other",
    emoji: "\u2601\uFE0F",
    blurb: "\u0641\u0636\u0627\u06CC \u0630\u062E\u06CC\u0631\u0647\u200C\u0633\u0627\u0632\u06CC \u0627\u0628\u0631\u06CC \u0627\u067E\u0644 \u0648 \u0647\u0645\u06AF\u0627\u0645\u200C\u0633\u0627\u0632\u06CC \u062F\u0633\u062A\u06AF\u0627\u0647\u200C\u0647\u0627."
  },
  {
    aliases: ["mega.nz", "mega cloud"],
    name: "\u0645\u06AF\u0627",
    category: "other",
    emoji: "\u2601\uFE0F",
    blurb: "\u0641\u0636\u0627\u06CC \u0630\u062E\u06CC\u0631\u0647\u200C\u0633\u0627\u0632\u06CC \u0627\u0628\u0631\u06CC \u0628\u0627 \u0631\u0645\u0632\u0646\u06AF\u0627\u0631\u06CC \u0633\u0631\u062A\u0627\u0633\u0631\u06CC."
  },
  {
    aliases: ["pcloud"],
    name: "\u067E\u06CC\u200C\u06A9\u0644\u0627\u062F",
    category: "other",
    emoji: "\u2601\uFE0F",
    blurb: "\u0630\u062E\u06CC\u0631\u0647\u200C\u0633\u0627\u0632\u06CC \u0627\u0628\u0631\u06CC \u0627\u0645\u0646 \u0628\u0627 \u0644\u0627\u06CC\u0633\u0646\u0633 \u0645\u0627\u062F\u0627\u0645\u200C\u0627\u0644\u0639\u0645\u0631."
  },
  {
    aliases: ["box"],
    name: "\u0628\u0627\u06A9\u0633",
    category: "other",
    emoji: "\u{1F5C4}\uFE0F",
    blurb: "\u0645\u062F\u06CC\u0631\u06CC\u062A \u0648 \u0627\u0634\u062A\u0631\u0627\u06A9 \u0627\u0645\u0646 \u0641\u0627\u06CC\u0644\u200C\u0647\u0627\u06CC \u0633\u0627\u0632\u0645\u0627\u0646\u06CC."
  },
  {
    aliases: [
      "apple gift card",
      "itunes gift card",
      "app store gift card",
      "\u06AF\u06CC\u0641\u062A \u06A9\u0627\u0631\u062A \u0627\u067E\u0644",
      "\u0627\u067E\u0644 \u06AF\u06CC\u0641\u062A \u06A9\u0627\u0631\u062A"
    ],
    name: "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A \u0627\u067E\u0644",
    category: "other",
    emoji: "\u{1F34E}",
    blurb: "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A \u062E\u0631\u06CC\u062F \u0627\u0632 \u0627\u067E \u0627\u0633\u062A\u0648\u0631 \u0648 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647 \u0627\u067E\u0644."
  },
  {
    aliases: ["amazon gift card", "\u06AF\u06CC\u0641\u062A \u06A9\u0627\u0631\u062A \u0622\u0645\u0627\u0632\u0648\u0646", "\u0622\u0645\u0627\u0632\u0648\u0646 \u06AF\u06CC\u0641\u062A \u06A9\u0627\u0631\u062A"],
    name: "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A \u0622\u0645\u0627\u0632\u0648\u0646",
    category: "other",
    emoji: "\u{1F381}",
    blurb: "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A \u062E\u0631\u06CC\u062F \u0627\u0632 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647 \u0622\u0645\u0627\u0632\u0648\u0646."
  },
  {
    aliases: ["ebay gift card", "ebay"],
    name: "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A \u0627\u06CC\u200C\u0628\u06CC",
    category: "other",
    emoji: "\u{1F6D2}",
    blurb: "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A \u062E\u0631\u06CC\u062F \u0627\u0632 \u0641\u0631\u0648\u0634\u06AF\u0627\u0647 \u0627\u06CC\u200C\u0628\u06CC."
  },
  {
    aliases: ["visa gift card", "prepaid visa"],
    name: "\u06A9\u0627\u0631\u062A \u0647\u062F\u06CC\u0647 \u0648\u06CC\u0632\u0627",
    category: "other",
    emoji: "\u{1F4B3}",
    blurb: "\u06A9\u0627\u0631\u062A \u067E\u0631\u062F\u0627\u062E\u062A \u067E\u06CC\u0634\u200C\u067E\u0631\u062F\u0627\u062E\u062A \u0648\u06CC\u0632\u0627 \u0628\u0631\u0627\u06CC \u062E\u0631\u06CC\u062F \u0622\u0646\u0644\u0627\u06CC\u0646."
  },
  {
    aliases: ["scribd", "everand"],
    name: "\u0627\u0633\u06A9\u0631\u0627\u06CC\u0628\u062F",
    category: "other",
    emoji: "\u{1F4DA}",
    blurb: "\u06A9\u062A\u0627\u0628 \u0627\u0644\u06A9\u062A\u0631\u0648\u0646\u06CC\u06A9\u06CC\u060C \u06A9\u062A\u0627\u0628 \u0635\u0648\u062A\u06CC \u0648 \u0645\u0642\u0627\u0644\u0647 \u0646\u0627\u0645\u062D\u062F\u0648\u062F."
  },
  {
    aliases: ["storytel"],
    name: "\u0627\u0633\u062A\u0648\u0631\u06CC\u200C\u062A\u0644",
    category: "other",
    emoji: "\u{1F3A7}",
    blurb: "\u06A9\u062A\u0627\u0628 \u0635\u0648\u062A\u06CC \u0648 \u0627\u0644\u06A9\u062A\u0631\u0648\u0646\u06CC\u06A9\u06CC \u0628\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u0627\u0645\u062D\u062F\u0648\u062F."
  },
  {
    aliases: ["blinkist"],
    name: "\u0628\u0644\u06CC\u0646\u06A9\u06CC\u0633\u062A",
    category: "other",
    emoji: "\u{1F4A1}",
    blurb: "\u062E\u0644\u0627\u0635\u0647 \u06A9\u062A\u0627\u0628\u200C\u0647\u0627\u06CC \u067E\u0631\u0641\u0631\u0648\u0634 \u062F\u0631 \u0686\u0646\u062F \u062F\u0642\u06CC\u0642\u0647."
  },
  {
    aliases: ["marvel unlimited"],
    name: "\u0645\u0627\u0631\u0648\u0644 \u0622\u0646\u0644\u06CC\u0645\u06CC\u062A\u062F",
    category: "other",
    emoji: "\u{1F9B8}",
    blurb: "\u06A9\u0645\u06CC\u06A9\u200C\u0647\u0627\u06CC \u0645\u0627\u0631\u0648\u0644 \u0628\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u0627\u0645\u062D\u062F\u0648\u062F."
  },
  {
    aliases: ["dc universe infinite", "dc universe"],
    name: "\u062F\u06CC\u200C\u0633\u06CC \u0622\u0646\u0644\u06CC\u0645\u06CC\u062A\u062F",
    category: "other",
    emoji: "\u{1F987}",
    blurb: "\u06A9\u0645\u06CC\u06A9\u200C\u0647\u0627\u06CC \u062F\u06CC\u200C\u0633\u06CC \u0628\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0646\u0627\u0645\u062D\u062F\u0648\u062F."
  },
  {
    aliases: ["comixology"],
    name: "\u06A9\u0627\u0645\u06CC\u06A9\u0633\u0648\u0644\u0648\u0698\u06CC",
    category: "other",
    emoji: "\u{1F4A5}",
    blurb: "\u06A9\u0645\u06CC\u06A9 \u0648 \u0631\u0645\u0627\u0646 \u06AF\u0631\u0627\u0641\u06CC\u06A9\u06CC \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644."
  },
  /* -------------------------------- Finance ------------------------------- */
  {
    aliases: ["tradingview"],
    name: "\u062A\u0631\u06CC\u062F\u06CC\u0646\u06AF\u200C\u0648\u06CC\u0648",
    category: "other",
    emoji: "\u{1F4C8}",
    gradient: "from-sky-500 via-blue-600 to-indigo-700",
    blurb: "\u062A\u062D\u0644\u06CC\u0644 \u062A\u06A9\u0646\u06CC\u06A9\u0627\u0644 \u0628\u0627\u0632\u0627\u0631\u0647\u0627\u06CC \u0645\u0627\u0644\u06CC \u0648 \u0686\u0627\u0631\u062A\u200C\u0647\u0627\u06CC \u062D\u0631\u0641\u0647\u200C\u0627\u06CC."
  },
  {
    aliases: ["binance"],
    name: "\u0628\u0627\u06CC\u0646\u0646\u0633",
    category: "other",
    emoji: "\u{1FA99}",
    blurb: "\u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0635\u0631\u0627\u0641\u06CC \u0627\u0631\u0632 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0648 \u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u0645\u0639\u0627\u0645\u0644\u0627\u062A\u06CC."
  },
  {
    aliases: ["bybit"],
    name: "\u0628\u0627\u06CC\u200C\u0628\u06CC\u062A",
    category: "other",
    emoji: "\u{1FA99}",
    blurb: "\u0635\u0631\u0627\u0641\u06CC \u0627\u0631\u0632 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0648 \u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0645\u0634\u062A\u0642\u0647."
  },
  {
    aliases: ["coinbase"],
    name: "\u06A9\u0648\u06CC\u0646\u200C\u0628\u06CC\u0633",
    category: "other",
    emoji: "\u{1FA99}",
    blurb: "\u062E\u0631\u06CC\u062F \u0648 \u0641\u0631\u0648\u0634 \u0627\u0631\u0632 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0648 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0627\u0645\u0646."
  },
  {
    aliases: ["kucoin", "ku coin"],
    name: "\u06A9\u0648\u06A9\u0648\u06CC\u0646",
    category: "other",
    emoji: "\u{1FA99}",
    blurb: "\u0635\u0631\u0627\u0641\u06CC \u0627\u0631\u0632 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0628\u0627 \u062A\u0646\u0648\u0639 \u0628\u0627\u0644\u0627\u06CC \u062A\u0648\u06A9\u0646."
  },
  {
    aliases: ["okx"],
    name: "\u0627\u0648\u06A9\u06CC\u200C\u0627\u06CC\u06A9\u0633",
    category: "other",
    emoji: "\u{1FA99}",
    blurb: "\u0635\u0631\u0627\u0641\u06CC \u0627\u0631\u0632 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0648 \u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u0648\u0628\u06F3."
  },
  {
    aliases: ["mexc"],
    name: "\u0627\u0645\u200C\u0627\u06CC\u06A9\u0633\u200C\u0633\u06CC",
    category: "other",
    emoji: "\u{1FA99}",
    blurb: "\u0635\u0631\u0627\u0641\u06CC \u0627\u0631\u0632 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0628\u0627 \u06A9\u0627\u0631\u0645\u0632\u062F \u067E\u0627\u06CC\u06CC\u0646."
  },
  {
    aliases: ["bitget"],
    name: "\u0628\u06CC\u062A\u200C\u06AF\u062A",
    category: "other",
    emoji: "\u{1FA99}",
    blurb: "\u0635\u0631\u0627\u0641\u06CC \u0627\u0631\u0632 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0648 \u06A9\u067E\u06CC\u200C\u062A\u0631\u06CC\u062F\u06CC\u0646\u06AF."
  },
  {
    aliases: ["kraken"],
    name: "\u06A9\u0631\u0627\u06A9\u0646",
    category: "other",
    emoji: "\u{1FA99}",
    blurb: "\u0635\u0631\u0627\u0641\u06CC \u0627\u0631\u0632 \u062F\u06CC\u062C\u06CC\u062A\u0627\u0644 \u0628\u0627 \u0627\u0645\u0646\u06CC\u062A \u0628\u0627\u0644\u0627."
  },
  {
    aliases: ["etoro"],
    name: "\u0627\u06CC\u200C\u062A\u0648\u0631\u0648",
    category: "other",
    emoji: "\u{1F4CA}",
    blurb: "\u067E\u0644\u062A\u0641\u0631\u0645 \u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0648 \u06A9\u067E\u06CC\u200C\u062A\u0631\u06CC\u062F\u06CC\u0646\u06AF \u0686\u0646\u062F\u062F\u0627\u0631\u0627\u06CC\u06CC."
  },
  {
    aliases: ["quotex"],
    name: "\u06A9\u0648\u062A\u06A9\u0633",
    category: "other",
    emoji: "\u{1F4C9}",
    blurb: "\u067E\u0644\u062A\u0641\u0631\u0645 \u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0622\u0646\u0644\u0627\u06CC\u0646 \u0628\u0627 \u0622\u0645\u0648\u0632\u0634 \u0648 \u062D\u0633\u0627\u0628 \u0622\u0632\u0645\u0627\u06CC\u0634\u06CC."
  },
  {
    aliases: ["pocket option"],
    name: "\u067E\u0627\u06A9\u062A \u0622\u067E\u0634\u0646",
    category: "other",
    emoji: "\u{1F4C9}",
    blurb: "\u067E\u0644\u062A\u0641\u0631\u0645 \u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0622\u0646\u0644\u0627\u06CC\u0646 \u0648 \u0627\u0628\u0632\u0627\u0631\u0647\u0627\u06CC \u062A\u062D\u0644\u06CC\u0644."
  },
  {
    aliases: ["iq option"],
    name: "\u0622\u06CC\u200C\u06A9\u06CC\u0648 \u0622\u067E\u0634\u0646",
    category: "other",
    emoji: "\u{1F4CA}",
    blurb: "\u067E\u0644\u062A\u0641\u0631\u0645 \u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0622\u0646\u0644\u0627\u06CC\u0646 \u0648 \u0622\u0645\u0648\u0632\u0634 \u062A\u0631\u06CC\u062F."
  },
  {
    aliases: ["metatrader", "meta trader", "mt4", "mt5"],
    name: "\u0645\u062A\u0627\u062A\u0631\u06CC\u062F\u0631",
    category: "other",
    emoji: "\u{1F4CA}",
    blurb: "\u067E\u0644\u062A\u0641\u0631\u0645 \u0645\u0639\u0627\u0645\u0644\u0627\u062A \u0641\u0627\u0631\u06A9\u0633 \u0648 \u062A\u062D\u0644\u06CC\u0644 \u0686\u0627\u0631\u062A."
  },
  {
    aliases: ["ftmo"],
    name: "\u0627\u0641\u200C\u062A\u06CC\u200C\u0627\u0645\u200C\u0627\u0648",
    category: "other",
    emoji: "\u{1F3E6}",
    blurb: "\u0686\u0627\u0644\u0634 \u067E\u0631\u0627\u067E \u062A\u0631\u06CC\u062F\u06CC\u0646\u06AF \u0648 \u0645\u062F\u06CC\u0631\u06CC\u062A \u0633\u0631\u0645\u0627\u06CC\u0647."
  },
  {
    aliases: ["fundednext", "funded next"],
    name: "\u0641\u0627\u0646\u062F\u062F \u0646\u06A9\u0633\u062A",
    category: "other",
    emoji: "\u{1F3E6}",
    blurb: "\u0686\u0627\u0644\u0634 \u067E\u0631\u0627\u067E \u062A\u0631\u06CC\u062F\u06CC\u0646\u06AF \u0628\u0627 \u0633\u0631\u0645\u0627\u06CC\u0647 \u0634\u0631\u06A9\u062A."
  },
  /* --------------------------- Security & VPN ----------------------------- */
  {
    aliases: ["nordvpn", "nord vpn"],
    name: "\u0646\u0648\u0631\u062F \u0648\u06CC\u200C\u067E\u06CC\u200C\u0627\u0646",
    category: "other",
    emoji: "\u{1F310}",
    gradient: "from-blue-500 via-indigo-500 to-sky-600",
    blurb: VPN_BLURB
  },
  {
    aliases: ["expressvpn", "express vpn", "\u0627\u06A9\u0633\u067E\u0631\u0633 \u0648\u06CC\u200C\u067E\u06CC\u200C\u0627\u0646", "\u0627\u06A9\u0633\u067E\u0631\u0633 \u0648\u06CC \u067E\u06CC \u0627\u0646"],
    name: "\u0627\u06A9\u0633\u067E\u0631\u0633 \u0648\u06CC\u200C\u067E\u06CC\u200C\u0627\u0646",
    category: "other",
    emoji: "\u{1F680}",
    gradient: "from-red-500 via-rose-600 to-orange-600",
    blurb: VPN_BLURB
  },
  {
    aliases: ["surfshark"],
    name: "\u0633\u0631\u0641\u200C\u0634\u0627\u0631\u06A9",
    category: "other",
    emoji: "\u{1F988}",
    gradient: "from-teal-400 via-cyan-500 to-blue-600",
    blurb: VPN_BLURB
  },
  {
    aliases: ["proton vpn", "protonvpn", "proton mail", "proton drive", "proton"],
    name: "\u067E\u0631\u0648\u062A\u0648\u0646",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: VPN_BLURB
  },
  {
    aliases: ["cyberghost", "cyber ghost"],
    name: "\u0633\u0627\u06CC\u0628\u0631\u06AF\u0648\u0633\u062A",
    category: "other",
    emoji: "\u{1F47B}",
    blurb: VPN_BLURB
  },
  {
    aliases: ["ipvanish"],
    name: "\u0622\u06CC\u200C\u067E\u06CC\u200C\u0648\u0646\u06CC\u0634",
    category: "other",
    emoji: "\u{1F575}\uFE0F",
    blurb: VPN_BLURB
  },
  {
    aliases: ["private internet access", "pia vpn"],
    name: "\u067E\u06CC\u200C\u0622\u06CC\u200C\u0627\u06CC \u0648\u06CC\u200C\u067E\u06CC\u200C\u0627\u0646",
    category: "other",
    emoji: "\u{1F576}\uFE0F",
    blurb: VPN_BLURB
  },
  {
    aliases: ["mullvad"],
    name: "\u0645\u0648\u0644\u0648\u062F",
    category: "other",
    emoji: "\u{1F9C5}",
    blurb: VPN_BLURB
  },
  {
    aliases: ["windscribe"],
    name: "\u0648\u06CC\u0646\u062F\u0627\u0633\u06A9\u0631\u0627\u06CC\u0628",
    category: "other",
    emoji: "\u{1F4A8}",
    blurb: VPN_BLURB
  },
  {
    aliases: ["vyprvpn", "vypr vpn"],
    name: "\u0648\u0627\u06CC\u067E\u0631 \u0648\u06CC\u200C\u067E\u06CC\u200C\u0627\u0646",
    category: "other",
    emoji: "\u{1F9ED}",
    blurb: VPN_BLURB
  },
  {
    aliases: ["tunnelbear", "tunnel bear"],
    name: "\u062A\u0627\u0646\u0644\u200C\u0628\u06CC\u0631",
    category: "other",
    emoji: "\u{1F43B}",
    blurb: VPN_BLURB
  },
  {
    aliases: ["hide.me"],
    name: "\u0647\u0627\u06CC\u062F\u0645\u06CC",
    category: "other",
    emoji: "\u{1F648}",
    blurb: VPN_BLURB
  },
  {
    aliases: ["purevpn", "pure vpn"],
    name: "\u067E\u06CC\u0648\u0631 \u0648\u06CC\u200C\u067E\u06CC\u200C\u0627\u0646",
    category: "other",
    emoji: "\u{1F30D}",
    blurb: VPN_BLURB
  },
  {
    aliases: ["astrill"],
    name: "\u0627\u0633\u062A\u0631\u06CC\u0644",
    category: "other",
    emoji: "\u{1F6F0}\uFE0F",
    blurb: VPN_BLURB
  },
  {
    aliases: ["kaspersky"],
    name: "\u06A9\u0633\u067E\u0631\u0633\u06A9\u06CC",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    gradient: "from-emerald-600 via-teal-600 to-cyan-700",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["norton 360", "norton"],
    name: "\u0646\u0648\u0631\u062A\u0648\u0646",
    category: "other",
    emoji: "\u{1F510}",
    gradient: "from-yellow-400 via-amber-500 to-orange-600",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["mcafee"],
    name: "\u0645\u06A9\u200C\u0622\u0641\u06CC",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["bitdefender"],
    name: "\u0628\u06CC\u062A\u200C\u062F\u06CC\u0641\u0646\u062F\u0631",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["eset", "nod32"],
    name: "\u0627\u06CC\u0633\u062A",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["avast"],
    name: "\u0622\u0648\u0627\u0633\u062A",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["avg"],
    name: "\u0627\u06CC\u200C\u0648\u06CC\u200C\u062C\u06CC",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["avira"],
    name: "\u0622\u0648\u06CC\u0631\u0627",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["malwarebytes"],
    name: "\u0645\u0627\u0644\u0648\u0631\u0628\u0627\u06CC\u062A\u0633",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["trend micro"],
    name: "\u062A\u0631\u0646\u062F \u0645\u06CC\u06A9\u0631\u0648",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["totalav", "total av"],
    name: "\u062A\u0648\u062A\u0627\u0644 \u0627\u06CC\u200C\u0648\u06CC",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["sophos"],
    name: "\u0633\u0648\u0641\u0648\u0633",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["panda security", "panda dome"],
    name: "\u067E\u0627\u0646\u062F\u0627 \u0627\u0645\u0646\u06CC\u062A",
    category: "other",
    emoji: "\u{1F43C}",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["f-secure", "fsecure"],
    name: "\u0627\u0641\u200C\u0633\u06A9\u06CC\u0648\u0631",
    category: "other",
    emoji: "\u{1F6E1}\uFE0F",
    blurb: ANTIVIRUS_BLURB
  },
  {
    aliases: ["1password", "1 password"],
    name: "\u0648\u0627\u0646\u200C\u067E\u0633\u0648\u0631\u062F",
    category: "other",
    emoji: "\u{1F511}",
    blurb: PASSWORD_BLURB
  },
  {
    aliases: ["bitwarden"],
    name: "\u0628\u06CC\u062A\u200C\u0648\u0627\u0631\u062F\u0646",
    category: "other",
    emoji: "\u{1F510}",
    blurb: PASSWORD_BLURB
  },
  {
    aliases: ["dashlane"],
    name: "\u062F\u0634\u0644\u06CC\u0646",
    category: "other",
    emoji: "\u{1F5DD}\uFE0F",
    blurb: PASSWORD_BLURB
  },
  {
    aliases: ["nordpass"],
    name: "\u0646\u0648\u0631\u062F\u067E\u0633",
    category: "other",
    emoji: "\u{1F511}",
    blurb: PASSWORD_BLURB
  },
  {
    aliases: ["lastpass"],
    name: "\u0644\u0633\u062A\u200C\u067E\u0633",
    category: "other",
    emoji: "\u{1F5DD}\uFE0F",
    blurb: PASSWORD_BLURB
  },
  {
    aliases: ["keeper security", "keeper"],
    name: "\u06A9\u06CC\u067E\u0631",
    category: "other",
    emoji: "\u{1F510}",
    blurb: PASSWORD_BLURB
  },
  {
    aliases: ["adguard"],
    name: "\u0627\u062F\u06AF\u0627\u0631\u062F",
    category: "other",
    emoji: "\u{1F6AB}",
    blurb: "\u0645\u0633\u062F\u0648\u062F\u0633\u0627\u0632\u06CC \u062A\u0628\u0644\u06CC\u063A\u0627\u062A \u0648 \u0631\u062F\u06CC\u0627\u0628\u200C\u0647\u0627 \u0631\u0648\u06CC \u0647\u0645\u0647 \u062F\u0633\u062A\u06AF\u0627\u0647\u200C\u0647\u0627."
  }
];
var BRANDS = BRAND_RULES.map((rule) => ({
  ...rule,
  logoUrl: brandLogoUrl(BRAND_LOGO_DOMAINS[rule.aliases[0] ?? ""])
}));
var BRAND_ALIASES = BRANDS.flatMap(
  (brand) => brand.aliases.map((alias) => ({ alias, brand }))
).sort((a, b) => b.alias.length - a.alias.length);
var BRAND_NAME_MATCHERS = BRANDS.map((brand) => ({
  brand,
  needle: brand.name.replace(/[\u200c\u200e\u200f\s]/g, "")
})).sort((a, b) => b.needle.length - a.needle.length);
var TIER_RULES = [
  { tokens: ["ultimate"], label: "\u0627\u0648\u0644\u062A\u06CC\u0645\u06CC\u062A" },
  { tokens: ["premium", "prem"], label: "\u067E\u0631\u06CC\u0645\u06CC\u0648\u0645" },
  { tokens: ["family"], label: "\u062E\u0627\u0646\u0648\u0627\u062F\u06AF\u06CC" },
  { tokens: ["business"], label: "\u062A\u062C\u0627\u0631\u06CC" },
  { tokens: ["enterprise"], label: "\u0633\u0627\u0632\u0645\u0627\u0646\u06CC" },
  { tokens: ["team"], label: "\u062A\u06CC\u0645\u06CC" },
  { tokens: ["standard"], label: "\u0627\u0633\u062A\u0627\u0646\u062F\u0627\u0631\u062F" },
  { tokens: ["individual"], label: "\u0641\u0631\u062F\u06CC" },
  { tokens: ["personal"], label: "\u0634\u062E\u0635\u06CC" },
  { tokens: ["student"], label: "\u062F\u0627\u0646\u0634\u062C\u0648\u06CC\u06CC" },
  { tokens: ["duo"], label: "\u062F\u0648 \u0646\u0641\u0631\u0647" },
  { tokens: ["basic"], label: "\u067E\u0627\u06CC\u0647" },
  { tokens: ["starter"], label: "\u0627\u0633\u062A\u0627\u0631\u062A\u0631" },
  { tokens: ["advanced"], label: "\u0627\u062F\u0648\u0646\u0633" },
  { tokens: ["super"], label: "\u0633\u0648\u067E\u0631" },
  { tokens: ["max"], label: "\u0645\u06A9\u0633" },
  { tokens: ["plus"], label: "\u067E\u0644\u0627\u0633" },
  { tokens: ["pro"], label: "\u067E\u0631\u0648" },
  { tokens: ["lite"], label: "\u0644\u0627\u06CC\u062A" },
  { tokens: ["free"], label: "\u0631\u0627\u06CC\u06AF\u0627\u0646" },
  { tokens: ["lifetime"], label: "\u0645\u0627\u062F\u0627\u0645\u200C\u0627\u0644\u0639\u0645\u0631" },
  { tokens: ["trial"], label: "\u0622\u0632\u0645\u0627\u06CC\u0634\u06CC" }
];
var KIND_RULES = [
  { tokens: ["gift card", "giftcard", "voucher"], label: "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A" },
  { tokens: ["wallet top up", "top up", "wallet"], label: "\u06A9\u06CC\u0641 \u067E\u0648\u0644" },
  { tokens: ["license key", "activation key", "cd key", "product key", "key"], label: "\u06A9\u062F \u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC" },
  { tokens: ["subscription", "membership", "plan"], label: "\u0627\u0634\u062A\u0631\u0627\u06A9" },
  { tokens: ["account", "profile"], label: "\u0627\u06A9\u0627\u0646\u062A" }
];
var REGION_RULES = [
  { tokens: ["worldwide", "all regions", "global"], label: "", global: true },
  { tokens: ["turkey", "turkish"], label: "\u062A\u0631\u06A9\u06CC\u0647" },
  { tokens: ["argentina"], label: "\u0622\u0631\u0698\u0627\u0646\u062A\u06CC\u0646" },
  { tokens: ["brazil"], label: "\u0628\u0631\u0632\u06CC\u0644" },
  { tokens: ["canada"], label: "\u06A9\u0627\u0646\u0627\u062F\u0627" },
  { tokens: ["germany"], label: "\u0622\u0644\u0645\u0627\u0646" },
  { tokens: ["france"], label: "\u0641\u0631\u0627\u0646\u0633\u0647" },
  { tokens: ["united kingdom", "uk", "england"], label: "\u0627\u0646\u06AF\u0644\u06CC\u0633" },
  { tokens: ["united states", "usa", "us"], label: "\u0622\u0645\u0631\u06CC\u06A9\u0627" },
  { tokens: ["europe"], label: "\u0627\u0631\u0648\u067E\u0627" },
  { tokens: ["india"], label: "\u0647\u0646\u062F" },
  { tokens: ["japan"], label: "\u0698\u0627\u067E\u0646" },
  { tokens: ["uae", "emirates"], label: "\u0627\u0645\u0627\u0631\u0627\u062A" },
  { tokens: ["egypt"], label: "\u0645\u0635\u0631" },
  { tokens: ["nigeria"], label: "\u0646\u06CC\u062C\u0631\u06CC\u0647" },
  { tokens: ["pakistan"], label: "\u067E\u0627\u06A9\u0633\u062A\u0627\u0646" },
  { tokens: ["netherlands"], label: "\u0647\u0644\u0646\u062F" },
  { tokens: ["spain"], label: "\u0627\u0633\u067E\u0627\u0646\u06CC\u0627" },
  { tokens: ["italy"], label: "\u0627\u06CC\u062A\u0627\u0644\u06CC\u0627" },
  { tokens: ["poland"], label: "\u0644\u0647\u0633\u062A\u0627\u0646" },
  { tokens: ["russia"], label: "\u0631\u0648\u0633\u06CC\u0647" },
  { tokens: ["china"], label: "\u0686\u06CC\u0646" },
  { tokens: ["south korea", "korea"], label: "\u06A9\u0631\u0647" },
  { tokens: ["sweden"], label: "\u0633\u0648\u0626\u062F" },
  { tokens: ["switzerland"], label: "\u0633\u0648\u0626\u06CC\u0633" },
  { tokens: ["austria"], label: "\u0627\u062A\u0631\u06CC\u0634" },
  { tokens: ["belgium"], label: "\u0628\u0644\u0698\u06CC\u06A9" },
  { tokens: ["mexico"], label: "\u0645\u06A9\u0632\u06CC\u06A9" },
  { tokens: ["colombia"], label: "\u06A9\u0644\u0645\u0628\u06CC\u0627" },
  { tokens: ["chile"], label: "\u0634\u06CC\u0644\u06CC" },
  { tokens: ["peru"], label: "\u067E\u0631\u0648" },
  { tokens: ["south africa"], label: "\u0622\u0641\u0631\u06CC\u0642\u0627\u06CC \u062C\u0646\u0648\u0628\u06CC" },
  { tokens: ["saudi arabia", "saudi"], label: "\u0639\u0631\u0628\u0633\u062A\u0627\u0646" },
  { tokens: ["qatar"], label: "\u0642\u0637\u0631" },
  { tokens: ["kuwait"], label: "\u06A9\u0648\u06CC\u062A" },
  { tokens: ["iraq"], label: "\u0639\u0631\u0627\u0642" },
  { tokens: ["afghanistan"], label: "\u0627\u0641\u063A\u0627\u0646\u0633\u062A\u0627\u0646" }
];
var PHRASE_RULES = [
  ["delivery within 24 hours", "\u062A\u062D\u0648\u06CC\u0644 \u06A9\u0645\u062A\u0631 \u0627\u0632 \u06F2\u06F4 \u0633\u0627\u0639\u062A"],
  ["delivery within 1 hour", "\u062A\u062D\u0648\u06CC\u0644 \u06A9\u0645\u062A\u0631 \u0627\u0632 \u06F1 \u0633\u0627\u0639\u062A"],
  ["instant activation", "\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC \u0641\u0648\u0631\u06CC"],
  ["instant delivery", "\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC"],
  ["immediate delivery", "\u062A\u062D\u0648\u06CC\u0644 \u0641\u0648\u0631\u06CC"],
  ["lifetime access", "\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u0627\u062F\u0627\u0645\u200C\u0627\u0644\u0639\u0645\u0631"],
  ["private profile", "\u067E\u0631\u0648\u0641\u0627\u06CC\u0644 \u0627\u062E\u062A\u0635\u0627\u0635\u06CC"],
  ["personal account", "\u062D\u0633\u0627\u0628 \u0634\u062E\u0635\u06CC"],
  ["shared account", "\u0627\u06A9\u0627\u0646\u062A \u0627\u0634\u062A\u0631\u0627\u06A9\u06CC"],
  ["full warranty", "\u06AF\u0627\u0631\u0627\u0646\u062A\u06CC \u06A9\u0627\u0645\u0644"],
  ["with warranty", "\u0647\u0645\u0631\u0627\u0647 \u0628\u0627 \u06AF\u0627\u0631\u0627\u0646\u062A\u06CC"],
  ["offline download", "\u062F\u0627\u0646\u0644\u0648\u062F \u0622\u0641\u0644\u0627\u06CC\u0646"],
  ["4k ultra hd", "\u06F4K \u0627\u0648\u0644\u062A\u0631\u0627 \u0627\u0686\u200C\u062F\u06CC"],
  ["ultra hd", "\u0627\u0648\u0644\u062A\u0631\u0627 \u0627\u0686\u200C\u062F\u06CC"],
  ["high quality", "\u06A9\u06CC\u0641\u06CC\u062A \u0628\u0627\u0644\u0627"],
  ["no ads", "\u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A"],
  ["ad free", "\u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A"],
  ["ad-free", "\u0628\u062F\u0648\u0646 \u062A\u0628\u0644\u06CC\u063A"],
  ["renewable", "\u0642\u0627\u0628\u0644 \u062A\u0645\u062F\u06CC\u062F"],
  ["activation", "\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC"],
  ["subscription", "\u0627\u0634\u062A\u0631\u0627\u06A9"],
  ["account", "\u0627\u06A9\u0627\u0646\u062A"],
  ["gift card", "\u06AF\u06CC\u0641\u062A\u200C\u06A9\u0627\u0631\u062A"],
  ["support 24/7", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u06F2\u06F4 \u0633\u0627\u0639\u062A\u0647"],
  ["support", "\u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC"],
  ["instant", "\u0641\u0648\u0631\u06CC"],
  ["immediate", "\u0641\u0648\u0631\u06CC"],
  ["worldwide", "\u062C\u0647\u0627\u0646\u06CC"],
  ["global", "\u062C\u0647\u0627\u0646\u06CC"],
  ["lifetime", "\u0645\u0627\u062F\u0627\u0645\u200C\u0627\u0644\u0639\u0645\u0631"],
  ["warranty", "\u06AF\u0627\u0631\u0627\u0646\u062A\u06CC"],
  ["premium", "\u067E\u0631\u06CC\u0645\u06CC\u0648\u0645"],
  ["plus", "\u067E\u0644\u0627\u0633"],
  ["pro", "\u067E\u0631\u0648"]
];
var WORD_RULES = [
  ["with", "\u0647\u0645\u0631\u0627\u0647 \u0628\u0627"],
  ["and", "\u0648"],
  ["for", "\u0628\u0631\u0627\u06CC"],
  ["on", "\u0631\u0648\u06CC"],
  ["in", "\u062F\u0631"],
  ["to", ""],
  ["of", ""],
  ["the", ""],
  ["your", "\u0634\u062E\u0635\u06CC"],
  ["you", "\u0634\u0645\u0627"],
  ["all", "\u0647\u0645\u0647"],
  ["apps", "\u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627"],
  ["app", "\u0628\u0631\u0646\u0627\u0645\u0647"],
  ["months", "\u0645\u0627\u0647"],
  ["month", "\u0645\u0627\u0647"],
  ["days", "\u0631\u0648\u0632"],
  ["day", "\u0631\u0648\u0632"],
  ["years", "\u0633\u0627\u0644"],
  ["year", "\u0633\u0627\u0644"],
  ["hours", "\u0633\u0627\u0639\u062A"],
  ["hour", "\u0633\u0627\u0639\u062A"],
  ["minutes", "\u062F\u0642\u06CC\u0642\u0647"],
  ["minute", "\u062F\u0642\u06CC\u0642\u0647"],
  ["devices", "\u062F\u0633\u062A\u06AF\u0627\u0647\u200C\u0647\u0627"],
  ["device", "\u062F\u0633\u062A\u06AF\u0627\u0647"],
  ["users", "\u06A9\u0627\u0631\u0628\u0631\u0627\u0646"],
  ["user", "\u06A9\u0627\u0631\u0628\u0631"],
  ["streaming", "\u0627\u0633\u062A\u0631\u06CC\u0645"],
  ["music", "\u0645\u0648\u0633\u06CC\u0642\u06CC"],
  ["videos", "\u0648\u06CC\u062F\u06CC\u0648\u0647\u0627"],
  ["video", "\u0648\u06CC\u062F\u06CC\u0648"],
  ["movies", "\u0641\u06CC\u0644\u0645\u200C\u0647\u0627"],
  ["movie", "\u0641\u06CC\u0644\u0645"],
  ["games", "\u0628\u0627\u0632\u06CC\u200C\u0647\u0627"],
  ["game", "\u0628\u0627\u0632\u06CC"],
  ["storage", "\u0641\u0636\u0627\u06CC \u0630\u062E\u06CC\u0631\u0647\u200C\u0633\u0627\u0632\u06CC"],
  ["quality", "\u06A9\u06CC\u0641\u06CC\u062A"],
  ["unlimited", "\u0646\u0627\u0645\u062D\u062F\u0648\u062F"],
  ["access", "\u062F\u0633\u062A\u0631\u0633\u06CC"],
  ["official", "\u0631\u0633\u0645\u06CC"],
  ["original", "\u0627\u0648\u0631\u062C\u06CC\u0646\u0627\u0644"],
  ["secure", "\u0627\u0645\u0646"],
  ["fast", "\u0633\u0631\u06CC\u0639"],
  ["new", "\u062C\u062F\u06CC\u062F"]
];
var BADGE_RULES = [
  ["best seller", "\u067E\u0631\u0641\u0631\u0648\u0634\u200C\u062A\u0631\u06CC\u0646"],
  ["bestseller", "\u067E\u0631\u0641\u0631\u0648\u0634\u200C\u062A\u0631\u06CC\u0646"],
  ["top rated", "\u0628\u0631\u062A\u0631\u06CC\u0646"],
  ["popular", "\u0645\u062D\u0628\u0648\u0628"],
  ["trending", "\u067E\u0631\u0637\u0631\u0641\u062F\u0627\u0631"],
  ["hot", "\u067E\u0631\u0637\u0631\u0641\u062F\u0627\u0631"],
  ["limited", "\u0645\u062D\u062F\u0648\u062F"],
  ["exclusive", "\u0627\u062E\u062A\u0635\u0627\u0635\u06CC"],
  ["on sale", "\u062A\u062E\u0641\u06CC\u0641\u200C\u062F\u0627\u0631"],
  ["sale", "\u062A\u062E\u0641\u06CC\u0641\u200C\u062F\u0627\u0631"],
  ["deal", "\u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u0648\u06CC\u0698\u0647"],
  ["new", "\u062C\u062F\u06CC\u062F"]
];
function normalize(text) {
  return text.toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalize, "normalize");
function hasToken(text, token) {
  return tokenIndex(text, token) >= 0;
}
__name(hasToken, "hasToken");
function isAsciiAlphanumeric(code) {
  return code >= 97 && code <= 122 || code >= 48 && code <= 57;
}
__name(isAsciiAlphanumeric, "isAsciiAlphanumeric");
function tokenIndex(text, token) {
  let index = text.indexOf(token);
  while (index !== -1) {
    const before = index === 0 || !isAsciiAlphanumeric(text.charCodeAt(index - 1));
    const end = index + token.length;
    const after = end === text.length || !isAsciiAlphanumeric(text.charCodeAt(end));
    if (before && after) return index === 0 ? 0 : index - 1;
    if (index === text.length) break;
    index = text.indexOf(token, index + 1);
  }
  return -1;
}
__name(tokenIndex, "tokenIndex");
function matchBrand(text) {
  const alias = BRAND_ALIASES.find(({ alias: alias2 }) => hasToken(text, alias2))?.brand;
  if (alias) return alias;
  const compact = text.replace(/[\u200c\u200e\u200f\s]/g, "");
  return BRAND_NAME_MATCHERS.find(
    ({ needle }) => needle.length >= 3 && compact.includes(needle)
  )?.brand;
}
__name(matchBrand, "matchBrand");
function matchTiers(text) {
  const found = [];
  for (const rule of TIER_RULES) {
    const indexes = rule.tokens.map((token) => tokenIndex(text, token)).filter((index) => index >= 0);
    if (indexes.length === 0) continue;
    found.push({ label: rule.label, index: Math.min(...indexes) });
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((entry) => entry.label);
}
__name(matchTiers, "matchTiers");
var TITLE_EXTRAS = [
  { tokens: ["all apps", "all applications"], label: "\u0647\u0645\u0647 \u0628\u0631\u0646\u0627\u0645\u0647\u200C\u0647\u0627" },
  { tokens: ["api credits", "api credit"], label: "\u0627\u0639\u062A\u0628\u0627\u0631 API" }
];
function matchTitleExtra(text) {
  return TITLE_EXTRAS.find((entry) => entry.tokens.some((token) => hasToken(text, token)))?.label;
}
__name(matchTitleExtra, "matchTitleExtra");
function matchRegion(text) {
  const rule = REGION_RULES.find(
    (entry) => entry.tokens.some((token) => hasToken(text, token))
  );
  return rule?.global ? void 0 : rule?.label;
}
__name(matchRegion, "matchRegion");
var QUOTA_RE = /(?:tokens?|credits?|requests?|messages?|prompts?|words?|chars?|characters?|images?|gb|tb)\b/;
var COMPACT_MONTH_COUNTS = /* @__PURE__ */ new Set([1, 2, 3, 4, 6, 12, 24]);
function monthsToLabel(count, raw) {
  if (count === 12) return "\u06F1 \u0633\u0627\u0644\u0647";
  if (count > 12 && count % 12 === 0) return `${toPersianDigits(String(count / 12))} \u0633\u0627\u0644\u0647`;
  return `${toPersianDigits(raw)} \u0645\u0627\u0647\u0647`;
}
__name(monthsToLabel, "monthsToLabel");
function parseDuration(text) {
  const years = text.match(/(\d+)\s*(?:years?|yrs?|y)\b/);
  if (years) return `${toPersianDigits(years[1])} \u0633\u0627\u0644\u0647`;
  const months = text.match(/(\d+)\s*(?:months?|mon|mo)\b/);
  if (months) return monthsToLabel(Number(months[1]), months[1]);
  const compactMonths = text.match(/(\d+)\s*m\b/);
  if (compactMonths && !QUOTA_RE.test(text)) {
    const count = Number(compactMonths[1]);
    if (COMPACT_MONTH_COUNTS.has(count)) return monthsToLabel(count, compactMonths[1]);
  }
  const days = text.match(/(\d+)\s*(?:days?|d)\b/);
  if (days) {
    const count = Number(days[1]);
    if (count === 30) return "\u06F1 \u0645\u0627\u0647\u0647";
    if (count === 365 || count === 360) return "\u06F1 \u0633\u0627\u0644\u0647";
    return `${toPersianDigits(days[1])} \u0631\u0648\u0632\u0647`;
  }
  return void 0;
}
__name(parseDuration, "parseDuration");
function parseAmount(text) {
  const dollar = text.match(/\$\s*(\d+(?:\.\d+)?)/) ?? text.match(/(\d+(?:\.\d+)?)\s*(?:usd|dollars?|dollar)\b/);
  return dollar ? `${toPersianDigits(dollar[1])} \u062F\u0644\u0627\u0631\u06CC` : void 0;
}
__name(parseAmount, "parseAmount");
function parseQuota(text) {
  const match2 = text.match(
    /(\d+(?:\.\d+)?)\s*(million|m|k|thousand)?\s*(tokens?|credits?|messages?|words?)\b/
  );
  if (!match2) return void 0;
  const amount = Number(match2[1]);
  if (!Number.isFinite(amount) || amount <= 0) return void 0;
  const unit = match2[2];
  const quantity = unit === "million" || unit === "m" ? `${toPersianDigits(String(amount))} \u0645\u06CC\u0644\u06CC\u0648\u0646` : unit === "k" || unit === "thousand" ? `${toPersianDigits(String(amount))} \u0647\u0632\u0627\u0631` : toPersianDigits(String(amount));
  const noun = match2[3].toLowerCase();
  const label = noun.startsWith("token") ? "\u062A\u0648\u06A9\u0646" : noun.startsWith("credit") ? "\u0627\u0639\u062A\u0628\u0627\u0631" : noun.startsWith("message") ? "\u067E\u06CC\u0627\u0645" : "\u06A9\u0644\u0645\u0647";
  return `${quantity} ${label}`;
}
__name(parseQuota, "parseQuota");
function englishFallbackTitle(raw) {
  const cleaned = raw.replace(/[_/|]+/g, " ").replace(
    /\b\d+\s*(?:years?|yrs?|y|months?|mon|mo|m|days?|d|hours?|hrs?|minutes?|mins?)\b/gi,
    " "
  ).replace(/\b(?:global|worldwide|all regions)\b/gi, " ").replace(/\b(?:instant|immediate)\s+(?:delivery|activation)\b/gi, " ").replace(/\s+/g, " ").trim();
  return cleaned || raw.trim();
}
__name(englishFallbackTitle, "englishFallbackTitle");
function localizeTitle(raw, category, combinedText, combinedBrand) {
  if (!raw.trim()) return CATEGORY_TITLES[category];
  if (PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim();
  const text = normalize(raw);
  const brand = text === combinedText ? combinedBrand : matchBrand(text);
  const tiers = matchTiers(text);
  const explicitTiers = tiers.filter((tier) => !brand?.name.includes(tier));
  const tierLabels = explicitTiers.length > 0 ? explicitTiers.slice(0, 2) : brand?.tier ? [brand.tier] : [];
  const extra = matchTitleExtra(text);
  const duration = parseDuration(text);
  const quota = parseQuota(text);
  const region = matchRegion(text);
  const amount = parseAmount(text);
  const parts = [];
  if (brand) {
    parts.push(brand.name);
    for (const tier of tierLabels) {
      if (!brand.name.includes(tier)) parts.push(tier);
    }
  } else {
    const fallback = englishFallbackTitle(raw);
    const kindRule = KIND_RULES.find(
      (rule) => rule.tokens.some((token) => hasToken(text, token))
    );
    const nameHasKind = kindRule?.tokens.some((token) => hasToken(normalize(fallback), token)) ?? false;
    parts.push(kindRule && !nameHasKind ? `${kindRule.label} ${fallback}` : fallback);
    for (const tier of tierLabels) {
      const tierRule = TIER_RULES.find((rule) => rule.label === tier);
      const nameHasTier = tierRule?.tokens.some((token) => hasToken(normalize(fallback), token)) ?? false;
      if (!nameHasTier) parts.push(tier);
    }
  }
  if (extra) parts.push(extra);
  if (duration) parts.push(duration);
  if (quota && !duration) parts.push(quota);
  if (region) parts.push(region);
  if (amount) parts.push(amount);
  return parts.join(" ");
}
__name(localizeTitle, "localizeTitle");
function replaceTerm(text, source, target) {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startsAlphanumeric = /^[a-z0-9]/i.test(source);
  const endsAlphanumeric = /[a-z0-9]$/i.test(source);
  const prefix = startsAlphanumeric ? "(^|[^a-z0-9])" : "";
  const suffix = endsAlphanumeric ? "(?=$|[^a-z0-9])" : "";
  if (prefix) {
    return text.replace(new RegExp(`${prefix}${escaped}${suffix}`, "gi"), `$1${target}`);
  }
  return text.replace(new RegExp(`${escaped}${suffix}`, "gi"), target);
}
__name(replaceTerm, "replaceTerm");
var REPLACEMENT_RULES = [
  ...BRAND_ALIASES.map(({ alias, brand }) => [alias, brand.name]),
  ...PHRASE_RULES,
  ...WORD_RULES
];
function replacePhrases(raw) {
  let result = raw;
  let lower = result.toLowerCase();
  for (const [source, target] of REPLACEMENT_RULES) {
    if (!lower.includes(source)) continue;
    const next = replaceTerm(result, source, target);
    if (next !== result) {
      result = next;
      lower = result.toLowerCase();
    }
  }
  const normalized = result.replace(/\s*[,|]\s*/g, " \xB7 ").replace(/^\s*·\s*/, "").replace(/\s*·\s*$/, "").replace(/\s+/g, " ").trim();
  return toPersianDigits(normalized);
}
__name(replacePhrases, "replacePhrases");
function localizeSubtitle(raw, category) {
  if (raw?.trim()) {
    if (PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim();
    const translated = replacePhrases(raw);
    if (PERSIAN_RE.test(translated) && !LATIN_RE.test(translated)) return translated;
  }
  return CATEGORY_SUBTITLES[category];
}
__name(localizeSubtitle, "localizeSubtitle");
function localizeDescription(raw, category, title, brand) {
  if (raw?.trim() && PERSIAN_RE.test(raw)) return raw.trim();
  if (raw?.trim()) {
    const translated = replacePhrases(raw);
    if (PERSIAN_RE.test(translated) && !LATIN_RE.test(translated) && translated.length >= 25) {
      return translated;
    }
  }
  return `${title}\u061B ${brand?.blurb ?? CATEGORY_DESCRIPTIONS[category]}`;
}
__name(localizeDescription, "localizeDescription");
function localizeFeatures(raw, category) {
  const translated = (raw ?? []).map((feature) => {
    if (PERSIAN_RE.test(feature) && !LATIN_RE.test(feature)) return feature.trim();
    const next = replacePhrases(feature);
    return PERSIAN_RE.test(next) && !LATIN_RE.test(next) ? next : null;
  }).filter((feature) => feature !== null && feature.length > 0);
  const unique = Array.from(new Set(translated));
  if (unique.length >= 2) return unique.slice(0, 6);
  return Array.from(/* @__PURE__ */ new Set([...unique, ...CATEGORY_FEATURES[category]])).slice(0, 6);
}
__name(localizeFeatures, "localizeFeatures");
function localizeBadge(raw) {
  if (!raw?.trim()) return void 0;
  if (PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim();
  const text = normalize(raw);
  const exact = BADGE_RULES.find(([source]) => source === text);
  if (exact) return exact[1];
  const partial = BADGE_RULES.find(([source]) => text.includes(source));
  if (partial) return partial[1];
  const translated = replacePhrases(raw);
  return PERSIAN_RE.test(translated) && !LATIN_RE.test(translated) ? translated : void 0;
}
__name(localizeBadge, "localizeBadge");
function localizeDeliveryTime(raw) {
  if (!raw?.trim()) return void 0;
  if (PERSIAN_RE.test(raw) && !LATIN_RE.test(raw)) return raw.trim();
  const text = normalize(raw);
  if (/instant|immediate|within minutes|minutes/.test(text)) {
    const minutes = text.match(/(\d+)\s*(?:minutes?|mins?)/);
    return minutes ? `\u06A9\u0645\u062A\u0631 \u0627\u0632 ${toPersianDigits(minutes[1])} \u062F\u0642\u06CC\u0642\u0647` : "\u0641\u0648\u0631\u06CC";
  }
  const hours = text.match(/(\d+)\s*(?:hours?|hrs?)/);
  if (hours) return `\u06A9\u0645\u062A\u0631 \u0627\u0632 ${toPersianDigits(hours[1])} \u0633\u0627\u0639\u062A`;
  const days = text.match(/(\d+)\s*(?:days?|business days?)/);
  if (days) return `${toPersianDigits(days[1])} \u0631\u0648\u0632 \u06A9\u0627\u0631\u06CC`;
  if (/same day|today/.test(text)) return "\u0647\u0645\u0627\u0646 \u0631\u0648\u0632";
  return void 0;
}
__name(localizeDeliveryTime, "localizeDeliveryTime");
function sanitizeEmoji(value) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 8 || /[A-Za-z0-9]/.test(trimmed) || /\s/.test(trimmed)) {
    return void 0;
  }
  return trimmed;
}
__name(sanitizeEmoji, "sanitizeEmoji");
function resolveEmoji(upstream, brand, category) {
  if (brand?.emoji) return brand.emoji;
  const clean = sanitizeEmoji(upstream);
  if (clean) return clean;
  return CATEGORY_STYLE[category].emoji;
}
__name(resolveEmoji, "resolveEmoji");
function resolveGradient(upstream, brand, category) {
  const custom = upstream?.trim();
  if (custom && !GENERIC_GRADIENTS.has(custom)) return custom;
  return brand?.gradient ?? CATEGORY_STYLE[category].gradient;
}
__name(resolveGradient, "resolveGradient");
function localizeProviderProduct(product) {
  const text = normalize(`${product.title} ${product.subtitle ?? ""}`);
  const brand = matchBrand(text);
  const providerTitle = product.providerTitle ?? product.title;
  const category = product.customCategory ?? classifyProduct(providerTitle);
  const title = localizeTitle(product.title, category, text, brand);
  const description = product.faDescription ?? localizeDescription(product.description, category, title, brand);
  const rawDescription = product.description?.trim();
  return {
    ...product,
    providerTitle,
    category,
    title,
    subtitle: localizeSubtitle(product.subtitle, category),
    description,
    // The localized copy is generated for unrecognized English prose, so the
    // upstream text is kept verbatim for the product details sheet.
    providerDescription: product.providerDescription ?? (rawDescription && rawDescription !== description ? rawDescription : void 0),
    features: localizeFeatures(product.features, category),
    badge: localizeBadge(product.badge),
    deliveryTime: localizeDeliveryTime(product.deliveryTime),
    emoji: resolveEmoji(product.emoji, brand, category),
    // Real brand logo resolved at run time; persisted rows re-derive it from
    // the matched brand, and unknown brands keep whatever the row had.
    logoUrl: brand?.logoUrl ?? product.logoUrl,
    gradient: resolveGradient(product.gradient, brand, category),
    // A second localization pass sees the Persian title, so an existing key must
    // survive it for storefront curation to keep working.
    brandKey: brand?.key ?? product.brandKey
  };
}
__name(localizeProviderProduct, "localizeProviderProduct");

// api/sync.ts
var UPSTREAM_TIMEOUT_MS2 = 15e3;
var PRODUCTS_PER_BATCH = 50;
var RESPONSE_HEADERS11 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
var UPSERT_SQL = `
  INSERT INTO products (
    id, title, subtitle, category, price, old_price,
    provider_price, provider_old_price, provider_currency, currency,
    stock, rating, review_count, badge, delivery_time, description,
    features, gradient, emoji, brand_key, provider_description, provider_title, logo_url,
    synced_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    subtitle = excluded.subtitle,
    category = excluded.category,
    price = excluded.price,
    old_price = excluded.old_price,
    provider_price = excluded.provider_price,
    provider_old_price = excluded.provider_old_price,
    provider_currency = excluded.provider_currency,
    currency = excluded.currency,
    stock = excluded.stock,
    rating = excluded.rating,
    review_count = excluded.review_count,
    badge = excluded.badge,
    delivery_time = excluded.delivery_time,
    description = excluded.description,
    features = excluded.features,
    gradient = excluded.gradient,
    emoji = excluded.emoji,
    brand_key = excluded.brand_key,
    provider_description = excluded.provider_description,
    provider_title = excluded.provider_title,
    logo_url = excluded.logo_url,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at
`;
var SyncError = class extends Error {
  static {
    __name(this, "SyncError");
  }
  code;
  constructor(code, message, options) {
    super(message, options);
    this.name = "SyncError";
    this.code = code;
  }
};
function jsonResponse10(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS11 });
}
__name(jsonResponse10, "jsonResponse");
function describeCause3(value, depth = 0) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    const record = value;
    const name = typeof record.name === "string" ? record.name : void 0;
    const message = typeof record.message === "string" ? record.message : void 0;
    const code = typeof record.code === "string" ? record.code : void 0;
    if (name || message || code) {
      const nested = depth < 3 ? describeCause3(record.cause, depth + 1) : void 0;
      return {
        ...name ? { name } : {},
        ...message ? { message } : {},
        ...code ? { code } : {},
        ...nested !== void 0 ? { cause: nested } : {}
      };
    }
    if (depth >= 3) return String(value);
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return String(value);
}
__name(describeCause3, "describeCause");
function failureResponse2(error) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : String(error));
  const code = error instanceof SyncError ? error.code : "SYNC_UNEXPECTED";
  return jsonResponse10(
    {
      success: false,
      code,
      message: err.message,
      error: {
        name: err.name,
        message: err.message,
        cause: describeCause3(err.cause) ?? null
      }
    },
    500
  );
}
__name(failureResponse2, "failureResponse");
function resolveProviderUrl(raw) {
  let url;
  try {
    url = new URL(raw?.trim() || DEFAULT_PROVIDER_URL);
  } catch (cause) {
    throw new SyncError("SYNC_CONFIG_INVALID", "\u0646\u0634\u0627\u0646\u06CC \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A.", { cause });
  }
  if (url.protocol !== "https:") {
    throw new SyncError(
      "SYNC_CONFIG_INVALID",
      "\u0646\u0634\u0627\u0646\u06CC \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0628\u0627\u06CC\u062F \u0628\u0627 https \u0622\u063A\u0627\u0632 \u0634\u0648\u062F.",
      { cause: new Error(`Unsupported protocol: ${url.protocol}`) }
    );
  }
  return url;
}
__name(resolveProviderUrl, "resolveProviderUrl");
async function fetchProviderCatalog(providerUrl, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS2);
  let response;
  try {
    response = await fetch(providerUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": PROVIDER_USER_AGENT
      },
      signal: controller.signal
    });
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new SyncError(
        "SYNC_UPSTREAM_TIMEOUT",
        `\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u062F\u0631 ${UPSTREAM_TIMEOUT_MS2 / 1e3} \u062B\u0627\u0646\u06CC\u0647 \u0642\u0637\u0639 \u0634\u062F. \u0627\u06AF\u0631 \u0641\u0627\u06CC\u0631\u0648\u0627\u0644 \u0645\u0628\u062F\u0623 \u062A\u0631\u0627\u0641\u06CC\u06A9 Cloudflare \u0631\u0627 \u0628\u0644\u0627\u06A9 \u06A9\u0631\u062F\u0647 \u0628\u0627\u0634\u062F \u0627\u06CC\u0646 \u062E\u0637\u0627 \u0631\u062E \u0645\u06CC\u200C\u062F\u0647\u062F.`,
        { cause }
      );
    }
    throw new SyncError(
      "SYNC_UPSTREAM_UNREACHABLE",
      "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0633\u0631\u0648\u0631 \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F.",
      { cause }
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    let snippet = "";
    try {
      snippet = (await response.text()).slice(0, 500);
    } catch {
    }
    throw new SyncError(
      "SYNC_UPSTREAM_HTTP",
      `\u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0628\u0627 \u0648\u0636\u0639\u06CC\u062A HTTP ${response.status} \u067E\u0627\u0633\u062E \u062F\u0627\u062F.`,
      { cause: new Error(`HTTP ${response.status}${snippet ? `: ${snippet}` : ""}`) }
    );
  }
  const text = await response.text();
  if (text.length > MAX_PAYLOAD_BYTES) {
    throw new SyncError("SYNC_UPSTREAM_BAD_PAYLOAD", "\u067E\u0627\u0633\u062E \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0628\u06CC\u0634 \u0627\u0632 \u062D\u062F \u0628\u0632\u0631\u06AF \u0627\u0633\u062A.", {
      cause: new Error(`Payload ${text.length} bytes > ${MAX_PAYLOAD_BYTES} limit`)
    });
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new SyncError("SYNC_UPSTREAM_BAD_PAYLOAD", "\u067E\u0627\u0633\u062E \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 JSON \u0645\u0639\u062A\u0628\u0631 \u0646\u0628\u0648\u062F.", {
      cause
    });
  }
}
__name(fetchProviderCatalog, "fetchProviderCatalog");
function toBindings(product, syncedAt) {
  return [
    product.id,
    product.title,
    product.subtitle ?? null,
    product.category,
    product.price,
    product.oldPrice ?? null,
    product.providerPrice ?? null,
    product.providerOldPrice ?? null,
    product.providerCurrency ?? "USDT",
    product.currency,
    product.stock,
    product.rating ?? null,
    product.reviewCount ?? null,
    product.badge ?? null,
    product.deliveryTime ?? null,
    product.description ?? null,
    product.features && product.features.length > 0 ? JSON.stringify(product.features) : null,
    product.gradient ?? null,
    product.emoji ?? null,
    product.brandKey ?? null,
    product.providerDescription ?? null,
    product.providerTitle ?? product.title,
    product.logoUrl ?? null,
    syncedAt,
    syncedAt,
    syncedAt
  ];
}
__name(toBindings, "toBindings");
async function writeProducts(db, products, syncedAt) {
  let batches = 0;
  const statement = db.prepare(UPSERT_SQL);
  let statements = [];
  for (let index = 0; index < products.length; index += 1) {
    statements.push(statement.bind(...toBindings(products[index], syncedAt)));
    if (statements.length < PRODUCTS_PER_BATCH && index + 1 < products.length) continue;
    try {
      await db.batch(statements);
    } catch (cause) {
      throw new SyncError(
        "SYNC_DB_WRITE_FAILED",
        `\u062B\u0628\u062A ${statements.length} \u0645\u062D\u0635\u0648\u0644 \u062F\u0631 D1 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F (\u062F\u0633\u062A\u0647 ${batches + 1}).`,
        { cause }
      );
    }
    batches += 1;
    statements = [];
  }
  return batches;
}
__name(writeProducts, "writeProducts");
async function writeSyncMeta(db, usdtRate, syncedAt) {
  try {
    await db.prepare(
      `INSERT INTO sync_meta (key, value, updated_at) VALUES ('usdt_rate', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(String(usdtRate), syncedAt).run();
  } catch (cause) {
    throw new SyncError("SYNC_DB_WRITE_FAILED", "\u062B\u0628\u062A \u0646\u0631\u062E USDT \u062F\u0631 D1 \u0646\u0627\u0645\u0648\u0641\u0642 \u0628\u0648\u062F.", { cause });
  }
}
__name(writeSyncMeta, "writeSyncMeta");
async function onRequestPost17(context) {
  try {
    const apiKey = context.env.ACCOUNTS_PROVIDER_API_KEY?.trim();
    if (!apiKey) {
      throw new SyncError(
        "SYNC_CONFIG_MISSING",
        "\u06A9\u0644\u06CC\u062F API \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u062F\u0631 \u0645\u062D\u06CC\u0637 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A."
      );
    }
    const db = context.env.DB;
    if (!db) {
      throw new SyncError(
        "SYNC_DB_NOT_CONFIGURED",
        "\u0627\u062A\u0635\u0627\u0644 \u067E\u0627\u06CC\u06AF\u0627\u0647\u200C\u062F\u0627\u062F\u0647 D1 (binding \xABDB\xBB) \u062F\u0631 \u0645\u062D\u06CC\u0637 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A."
      );
    }
    const providerUrl = resolveProviderUrl(context.env.ACCOUNTS_PROVIDER_BASE_URL);
    const usdtRate = resolveUsdtRate(context.env.USDT_RATE_TOMAN);
    const payload = await fetchProviderCatalog(providerUrl, apiKey);
    const rows = extractRows(payload);
    if (!rows) {
      throw new SyncError(
        "SYNC_UPSTREAM_BAD_PAYLOAD",
        "\u0633\u0627\u062E\u062A\u0627\u0631 \u06A9\u0627\u062A\u0627\u0644\u0648\u06AF \u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0646\u0627\u0645\u0639\u062A\u0628\u0631 \u0627\u0633\u062A (\u0622\u0631\u0627\u06CC\u0647 \u06CC\u0627 \u06A9\u0644\u06CC\u062F data/products \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F)."
      );
    }
    const products = [];
    const seen = /* @__PURE__ */ new Set();
    let skipped = 0;
    for (const row of rows) {
      const normalized = normalizeProduct(row, usdtRate);
      if (!normalized || seen.has(normalized.id)) {
        skipped += 1;
        continue;
      }
      seen.add(normalized.id);
      products.push(localizeProviderProduct(normalized));
    }
    if (products.length === 0) {
      throw new SyncError(
        "SYNC_EMPTY_CATALOGUE",
        "\u0627\u0631\u0627\u0626\u0647\u200C\u062F\u0647\u0646\u062F\u0647 \u0647\u06CC\u0686 \u0645\u062D\u0635\u0648\u0644 \u0645\u0639\u062A\u0628\u0631\u06CC \u0628\u0631\u0646\u06AF\u0631\u062F\u0627\u0646\u062F."
      );
    }
    const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
    const batches = await writeProducts(db, products, syncedAt);
    await writeSyncMeta(db, usdtRate, syncedAt);
    return jsonResponse10({
      success: true,
      data: {
        products,
        synced: products.length,
        skipped,
        batches,
        syncedAt,
        usdtRate
      },
      meta: {
        count: products.length,
        skipped,
        fetchedAt: syncedAt,
        usdtRate
      }
    });
  } catch (error) {
    return failureResponse2(error);
  }
}
__name(onRequestPost17, "onRequestPost");

// api/wallet.ts
var INIT_DATA_MAX_AGE_SECONDS3 = 24 * 60 * 60;
var TRANSACTION_LIMIT = 20;
var RESPONSE_HEADERS12 = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};
function jsonResponse11(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS12 });
}
__name(jsonResponse11, "jsonResponse");
function failure10(status, code, message) {
  return jsonResponse11({ success: false, code, message }, status);
}
__name(failure10, "failure");
function toHex4(buffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(toHex4, "toHex");
function timingSafeEqual3(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
__name(timingSafeEqual3, "timingSafeEqual");
async function hmacSha2563(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
}
__name(hmacSha2563, "hmacSha256");
async function verifyInitData3(initData, botToken) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = await hmacSha2563(new TextEncoder().encode("WebAppData"), botToken);
  const signature = toHex4(await hmacSha2563(secretKey, dataCheckString));
  if (!timingSafeEqual3(signature, hash.toLowerCase())) return null;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  if (Date.now() / 1e3 - authDate > INIT_DATA_MAX_AGE_SECONDS3) return null;
  const rawUser = params.get("user");
  if (!rawUser) return null;
  try {
    const parsed = JSON.parse(rawUser);
    const id = Number(parsed.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      id,
      username: typeof parsed.username === "string" ? parsed.username : void 0,
      first_name: typeof parsed.first_name === "string" ? parsed.first_name : void 0,
      last_name: typeof parsed.last_name === "string" ? parsed.last_name : void 0
    };
  } catch {
    return null;
  }
}
__name(verifyInitData3, "verifyInitData");
async function authenticate4(request, env) {
  const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
  const initData = request.headers.get("X-Telegram-Init-Data")?.trim();
  if (initData) {
    if (!botToken) {
      return {
        ok: false,
        status: 500,
        code: "SERVER_NOT_CONFIGURED",
        message: "\u062A\u0648\u06A9\u0646 \u0631\u0628\u0627\u062A \u062F\u0631 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0633\u0631\u0648\u0631 \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A."
      };
    }
    const user = await verifyInitData3(initData, botToken);
    if (!user) {
      return {
        ok: false,
        status: 401,
        code: "TELEGRAM_AUTH_INVALID",
        message: "\u0646\u0634\u0633\u062A \u062A\u0644\u06AF\u0631\u0627\u0645 \u0645\u0639\u062A\u0628\u0631 \u0646\u06CC\u0633\u062A. \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u062F\u0648\u0628\u0627\u0631\u0647 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
      };
    }
    return { ok: true, user };
  }
  const demoTelegramId = Number(env.PURCHASE_DEMO_TELEGRAM_ID);
  if (Number.isInteger(demoTelegramId) && demoTelegramId > 0) {
    return { ok: true, user: { id: demoTelegramId, first_name: "\u06A9\u0627\u0631\u0628\u0631 \u0622\u0632\u0645\u0627\u06CC\u0634\u06CC" } };
  }
  return {
    ok: false,
    status: 401,
    code: "TELEGRAM_AUTH_REQUIRED",
    message: "\u0628\u0631\u0627\u06CC \u062F\u06CC\u062F\u0646 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0628\u0627\u06CC\u062F \u0645\u06CC\u0646\u06CC\u200C\u0627\u067E \u0631\u0627 \u0627\u0632 \u062F\u0627\u062E\u0644 \u062A\u0644\u06AF\u0631\u0627\u0645 \u0628\u0627\u0632 \u06A9\u0646\u06CC\u062F."
  };
}
__name(authenticate4, "authenticate");
function userIdFor5(user) {
  return `usr_tg_${user.id}`;
}
__name(userIdFor5, "userIdFor");
async function ensureUser2(db, user, now) {
  await db.prepare(
    `INSERT INTO users (id, telegram_id, username, first_name, last_name, balance, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, 'IRT', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         username = excluded.username,
         first_name = excluded.first_name,
         last_name = excluded.last_name,
         updated_at = excluded.updated_at`
  ).bind(
    userIdFor5(user),
    user.id,
    user.username ?? null,
    user.first_name ?? null,
    user.last_name ?? null,
    now,
    now
  ).run();
}
__name(ensureUser2, "ensureUser");
async function onRequestGet18(context) {
  const auth = await authenticate4(context.request, context.env);
  if (!auth.ok) return failure10(auth.status, auth.code, auth.message);
  const db = context.env.DB;
  if (!db) return failure10(503, "DB_NOT_CONFIGURED", "\u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u062F\u0631 \u0633\u0631\u0648\u0631 \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const userId = userIdFor5(auth.user);
  try {
    await ensureUser2(db, auth.user, now);
  } catch {
    return failure10(503, "DB_UNAVAILABLE", "\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u067E\u0627\u06CC\u06AF\u0627\u0647 \u062F\u0627\u062F\u0647 \u0628\u0631\u0642\u0631\u0627\u0631 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
  }
  let balance;
  let lifetimeSpent;
  let pendingReceipts = 0;
  let rows;
  try {
    const user = await db.prepare("SELECT balance FROM users WHERE id = ?").bind(userId).first();
    if (!user) return failure10(500, "USER_NOT_FOUND", "\u062D\u0633\u0627\u0628 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
    balance = Number(user.balance);
    const spent = await db.prepare(
      `SELECT COALESCE(SUM(-amount), 0) AS spent FROM wallet_transactions
         WHERE user_id = ? AND type = 'purchase'`
    ).bind(userId).first();
    lifetimeSpent = Number(spent?.spent ?? 0);
    try {
      const pendingRow = await db.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS pending FROM payment_receipts
           WHERE user_id = ? AND purpose = 'wallet_topup' AND status = 'PENDING'`
      ).bind(userId).first();
      pendingReceipts = Number(pendingRow?.pending ?? 0);
    } catch {
      pendingReceipts = 0;
    }
    const result = await db.prepare(
      `SELECT id, type, amount, currency, description, reference, created_at
         FROM wallet_transactions
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
    ).bind(userId, TRANSACTION_LIMIT).all();
    rows = result.results ?? [];
  } catch {
    return failure10(503, "DB_UNAVAILABLE", "\u062E\u0648\u0627\u0646\u062F\u0646 \u06A9\u06CC\u0641 \u067E\u0648\u0644 \u0627\u0646\u062C\u0627\u0645 \u0646\u0634\u062F. \u062F\u0648\u0628\u0627\u0631\u0647 \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.");
  }
  return jsonResponse11({
    success: true,
    data: {
      balance,
      currency: "IRT",
      pending: pendingReceipts,
      lifetimeSpent,
      transactions: rows.map((row) => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        currency: "IRT",
        status: "completed",
        description: row.description,
        createdAt: row.created_at,
        reference: row.reference ?? void 0
      }))
    }
  });
}
__name(onRequestGet18, "onRequestGet");

// ../.wrangler/tmp/pages-uYSjhO/functionsRoutes-0.07499403060973386.mjs
var routes = [
  {
    routePath: "/api/admin/static-ip/nodes/action",
    mountPath: "/api/admin/static-ip/nodes",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/admin/static-ip/plans/action",
    mountPath: "/api/admin/static-ip/plans",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/admin/auth/request-otp",
    mountPath: "/api/admin/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/admin/auth/session",
    mountPath: "/api/admin/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/admin/auth/verify-otp",
    mountPath: "/api/admin/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/admin/orders/action",
    mountPath: "/api/admin/orders",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/admin/products/delete",
    mountPath: "/api/admin/products",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/admin/products/override",
    mountPath: "/api/admin/products",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/admin/receipts/action",
    mountPath: "/api/admin/receipts",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/admin/settings/bank",
    mountPath: "/api/admin/settings",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/admin/settings/bank",
    mountPath: "/api/admin/settings",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api/admin/settings/margins",
    mountPath: "/api/admin/settings",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/admin/settings/margins",
    mountPath: "/api/admin/settings",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost10]
  },
  {
    routePath: "/api/admin/static-ip/nodes",
    mountPath: "/api/admin/static-ip",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/admin/static-ip/plans",
    mountPath: "/api/admin/static-ip",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/admin/wallet/adjust",
    mountPath: "/api/admin/wallet",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost11]
  },
  {
    routePath: "/api/admin/orders",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/admin/receipts",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/api/admin/users",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet8]
  },
  {
    routePath: "/api/auth/session",
    mountPath: "/api/auth",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet9]
  },
  {
    routePath: "/api/auth/telegram",
    mountPath: "/api/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost12]
  },
  {
    routePath: "/api/provider/products",
    mountPath: "/api/provider",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet10]
  },
  {
    routePath: "/api/static-ip/download",
    mountPath: "/api/static-ip",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet11]
  },
  {
    routePath: "/api/static-ip/download",
    mountPath: "/api/static-ip",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost13]
  },
  {
    routePath: "/api/static-ip/nodes",
    mountPath: "/api/static-ip",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet12]
  },
  {
    routePath: "/api/static-ip/plans",
    mountPath: "/api/static-ip",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet13]
  },
  {
    routePath: "/api/static-ip/resend",
    mountPath: "/api/static-ip",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost14]
  },
  {
    routePath: "/api/static-ip/services",
    mountPath: "/api/static-ip",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet14]
  },
  {
    routePath: "/api/wallet/receipt",
    mountPath: "/api/wallet",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost15]
  },
  {
    routePath: "/api/bank",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet15]
  },
  {
    routePath: "/api/orders",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet16]
  },
  {
    routePath: "/api/products",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet17]
  },
  {
    routePath: "/api/purchase",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost16]
  },
  {
    routePath: "/api/sync",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost17]
  },
  {
    routePath: "/api/wallet",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet18]
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function getOriginalPathPrefix(requestPath, normalizedPrefix) {
  let end = 0;
  for (let index = 0; index < normalizedPrefix.length; index++) {
    end++;
    if (normalizedPrefix[index] === "/") {
      while (requestPath[end] === "/") {
        end++;
      }
    }
  }
  return requestPath.slice(0, end);
}
__name(getOriginalPathPrefix, "getOriginalPathPrefix");
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  const normalizedRequestPath = requestPath.replace(/\/+/g, "/");
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath) || routeMatcher(normalizedRequestPath);
    const originalMountMatch = mountMatcher(requestPath);
    const mountMatchResult = originalMountMatch || mountMatcher(normalizedRequestPath);
    if (matchResult && mountMatchResult) {
      const path = originalMountMatch ? originalMountMatch.path : getOriginalPathPrefix(requestPath, mountMatchResult.path);
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
