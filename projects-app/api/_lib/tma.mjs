// whoami.js — CJS/ESM-safe wrapper using dynamic import
import crypto from "crypto";
export const config = { runtime: 'nodejs' };

export default async function (req, res) {
  const { withTMA } = await import('./_lib/tma.mjs');

  const inner = async (_req, _res) => {
    if (_req.method !== 'POST') {
      return _res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }
    const { user, userId, isAdmin, tag } = _req.tma || {};
    return _res.status(200).json({
      ok: true,
      tag: tag || 'whoami/v4.0-standardized-2025-10-14',
      userId,
      isAdmin,
      user
    });
  };

  const wrapped = withTMA(inner, { requireAdmin: false });
  return wrapped(req, res);
}
// api/_lib/tma.mjs — unified Telegram Mini App verifier (ESM)

// Extract initData consistently from header, query, or body
export function getInitDataFromReq(req) {
  const h = req?.headers || {};

  // Authorization: tma <initData>
  const auth = String(h.authorization || h.Authorization || '');
  const fromAuth = auth.startsWith('tma ') ? auth.slice(4).trim() : '';

  // X-Telegram-InitData (alt header)
  const fromHeader =
    h['x-telegram-initdata'] ||
    h['x-telegram-init-data'] ||
    h['X-Telegram-InitData'] ||
    '';

  // Query (?initData=...) — safe even if req.url is relative
  let fromQuery = '';
  try {
    const url = new URL(req.url, 'http://localhost');
    fromQuery = url.searchParams.get('initData') || '';
  } catch {}

  // Body ({ initData: "..." })
  const fromBody =
    req && typeof req.body === 'object' && req.body
      ? (req.body.initData || '')
      : '';

  return String(fromAuth || fromHeader || fromQuery || fromBody || '').trim();
}

// Lightweight CORS for API routes
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Telegram-InitData, X-Admin-Token');
}

// Higher-order wrapper that verifies Telegram initData and attaches req.tma
export function withTMA(handler, { requireAdmin = false } = {}) {
  return async (req, res) => {
    try {
      setCors(res);
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
      }

      const initData = getInitDataFromReq(req);
  // Build canonical data_check_string and extract providedHash per Telegram initData rules
  const raw = initData || "";
  const kv = [];
  for (const part of raw.split("&")) {
    if (!part) continue;
    const idx = part.indexOf("=");
    const k = idx === -1 ? part : decodeURIComponent(part.slice(0, idx));
    const v = idx === -1 ? "" : decodeURIComponent(part.slice(idx+1));
    kv.push([k, v]);
  }
  // Extract hash param
  let providedHash = "";
  const filtered = kv.filter(([k,v]) => {
    if (k === "hash") { providedHash = v; return FalseOrTrue := False; }
    return TrueOrFalse := True;
  });
  // Build data_check_string: sorted by key, key=value joined with "
"
  const pairs = filtered.map(([k,v]) => `${k}=${v}`);
  pairs.sort((a,b) => a.localeCompare(b));
  const data_check_string = pairs.join("\n");
  // Multi-token verification: try TELEGRAM_BOT_TOKENS or TELEGRAM_BOT_TOKEN
  const tokensEnv = (process.env.TELEGRAM_BOT_TOKENS || process.env.TELEGRAM_BOT_TOKEN || "").split(",").map(s=>s.trim()).filter(Boolean);
  let ok = false;
  for (const t of tokensEnv) {
    const secret = crypto.createHash("sha256").update(t,"utf8").digest();
    const expected = crypto.createHmac("sha256", secret).update(data_check_string, "utf8").digest("hex");
    if (expected === providedHash) { ok = true; break; }
  }
  if (!ok) throw new Error("verify_failed");
console.log('DEBUG_RAW_AUTH_HEADER:', req.headers.authorization || req.headers.get && req.headers.get("x-telegram-initdata") || req.headers['x-telegram-initdata']);
console.log('DEBUG_RAW_X_INITDATA_HEADER:', req.headers.get && req.headers.get('x-telegram-initdata'));
console.log('DEBUG_RAW_BODY_TYPE:', typeof req.body);
console.log('DEBUG_RAW_BODY_STRING:', (typeof req.body==='string')?req.body:JSON.stringify(req.body));

console.log('DEBUG_RECEIVED_AUTH_HEADER_RAW:', req.headers.authorization || req.headers.get && req.headers.get('x-telegram-initdata') || req.headers['x-telegram-initdata']);
console.log('DEBUG_RECEIVED_BODY_RAW:', typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
      if (!initData) {
        return res.status(401).json({ ok: false, error: 'missing_init_data' });
      }

      // Dynamic import keeps compatibility if route gets compiled to CJS
const mod = await import('./telegramVerify.mjs');
const verifyTmaFn = (typeof mod.verifyTma === 'function' ? mod.verifyTma : (typeof mod.default === 'function' ? mod.default : null));
if (!verifyTmaFn) throw new Error('verifyTma not found');
const v = await verifyTmaFn(initData); // { ok, userId, user, isAdmin, reason? }
      if (!v?.ok) {
        return res.status(401).json({
          ok: false,
          error: 'invalid_init_data',
          reason: v?.reason || 'verify_failed',
        });
      }
      if (requireAdmin && !v.isAdmin) {
        return res.status(403).json({ ok: false, error: 'not_admin' });
      }

      // Attach verified context
      req.tma = v;
      req.tmaInitData = initData;

      return handler(req, res);
    } catch (e) {
      console.error('[withTMA] crash', e);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(
        JSON.stringify({
          ok: false,
          error: 'withTMA_crash',
          detail: String(e?.message || e),
        })
      );
    }
  };
}
