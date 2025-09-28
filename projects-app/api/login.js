import { verifyTelegramAuth } from './_lib/telegramVerify.js';
import { createClient } from '@supabase/supabase-js';
import { verifyPin } from './_lib/pin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const auth = verifyTelegramAuth(req);
  if (!auth.ok) return res.status(401).json({ ok: false, reason: auth.error });

  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ ok: false, reason: 'missing_pin' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const user_id = auth.userId;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('pin_hash, username, contact, needs_pin_reset')
    .eq('user_id', user_id)
    .single();

  if (error) return res.status(404).json({ ok: false, reason: 'not_registered' });
  if (profile.needs_pin_reset === true) return res.status(409).json({ ok: false, reason: 'pin_reset_required' });

  const ok = verifyPin(pin, profile.pin_hash);
  if (!ok) return res.status(401).json({ ok: false, reason: 'invalid_pin' });

  return res.status(200).json({ ok: true, tag: 'login/v1.0', userId: user_id, username: profile.username });
}
