import { verifyTelegramAuth } from './_lib/telegramVerify.js';
import { createClient } from '@supabase/supabase-js';
import { hashPin } from './_lib/pin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const auth = verifyTelegramAuth(req);
  if (!auth.ok) return res.status(401).json({ ok: false, reason: auth.error });

  const { username, contact, pin } = req.body || {};
  if (!username || !contact || !pin) return res.status(400).json({ ok: false, reason: 'missing_fields' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const user_id = auth.userId;

  const { data: existing, error: selErr } = await supabase
    .from('profiles')
    .select('user_id, needs_pin_reset')
    .eq('user_id', user_id)
    .maybeSingle();
  if (selErr) return res.status(500).json({ ok: false, reason: 'select_failed' });

  const pin_hash = hashPin(pin);

  if (!existing) {
    const { error } = await supabase.from('profiles').insert({ user_id, username, contact, pin_hash, needs_pin_reset: false });
    if (error) return res.status(500).json({ ok: false, reason: 'insert_failed' });
    return res.status(200).json({ ok: true, tag: 'register/v1.0', userId: user_id });
  }

  if (existing.needs_pin_reset === true) {
    const { error } = await supabase
      .from('profiles')
      .update({ username, contact, pin_hash, needs_pin_reset: false })
      .eq('user_id', user_id);
    if (error) return res.status(500).json({ ok: false, reason: 'reset_update_failed' });
    return res.status(200).json({ ok: true, tag: 'register/v1.0-reset', userId: user_id });
  }

  return res.status(409).json({ ok: false, reason: 'already_registered' });
}
