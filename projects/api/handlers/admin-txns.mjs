export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from './telegramVerify.mjs';

function maskUser(userId) {
  if (!userId) return '';
  const s = String(userId);
  if (s.length <= 6) return s;
  return s.slice(0, 3) + '***' + s.slice(-3);
}

function parseAdminIds(env) {
  return (env || '').split(',').map(s => s.trim()).filter(Boolean);
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

  const authHeader = (req.headers?.authorization || req.headers?.Authorization || '').toString();
  const initFromHeader = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : '';
  const { initData: initFromBody } = body || {};
  const initData = initFromBody || initFromHeader;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allow = parseAdminIds(process.env.ADMIN_USER_IDS);
  const v = verifyInitData(String(initData || ''), botToken);
  if (!v.ok || (allow.length > 0 && !allow.includes(String(v.userId || '')))) {
    res.statusCode = 401;
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: 'Missing Supabase envs' }));
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  try {
    const { data, error } = await supabase
      .from('wallet_txns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const txns = (data || []).map(tx => ({
      id: tx.id,
      user_id: maskUser(tx.user_id),
      user_mask: maskUser(tx.user_id),
      type: tx.type,
      amount: tx.amount,
      balance_after: tx.balance_after,
      note: tx.note,
      created_at: tx.created_at,
    }));

    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true, txns }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
