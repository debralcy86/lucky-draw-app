// Telegram Mini App middleware: extracts initData from multiple sources and verifies it
export function getInitDataFromReq(req) {
  const h = req?.headers || {};
  const auth = String(h.authorization || h.Authorization || '');
  const fromAuth = auth.startsWith('tma ') ? auth.slice(4).trim() : '';

  const fromHeader = String(
    h['x-telegram-initdata'] ||
    h['x-telegram-init-data'] ||
    h['X-Telegram-InitData'] ||
    ''
  );

  let fromQuery = '';
  try { const url = new URL(req.url, 'http://localhost'); fromQuery = url.searchParams.get('initData') || ''; } catch {}

  const fromBody = req && typeof req.body === 'object' && req.body ? (req.body.initData || '') : '';

  let raw = String(fromAuth || fromHeader || fromQuery || fromBody || '').trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  return raw;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Telegram-InitData, X-Admin-Token, X-Cron-Key, X-Debug-RID');
}

export function withTMA(handler, { requireAdmin = false } = {}) {
  return async (req, res) => {
    try {
      setCors(res);
      if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

      const initData = getInitDataFromReq(req);
      if (!initData) return res.status(401).json({ ok: false, reason: 'missing_tma_header' });

      try {
        if (!/(^|&)?hash=/.test(initData)) {
          const sp = new URLSearchParams(initData);
          const keys = Array.from(sp.keys());
          return res.status(400).json({ ok: false, reason: 'verify_failed', message: '"hash" parameter is missing', keys });
        }
      } catch {
        return res.status(400).json({ ok: false, reason: 'verify_failed', message: 'initData not URLSearchParams-parseable' });
      }

      const mod = await import('./telegramVerify.mjs');
      const verifyTma = mod.verifyTma ?? mod.default ?? mod.verifyTelegramInitData;
      if (typeof verifyTma !== 'function') {
        return res.status(500).json({ ok: false, reason: 'telegram_verify_export_invalid' });
      }

      const v = await verifyTma(initData);
      if (!v?.ok) return res.status(401).json({ ok: false, reason: v?.reason || 'verify_failed' });
      if (requireAdmin && !v.isAdmin) return res.status(403).json({ ok: false, reason: 'not_admin' });

      req.tma = v;
      req.tmaInitData = initData;

      return handler(req, res);
    } catch (e) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ ok: false, reason: 'withTMA_crash', detail: String(e?.message || e) }));
    }
  };
}
