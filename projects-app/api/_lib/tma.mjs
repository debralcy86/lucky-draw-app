import { withCors } from './cors.mjs';
import { verifyTma } from './telegramVerify.mjs';

function getHeaderValue(req, name) {
  const headers = req?.headers;
  if (!headers) return undefined;
  if (typeof headers.get === 'function') {
    return (
      headers.get(name) ||
      headers.get(name.toLowerCase()) ||
      headers.get(name.toUpperCase()) ||
      undefined
    );
  }
  const lower = name.toLowerCase();
  return headers[name] || headers[lower] || headers[name.toUpperCase()];
}

function normalizeAdminIds(source) {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source
      .flat()
      .map((value) => String(value).trim())
      .filter(Boolean);
  }
  return String(source)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getInitDataFromReq(req) {
  if (!req) return '';

  const authHeader = getHeaderValue(req, 'authorization') || '';
  let fromAuth = '';
  if (authHeader) {
    const value = String(authHeader);
    if (value.startsWith('tma ')) {
      fromAuth = value.slice(4).trim();
    } else if (value.startsWith('Bearer ')) {
      fromAuth = value.slice(7).trim();
    }
  }

  const fromHeader =
    getHeaderValue(req, 'x-telegram-initdata') ||
    getHeaderValue(req, 'x-telegram-init-data') ||
    getHeaderValue(req, 'X-Telegram-InitData') ||
    '';

  let fromQuery = '';
  if (req.query && typeof req.query === 'object') {
    const q = req.query;
    fromQuery =
      q.initData ||
      q.initdata ||
      q.init_data ||
      q.telegram_init_data ||
      '';
  }

  let fromBody = '';
  const body = req.body;
  if (body && typeof body === 'object') {
    fromBody =
      body.initData ||
      body.initdata ||
      body.init_data ||
      body.telegram_init_data ||
      '';
  }

  let raw = String(fromAuth || fromHeader || fromQuery || fromBody || '').trim();
  if (!raw) return '';

  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1);
  }

  return raw;
}

export function withTMA(handler, options = {}) {
  const {
    requireAdmin = false,
    botTokens,
    adminIds,
    cors: corsOptions,
  } = options || {};

  return withCors(async (req, res) => {
    try {
      const initData = getInitDataFromReq(req);
      if (!initData) {
        return res.status(401).json({ ok: false, error: 'missing_init_data' });
      }

      const tokensSource =
        botTokens ??
        process.env.TELEGRAM_BOT_TOKENS ??
        process.env.TELEGRAM_BOT_TOKEN;

      const verification = await verifyTma(initData, tokensSource);
      if (!verification?.ok) {
        return res.status(401).json({
          ok: false,
          error: 'invalid_init_data',
          reason: verification?.reason || 'verify_failed',
        });
      }

      const adminSource =
        adminIds ??
        process.env.ADMIN_USER_IDS ??
        process.env.TELEGRAM_ADMIN_IDS ??
        '';
      const adminSet = new Set(normalizeAdminIds(adminSource));

      const userId =
        verification.userId != null ? String(verification.userId) : '';
      const envIsAdmin = userId && adminSet.has(userId);
      const derivedIsAdmin =
        typeof verification.isAdmin === 'boolean'
          ? verification.isAdmin || envIsAdmin
          : envIsAdmin;

      const context = {
        ...verification,
        userId,
        isAdmin: derivedIsAdmin,
      };

      req.tma = context;
      req.tmaInitData = initData;

      if (requireAdmin && !context.isAdmin) {
        return res.status(403).json({ ok: false, error: 'not_admin' });
      }

      return handler(req, res);
    } catch (err) {
      console.error('[withTMA] crash', err);
      return res.status(500).json({
        ok: false,
        error: 'withTMA_crash',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }, corsOptions);
}
