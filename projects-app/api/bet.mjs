export const config = { runtime: 'nodejs' };

import { Buffer } from 'node:buffer';
import { createServiceClient, fetchWallet, adjustWalletBalance } from './_lib/wallet.js';
import verifyInitData from './_lib/telegramVerify.mjs';
import { withCors } from './_lib/cors.mjs';
import extractInitData from './_lib/initData.mjs';

function rid() { return Math.random().toString(36).slice(2, 10); }
function respond(res, code, body) { res.status(code).setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(body)); }
function ok(res, data) { return respond(res, 200, { ok: true, ...data }); }
function bad(res, reason, extra) { return respond(res, 400, { ok: false, reason, ...(extra||{}) }); }
function err(res, reason, extra) { return respond(res, 500, { ok: false, reason, ...(extra||{}) }); }

async function readJSON(req) {
  try { if (typeof req.json === 'function') return await req.json(); } catch {}
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function lookupOpenDraw(supabase, drawId) {
  if (drawId) {
    const { data: d, error: e } = await supabase
      .from('draws')
      .select('*')
      .eq('id', drawId)
      .eq('status', 'open')
      .maybeSingle();
    if (e) return { error: 'draw_lookup_failed', detail: String(e.message||e) };
    if (!d) return { error: 'draw_not_found', detail: String(drawId) };
    return { data: d };
  }
  const { data, error } = await supabase
    .from('draws')
    .select('*')
    .eq('status', 'open')
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: 'draw_lookup_failed', detail: String(error.message||error) };
  if (!data) return { error: 'no_open_draw' };
  return { data };
}

async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 'method_not_allowed');

  let supabase;
  try { supabase = createServiceClient(); } catch { return err(res, 'server_misconfig'); }

  const body = await readJSON(req);
  const initData = extractInitData(req, body);
  if (!initData) return bad(res, 'missing_tma');

  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) return err(res, 'server_misconfig', { detail: 'missing_bot_token' });

  const verify = verifyInitData(initData, botToken);
  if (!verify.ok) return bad(res, 'invalid_tma');
  const userId = verify.userId;
  if (!userId) return bad(res, 'invalid_tma');

  let { drawId, figure, amount } = body || {};
  amount = Number(amount);
  if (!figure || !(typeof figure === 'string')) return bad(res, 'missing_or_invalid_figure');
  if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'invalid_amount');

  const found = await lookupOpenDraw(supabase, drawId);
  if (found.error) {
    const code = (found.error === 'draw_not_found' || found.error === 'no_open_draw') ? 404 : 500;
    return respond(res, code, { ok: false, reason: found.error, drawId, detail: found.detail });
  }
  const draw = found.data;
  drawId = draw.id;

  const w0 = await fetchWallet(supabase, userId);
  if (w0.error) return err(res, 'wallet_lookup_failed');
  const currentBalance = Number(w0.data?.balance ?? 0);
  if (currentBalance < amount) return bad(res, 'insufficient_balance', { balance: currentBalance });

  const debit = await adjustWalletBalance(supabase, {
    userId,
    delta: -Math.abs(amount),
    note: `bet:${drawId}:${figure}`,
    type: 'bet',
  });
  if (debit.error) {
    if (debit.code === 'insufficient_balance') return bad(res, 'insufficient_balance');
    return err(res, debit.code || 'wallet_update_failed');
  }

  const { data: bet, error: betErr } = await supabase
    .from('bets')
    .insert({ user_id: userId, draw_id: drawId, figure, amount })
    .select()
    .maybeSingle();

  if (betErr) {
    await adjustWalletBalance(supabase, {
      userId,
      delta: Math.abs(amount),
      note: `bet_rollback:${drawId}:${figure}`,
      type: 'bet_rollback'
    });
    return err(res, 'bet_insert_failed');
  }

  return ok(res, { rid: rid(), bet, balance: debit.balance, draw });
}

export default withCors(handler, { methods: ['POST', 'OPTIONS'] });
