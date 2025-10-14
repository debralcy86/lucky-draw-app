import { validate, parse } from '@telegram-apps/init-data-node';

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let data = '';
  for await (const chunk of req) data += chunk;
  try { return data ? JSON.parse(data) : {}; } catch { return {}; }
}

export async function extractInitData(req) {
  const h = req.headers || {};
  const auth = String(h.authorization || h.Authorization || '');
  if (auth.startsWith('tma ')) return auth.slice(4).trim();

  let init = '';
  if (req.method === 'POST') {
    const body = await readJson(req);
    init = body && typeof body.initData === 'string' ? body.initData : '';
    if (init) return init;
    req.body = body;
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    const q = url.searchParams.get('initData');
    if (q) return q;
  } catch {}

  return '';
}

export function verifyTma(initData, botToken) {
  if (!initData) return { ok: false, error: 'missing_init_data' };
  if (!botToken) return { ok: false, error: 'missing_bot_token' };
  try {
    validate(initData, botToken);
    const data = parse(initData);
    const userId = data && data.user && data.user.id ? String(data.user.id) : '';
    if (!userId) return { ok: false, error: 'no_user_in_initdata' };
    return { ok: true, userId, data };
  } catch (e) {
    return { ok: false, error: 'invalid_init_data', detail: String(e && e.message || e) };
  }
}

export async function requireTma(req, res) {
  const initData = await extractInitData(req);
  const v = verifyTma(initData, process.env.TELEGRAM_BOT_TOKEN);
  if (!v.ok) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok:false, error:v.error, detail:v.detail || null }));
    return null;
  }
  return { initData, userId: v.userId, tma: v.data };
}
