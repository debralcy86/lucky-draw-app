// Simple CORS wrapper for Vercel Functions
// Allowed methods: GET, POST, OPTIONS
// Origin: process.env.APP_ORIGIN || '*'

const DEFAULT_METHODS = ['GET', 'POST', 'OPTIONS'];
const DEFAULT_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Admin-Token',
  'x-admin-token',
  'X-Cron-Key',
  'x-cron-key',
  'X-Telegram-InitData',
  'X-Debug-RID',
];

export function withCors(handler, options = {}) {
  const {
    methods = DEFAULT_METHODS,
    headers = DEFAULT_HEADERS,
    exposeHeaders = [],
    allowCredentials = false,
    origin = process.env.APP_ORIGIN || '*',
  } = options;

  const allowMethodsHeader = methods.join(',');
  const allowHeadersHeader = headers.join(', ');
  const exposeHeadersHeader = exposeHeaders.length ? exposeHeaders.join(', ') : null;

  return async function corsWrapped(req, res) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', allowMethodsHeader);
    res.setHeader('Access-Control-Allow-Headers', allowHeadersHeader);
    if (exposeHeadersHeader) {
      res.setHeader('Access-Control-Expose-Headers', exposeHeadersHeader);
    }
    if (allowCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    if (!methods.includes(req.method)) {
      res.setHeader('Allow', allowMethodsHeader);
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    return handler(req, res);
  };
}

