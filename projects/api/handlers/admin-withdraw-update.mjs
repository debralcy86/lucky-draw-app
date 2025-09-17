// projects/api/handlers/admin-withdraw-update.mjs
import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from './telegramVerify.mjs';

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};
const parseAdmins = (env) => (env || '').split(',').map(s => s.trim()).filter(Boolean);

export async function adminWithdrawUpdate(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);

  try {
    if (req.method !== 'POST') {
      return send(res, 405, { ok:false, rid, error:'Method not allowed' });
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, ADMIN_USER_IDS } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN) {
      return send(res, 500, { ok:false, rid, error:'Missing required envs' });
    }

    // body
    let raw = '';
    await new Promise(r => { req.on('data', c => raw += c); req.on('end', r); });
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const authHeader = (req.headers?.authorization || req.headers?.Authorization || '').toString();
    const initFromHeader = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : '';
    const { initData: initFromBody, id, action, note } = body || {};
    const initData = initFromBody || initFromHeader;

    if (!initData) return send(res, 400, { ok:false, rid, error:'Missing initData' });
    if (!id)       return send(res, 400, { ok:false, rid, error:'Missing request id' });
    const act = String(action || '').toLowerCase();
    if (!['approve','reject'].includes(act)) {
      return send(res, 400, { ok:false, rid, error:'Invalid action (approve|reject)' });
    }

    // admin gate
    const v = verifyInitData(String(initData), TELEGRAM_BOT_TOKEN);
    const allowed = parseAdmins(ADMIN_USER_IDS);
    if (!v.ok || (allowed.length && !allowed.includes(String(v.userId || '')))) {
      return send(res, 401, { ok:false, rid, error:'Unauthorized' });
    }

    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } });

    // Load request (must be pending)
    const { data: reqRow, error: reqErr } = await supa
      .from('withdraw_requests')
      .select('id,user_id,amount,note,status,created_at')
      .eq('id', id)
      .maybeSingle();
    if (reqErr)   return send(res, 500, { ok:false, rid, error:'Failed to read request', details:reqErr.message });
    if (!reqRow)  return send(res, 404, { ok:false, rid, error:'Request not found' });
    if (String(reqRow.status) !== 'pending') {
      return send(res, 409, { ok:false, rid, error:'Request is not pending', status:reqRow.status });
    }

    if (act === 'reject') {
      const { data: upd, error: uErr } = await supa
        .from('withdraw_requests')
        .update({ status:'rejected', note: note ?? reqRow.note })
        .eq('id', id)
        .eq('status', 'pending')
        .select()
        .maybeSingle();
      if (uErr) return send(res, 500, { ok:false, rid, error:'Reject failed', details:uErr.message });
      return send(res, 200, { ok:true, rid, request: upd });
    }

    // approve: ensure wallet has funds, then debit & mark approved
    const userId = String(reqRow.user_id);
    const amt = Number(reqRow.amount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      return send(res, 400, { ok:false, rid, error:'Invalid request amount' });
    }

    // 1) fetch wallet
    const { data: wallet, error: wErr } = await supa
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (wErr) return send(res, 500, { ok:false, rid, error:'Wallet read failed', details:wErr.message });

    const currentBal = Number(wallet?.balance || 0);
    if (currentBal < amt) {
      return send(res, 409, { ok:false, rid, error:'Insufficient balance', balance: currentBal, amount: amt });
    }
    const newBal = currentBal - amt;

    // 2) update wallet balance
    const { error: upErr } = await supa
      .from('wallets')
      .upsert({ user_id: userId, balance: newBal });
    if (upErr) return send(res, 500, { ok:false, rid, error:'Wallet update failed', details:upErr.message });

    // 3) insert wallet_txn (debit)
    const txnNote = note ? String(note) : `withdraw approved (req ${id})`;
    const { error: tErr } = await supa
      .from('wallet_txns')
      .insert({
        user_id: userId,
        type: 'debit',
        amount: -Math.abs(amt),
        balance_after: newBal,
        note: txnNote
      });
    if (tErr) return send(res, 500, { ok:false, rid, error:'Txn insert failed', details:tErr.message });

    // 4) mark request approved
    const { data: okReq, error: aErr } = await supa
      .from('withdraw_requests')
      .update({ status:'approved', note: reqRow.note ?? null })
      .eq('id', id)
      .eq('status', 'pending')
      .select()
      .maybeSingle();
    if (aErr) return send(res, 500, { ok:false, rid, error:'Approve status update failed', details:aErr.message });
    if (!okReq) return send(res, 409, { ok:false, rid, error:'Approve raced; status changed by another admin' });

    return send(res, 200, {
      ok:true, rid,
      request: okReq,
      balance_after: newBal
    });
  } catch (e) {
    return send(res, 500, { ok:false, rid, error:String(e?.message || e) });
  }
}
