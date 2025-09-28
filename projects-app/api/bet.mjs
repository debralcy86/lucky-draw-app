export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import verifyInitData from './_lib/telegramVerify.mjs';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}
function rid() { return Math.random().toString(36).slice(2, 10); }
function ok(res, data) { return res.status(200).json({ ok: true, ...data }); }
function bad(res, reason) { return res.status(400).json({ ok: false, reason }); }
function err(res, reason) { return res.status(500).json({ ok: false, reason }); }

async function readJSON(req) {
  try { return await req.json(); }
  catch {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return bad(res, 'method_not_allowed');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('tma ')) return bad(res, 'missing_tma');
  const initData = auth.slice(4);
  const verify = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
  if (!verify.ok) return bad(res, verify.error || 'invalid_tma');
  const userId = verify.userId;

  const body = await readJSON(req);
  const { drawId, figure, amount } = body || {};
  if (!drawId || !figure || !amount) return bad(res, 'missing_fields');
  if (amount <= 0) return bad(res, 'invalid_amount');

  const { data: draw, error: drawErr } = await supabase
    .from('draws')
    .select('*')
    .eq('id', drawId)
    .eq('status', 'open')
    .maybeSingle();
  if (drawErr) return res.status(500).json({ ok:false, reason:'draw_lookup_failed', drawId, message:String(drawErr.message||drawErr) });
  if (!draw) return res.status(404).json({ ok:false, reason:'draw_not_found', drawId });
  if (String(draw.status).toLowerCase() !== 'open') return res.status(400).json({ ok:false, reason:'draw_closed', drawId, status: draw.status });

  const { data: wallet, error: walletErr } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (walletErr) return err(res, 'wallet_lookup_failed');
  if (!wallet) return bad(res, 'wallet_missing');
  if (wallet.balance < amount) return bad(res, 'insufficient_balance');

  const newBalance = wallet.balance - amount;

  const { data: bet, error: betErr } = await supabase
    .from('bets')
    .insert({
      user_id: userId,
      draw_id: drawId,
      figure,
      amount
    })
    .select()
    .maybeSingle();
  if (betErr) return err(res, 'bet_insert_failed');

  const { error: txnErr } = await supabase
    .from('wallet_txns')
    .insert({
      user_id: userId,
      type: 'debit',
      amount,
      balance_after: newBalance,
      note: `bet:${drawId}:${figure}`
    });
  if (txnErr) return err(res, 'txn_insert_failed');

  const { error: updErr } = await supabase
    .from('wallets')
    .update({ balance: newBalance })
    .eq('user_id', userId);
  if (updErr) return err(res, 'wallet_update_failed');

  return ok(res, { rid: rid(), bet, balance: newBalance });
}
