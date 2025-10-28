
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

async function lookupOpenDraw(supabase, drawId, group) {
  if (drawId) {
    let q = supabase.from('draws').select('id, code, status').eq('id', drawId).maybeSingle();
    const byId = await q;
    if (byId.error) return { error: 'draw_lookup_failed', detail: String(byId.error.message || byId.error) };
    if (!byId.data) return { error: 'draw_not_found', detail: String(drawId) };
    if (byId.data.status !== 'open') return { error: 'draw_not_open', detail: String(drawId) };
    if (group && String(byId.data.code || '').toUpperCase() !== String(group).toUpperCase()) {
      return { error: 'group_mismatch', detail: `draw ${drawId} is code ${byId.data.code}, expected ${group}` };
    }
    return { data: byId.data };
  }
  let q = supabase
    .from('draws')
    .select('id, code, status, scheduled_at, created_at')
    .eq('status', 'open');
  if (group) q = q.eq('code', String(group).toUpperCase());
  const { data, error } = await q
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: 'draw_lookup_failed', detail: String(error.message || error) };
  if (!data) return { error: 'no_open_draw' };
  return { data };
}

async function lookupNextScheduledDraw(supabase, group) {
  let q = supabase
    .from('draws')
    .select('id, code, status, scheduled_at, created_at')
    .eq('status', 'scheduled');
  if (group) q = q.eq('code', String(group).toUpperCase());
  const nowIso = new Date().toISOString();
  const { data, error } = await q
    .gt('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: 'draw_lookup_failed', detail: String(error.message || error) };
  if (!data) return { error: 'no_scheduled_draw' };
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
  const verify = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN);
  if (!verify.ok) return bad(res, 'invalid_tma');
  const userId = verify.userId;

  const body = await readJSON(req);

  // Normalize incoming draw id (support both draw_id and drawId)
  const inputDrawId = body && (body.draw_id || body.drawId) ? (body.draw_id || body.drawId) : null;

  // Resolve a single group for this request (body.group wins, else first bet's group, else 'A')
  const groupFromBody = (body && body.group ? body.group : (Array.isArray(body?.bets) && body.bets[0]?.group ? body.bets[0].group : 'A')).toUpperCase();
  if (!GROUP_CODES.includes(groupFromBody)) return bad(res, 'invalid_group_code');

  // Allow mixed-group bets; validate each group's draw time.
  const normalizeGroup = (g) => String(g || groupFromBody || '').toUpperCase();
  if (Array.isArray(body?.bets)) {
    for (const bet of body.bets) {
      const grp = normalizeGroup(bet.group);
      if (!GROUP_CODES.includes(grp)) return bad(res, 'invalid_group_code');
      const drawCheck = await lookupOpenDraw(supabase, inputDrawId, grp);
      if (drawCheck.error && drawCheck.error !== 'no_open_draw') {
        return respond(res, 400, { ok: false, reason: drawCheck.error, detail: drawCheck.detail });
      }
    }
  }

  // support both single and multiple bet entries
  const betsArray = Array.isArray(body?.bets) ? body.bets : [body];
  const validBets = betsArray.filter(b => Number(b.amount) > 0 && Number.isInteger(Number(b.figure)));
  if (!validBets.length) return bad(res, 'invalid_bets_payload');

  // Per-bet draw resolution (supports advance bets and mixed groups)
  let firstResolvedDraw = null;
  const drawsUsed = [];

  const w0 = await fetchWallet(supabase, userId);
  if (w0.error) return err(res, 'wallet_lookup_failed');
  let currentBalance = Number(w0.data?.balance ?? 0);

  let insertedAll = [];
  for (const b of validBets) {
    const figNum = parseInt(b.figure, 10);
    const amt = Number(b.amount);
    const grp = normalizeGroup(b.group);
    // Resolve an open draw for this group; if none, fallback to next scheduled for advance bets
    let perBetDrawId = inputDrawId || null;
    let perBetDraw = null;
    if (perBetDrawId) {
      const byId = await lookupOpenDraw(supabase, perBetDrawId, grp);
      if (!byId.error) {
        perBetDraw = byId.data;
      } else if (byId.error !== 'no_open_draw') {
        return respond(res, 500, { ok: false, reason: byId.error, detail: byId.detail });
      }
    }
    if (!perBetDraw) {
      const open = await lookupOpenDraw(supabase, null, grp);
      if (!open.error) {
        perBetDraw = open.data;
      } else if (open.error === 'no_open_draw') {
        const nxt = await lookupNextScheduledDraw(supabase, grp);
        if (nxt.error) {
          const code = (nxt.error === 'no_scheduled_draw') ? 404 : 500;
          return respond(res, code, { ok: false, reason: nxt.error, group: grp, detail: nxt.detail });
        }
        perBetDraw = nxt.data;
      } else {
        return respond(res, 500, { ok: false, reason: open.error, detail: open.detail });
      }
    }
    const drawId = perBetDraw.id;
    if (!firstResolvedDraw) firstResolvedDraw = perBetDraw;
    if (!drawsUsed.find(d => d.id === perBetDraw.id)) drawsUsed.push({ id: perBetDraw.id, code: perBetDraw.code, status: perBetDraw.status });

    if (!GROUP_CODES.includes(grp)) return bad(res, 'invalid_group_code');
    if (!Number.isInteger(figNum) || figNum < 1 || figNum > 36) return bad(res, 'missing_or_invalid_figure');
    if (!Number.isFinite(amt) || amt <= 0) return bad(res, 'invalid_amount');
    if (currentBalance < amt) return bad(res, 'insufficient_balance', { balance: currentBalance });
    const debit = await adjustWalletBalance(supabase, {
      userId,
      delta: -Math.abs(amt),
      note: `bet:${grp}:${drawId}:${figNum}`,
      meta: { group_code: grp, figure: figNum },
    });
    if (debit.error) return err(res, debit.code || 'wallet_update_failed');
    currentBalance = Number(debit.balance ?? currentBalance);
    const inserted = await insertBetWithFallback(supabase, {
      user_id: userId,
      draw_id: drawId,
      group_code: grp,
      figure: figNum,
      amount: amt,
    });
    if (inserted.error) {
      await adjustWalletBalance(supabase, {
        userId,
        delta: Math.abs(amt),
        note: `bet_rollback:${grp}:${drawId}:${figNum}`,
        meta: { group_code: grp, figure: figNum },
      });
      return err(res, 'bet_insert_failed', { detail: String(inserted.error.message || inserted.error) });
    }
    insertedAll.push(inserted.data);
  }
  return ok(res, { rid: rid(), bets: insertedAll, balance: currentBalance, draw: firstResolvedDraw, draws: drawsUsed });
}

export default withCors(handler, { methods: ['POST', 'OPTIONS'] });

