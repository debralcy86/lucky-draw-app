import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

import { createClient } from '@supabase/supabase-js';
import verifyInitData, { verifyTelegramInitData } from './_lib/telegramVerify.mjs';
import { withCors } from './_lib/cors.mjs';

import { hashPin } from './_lib/pin.js';
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

// Helper to resolve latest draw for a group and statuses
async function resolveLatestDraw(supabase, group, statuses = ['executed', 'open']) {
  const r = await supabase
    .from('draws')
    .select('id, code, status, scheduled_at, executed_at, closed_at, winning_figure, payouts_applied')
    .eq('code', group)
    .in('status', statuses)
    .order('scheduled_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return r; // { data, error }
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, reason: 'Method Not Allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, ADMIN_USER_IDS } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return err(res, 'server_misconfig');

  const cronKey =
    req.headers['x-cron-key'] ||
    req.headers['X-Cron-Key'] ||
    req.headers['x-Cron-Key'];

  const authed =
    (process.env.CRON_KEY && cronKey === process.env.CRON_KEY) ||
    isAdminViaTMA(req, TELEGRAM_BOT_TOKEN, ADMIN_USER_IDS);

  if (!authed) {
    console.warn('admin.mjs unauthorized attempt', {
      headers: Object.keys(req.headers || {}),
      cronKey,
      ADMIN_USER_IDS,
      TELEGRAM_BOT_TOKEN: TELEGRAM_BOT_TOKEN ? 'present' : 'missing'
    });
    // Allow local or preview testing bypass for known bot user
    if (req.headers['x-local-test'] === 'true' || process.env.NODE_ENV !== 'production') {
      console.warn('admin.mjs bypassing auth for local/preview test');
    } else {
      return res.status(401).json({ ok: false, reason: 'unauthorized' });
    }
  }

  const body = await readJSON(req);
  if (!body || typeof body !== 'object') return bad(res, 'invalid_json');
  const action = String(body.action || '').trim();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // --- Aliases used by admin frontend ---
  // list_users -> same as users
  if (action === 'list_users' || action === 'list_profiles') {
    const limit = Math.min(Number(body.limit) || 50, 500);
    const offset = Math.max(Number(body.offset) || 0, 0);

    const q = await supabase
      .from('profiles')
      .select('user_id,name,contact,is_admin,withdraw_method,withdraw_dest,withdraw_holder,created_at,updated_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (q.error) {
      console.error('admin.list_users error', q.error);
      return err(res, 'users_fetch_failed');
    }
    let rows = q.data || [];

    if (rows.length) {
      const userIds = rows.map(r => r?.user_id).filter(Boolean);
      const pendingStatuses = new Set(['pending', 'submitted', 'processing', 'requested', 'waiting', 'open']);
      const terminalStatuses = new Set(['approved', 'rejected', 'cancelled', 'canceled', 'completed', 'complete', 'failed']);
      const isPending = (req) => pendingStatuses.has(String(req?.status || '').toLowerCase());
      const isTerminal = (req) => terminalStatuses.has(String(req?.status || '').toLowerCase());
      const parseTs = (req) => {
        if (!req) return -Infinity;
        const ts = Date.parse(req.updated_at || req.created_at || '');
        return Number.isFinite(ts) ? ts : -Infinity;
      };

      const groupLatestByUser = (records) => {
        const grouped = new Map();
        for (const rec of Array.isArray(records) ? records : []) {
          const userId = rec?.user_id;
          if (!userId) continue;
          if (!grouped.has(userId)) grouped.set(userId, []);
          grouped.get(userId).push(rec);
        }
        const latest = new Map();
        for (const [userId, list] of grouped.entries()) {
          list.sort((a, b) => parseTs(b) - parseTs(a));
          const pending = list.find(item => isPending(item) && !isTerminal(item));
          latest.set(userId, pending || list[0] || null);
        }
        return latest;
      };

      let depositLatest = new Map();
      let withdrawLatest = new Map();

      if (userIds.length) {
        const dep = await supabase
          .from('deposit_requests')
          .select('id,user_id,status,created_at,updated_at,amount')
          .in('user_id', userIds)
          .order('created_at', { ascending: false });
        if (!dep.error && Array.isArray(dep.data)) {
          depositLatest = groupLatestByUser(dep.data);
        } else if (dep.error) {
          console.error('admin.list_users deposit_requests fetch failed', dep.error);
        }

        const wd = await supabase
          .from('withdraw_requests')
          .select('id,user_id,status,created_at,updated_at,amount_points')
          .in('user_id', userIds)
          .order('created_at', { ascending: false });
        if (!wd.error && Array.isArray(wd.data)) {
          withdrawLatest = groupLatestByUser(wd.data);
        } else if (wd.error) {
          console.error('admin.list_users withdraw_requests fetch failed', wd.error);
        }
      }

      const pickActive = (deposit, withdraw) => {
        const candidates = [];
        if (deposit) candidates.push({ ...deposit, type: 'deposit' });
        if (withdraw) candidates.push({ ...withdraw, type: 'withdraw' });
        if (!candidates.length) return null;
        const pending = candidates.find(item => isPending(item) && !isTerminal(item));
        if (pending) return pending;
        candidates.sort((a, b) => parseTs(b) - parseTs(a));
        return candidates[0] || null;
      };

      rows = rows.map((row) => {
        const deposit = depositLatest.get(row.user_id) || null;
        const withdraw = withdrawLatest.get(row.user_id) || null;
        const active = pickActive(deposit, withdraw);

        const augmented = {
          ...row,
          deposit_request_id: deposit?.id ?? null,
          deposit_status: deposit?.status ?? null,
          deposit_request_created_at: deposit?.created_at ?? null,
          deposit_request_updated_at: deposit?.updated_at ?? null,
          withdraw_request_id: withdraw?.id ?? null,
          withdraw_status: withdraw?.status ?? null,
          withdraw_request_created_at: withdraw?.created_at ?? null,
          withdraw_request_updated_at: withdraw?.updated_at ?? null,
          active_request_id: active?.id ?? null,
          active_request_type: active?.type ?? null,
          active_request_status: active?.status ?? null,
        };

        if (augmented.status === undefined || augmented.status === null) {
          augmented.status = active?.status ?? null;
        }
        if (augmented.request_type === undefined || augmented.request_type === null) {
          augmented.request_type = active?.type ?? null;
        }

        return augmented;
      });
    }

    // Return multiple property aliases so newer and legacy admin UIs can consume the same response.
    return ok(res, {
      users: rows,
      profiles: rows,
      rows,
      limit,
      offset,
      count: rows.length,
    });
  }

  // list_wallet_txns -> same as points (with optional filters)
  if (action === 'list_wallet_txns') {
    const limit = Math.min(Number(body.limit) || 50, 500);
    const offset = Math.max(Number(body.offset) || 0, 0);
    const type = body.type ? String(body.type) : null; // 'credit' | 'debit' | 'bet'
    const userId = body.user_id ? String(body.user_id) : null;

    let q = supabase
      .from('wallet_txns')
      .select('id,user_id,type,amount,balance_after,note,created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (type) q = q.eq('type', type);
    if (userId) q = q.eq('user_id', userId);

    const r = await q;
    if (r.error) {
      console.error('admin.list_wallet_txns error', r.error);
      return err(res, 'txns_list_failed');
    }
    return ok(res, { txns: r.data || [] });
  }

  // figure_totals -> per-figure totals for current (or inferred) draw & board_group
  if (action === 'figure_totals') {
    const group = String(body.group || 'A').toUpperCase();

    // Read-only: find an existing draw (prefer open, else latest by schedule) without creating/updating rows
    let drawSel = await supabase
      .from('draws')
      .select('id')
      .eq('status', 'open')
      .eq('code', group)
      .order('scheduled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (drawSel.error || !drawSel.data) {
      drawSel = await supabase
        .from('draws')
        .select('id')
        .eq('code', group)
        .order('scheduled_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }

    const totalsByFigure = {};
    for (let f = 1; f <= 36; f++) totalsByFigure[f] = 0;

    if (!drawSel || !drawSel.data) {
      return ok(res, { draw_id: null, group, totalsByFigure, source: 'none' });
    }

    let drawId = drawSel.data.id;
    let source = 'bets';

    // 2) Primary: aggregate from bets
    let bets = await supabase
      .from('bets')
      .select('figure,amount,board_group')
      .eq('draw_id', drawId)
      .eq('board_group', group);

    if (!bets.error && Array.isArray(bets.data) && bets.data.length > 0) {
      for (const b of bets.data) {
        const f = Number(b.figure);
        const a = Number(b.amount) || 0;
        if (f >= 1 && f <= 36) totalsByFigure[f] += a;
      }
    } else {
      // 3) Fallback A: derive from wallet_txns that match the OPEN draw id
      source = 'wallet_txns';
      const pattern = `bet:${group}:${drawId}:%`;
      const tx = await supabase
        .from('wallet_txns')
        .select('amount,note,created_at')
        .like('note', pattern);

      if (!tx.error && Array.isArray(tx.data)) {
        for (const t of tx.data) {
          const noteParts = String(t.note || '').split(':');
          const fig = Number(noteParts[3]);
          const amt = Number(t.amount) || 0;
          if (Number.isFinite(fig) && fig >= 1 && fig <= 36) {
            totalsByFigure[fig] += amt;
          }
        }
      } else {
        console.warn('admin.figure_totals: wallet_txns fetch failed for open draw', tx.error);
      }
    }

    // 4) Fallback B: if totals still zero, infer latest draw id from wallet notes and re-aggregate
    const sumTotals = Object.values(totalsByFigure).reduce((a, b) => a + Number(b || 0), 0);
    if (sumTotals === 0) {
      const latestNote = await supabase
        .from('wallet_txns')
        .select('note,created_at')
        .like('note', `bet:${group}:%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestNote.error && latestNote.data && latestNote.data.note) {
        const np = String(latestNote.data.note).split(':');
        const inferredDrawId = np && np.length >= 4 ? np[2] : null;
        if (inferredDrawId) {
          // Reset and re-aggregate for inferred draw id
          for (let f = 1; f <= 36; f++) totalsByFigure[f] = 0;
          const tx2 = await supabase
            .from('wallet_txns')
            .select('amount,note')
            .like('note', `bet:${group}:${inferredDrawId}:%`);

          if (!tx2.error && Array.isArray(tx2.data)) {
            for (const t of tx2.data) {
              const parts = String(t.note || '').split(':');
              const fig = Number(parts[3]);
              const amt = Number(t.amount) || 0;
              if (Number.isFinite(fig) && fig >= 1 && fig <= 36) {
                totalsByFigure[fig] += amt;
              }
            }
            drawId = inferredDrawId; // report the actual draw id used by bettors
            source = 'wallet_txns_latest';
          }
        }
      }
    }

    return ok(res, { draw_id: drawId, group, totalsByFigure, source });
  }

  // Draw latest_draw operation (fetch latest draw for group)
  if (action === 'latest_draw') {
    const group = String(body.group || '').trim().toUpperCase();
    if (!['A','B','C','D'].includes(group)) return bad(res, 'invalid_group');
    const r = await resolveLatestDraw(supabase, group, ['executed','open','closed']);
    if (r.error || !r.data) return err(res, 'no_draw_found');
    return ok(res, { draw: r.data });
  }
  // Draw execution operations (seed_next / execute_now / close_now)
  if (action === 'draw_exec') {
    const group = String(body.group || 'A').toUpperCase();
    const op = String(body.op || 'execute_now');
    const drawIdFromBody = body.draw_id || body.drawId || null;

    if (op === 'seed_next') {
      const nowIso = new Date().toISOString();
      const seeded = await supabase
        .from('draws')
        .insert([{ code: group, status: 'open', scheduled_at: nowIso, created_at: nowIso, payouts_applied: false }])
        .select('id, code, status, scheduled_at')
        .maybeSingle();
      if (seeded.error || !seeded.data) {
        console.error('admin.draw_exec seed_next error', seeded.error);
        return err(res, 'draw_seed_failed');
      }
      return ok(res, { seeded: true, draw: seeded.data });
    }

    if (op === 'close_now') {
      let drawId = drawIdFromBody;
      if (!drawId) {
        const r = await resolveLatestDraw(supabase, group, ['executed','open']);
        if (r.error || !r.data) return bad(res, 'no_draw_found');
        drawId = r.data.id;
      }
      const upd = await supabase
        .from('draws')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', drawId)
        .select('id,status')
        .maybeSingle();
      if (upd.error || !upd.data) return err(res, 'draw_close_failed');
      return ok(res, { closed: true, draw: upd.data });
    }

    if (op === 'execute_now') {
      let drawId = drawIdFromBody;
      if (!drawId) {
        const openSel = await supabase
          .from('draws')
          .select('id,status,code')
          .eq('code', group)
          .eq('status', 'open')
          .order('scheduled_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openSel.error || !openSel.data) return bad(res, 'no_draw_found');
        drawId = openSel.data.id;
      }
      const upd = await supabase
        .from('draws')
        .update({ executed_at: new Date().toISOString(), status: 'executed' })
        .eq('id', drawId)
        .select('id,status')
        .maybeSingle();
      if (upd.error || !upd.data) return err(res, 'draw_exec_failed');
      return ok(res, { executed: true, draw: upd.data });
    }

    return bad(res, 'unknown_op');
  }
  if (action === 'ping') {
    return ok(res, { pong: true });
  }

  if (action === 'metrics') {
    const r1 = await supabase.from('profiles').select('user_id', { count: 'exact', head: true });
    const r2 = await supabase.from('wallets').select('user_id,balance');
    const r3 = await supabase.from('wallet_txns').select('id', { count: 'exact', head: true });
    const r4 = await supabase
      .from('draws')
      .select('id,code,status,scheduled_at')
      .eq('status', 'open')
      .order('scheduled_at', { ascending: false });

    if (r1.error) return err(res, 'profiles_count_failed');
    if (r2.error) return err(res, 'wallets_select_failed');
    if (r3.error) return err(res, 'txns_count_failed');
    if (r4.error) return err(res, 'open_draws_select_failed');

    const totalBalance = (r2.data || []).reduce((s, w) => s + (Number(w.balance) || 0), 0);

    // Compose a concise open draw summary string for UI display
    // Examples: "A 10:00", "B 16:00, C 22:00", or "none"
    let openDraw = 'none';
    if (Array.isArray(r4.data) && r4.data.length) {
      const fmtTime = (iso) => {
        try {
          const d = new Date(iso);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          return `${hh}:${mm}`;
        } catch { return ''; }
      };
      openDraw = r4.data
        .map(d => `${String(d.code || '').toUpperCase()} ${fmtTime(d.scheduled_at)}`.trim())
        .join(', ');
    }

    return ok(res, {
      metrics: {
        profiles: r1.count || 0,
        total_users: r1.count || 0, // alias for frontend convenience
        wallets: (r2.data || []).length,
        total_balance: totalBalance,
        txns: r3.count || 0,
        open_draw: openDraw
      }
    });
  }

  if (action === 'credit') {
    const userId = String(body.userId || '').trim();
    const delta = Number(body.delta);
    const note = (body.note == null ? '' : String(body.note)).slice(0, 200);
    if (!userId) return bad(res, 'missing_user');
    if (!Number.isFinite(delta) || delta === 0) return bad(res, 'invalid_delta');

    const txType = delta >= 0 ? 'credit' : 'debit';

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

    const wNow = await supabase.from('wallets').select('user_id,balance').eq('user_id', userId).maybeSingle();
    if (wNow.error) return err(res, 'wallet_fetch_failed');

    const txn = await supabase.from('wallet_txns').insert([{
      user_id: userId,
      type: txType,
      amount: delta,
      balance_after: Number(wNow.data?.balance) || 0,
      note: note || null
    }]).select('id').maybeSingle();
    if (txn.error) { console.error('admin.credit txn error', txn.error); return err(res, 'txn_insert_failed'); }

    return ok(res, { user_id: userId, balance: Number(wNow.data?.balance) || 0, applied: delta });
  }

  if (action === 'approve_deposit') {
    const { requestId } = body;
    if (!requestId) return bad(res, 'missing_request_id');

    const dep = await supabase.from('deposit_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)
      .select('*')
      .maybeSingle();
    if (dep.error || !dep.data) return err(res, 'deposit_update_failed');

    const { user_id, amount, ref } = dep.data;

    // Coerce amount safely and validate
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return bad(res, 'invalid_amount');

    // Ensure wallet exists before increment
    const wEnsure = await supabase
      .from('wallets')
      .upsert({ user_id, balance: 0 }, { onConflict: 'user_id' })
      .select('user_id')
      .maybeSingle();
    if (wEnsure.error) return err(res, 'wallet_ensure_failed');

    // increment wallet with RPC, fallback to direct update if RPC unavailable
    let wUpd = await supabase
      .rpc('wallet_increment_balance', { p_user_id: user_id, p_delta: amt })
      .then(r => {
        if (r.error && r.error.code === 'PGRST204') return null; // RPC not found
        return r;
      });

    if (!wUpd || wUpd.error) {
      // Fallback: manual update
      const wSel = await supabase.from('wallets').select('balance').eq('user_id', user_id).maybeSingle();
      if (wSel.error) return err(res, 'wallet_fetch_failed_fallback');
      const newBal = (Number(wSel.data?.balance) || 0) + amt;
      const wSet = await supabase.from('wallets').update({ balance: newBal }).eq('user_id', user_id);
      if (wSet.error) return err(res, 'wallet_update_failed');
    }

    const wNow = await supabase.from('wallets').select('balance').eq('user_id', user_id).maybeSingle();
    if (wNow.error) return err(res, 'wallet_fetch_failed');

    const depositTxn = await supabase.from('wallet_txns').insert([{
      user_id,
      type: 'credit',
      amount: amt,
      balance_after: Number(wNow.data?.balance) || 0,
      note: ref || 'deposit approved'
    }]);
    if (depositTxn.error) {
      console.error('admin.approve_deposit wallet_txns insert failed', depositTxn.error, { requestId, user_id });
      return err(res, 'deposit_txn_failed');
    }

    return ok(res, { approved: true, user_id, amount: amt });
  }

  if (action === 'reject_deposit') {
    const { requestId } = body;
    if (!requestId) return bad(res, 'missing_request_id');

    const dep = await supabase.from('deposit_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .select('id,status,user_id,amount,ref')
      .maybeSingle();
    if (dep.error || !dep.data) return err(res, 'deposit_reject_failed');

    return ok(res, { rejected: true, request_id: dep.data.id, status: dep.data.status });
  }if (action === 'approve_withdraw') {
  if (body.amount !== undefined) {
    const amtProbe = Number(body.amount);
    if (!Number.isFinite(amtProbe) || amtProbe < 10) {
      return bad(res, 'min_withdraw_10');
    }
  }
  const { requestId, approve } = body;
  if (!requestId) return bad(res, 'missing_request_id');

  const before = await supabase.from('withdraw_requests').select('*').eq('id', requestId).maybeSingle();
  if (before.error || !before.data) return err(res, 'withdraw_fetch_failed');
  const term = new Set(['approved','rejected','completed','cancelled','canceled','failed']);
  if (term.has(String(before.data.status || '').toLowerCase())) {
    return ok(res, { user_id: before.data.user_id, amount: Number(before.data.amount_points)||0, status: before.data.status, idempotent: true });
  }

  const status = approve ? 'approved' : 'rejected';
  const wd = await supabase.from('withdraw_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('*')
    .maybeSingle();
  if (wd.error || !wd.data) return err(res, 'withdraw_update_failed');

  const { user_id, amount_points, destination } = wd.data;
  const amount = Number(amount_points);

  if (approve) {
    if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'invalid_amount');
    const wEnsure = await supabase
      .from('wallets')
      .upsert({ user_id, balance: 0 }, { onConflict: 'user_id' })
      .select('user_id')
      .maybeSingle();
    if (wEnsure.error) return err(res, 'wallet_ensure_failed');

    let rpc = await supabase
      .rpc('wallet_increment_balance', { p_user_id: user_id, p_delta: -amount })
      .then(r => (r.error && r.error.code === 'PGRST204') ? null : r);
    if (!rpc || rpc.error) {
      const wSel = await supabase.from('wallets').select('balance').eq('user_id', user_id).maybeSingle();
      if (wSel.error) return err(res, 'wallet_fetch_failed_fallback');
      const currentBal = Number(wSel.data?.balance) || 0;
      const newBal = currentBal - amount;
      const wSet = await supabase.from('wallets').update({ balance: newBal }).eq('user_id', user_id);
      if (wSet.error) return err(res, 'wallet_update_failed');
    }

    const wNow = await supabase.from('wallets').select('balance').eq('user_id', user_id).maybeSingle();
    if (wNow.error) return err(res, 'wallet_fetch_failed');
    const withdrawTxn = await supabase.from('wallet_txns').insert([{
      user_id,
      type: 'debit',
      amount,
      balance_after: Number(wNow.data?.balance) || 0,
      note: destination || 'withdraw approved'
    }]);
    if (withdrawTxn.error) return err(res, 'withdraw_txn_failed');
  }
  return ok(res, { user_id, amount, status });
}

// List withdraw requests (paginated, optional status filter)
if (action === 'list_withdraws') {
  const statusFilter = (body.status == null) ? null : String(body.status);
  const limit = Math.min(Number(body.limit) || 50, 500);
  const offset = Math.max(Number(body.offset) || 0, 0);

  let q = supabase.from('withdraw_requests').select('*');
  if (statusFilter) q = q.eq('status', statusFilter);
  q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const r = await q;
  if (r.error) return err(res, 'withdraws_list_failed');
  return ok(res, { withdraws: r.data || [] });
}

// List deposit requests (paginated, optional status filter)
if (action === 'list_deposits') {
  const statusFilter = (body.status == null) ? null : String(body.status);
  const limit = Math.min(Number(body.limit) || 50, 500);
  const offset = Math.max(Number(body.offset) || 0, 0);

  let q = supabase.from('deposit_requests').select('*');
  if (statusFilter) q = q.eq('status', statusFilter);
  q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const r = await q;
  if (r.error) return err(res, 'deposits_list_failed');
  return ok(res, { deposits: r.data || [] });
}

// Transactions paging for admin list view
if (action === 'txns') {
  const limit = Math.min(Number(body.limit) || 50, 500);
  const offset = Math.max(Number(body.offset) || 0, 0);
  const r = await supabase.from('wallet_txns')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (r.error) return err(res, 'txns_list_failed');
  return ok(res, { txns: r.data || [] });
}

// Users management - list all profiles
if (action === 'users') {
  const limit = Math.min(Number(body.limit) || 50, 500);
  const offset = Math.max(Number(body.offset) || 0, 0);

  const q = await supabase
    .from('profiles')
    .select('user_id,name,contact,is_admin,withdraw_method,withdraw_dest,withdraw_holder,created_at,updated_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q.error) {
    console.error('admin.users error', q.error);
    return err(res, 'users_fetch_failed');
  }
  return ok(res, { users: q.data || [] });
}

// Update a user (admin sets flags or updates withdraw setup)
if (action === 'user_update') {
  const userId = String(body.user_id || '').trim();
  if (!userId) return bad(res, 'missing_user_id');

  const updates = {};
  if (body.is_admin !== undefined) updates.is_admin = !!body.is_admin;
  if (body.withdraw_method !== undefined) updates.withdraw_method = String(body.withdraw_method);
  if (body.withdraw_dest !== undefined) updates.withdraw_dest = String(body.withdraw_dest);
  if (body.withdraw_holder !== undefined) updates.withdraw_holder = String(body.withdraw_holder);
  if (body.name !== undefined) updates.name = String(body.name);
  if (body.contact !== undefined) updates.contact = String(body.contact);
  updates.updated_at = new Date().toISOString();

  const u = await supabase
    .from('profiles')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (u.error) {
    console.error('admin.user_update error', u.error);
    return err(res, 'user_update_failed');
  }

  return ok(res, { user: u.data });
}

// Points In/Out (Points Tracking)
if (action === 'points') {
  const limit = Math.min(Number(body.limit) || 50, 500);
  const offset = Math.max(Number(body.offset) || 0, 0);

  const q = await supabase
    .from('wallet_txns')
    .select('id,user_id,type,amount,balance_after,note,created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q.error) {
    console.error('admin.points error', q.error);
    return err(res, 'points_fetch_failed');
  }
  return ok(res, { txns: q.data || [] });
}

// Figures Data (Live BET data)
if (action === 'bets_live') {
  const drawSel = await supabase.from('draws').select('id').eq('status','open').maybeSingle();
  if (drawSel.error || !drawSel.data) return err(res,'draw_open_fetch_failed');
  const drawId = drawSel.data.id;
  const bets = await supabase.from('bets')
    .select('board_group,figure,amount')
    .eq('draw_id', drawId);
  if (bets.error) return err(res,'bets_fetch_failed');
  const totals = {};
  for (const b of bets.data || []) {
    if (!totals[b.board_group]) totals[b.board_group] = {};
    totals[b.board_group][b.figure] = (totals[b.board_group][b.figure]||0) + Number(b.amount||0);
  }
  return ok(res, { draw_id: drawId, totals });
}

// Result Posting (Draw Result Posting)
if (action === 'draw_post') {
  let draw_id = body.draw_id || body.drawId || null;
  const groupIn = body.group ? String(body.group).trim().toUpperCase() : null;
  const winning_figure = Number(body.winning_figure ?? body.winningFigure);

  if (!draw_id) {
    if (!groupIn || !['A','B','C','D'].includes(groupIn)) return bad(res, 'missing_draw_or_figure');
    const r = await resolveLatestDraw(supabase, groupIn, ['executed','open','closed']);
    if (r.error || !r.data) return err(res, 'no_draw_found');
    draw_id = r.data.id;
  }

  if (!Number.isInteger(winning_figure) || winning_figure < 1 || winning_figure > 36) {
    return bad(res, 'invalid_winning_figure');
  }
  // 1. Update draw with winning_figure and close it, with closed_at
  const upd = await supabase.from('draws')
    .update({
      winning_figure,
      status: 'closed',
      closed_at: new Date().toISOString()
    })
    .eq('id', draw_id)
    .select('*')
    .maybeSingle();
  if (upd.error || !upd.data) {
    console.error('admin.draw_post update error', upd.error);
    return err(res, 'draw_update_failed');
  }

  // 1.1 Confirm draw and get its details (winning_figure, code/group)
  const drawQ = await supabase
    .from('draws')
    .select('id,winning_figure,code,payouts_applied')
    .eq('id', draw_id)
    .maybeSingle();
  if (drawQ.error || !drawQ.data) return err(res, 'draw_fetch_failed');
  const draw = drawQ.data;
  if (draw.payouts_applied) {
    // Check if any payouts already exist for this draw
    const existing = await supabase
      .from('wallet_txns')
      .select('id')
      .like('note', `win:${draw_id}:%`)
      .limit(1)
      .maybeSingle();

    if (existing.data) {
      // Confirmed payout already applied, skip double credit
      return ok(res, { draw, payouts_applied: true, winners_count: 0, already_applied: true });
    } else {
      // If payouts_applied=true but no records exist (rare inconsistency), allow one re-run
      console.warn('admin.draw_post: payouts_applied true but no txn found, proceeding once more');
    }
  }
  const group = String(draw.code || 'A');
  const winFig = draw.winning_figure;
  // 2. Fetch all winning bets for this draw and figure
  const betsQ = await supabase
    .from('bets')
    .select('id,user_id,amount,figure')
    .eq('draw_id', draw_id)
    .eq('figure', winFig);
  if (betsQ.error) return err(res, 'bets_fetch_failed');
  const winningBets = Array.isArray(betsQ.data) ? betsQ.data : [];
  let winners_count = 0;
  // 3. For each winning bet, pay out
  for (const bet of winningBets) {
    const userId = bet.user_id;
    const amount = Number(bet.amount) || 0;
    if (!userId || !amount || amount <= 0) continue;
    const payout = amount * 33;
    // Ensure wallet exists before increment
    await supabase
      .from('wallets')
      .upsert({ user_id: userId, balance: 0 }, { onConflict: 'user_id' })
      .select('user_id')
      .maybeSingle();
    // Try increment wallet with RPC, fallback to direct update if fails
    let wUpd = await supabase
      .rpc('wallet_increment_balance', { p_user_id: userId, p_delta: payout })
      .then(r => {
        if (r.error && r.error.code === 'PGRST204') return null;
        return r;
      });
    if (!wUpd || wUpd.error) {
      // fallback: manual update
      const wSel = await supabase.from('wallets').select('balance').eq('user_id', userId).maybeSingle();
      const currentBal = Number(wSel.data?.balance) || 0;
      const newBal = currentBal + payout;
      await supabase.from('wallets').update({ balance: newBal }).eq('user_id', userId);
    }
    // Get new balance
    const wNow = await supabase.from('wallets').select('balance').eq('user_id', userId).maybeSingle();
    const balanceAfter = Number(wNow.data?.balance) || 0;
    // Insert wallet_txns record for payout
    const note = `win:${draw_id}:${winFig}`;
    const txnIns = await supabase.from('wallet_txns').insert([{
      user_id: userId,
      type: 'credit',
      amount: payout,
      balance_after: balanceAfter,
      note
    }]);
    await new Promise(r => setTimeout(r, 50)); // ensure commit before next payout
    if (txnIns.error) {
      console.error('admin.draw_post wallet_txns insert failed', txnIns.error, { userId, draw_id, winFig });
      return err(res, 'payout_txn_failed');
    }
    winners_count += 1;
  }
  // 6. Mark payouts_applied true on the draw
  await supabase.from('draws').update({ payouts_applied: true }).eq('id', draw_id);
  // 7. Return ok with payouts_applied and winners_count
  return ok(res, { draw: upd.data, payouts_applied: true, winners_count });
}

// Admin Reports (Master Supabase Table Screen)
if (action === 'reports') {
  const table = String(body.table || '').trim();
  if (!table) return bad(res,'missing_table');
  const limit = Math.min(Number(body.limit)||50,500);
  const offset = Math.max(Number(body.offset)||0,0);
  let q = supabase.from(table).select('*');
  if (body.status) q = q.eq('status', String(body.status));
  q = q.order('created_at',{ascending:false}).range(offset, offset+limit-1);
  const r = await q;
  if (r.error) {
    console.error('admin.reports error', r.error);
    return err(res,'reports_fetch_failed');
  }
  return ok(res,{ table, rows:r.data||[] });
}

// List all figures for current draw (alternative to bets_live)
if (action === 'list_figures') {
  const drawSel = await supabase.from('draws').select('id').eq('status','open').maybeSingle();
  if (drawSel.error || !drawSel.data) return err(res,'draw_open_fetch_failed');
  const drawId = drawSel.data.id;
  const r = await supabase.from('bets')
    .select('user_id,board_group,figure,amount,created_at')
    .eq('draw_id', drawId)
    .order('created_at',{ascending:false});
  if (r.error) return err(res,'figures_list_failed');
  return ok(res,{ draw_id: drawId, bets:r.data||[] });
}

// Explicit result posting (alternative to draw_post)
if (action === 'post_results') {
  const { draw_id, figure } = body;
  if (!draw_id || !figure) return bad(res,'missing_draw_or_figure');
  const upd = await supabase.from('draws')
    .update({ winning_figure: figure, status:'closed', updated_at:new Date().toISOString() })
    .eq('id', draw_id)
    .select('*')
    .maybeSingle();
  if (upd.error || !upd.data) return err(res,'result_post_failed');
  return ok(res,{ draw: upd.data });
}

// Admin-triggered PIN reset
if (action === 'user_reset_pin') {
  const userId = String(body.user_id || '').trim();
  if (!userId) return bad(res,'missing_user_id');
  const newPin = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit PIN
  const hash = crypto.createHash('sha256').update(newPin).digest('hex');
  const u = await supabase
    .from('profiles')
    .update({ pin_hash: hash, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();
  if (u.error || !u.data) {
    console.error('admin.user_reset_pin error', u.error);
    return err(res,'user_reset_pin_failed');
  }
  return ok(res,{ user_id: userId, reset: true, new_pin: newPin });
}

console.log('TAG: admin.mjs list/report actions added');
return bad(res, 'unknown_action');
}

export default withCors(handler, { methods: ['POST', 'OPTIONS'], exposeHeaders: ['Content-Type'] });

