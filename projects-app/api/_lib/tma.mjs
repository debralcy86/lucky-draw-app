// api/_lib/tma.mjs
import { verifyTma } from './telegramVerify.mjs';  // you already have this
import { applyCors } from './cors.mjs';            // you already have this

export function getInitDataFromReq(req) {
  // Accept the same sources everywhere
  const h = req.headers || {};
  const auth = String(h.authorization || h.Authorization || '');
  const fromAuth = auth.startsWith('tma ') ? auth.slice(4).trim() : '';

  const fromHeader =
    h['x-telegram-initdata'] ||
    h['x-telegram-init-data'] ||
    h['X-Telegram-InitData'] ||
    '';

  const fromQuery =
    (req.method === 'GET' && req.query?.initData) ||
    (req.method !== 'GET' && req.body?.initData) ||
    '';

  // Choose first non-empty; do NOT double-decode
  return String(fromAuth || fromHeader || fromQuery || '').trim();
}

// HOF wrapper: uniform CORS + Telegram verification (optionally gate admin)
export function withTMA(handler, { requireAdmin = false } = {}) {
  return applyCors(async (req, res) => {
    const initData = getInitDataFromReq(req);
    if (!initData) {
      return res.status(401).json({ ok: false, error: 'missing_init_data' });
    }

    const v = await verifyTma(initData);  // returns { ok, user, userId, isAdmin, reason?, tag? }
    if (!v?.ok) {
      return res.status(401).json({ ok: false, error: 'invalid_init_data', reason: v?.reason || 'verify_failed' });
    }
    if (requireAdmin && !v.isAdmin) {
      return res.status(403).json({ ok: false, error: 'not_admin' });
    }

    // Attach for downstream use
    req.tma = v;               // { user, userId, isAdmin, tag, ... }
    req.tmaInitData = initData;

    return handler(req, res);
  });
}