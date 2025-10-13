const DEFAULT_ALLOWED = [
  'https://projects-app-sepia.vercel.app',
  'https://lucky-draw-app-azure.vercel.app',
  'https://lucky-draw-admin-nu.vercel.app',
];

const DEFAULT_ALLOW_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Telegram-InitData',
  'X-Telegram-Init-Data',
  'X-Debug-RID',
  'x-cron-key',
].join(', ');

const DEFAULT_ALLOW_METHODS = 'GET, POST, OPTIONS';

function parseOriginList(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ensureVary(res, value) {
  const prev = res.getHeader('Vary');
  if (!prev) {
    res.setHeader('Vary', value);
  } else if (!String(prev).split(',').map((v) => v.trim()).includes(value)) {
    res.setHeader('Vary', `${prev}, ${value}`);
  }
}

export function setCorsHeaders(res, origin = '', options = {}) {
  const envOrigins = [
    ...parseOriginList(process.env.CORS_ORIGIN),
    ...parseOriginList(process.env.ADMIN_ORIGIN),
  ];
  const configuredOrigins = envOrigins.length ? envOrigins : DEFAULT_ALLOWED;

  const allowOrigins = Array.isArray(options.allowOrigins)
    ? options.allowOrigins
    : configuredOrigins;

  const allowAll = allowOrigins.includes('*');
  const allowVercel = options.allowVercelSubdomains ?? true;
  const originAllowed =
    allowAll ||
    (origin && allowOrigins.includes(origin)) ||
    (origin && options.allowWildcardSubdomains && allowOrigins.some((allowed) => allowed.startsWith('*.') && origin.endsWith(allowed.slice(1)))) ||
    (origin && allowVercel && origin.endsWith('.vercel.app'));

  if (originAllowed) {
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (allowAll) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  } else if (!res.getHeader('Access-Control-Allow-Origin')) {
    if (allowAll) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }

  ensureVary(res, 'Origin');

  const allowHeaders = options.allowHeaders || DEFAULT_ALLOW_HEADERS;
  const allowMethods = options.allowMethods || DEFAULT_ALLOW_METHODS;
  const allowCredentials = options.allowCredentials ?? true;

  res.setHeader('Access-Control-Allow-Headers', allowHeaders);
  res.setHeader('Access-Control-Allow-Methods', allowMethods);

  if (allowCredentials) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

export function withCors(handler, options = {}) {
  return async function corsWrapped(req, res) {
    const origin = req.headers?.origin || '';
    setCorsHeaders(res, origin, options);

    if (req.method === 'OPTIONS') {
      const status = options.preflightStatus || 204;
      res.statusCode = status;
      if (options.preflightBody !== undefined) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          typeof options.preflightBody === 'string'
            ? options.preflightBody
            : JSON.stringify(options.preflightBody)
        );
      } else {
        res.end();
      }
      return;
    }

    return handler(req, res);
  };
}

export default withCors;
