export const config = { runtime: 'nodejs' };
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import verifyInitData, { verifyTelegramInitData } from '../_lib/telegramVerify.mjs';
import { withCors } from '../_lib/cors.mjs';
import extractInitData from '../_lib/initData.mjs';

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Missing server configuration' });
  }

  let initData = extractInitData(req);
  if (!initData) {
    const body = await readJsonBody(req);
    initData = extractInitData(req, body);
  }
  if (!initData) return res.status(401).json({ ok: false, error: 'missing_initdata' });

  const check = verifyTelegramInitData(initData, TELEGRAM_BOT_TOKEN) || verifyInitData(initData, TELEGRAM_BOT_TOKEN);
  if (!check?.ok) return res.status(401).json({ ok: false, error: check?.error || 'invalid_tma' });
  const userId = String(check.userId || check.user?.id || check.user?.user?.id || '');
  if (!userId) return res.status(400).json({ ok: false, error: 'invalid_user' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = sha(`${code}:${userId}`);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('pin_reset_tokens')
    .upsert({ user_id: userId, otp_hash: otpHash, expires_at: expiresAt });

  if (error) return res.status(500).json({ ok: false, error: 'otp_upsert_failed' });

  let sent = false;
  try {
    const resp = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: userId, text: `Your PIN reset code: ${code}\nExpires in 10 minutes.` })
    });
    sent = resp.ok;
  } catch {}

  return res.status(200).json({ ok: true, sent, expires_at: expiresAt });
}

export default withCors(handler, { methods: ['POST', 'OPTIONS'] });

async function readJsonBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try { return req.body ? JSON.parse(req.body) : {}; } catch { return {}; }
    }
    if (req.body && typeof req.body === 'object') {
      return req.body;
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}
