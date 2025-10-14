// wallet/v2 – REST-only
export const config = { runtime: 'nodejs' };

import { withTMA } from './_lib/tma.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BET_GROUPS = ['A', 'B', 'C', 'D'];
const PAYMENT_METHODS = ['bank', 'ewallet', 'agent'];
const WITHDRAW_STATUSES = ['pending', 'approved', 'rejected', 'paid'];

async function sfetch(path, init={}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const headers = {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  return res;
}

async function readJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchOpenDraw(drawId) {
  let query = '?select=id,status&status=eq.open&order=scheduled_at.asc&limit=1';
  if (drawId) {
    query = `?select=id,status&status=eq.open&id=eq.${encodeURIComponent(drawId)}`;
  }
  const res = await sfetch(`/draws${query}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { error: 'draw_lookup_failed', status: res.status, detail: text };
  }
  const data = await readJsonSafe(res);
  const row = Array.isArray(data) ? (data[0] || null) : data;
  if (!row?.id) {
    return { error: 'draw_not_found' };
  }
  return { draw: row };
}

function sanitizeBetEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      const group = typeof entry.group === 'string' ? entry.group.trim().toUpperCase() : '';
      const figure = Number(entry.figure);
      const amount = Math.floor(Number(entry.amount) || 0);
      return { group, figure, amount };
    })
    .filter((item) => BET_GROUPS.includes(item.group)
      && Number.isInteger(item.figure)
      && item.figure >= 1
      && item.figure <= 36
      && Number.isInteger(item.amount)
      && item.amount > 0);
}

function normalizeMethod(value) {
  if (typeof value !== 'string') return null;
  const method = value.trim().toLowerCase();
  return PAYMENT_METHODS.includes(method) ? method : null;
}

async function patchWalletBalance(userId, balance) {
  const res = await sfetch(`/wallets?user_id=eq.${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ balance }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, detail: text };
  }
  return { ok: true };
}

async function deleteBets(ids) {
  if (!ids || !ids.length) return;
  const encoded = ids.map((id) => encodeURIComponent(id)).join(',');
  await sfetch(`/bets?id=in.(${encoded})`, { method: 'DELETE' });
}

async function insertBets(bets) {
  if (!bets || !bets.length) {
    return { ok: true, data: [] };
  }

  let res = await sfetch('/bets', {
    method: 'POST',
    body: JSON.stringify(bets.map((bet) => ({
      user_id: bet.user_id,
      draw_id: bet.draw_id,
      group_code: bet.group,
      figure: bet.figure,
      amount: bet.amount,
    }))),
  });

  if (res.ok) {
    const data = await readJsonSafe(res);
    return { ok: true, data: Array.isArray(data) ? data : [] };
  }

  const text = await res.text().catch(() => '');
  if (res.status === 400 && text && text.includes("group")) {
    console.warn('[wallet] insertBets fallback: bet schema missing group column');
    // fallback for legacy schema without group column
    const fallback = await sfetch('/bets', {
      method: 'POST',
      body: JSON.stringify(bets.map((bet) => ({
        user_id: bet.user_id,
        draw_id: bet.draw_id,
        figure: bet.figure,
        amount: bet.amount,
      }))),
    });
    if (fallback.ok) {
      const data = await readJsonSafe(fallback);
      return { ok: true, data: Array.isArray(data) ? data : [] };
    }
    return { ok: false, status: fallback.status, detail: await fallback.text().catch(() => '') };
  }

  return { ok: false, status: res.status, detail: text };
}

function ok(res, body, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-InitData, X-Debug-RID');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(body);
}

function err(res, code, reason, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Telegram-InitData, X-Debug-RID');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).json({ ok: false, reason });
}

async function ensureWallet(userId) {
  const get = await sfetch(`/wallets?user_id=eq.${userId}&select=user_id,balance&limit=1`);
  if (!get.ok) throw new Error('wallet_select_failed');
  const rows = await get.json();
  if (rows.length) return rows[0];
  const ins = await sfetch(`/wallets`, {
    method: 'POST',
    body: JSON.stringify([{ user_id: userId, balance: 0 }]),
  });
  if (!ins.ok) throw new Error('wallet_insert_failed');
  const [row] = await ins.json();
  return row;
}

