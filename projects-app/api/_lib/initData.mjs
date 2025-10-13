const isObject = (value) => value && typeof value === 'object';

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fromBodyMaybe(body) {
  if (!body) return '';

  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) return '';
    try {
      const parsed = JSON.parse(trimmed);
      const fromParsed = fromBodyMaybe(parsed);
      if (fromParsed) return fromParsed;
    } catch {
      return trimmed;
    }
    return trimmed;
  }

  if (Buffer.isBuffer(body)) {
    const text = body.toString('utf8').trim();
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      const fromParsed = fromBodyMaybe(parsed);
      if (fromParsed) return fromParsed;
    } catch {
      return text;
    }
    return text;
  }

  if (!isObject(body)) return '';

  const directKeys = [
    'initData',
    'initdata',
    'init_data',
    'tgWebAppData',
    'tma',
    'authorization',
    'auth',
    'token',
  ];

  for (const key of directKeys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim();
      if (key === 'authorization' || key === 'auth' || key === 'token') {
        if (trimmed.startsWith('tma ')) {
          return trimmed.slice(4).trim();
        }
      }
      return trimmed;
    }
  }

  if (typeof body.headers === 'object' && body.headers !== null) {
    const nested = fromBodyMaybe(body.headers);
    if (nested) return nested;
  }

  if (typeof body.payload === 'string' && body.payload.includes('auth_date')) {
    return body.payload.trim();
  }

  if (typeof body.telegram === 'object' && body.telegram !== null) {
    const nested = fromBodyMaybe(body.telegram);
    if (nested) return nested;
  }

  return '';
}

export function extractInitData(req, bodyOverride) {
  const headers = req?.headers || {};
  const authHeader = normalize(headers.authorization || headers.Authorization || '');
  const fromHeader = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : '';

  const telegramHeader =
    normalize(headers['x-telegram-initdata'] || headers['x-telegram-init-data'] || headers['x-telegram-auth']);

  const queryInit =
    typeof req?.query?.initData === 'string'
      ? req.query.initData.trim()
      : (typeof req?.query?.tgWebAppData === 'string' ? req.query.tgWebAppData.trim() : '');

  const bodySource = fromBodyMaybe(bodyOverride !== undefined ? bodyOverride : req?.body);

  return fromHeader || bodySource || telegramHeader || queryInit || '';
}

export default extractInitData;
