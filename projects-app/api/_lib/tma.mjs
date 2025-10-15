// api/_lib/tma.mjs — Telegram Mini App middleware (single-bot)

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

  // Query (?initData=...)
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

  let raw = String(fromAuth || fromHeader || fromQuery || fromBody || '').trim();
  // If someone accidentally wrapped the initData in quotes when passing via header/body, strip one pair of quotes.
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    raw = raw.slice(1, -1);
  }
  return raw;
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
      if (!initData) {
        return res.status(401).json({ ok: false, error: 'missing_init_data' });
      }
      // Diagnostic: ensure raw initData actually contains a hash
      try {
        if (!/(^|&)?hash=/.test(initData)) {
          const sp = new URLSearchParams(initData);
          const keys = Array.from(sp.keys());
          return res.status(400).json({ ok: false, error: 'verify_failed', message: '"hash" parameter is missing', keys });
        }
      } catch (_) {
        // If initData isn't even parseable as URL params, signal clearly
        return res.status(400).json({ ok: false, error: 'verify_failed', message: 'initData not URLSearchParams-parseable' });
      }

      // Import verifier (single-bot). Accept named or default export.
      const mod = await import('./telegramVerify.mjs');
      const verifyTma = mod.verifyTma ?? mod.default;
      if (typeof verifyTma !== 'function') {
        return res.status(500).json({ ok: false, error: 'telegram_verify_export_invalid' });
      }

      const v = await verifyTma(initData); // { ok, userId, user, isAdmin, reason? }
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
