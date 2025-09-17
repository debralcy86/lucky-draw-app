// projects/api/handlers/whoami.mjs
import { verifyTelegramInitData } from '../_lib/telegramVerify.mjs';

function send(res, status, obj) {
  res.setHeader?.('Content-Type', 'application/json');
  res.status?.(status).send?.(JSON.stringify(obj));
  // If you're using fetch-style Response in your router, you can adapt:
  // return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

export default async function whoami(req, res) {
  try {
    if (req.method !== 'POST') {
      return send(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    // Safe body parse for @vercel/node
    let body = {};
    try {
      if (typeof req.body === 'object' && req.body !== null) {
        body = req.body;
      } else if (typeof req.body === 'string') {
        body = JSON.parse(req.body || '{}');
      } else {
        // Some runtimes give you a raw buffer
        const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
        body = raw ? JSON.parse(raw) : {};
      }
    } catch {
      body = {};
    }

    // Accept initData from JSON body or Authorization: tma <raw>
    const auth = (req.headers?.authorization || req.headers?.Authorization || '').toString();
    const fromHeader = auth.startsWith('tma ') ? auth.slice(4).trim() : '';
    const initData = typeof body.initData === 'string' && body.initData
      ? body.initData
      : fromHeader;
    if (!initData) {
      return send(res, 400, { ok: false, reason: 'missing_initData' });
    }

    // Verify signed init data
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) {
      return send(res, 500, { ok: false, reason: 'missing_bot_token' });
    }

    const result = verifyTelegramInitData(initData, token);
    if (!result?.ok) {
      return send(res, 401, { ok: false, reason: 'bad_initData' });
    }

    const userId = String(result.user?.id || result.user_id || result.userId || '');
    const admins = String(process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const isAdmin = admins.includes(userId);
    return send(res, 200, {
      ok: true,
      rid: result.rid,          // if your helper returns a request id
      // camelCase (preferred by UI)
      userId,
      isAdmin,
      // snake_case for backward compatibility
      user_id: userId,
      is_admin: isAdmin,
    });
  } catch (err) {
    console.error('whoami handler error:', err);
    return send(res, 500, { ok: false, error: 'server_error' });
  }
}