async function handler(req, res) {
  const origin = req.headers.origin || '*';
  if (req.method === 'OPTIONS') return ok(res, { ok: true }, origin);
  if (req.method !== 'POST') return err(res, 405, 'method_not_allowed', origin);

  const userId = req.tma?.userId ? String(req.tma.userId) : '';
  if (!userId) {
    return err(res, 401, 'invalid_init_data', origin);
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch { body = {}; }
  const action = String(body.action || '');

  if (!SUPABASE_URL || !SERVICE_ROLE) return err(res, 500, 'server_misconfigured', origin);

  try {
    if (action === 'deposit') {
      const amount = Number(body.amount || 0);
      const methodInput = normalizeMethod(body.method ?? 'bank');
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      const ref = typeof body.ref === 'string' ? body.ref.trim() : note;
      if (!(amount > 0)) return err(res, 400, 'bad_amount', origin);
      if (!methodInput) return err(res, 400, 'invalid_method', origin);

      const wallet = await ensureWallet(userId);
      const currentBalance = Number(wallet.balance ?? 0);
      const nextBalance = currentBalance + amount;

      const depositPayload = {
        user_id: userId,
        amount,
        method: methodInput,
      };
      if (ref) depositPayload.ref = ref;
      if (note) depositPayload.note = note;

      const insReq = await sfetch(`/deposit_requests`, {
        method: 'POST',
        body: JSON.stringify([depositPayload]),
      });
      if (!insReq.ok) {
        const text = await insReq.text().catch(() => '');
        console.error('[wallet] deposit_request_failed', { status: insReq.status, body: text });
        return err(res, 500, 'deposit_request_failed', origin);
      }

      const walletUpdate = await patchWalletBalance(userId, nextBalance);
      if (!walletUpdate.ok) {
        console.error('[wallet] wallet_update_failed', { action: 'deposit', userId, detail: walletUpdate.detail });
        return err(res, 500, 'wallet_update_failed', origin);
      }

      const insTxn = await sfetch(`/wallet_txns`, {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: userId,
            type: 'credit',
            amount,
            balance_after: nextBalance,
            note: note || ref || 'deposit request',
            created_at: new Date().toISOString(),
          },
        ]),
      });
      if (!insTxn.ok) {
        const text = await insTxn.text().catch(() => '');
        console.error('[wallet] txn_insert_failed', { status: insTxn.status, body: text, action: 'deposit', userId });
        return err(res, 500, 'txn_insert_failed', origin);
      }

      const refreshed = await sfetch(`/wallets?user_id=eq.${userId}&select=user_id,balance&limit=1`);
      const [current] = refreshed.ok ? await refreshed.json() : [wallet];
      return ok(res, { ok: true, action: 'deposit', balance: current?.balance ?? nextBalance }, origin);
    }

    if (action === 'withdraw') {
      const amount = Number(body.amount || 0);
      const destination = String(body.destination || '');
      const accountHolder = typeof body.account_holder === 'string' ? body.account_holder.trim() : '';
      const methodInput = normalizeMethod(body.method || 'bank');
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      const reqId = `WR-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 100000)}`;
      if (!(amount > 0)) return err(res, 400, 'bad_amount', origin);
      if (amount < 10) return err(res, 400, 'amount_below_minimum', origin);
      if (!methodInput) return err(res, 400, 'invalid_method', origin);

      const wallet = await ensureWallet(userId);
      const currentBalance = Number(wallet.balance ?? 0);
      const nextBalance = currentBalance - amount;
      if (nextBalance < 0) {
        return err(res, 400, 'insufficient_balance', origin);
      }

      const withdrawPayload = {
        user_id: userId,
        rid: reqId,
        amount_points: amount,
        method: methodInput,
        destination,
        account_holder: accountHolder,
        status: 'pending',
      };
      if (note) withdrawPayload.note = note;

      const insReq = await sfetch(`/withdraw_requests`, {
        method: 'POST',
        body: JSON.stringify([withdrawPayload]),
      });
      if (!insReq.ok) {
        const text = await insReq.text().catch(() => '');
        console.error('[wallet] withdraw_request_failed', { status: insReq.status, body: text });
        return err(res, 500, 'withdraw_request_failed', origin);
      }

      const walletUpdate = await patchWalletBalance(userId, nextBalance);
      if (!walletUpdate.ok) {
        console.error('[wallet] wallet_update_failed', { action: 'withdraw', userId, detail: walletUpdate.detail });
        return err(res, 500, 'wallet_update_failed', origin);
      }

      const insTxn = await sfetch(`/wallet_txns`, {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: userId,
            type: 'debit',
            amount,
            balance_after: nextBalance,
            note: destination || 'withdraw request',
            created_at: new Date().toISOString(),
          },
        ]),
      });
      if (!insTxn.ok) {
        const text = await insTxn.text().catch(() => '');
        console.error('[wallet] txn_insert_failed', { status: insTxn.status, body: text, action: 'withdraw', userId });
        return err(res, 500, 'txn_insert_failed', origin);
      }

      const refreshed = await sfetch(`/wallets?user_id=eq.${userId}&select=user_id,balance&limit=1`);
      const [current] = refreshed.ok ? await refreshed.json() : [wallet];
      return ok(res, { ok: true, action: 'withdraw', balance: current?.balance ?? nextBalance }, origin);
    }


    if (action === 'bet') {
      const bets = sanitizeBetEntries(body?.bets);
      if (!bets.length) {
        return err(res, 400, 'invalid_bets_payload', origin);
      }

      const drawLookup = await fetchOpenDraw(typeof body.draw_id === 'string' ? body.draw_id : '');
      if (drawLookup.error) {
        if (drawLookup.error === 'draw_not_found') {
          return err(res, 404, 'draw_not_found', origin);
        }
        return err(res, 500, 'draw_lookup_failed', origin);
      }
      const draw = drawLookup.draw;

      const wallet = await ensureWallet(userId);
      const currentBalance = Number(wallet.balance ?? 0);
      const totalStake = bets.reduce((sum, bet) => sum + bet.amount, 0);
      if (totalStake <= 0) {
        return err(res, 400, 'invalid_bet_total', origin);
      }
      if (totalStake > currentBalance) {
        return err(res, 400, 'insufficient_balance', origin);
      }

      const betPayload = bets.map((bet) => ({
        user_id: userId,
        draw_id: draw.id,
        group: bet.group,
        figure: bet.figure,
        amount: bet.amount,
      }));

      const inserted = await insertBets(betPayload);
      const insertedRows = inserted.ok ? inserted.data : [];
      const betIds = insertedRows.map((row) => row.id).filter(Boolean);
      if (!inserted.ok) {
        console.error('[wallet] bet_insert_failed', { status: inserted.status, body: inserted.detail });
        return err(res, 500, 'bet_insert_failed', origin);
      }

      const nextBalance = currentBalance - totalStake;
      const walletUpdate = await patchWalletBalance(userId, nextBalance);
      if (!walletUpdate.ok) {
        console.error('[wallet] wallet_update_failed', { action: 'bet', userId, detail: walletUpdate.detail });
        await deleteBets(betIds);
        return err(res, 500, 'wallet_update_failed', origin);
      }

      const betLabel = bets
        .map((bet) => `${bet.group}#${bet.figure}=${bet.amount}`)
        .join(', ');
      const txnRes = await sfetch('/wallet_txns', {
        method: 'POST',
        body: JSON.stringify([
          {
            user_id: userId,
            type: 'debit',
            amount: totalStake,
            balance_after: nextBalance,
            note: betLabel ? `bet:${betLabel}` : `bet:${draw.id}`,
            created_at: new Date().toISOString(),
          },
        ]),
      });
      if (!txnRes.ok) {
        const text = await txnRes.text().catch(() => '');
        console.error('[wallet] txn_insert_failed', { status: txnRes.status, body: text, action: 'bet', userId });
        await patchWalletBalance(userId, currentBalance);
        await deleteBets(betIds);
        return err(res, 500, 'txn_insert_failed', origin);
      }

      return ok(res, {
        ok: true,
        action: 'bet',
        balance: nextBalance,
        draw_id: draw.id,
        bets: insertedRows,
      }, origin);
    }

    if (action === 'bet_totals') {
      const drawLookup = await fetchOpenDraw(typeof body.draw_id === 'string' ? body.draw_id : '');
      if (drawLookup.error) {
        if (drawLookup.error === 'draw_not_found') {
          return err(res, 404, 'draw_not_found', origin);
        }
        return err(res, 500, 'draw_lookup_failed', origin);
      }
      const draw = drawLookup.draw;

      let totalsRes = await sfetch(`/bets?draw_id=eq.${draw.id}&select=group_code,sum(amount)&group=group_code`);
      let totalsData = null;
      if (totalsRes.ok) {
        totalsData = await readJsonSafe(totalsRes);
      } else {
        const fallbackText = await totalsRes.text().catch(() => '');
        if (totalsRes.status === 400 && fallbackText.includes('group_code')) {
          console.warn('[wallet] bet_totals fallback: bets table missing group_code column');
          totalsRes = await sfetch(`/bets?draw_id=eq.${draw.id}&select=sum(amount)`);
          if (totalsRes.ok) {
            totalsData = await readJsonSafe(totalsRes);
            const totalAmount = Array.isArray(totalsData) && totalsData.length > 0 ? Number(totalsData[0]?.sum ?? 0) : 0;
            const map = {};
            BET_GROUPS.forEach((grp) => {
              map[grp] = 0;
            });
            return ok(res, {
              ok: true,
              action: 'bet_totals',
              draw_id: draw.id,
              totals: map,
            }, origin);
          }
        }
        console.error('[wallet] bet_totals_failed', { status: totalsRes.status, body: fallbackText });
        return err(res, 500, 'bet_totals_failed', origin);
      }
      const totalsMap = {};
      BET_GROUPS.forEach((group) => {
        totalsMap[group] = 0;
      });
      (Array.isArray(totalsData) ? totalsData : []).forEach((row) => {
        const group = row?.group || row?.group_code;
        const sum = Number(row?.sum ?? row?.sum_amount ?? 0);
        if (BET_GROUPS.includes(group)) {
          totalsMap[group] = sum;
        }
      });

      return ok(res, {
        ok: true,
        action: 'bet_totals',
        draw_id: draw.id,
        totals: totalsMap,
      }, origin);
    }

    if (action === 'withdraw_update') {
      // Only admins can update withdraw requests
      const isAdmin = process.env.ADMIN_USER_IDS && process.env.ADMIN_USER_IDS.split(',').includes(userId);
      if (!isAdmin) {
        return err(res, 403, 'admin_required', origin);
      }

      const rid = String(body.rid || '');
      const status = String(body.status || 'pending');
      const admin_note = body.admin_note || null;
      const approved_by = userId;
      const paid_by = body.paid_by || null;
      const paid_ref = body.paid_ref || null;

      if (!rid) {
        return err(res, 400, 'missing_rid', origin);
      }

      const updReq = await sfetch(`/withdraw_requests?rid=eq.${encodeURIComponent(rid)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          admin_note,
          approved_by,
          paid_by,
          paid_ref,
          updated_at: new Date().toISOString(),
        }),
      });

      if (!updReq.ok) {
        const text = await updReq.text().catch(() => '');
        console.error('[wallet] withdraw_update_failed', { status: updReq.status, body: text });
        return err(res, 500, 'withdraw_update_failed', origin);
      }

      return ok(res, { ok: true, action: 'withdraw_update', rid, status }, origin);
    }

    return err(res, 400, 'unknown_action', origin);
  } catch (error) {
    console.error('[wallet] unexpected_error', error);
    return err(res, 500, 'server_error', origin);
  }
}
export default withTMA(handler);
