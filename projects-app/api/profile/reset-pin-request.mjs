export const config = { runtime: 'nodejs' };
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import verifyInitData, { verifyTelegramInitData } from '../_lib/telegramVerify.mjs';

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, DEBUG_ALLOW_OTP } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Missing server configuration' });
  }

  const auth = (req.headers.authorization || req.headers.Authorization || '').toString();
  const initData = auth.startsWith('tma ') ? auth.slice(4).trim() : '';
  if (!initData) return res.status(401).json({ ok: false, error: 'missing_tma_header' });

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

  if (String(DEBUG_ALLOW_OTP) === '1') {
    return res.status(200).json({ ok: true, sent, code, expires_at: expiresAt });
  }
  return res.status(200).json({ ok: true, sent, expires_at: expiresAt });
}
