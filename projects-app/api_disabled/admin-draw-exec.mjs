export const config = { runtime: 'nodejs' };

import { verifyTelegramInitData } from '../api-lib/telegramVerify.mjs';

function parseAdminIds(list) {
  return (list || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function readBody(req) {
  let raw = '';
  await new Promise((resolve) => {
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', resolve);
    req.on('error', resolve);
  });
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const cronHeader = String(req.headers['x-cron-key'] || '').trim();
  const cronSecret = String(process.env.CRON_KEY || process.env.CRON_SECRET || '').trim();
  const body = await readBody(req);
  const initData = body?.initData || '';

  let authorized = false;
  if (cronSecret && cronHeader && cronHeader === cronSecret) {
    authorized = true;
  } else {
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!botToken) {
      return send(res, 500, { ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' });
    }
    const allowList = parseAdminIds(process.env.ADMIN_USER_IDS);
    const verified = verifyTelegramInitData(String(initData), botToken);
    const tgUserId = verified?.data?.user?.id ? String(verified.data.user.id) : '';
    if (verified.ok && (!allowList.length || (tgUserId && allowList.includes(tgUserId)))) {
      authorized = true;
    }
  }

  if (!authorized) {
    return send(res, 401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const base = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const target = new URL('/api/draw-scheduler', base);
    if (body?.force) target.searchParams.set('force', String(body.force));

    const fetchHeaders = cronSecret ? { 'x-cron-key': cronSecret } : {};
    const resp = await fetch(target.toString(), { method: 'GET', headers: fetchHeaders });
    const data = await resp.json().catch(() => ({ ok: false, error: 'Invalid JSON from scheduler' }));
    return send(res, resp.status, data);
  } catch (err) {
    return send(res, 500, { ok: false, error: err?.message || String(err) });
  }
}
