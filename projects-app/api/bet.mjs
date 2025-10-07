export const config = { runtime: 'nodejs' };

import { Buffer } from 'node:buffer';
import { createServiceClient, fetchWallet, adjustWalletBalance } from './_lib/wallet.js';
import verifyInitData from './_lib/telegramVerify.mjs';
import { withCors } from './_lib/cors.mjs';

const GROUP_CODES = ['A', 'B', 'C', 'D'];

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

function isGroupColumnError(error) {
  if (!error) return false;
  const msg = String(error.message || error.details || '').toLowerCase();
  return msg.includes('group') && msg.includes('column');
}

async function insertBetWithFallback(supabase, payload) {
  const primary = await supabase
    .from('bets')
    .insert({
      user_id: payload.user_id,
      draw_id: payload.draw_id,
      group_code: payload.group_code,
      figure: payload.figure,
      amount: payload.amount,
    })
    .select()
    .maybeSingle();

  if (!primary.error) {
    return { data: primary.data };
  }

  if (!isGroupColumnError(primary.error)) {
    return { error: primary.error };
  }

  const fallback = await supabase
    .from('bets')
    .insert({
      user_id: payload.user_id,
      draw_id: payload.draw_id,
      figure: payload.figure,
      amount: payload.amount,
    })
    .select()
    .maybeSingle();

  return fallback.error ? { error: fallback.error } : { data: fallback.data };
}

async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 'method_not_allowed');

  let supabase;
  try { supabase = createServiceClient(); } catch { return err(res, 'server_misconfig'); }

  const auth = req.headers.authorization || '';
  if (!auth.startsWith('tma ')) return bad(res, 'missing_tma');
  const initData = auth.slice(4);
  const verify = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
  if (!verify.ok) return bad(res, 'invalid_tma');
  const userId = verify.userId;

  const body = await readJSON(req);
  let { drawId, figure, amount, group } = body || {};
  const figureNumber = Number(figure);
  amount = Number(amount);
  if (!Number.isInteger(figureNumber) || figureNumber < 1 || figureNumber > 36) return bad(res, 'missing_or_invalid_figure');
  const groupCode = typeof group === 'string' ? group.trim().toUpperCase() : 'A';
  if (!GROUP_CODES.includes(groupCode)) return bad(res, 'invalid_group_code');
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
    note: `bet:${groupCode}:${drawId}:${figureNumber}`,
  });
  if (debit.error) {
    if (debit.code === 'insufficient_balance') return bad(res, 'insufficient_balance');
    return err(res, debit.code || 'wallet_update_failed');
  }
    const inserted = await insertBetWithFallback(supabase, {
    user_id: userId,
    draw_id: drawId,
    group_code: groupCode,
    figure: figureNumber,
    amount,
  });

  if (inserted.error) {
    await adjustWalletBalance(supabase, {
      userId,
      delta: Math.abs(amount),
      note: `bet_rollback:${groupCode}:${drawId}:${figureNumber}`,
    });
    return err(res, 'bet_insert_failed', { detail: String(inserted.error.message || inserted.error) });
  }

    const betOut = inserted.data ? {
    ...inserted.data,
    figure_label: inserted.data.group_code && inserted.data.figure
      ? `${inserted.data.group_code}#${inserted.data.figure}`
      : inserted.data.figure
  } : null;

  return ok(res, { rid: rid(), bet: betOut, balance: debit.balance, draw });
}

export default withCors(handler, { methods: ['POST', 'OPTIONS'] });
