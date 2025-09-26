// projects-app/api/admin.mjs  // TAG: admin.mjs v1
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from '../api-lib/telegramVerify.mjs';

// --- shared helpers ---
function parseAdminIds(env) {
  return (env || '').split(',').map(s => s.trim()).filter(Boolean);
}
function json(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  await new Promise(r => { req.on('data', c => raw += c); req.on('end', r); });
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
function authFrom(req, body) {
  const h = (req.headers?.authorization || req.headers?.Authorization || '').toString();
  const fromHeader = h.startsWith('tma ') ? h.slice(4).trim() : '';
  const fromBody = body?.initData ? String(body.initData).trim() : '';
  return fromBody || fromHeader;
}
function maskUser(uid = '') {
  const s = String(uid);
  if (!s) return '';
  return s.length <= 4 ? '****' : '****' + s.slice(-4);
}

// --- route handlers (inlined from your existing files) ---

async function handleAdminTxns(req, res, env) {
  const rid = Math.random().toString(36).slice(2,10);
  const { TELEGRAM_BOT_TOKEN, ADMIN_USER_IDS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
  const body = await readJson(req);
  const initData = authFrom(req, body);
  const allow = parseAdminIds(ADMIN_USER_IDS);
  const v = verifyInitData(String(initData || ''), TELEGRAM_BOT_TOKEN);
  if (!v.ok || (allow.length && !allow.includes(String(v.userId || '')))) {
    return json(res, 401, { ok:false, error:'Unauthorized', rid });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { ok:false, error:'Missing Supabase envs', rid });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } });
  try {
    const { data, error } = await sb
      .from('wallet_txns')
      .select('*')
      .order('created_at', { ascending:false })
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
    return json(res, 200, { ok:true, rid, txns });
  } catch (e) {
    return json(res, 500, { ok:false, rid, error:String(e?.message||e) });
  }
}

async function handleAdminWithdraws(req, res, env) {
  const rid = Math.random().toString(36).slice(2,10);
  const { TELEGRAM_BOT_TOKEN, ADMIN_USER_IDS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
  const body = await readJson(req);
  const initData = authFrom(req, body);
  const status = body?.status ?? 'pending';
  const limit = Math.max(1, Math.min(100, Number(body?.limit) || 50));
  const offset = Math.max(0, Number(body?.offset) || 0);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { ok:false, rid, error:'Missing envs' });
  }

  const v = verifyInitData(String(initData || ''), TELEGRAM_BOT_TOKEN);
  const allowed = parseAdminIds(ADMIN_USER_IDS);
  if (!v.ok || (allowed.length && !allowed.includes(String(v.userId || '')))) {
    return json(res, 401, { ok:false, rid, error:'Unauthorized' });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } });

  let q = sb.from('withdraw_requests')
    .select('id,user_id,amount,note,status,created_at')
    .order('created_at', { ascending:false })
    .range(offset, offset + limit - 1);

  if (status) q = q.eq('status', String(status));

  const { data, error } = await q;
  if (error) return json(res, 500, { ok:false, rid, error:'Query failed', details:error.message });

  const rows = (data || []).map(r => ({
    id: r.id,
    user_id: r.user_id,
    user_mask: maskUser(r.user_id),
    amount: Number(r.amount || 0),
    note: r.note || null,
    status: r.status || 'pending',
    created_at: r.created_at
  }));

  return json(res, 200, { ok:true, rid, rows, page:{ limit, offset, returned: rows.length } });
}

