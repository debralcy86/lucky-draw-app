import { verifyTma } from './_lib/telegramVerify.mjs';
import { createClient } from '@supabase/supabase-js';

function pickInitData(req) {
  const hAuth = req.headers['authorization'] || '';
  const hInit = req.headers['x-telegram-initdata'] || req.headers['x-telegram-init-data'] || '';
  const qInit = (req.query && (req.query.initData || req.query.initdata)) || '';
  const b = req.body || {};
  const bInit = typeof b === 'string' ? b : (b.initData || b.initdata || '');
  return hAuth || hInit || qInit || bInit || '';
}

function num(v) {
  const n = Math.floor(Number(v || 0));
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const initDataRaw = pickInitData(req);
  const tma = verifyTma(initDataRaw);
  if (!tma.ok) {
    return res.status(401).json({ ok: false, error: 'invalid_init_data', reason: tma.reason || null, tag: 'wallet/verify' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const action = body?.action || '';
  const amount = num(body?.amount);
  const method = body?.method || 'bank';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';

  if (!(amount > 0)) {
    return res.status(400).json({ ok: false, error: 'invalid_amount', tag: 'wallet/validate' });
  }
  if (action !== 'deposit' && action !== 'withdraw') {
    return res.status(400).json({ ok: false, error: 'invalid_action', tag: 'wallet/validate' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || '';
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured_supabase', tag: 'wallet/env' });
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const userId = String(tma.userId || '').trim();
  if (!userId) {
    return res.status(400).json({ ok: false, error: 'missing_user_id', tag: 'wallet/validate' });
  }

  try {
    let balance = 0;

    const { data: found, error: selErr } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (selErr) throw selErr;

    if (!found) {
      const { data: created, error: insWalletErr } = await supabase
        .from('wallets')
        .insert([{ user_id: userId, balance: 0 }])
        .select('balance')
        .single();
      if (insWalletErr) throw insWalletErr;
      balance = created.balance || 0;
    } else {
      balance = found.balance || 0;
    }

    if (action === 'deposit') {
      const newBalance = balance + amount;

      const { data: txn, error: insTxnErr } = await supabase
        .from('wallet_txns')
        .insert([
          {
            user_id: userId,
            type: 'credit',
            amount,
            note: note || null,
            balance_before: balance,
            balance_after: newBalance
          }
        ])
        .select('id,created_at')
        .single();
      if (insTxnErr) throw insTxnErr;

      const { error: updErr } = await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('user_id', userId);
      if (updErr) throw updErr;

      return res.status(200).json({
        ok: true,
        accepted: true,
        userId,
        amount,
        method,
        note: note || null,
        balance: newBalance,
        txnId: txn?.id ?? null,
        tag: 'wallet/deposit-ok'
      });
    } else if (action === 'withdraw') {
      if (balance < amount) {
        return res.status(400).json({ ok: false, error: 'insufficient_balance', balance, tag: 'wallet/withdraw' });
      }
      const newBalance = balance - amount;

      const { data: txn, error: insTxnErr } = await supabase
        .from('wallet_txns')
        .insert([
          {
            user_id: userId,
            type: 'debit',
            amount,
            note: note || null,
            balance_before: balance,
            balance_after: newBalance
          }
        ])
        .select('id,created_at')
        .single();
      if (insTxnErr) throw insTxnErr;

      const { error: updErr } = await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('user_id', userId);
      if (updErr) throw updErr;

      return res.status(200).json({
        ok: true,
        accepted: true,
        userId,
        amount,
        method,
        note: note || null,
        balance: newBalance,
        txnId: txn?.id ?? null,
        tag: 'wallet/withdraw-ok'
      });
    }
  } catch (err) {
    const msg = (err && (err.message || err.msg)) || String(err);
    return res.status(500).json({ ok: false, error: 'wallet_operation_failed', reason: msg, tag: 'wallet/exception' });
  }
}
