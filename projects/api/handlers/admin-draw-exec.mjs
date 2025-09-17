export const config = { runtime: 'nodejs' };

import { verifyInitData } from './telegramVerify.mjs';

function parseAdminIds(env) {
  return (env || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  // Parse JSON body
  let raw = '';
  await new Promise(r => { req.on('data', c => raw += c); req.on('end', r); });
  let body = {};
  try { body = JSON.parse(raw || '{}'); } catch {}

  const { initData, force } = body || {};
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allow = parseAdminIds(process.env.ADMIN_USER_IDS);
  const v = verifyInitData(String(initData || ''), botToken);
  if (!v.ok || (allow.length > 0 && !allow.includes(String(v.userId || '')))) {
    res.statusCode = 401;
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    return;
  }

  try {
    const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const cron = String(process.env.CRON_KEY || '').trim();
    const url = `${base}/api/draw-scheduler?force=${encodeURIComponent(force || '')}`;
    const headers = {};
    if (cron) headers['x-cron-key'] = cron;

    const resp = await fetch(url, { method: 'GET', headers });
    const data = await resp.json().catch(() => ({ ok:false, error:'Invalid JSON from scheduler' }));
    res.statusCode = resp.status;
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
