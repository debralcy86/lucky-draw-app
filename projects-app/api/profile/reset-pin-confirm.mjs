export const config = { runtime: 'nodejs' };
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import verifyInitData, { verifyTelegramInitData } from '../_lib/telegramVerify.mjs';
import { hashPin } from '../_lib/pin.js';
import { withCors } from '../_lib/cors.mjs';

function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

async function readJSON(rq) {
  if (rq && typeof rq.json === 'function') {
    try { return await rq.json(); } catch {}
  }
  try {
    const chunks = [];
    for await (const chunk of rq) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN } = process.env;
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

  const body = await readJSON(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }
  const code = String(body.code || '').trim();
  const newPin = String(body.newPin || '').trim();

  if (!/^[0-9]{6}$/.test(code)) return res.status(400).json({ ok: false, error: 'invalid_code' });
  if (!/^[0-9]{4,6}$/.test(newPin)) return res.status(400).json({ ok: false, error: 'invalid_pin' });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const { data: tokenRow, error: tErr } = await supabase
    .from('pin_reset_tokens')
    .select('user_id, otp_hash, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (tErr) return res.status(500).json({ ok: false, error: 'otp_select_failed' });
  if (!tokenRow) return res.status(400).json({ ok: false, error: 'no_reset_requested' });
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) return res.status(400).json({ ok: false, error: 'code_expired' });

  const expected = sha(`${code}:${userId}`);
  if (expected !== tokenRow.otp_hash) return res.status(400).json({ ok: false, error: 'code_mismatch' });

  const pinHash = hashPin(newPin);

  const { error: uErr } = await supabase
    .from('profiles')
    .update({ pin_hash: pinHash, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (uErr) return res.status(500).json({ ok: false, error: 'pin_update_failed' });

  await supabase.from('pin_reset_tokens').delete().eq('user_id', userId);

  return res.status(200).json({ ok: true, reset: true });
}

export default withCors(handler, { methods: ['POST', 'OPTIONS'] });
