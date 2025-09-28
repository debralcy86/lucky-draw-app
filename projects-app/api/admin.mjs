import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import verifyInitData, { verifyTelegramInitData } from './_lib/telegramVerify.mjs';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers','Content-Type');
}
function ok(res, data) { return res.status(200).json({ ok: true, ...data }); }
function bad(res, error) { return res.status(400).json({ ok: false, reason: error }); }
function err(res, error) { return res.status(500).json({ ok: false, reason: error }); }

function parseTMA(req, botToken) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  if (!h || !h.toString().startsWith('tma ')) return { ok: false };
  const initData = h.toString().slice(4).trim();
  const check = verifyTelegramInitData(initData, botToken) || verifyInitData(initData, botToken);
  if (!check?.ok) return { ok: false };
  const userId = String(check.userId || check.user?.id || check.user?.user?.id || '');
  if (!userId) return { ok: false };
  return { ok: true, userId };
}

function isAdminViaHeader(req, adminToken) {
  const t = req.headers['x-admin-token'];
  return !!adminToken && !!t && String(t) === String(adminToken);
}

function isAdminViaTMA(req, botToken, adminIdsCsv) {
  if (!botToken || !adminIdsCsv) return false;
  const parsed = parseTMA(req, botToken);
  if (!parsed.ok) return false;
  const allow = new Set(String(adminIdsCsv).split(',').map(s => s.trim()).filter(Boolean));
  return allow.has(parsed.userId);
}

async function readJSON(req) {
  if (typeof req?.json === 'function') {
    try { return await req.json(); } catch {}
  }
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reason: 'Method Not Allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, ADMIN_TOKEN, ADMIN_USER_IDS } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return err(res, 'server_misconfig');

  const authed = isAdminViaHeader(req, ADMIN_TOKEN) || isAdminViaTMA(req, TELEGRAM_BOT_TOKEN, ADMIN_USER_IDS);
  if (!authed) return res.status(401).json({ ok: false, reason: 'unauthorized' });

  const body = await readJSON(req);
  if (!body || typeof body !== 'object') return bad(res, 'invalid_json');
  const action = String(body.action || '').trim();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (action === 'ping') {
    return ok(res, { pong: true });
  }

  if (action === 'metrics') {
    const r1 = await supabase.from('profiles').select('user_id', { count: 'exact', head: true });
    const r2 = await supabase.from('wallets').select('user_id,balance');
    const r3 = await supabase.from('wallet_txns').select('id', { count: 'exact', head: true });
    if (r1.error) return err(res, 'profiles_count_failed');
    if (r2.error) return err(res, 'wallets_select_failed');
    if (r3.error) return err(res, 'txns_count_failed');
    const totalBalance = (r2.data || []).reduce((s, w) => s + (Number(w.balance) || 0), 0);
    return ok(res, {
      metrics: {
        profiles: r1.count || 0,
        wallets: (r2.data || []).length,
        total_balance: totalBalance,
        txns: r3.count || 0
      }
    });
  }

  if (action === 'credit') {
    const userId = String(body.userId || '').trim();
const txType = (delta >= 0) ? 'credit' : 'debit';
    const delta = Number(body.delta);
    const note = (body.note == null ? '' : String(body.note)).slice(0, 200);
    if (!userId) return bad(res, 'missing_user');
    if (!Number.isFinite(delta) || delta === 0) return bad(res, 'invalid_delta');

    const wUp = await supabase
      .from('wallets')
      .upsert({ user_id: userId, balance: 0 }, { onConflict: 'user_id' })
      .select('user_id,balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (wUp.error) return err(res, 'wallet_upsert_failed');

    const wUpd = await supabase.rpc('wallet_increment_balance', { p_user_id: userId, p_delta: delta }).then(r => {
      if (r.error && r.error.code === 'PGRST204') return null;
      return r;
    });

    if (!wUpd || wUpd.error) {
      const wSel = await supabase.from('wallets').select('balance').eq('user_id', userId).maybeSingle();
      const newBal = (Number(wSel.data?.balance) || 0) + delta;
      const wSet = await supabase.from('wallets').update({ balance: newBal }).eq('user_id', userId);
      if (wSet.error) return err(res, 'wallet_update_failed');
    }

    const txn = await supabase.from('wallet_txns').insert([{ user_id: userId, delta, note: (note && note.length) ? note : null }]).select('id').maybeSingle();
if (txn.error) { console.error('admin.credit txn error', txn.error); return err(res, 'txn_insert_failed'); }

    const wNow = await supabase.from('wallets').select('user_id,balance').eq('user_id', userId).maybeSingle();
    if (wNow.error) return err(res, 'wallet_fetch_failed');

    return ok(res, { user_id: userId, balance: Number(wNow.data?.balance) || 0, applied: delta });
  }

  return bad(res, 'unknown_action');
}