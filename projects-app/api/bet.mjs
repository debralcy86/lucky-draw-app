export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import verifyInitData, { verifyTelegramInitData } from '../_lib/telegramVerify.mjs';
import { Buffer } from 'node:buffer';

function sanitizeCorsOrigin(val) {
  return String(val || '*').replace(/[\r\n]/g, '').split(',')[0].trim() || '*';
}
function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function rid() { return Math.random().toString(36).slice(2, 10); }

export default async function handler(req, res) {
  const R = rid();
  // CORS
  res.setHeader('Access-Control-Allow-Origin', sanitizeCorsOrigin(process.env.CORS_ORIGIN));
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.end();

  if (req.method !== 'POST') {
    return send(res, 405, { ok: false, rid: R, error: 'Method Not Allowed' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN) {
    return send(res, 500, { ok: false, rid: R, error: 'Missing envs (SUPABASE or TELEGRAM_BOT_TOKEN)' });
  }

  try {
    // parse body
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    const auth = (req.headers?.authorization || req.headers?.Authorization || '').toString();
    const initFromHeader = auth.startsWith('tma ') ? auth.slice(4).trim() : '';
    const { initData: initFromBody, drawId, figure, amount } = body || {};
    const initData = initFromBody || initFromHeader;
    if (!initData) return send(res, 400, { ok: false, rid: R, error: 'Invalid Telegram initData', details: 'Missing initData' });

    // verify Telegram
    const v = verifyTelegramInitData(initData, TELEGRAM_BOT_TOKEN) || (await verifyInitData(initData, TELEGRAM_BOT_TOKEN));
    if (!v?.ok) return send(res, 400, { ok: false, rid: R, error: 'Invalid Telegram initData', details: v?.error || 'verify failed' });
    const userId = String(v.userId);

    // validate inputs
    if (!isUuid(drawId)) return send(res, 400, { ok: false, rid: R, error: 'Invalid drawId' });
    const fig = Number(figure);
    if (!Number.isInteger(fig) || fig < 1 || fig > 36) return send(res, 400, { ok: false, rid: R, error: 'Invalid figure (1..36)' });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return send(res, 400, { ok: false, rid: R, error: 'Invalid amount (> 0)' });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // draw must be open and in future
    const { data: dRow, error: dErr } = await sb.from('draws').select('id,status,scheduled_at').eq('id', drawId).maybeSingle();
    if (dErr) return send(res, 500, { ok: false, rid: R, error: 'Draw lookup failed', details: String(dErr?.message || dErr) });
    if (!dRow) return send(res, 404, { ok: false, rid: R, error: 'Draw not found' });
    if (dRow.status !== 'open') return send(res, 400, { ok: false, rid: R, error: `Draw not open (status=${dRow.status})` });
    if (dRow.scheduled_at && new Date(dRow.scheduled_at) <= new Date()) {
      return send(res, 400, { ok: false, rid: R, error: 'Draw already scheduled/past' });
    }

    // ensure wallet
    let { data: w, error: we } = await sb.from('wallets').select('user_id,balance').eq('user_id', userId).maybeSingle();
    if (we) return send(res, 500, { ok: false, rid: R, error: 'Wallet read failed', details: String(we?.message || we) });
    if (!w) {
      const { data: wNew, error: wi } = await sb.from('wallets').insert({ user_id: userId, balance: 0 }).select('user_id,balance').maybeSingle();
      if (wi) return send(res, 500, { ok: false, rid: R, error: 'Wallet create failed', details: String(wi?.message || wi) });
      w = wNew;
    }

    // balance check
    const newBal = Number(w.balance) - amt;
    if (newBal < 0) return send(res, 400, { ok: false, rid: R, error: 'Insufficient funds', balance: Number(w.balance) });

    // debit + bet (MVP: sequential ops; later: SQL function/transaction)
    const { error: wu } = await sb.from('wallets').update({ balance: newBal }).eq('user_id', userId);
    if (wu) return send(res, 500, { ok: false, rid: R, error: 'Wallet debit failed', details: String(wu?.message || wu) });

    const { error: wtxe } = await sb.from('wallet_txns').insert({
      user_id: userId,
      type: 'debit',
      amount: amt,
      balance_after: newBal,
      note: `bet stake ${drawId}`
    });
    if (wtxe) {
      return send(res, 500, { ok: false, rid: R, error: 'Txn write failed', details: String(wtxe?.message || wtxe) });
    }

    const { data: bet, error: be } = await sb
      .from('bets')
      .insert({ user_id: userId, draw_id: drawId, figure: fig, amount: amt })
      .select('id,user_id,draw_id,figure,amount')
      .maybeSingle();
    if (be) return send(res, 500, { ok: false, rid: R, error: 'Bet insert failed', details: String(be?.message || be) });

    return send(res, 200, { ok: true, rid: R, bet, balance_after: newBal });
  } catch (e) {
    return send(res, 500, { ok: false, rid: R, error: 'Bet failed', details: String(e?.message || e) });
  }
}
