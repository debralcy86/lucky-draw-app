export const config = { runtime: 'nodejs' };

import { verifyTelegramInitData } from '../api-lib/telegramVerify.mjs';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST,OPTIONS');
      return send(res, 405, { ok: false, error: 'Method Not Allowed' });
    }

    const body = parseBody(req);
    const authHeader = (req.headers?.authorization || req.headers?.Authorization || '').toString();
    const initFromHeader = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : '';
    const initData = typeof body?.initData === 'string' && body.initData ? body.initData : initFromHeader;
    if (!initData) {
      return send(res, 400, { ok: false, reason: 'missing_initData' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!botToken) {
      return send(res, 500, { ok: false, reason: 'missing_bot_token' });
    }

    const result = verifyTelegramInitData(initData, botToken);
    if (!result?.ok) {
      return send(res, 401, { ok: false, reason: 'bad_initData', details: result?.reason });
    }

    const tgUser = result?.data?.user || {};
    const userId = tgUser?.id ? String(tgUser.id) : '';
    const admins = String(process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const isAdmin = userId && admins.includes(userId);

    return send(res, 200, {
      ok: true,
      userId,
      isAdmin,
      user_id: userId,
      is_admin: isAdmin,
      user: tgUser || null,
    });
  } catch (err) {
    console.error('whoami handler error:', err);
    return send(res, 500, { ok: false, error: 'server_error' });
  }
}