async function handleAdminWithdrawUpdate(req, res, env) {
  const rid = Math.random().toString(36).slice(2,10);
  const { TELEGRAM_BOT_TOKEN, ADMIN_USER_IDS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env;
  const body = await readJson(req);
  const initData = authFrom(req, body);
  const id = body?.id;
  const action = String(body?.action || '').toLowerCase();
  const note = body?.note;

  if (!initData) return json(res, 400, { ok:false, rid, error:'Missing initData' });
  if (!id)       return json(res, 400, { ok:false, rid, error:'Missing request id' });
  if (!['approve','reject'].includes(action)) {
    return json(res, 400, { ok:false, rid, error:'Invalid action (approve|reject)' });
  }

  const v = verifyInitData(String(initData), TELEGRAM_BOT_TOKEN);
  const allowed = parseAdminIds(ADMIN_USER_IDS);
  if (!v.ok || (allowed.length && !allowed.includes(String(v.userId || '')))) {
    return json(res, 401, { ok:false, rid, error:'Unauthorized' });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } });

  const { data: reqRow, error: reqErr } = await sb
    .from('withdraw_requests')
    .select('id,user_id,amount,note,status,created_at')
    .eq('id', id)
    .maybeSingle();
  if (reqErr)  return json(res, 500, { ok:false, rid, error:'Failed to read request', details:reqErr.message });
  if (!reqRow) return json(res, 404, { ok:false, rid, error:'Request not found' });
  if (path.endsWith("/withdraw-request") || path.endsWith("/admin/withdraw-request")) {
    return handleWithdrawRequestGone(req, res);
  }
  if (String(reqRow.status) !== 'pending') {
    return json(res, 409, { ok:false, rid, error:'Request is not pending', status:reqRow.status });
  }

  if (action === 'reject') {
    const { data: upd, error: uErr } = await sb
      .from('withdraw_requests')
      .update({ status:'rejected', note: note ?? reqRow.note })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    if (uErr) return json(res, 500, { ok:false, rid, error:'Reject failed', details:uErr.message });
    return json(res, 200, { ok:true, rid, request: upd });
  }

  // approve
  const userId = String(reqRow.user_id);
  const amt = Number(reqRow.amount || 0);
  if (!Number.isFinite(amt) || amt <= 0) {
    return json(res, 400, { ok:false, rid, error:'Invalid request amount' });
  }

  const { data: wallet, error: wErr } = await sb
    .from('wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (wErr) return json(res, 500, { ok:false, rid, error:'Wallet read failed', details:wErr.message });

  const currentBal = Number(wallet?.balance || 0);
  if (currentBal < amt) {
    return json(res, 409, { ok:false, rid, error:'Insufficient balance', balance: currentBal, amount: amt });
  }
  const newBal = currentBal - amt;

  const { error: upErr } = await sb
    .from('wallets')
    .upsert({ user_id: userId, balance: newBal });
  if (upErr) return json(res, 500, { ok:false, rid, error:'Wallet update failed', details:upErr.message });

  const txnNote = note ? String(note) : `withdraw approved (req ${id})`;
  const { error: tErr } = await sb
    .from('wallet_txns')
    .insert({
      user_id: userId,
      type: 'debit',
      amount: -Math.abs(amt),
      balance_after: newBal,
      note: txnNote
    });
  if (tErr) return json(res, 500, { ok:false, rid, error:'Txn insert failed', details:tErr.message });

  const { data: okReq, error: aErr } = await sb
    .from('withdraw_requests')
    .update({ status:'approved', note: reqRow.note ?? null })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (aErr) return json(res, 500, { ok:false, rid, error:'Approve status update failed', details:aErr.message });
  if (!okReq) return json(res, 409, { ok:false, rid, error:'Approve raced; status changed by another admin' });

  return json(res, 200, { ok:true, rid, request: okReq, balance_after: newBal });
}

// --- main multiplexer ---
export default async function adminMux(req, res) {
  if (req.method !== 'POST') {
    // allow OPTIONS for CORS preflight if needed by your UI
    if (req.method === 'OPTIONS') { res.statusCode = 200; return res.end(); }
    return json(res, 405, { ok:false, error:'Method not allowed' });
  }

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname; // e.g. /api/admin/txns or /api/admin-txns
  const env = process.env;

  // Legacy aliases still work:
  if (path.endsWith('/admin-txns') || path.endsWith('/admin/txns')) {
    return handleAdminTxns(req, res, env);
  }
  if (path.endsWith('/admin-withdraws') || path.endsWith('/admin/withdraws')) {
    return handleAdminWithdraws(req, res, env);
  }
  if (path.endsWith('/admin-withdraw-update') || path.endsWith('/admin/withdraw-update')) {
    return handleAdminWithdrawUpdate(req, res, env);
  }

  return json(res, 404, { ok:false, error:'Unknown admin route', path, hint:'Try /api/admin/txns, /api/admin/withdraws, /api/admin/withdraw-update' });
}
