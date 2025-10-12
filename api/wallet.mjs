// wallet/v2 – REST-only
export const config = { runtime: 'nodejs' };

import verifyInitData from './_lib/telegramVerify.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

export default async function handler(req, res) {
  const origin = req.headers.origin || '*';
  if (req.method === 'OPTIONS') return ok(res, { ok: true }, origin);
  if (req.method !== 'POST') return err(res, 405, 'method_not_allowed', origin);

  const auth = req.headers.authorization || '';
  const tma = auth.startsWith('tma ') ? auth.slice(4) : '';
  if (!tma) return err(res, 400, 'missing_tma_or_admin_token', origin);

  let tuser;
  try {
    tuser = verifyInitData(tma);
  } catch {
    return err(res, 400, 'tma_invalid', origin);
  }
  const userId = String(tuser?.id || tuser?.user?.id || '');

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch { body = {}; }
  const action = String(body.action || '');

  if (!SUPABASE_URL || !SERVICE_ROLE) return err(res, 500, 'server_misconfigured', origin);

  try {
    if (action === 'deposit') {
      const amount = Number(body.amount || 0);
      const method = String(body.method || 'bank');
      const ref = String(body.ref || '');
      if (!(amount > 0)) return err(res, 400, 'bad_amount', origin);

      const wallet = await ensureWallet(userId);
      const balance_after = wallet.balance;

      const insReq = await sfetch(`/deposit_requests`, {
        method: 'POST',
        body: JSON.stringify([{ user_id: userId, amount, method, ref }]),
      });
      if (!insReq.ok) return err(res, 500, 'deposit_request_failed', origin);

      const insTxn = await sfetch(`/wallet_txns`, {
        method: 'POST',
        body: JSON.stringify([{
          user_id: userId,
          type: 'deposit_pending',
          amount,
          balance_after,
          note: ref || 'deposit request',
          created_at: new Date().toISOString(),
        }]),
      });
      if (!insTxn.ok) return err(res, 500, 'txn_insert_failed', origin);

      const refreshed = await sfetch(`/wallets?user_id=eq.${userId}&select=user_id,balance&limit=1`);
      const [current] = refreshed.ok ? await refreshed.json() : [wallet];
      return ok(res, { ok: true, action: 'deposit', balance: current?.balance ?? balance_after }, origin);
    }

    if (action === 'withdraw') {
      const amount = Number(body.amount || 0);
      const destination = String(body.destination || '');
      if (!(amount > 0)) return err(res, 400, 'bad_amount', origin);

      const wallet = await ensureWallet(userId);
      const balance_after = wallet.balance;

      const insReq = await sfetch(`/withdraw_requests`, {
        method: 'POST',
        body: JSON.stringify([{ user_id: userId, amount, destination }]),
      });
      if (!insReq.ok) return err(res, 500, 'withdraw_request_failed', origin);

      const insTxn = await sfetch(`/wallet_txns`, {
        method: 'POST',
        body: JSON.stringify([{
          user_id: userId,
          type: 'withdraw_pending',
          amount,
          balance_after,
          note: destination || 'withdraw request',
          created_at: new Date().toISOString(),
        }]),
      });
      if (!insTxn.ok) return err(res, 500, 'txn_insert_failed', origin);

      const refreshed = await sfetch(`/wallets?user_id=eq.${userId}&select=user_id,balance&limit=1`);
      const [current] = refreshed.ok ? await refreshed.json() : [wallet];
      return ok(res, { ok: true, action: 'withdraw', balance: current?.balance ?? balance_after }, origin);
    }

    return err(res, 400, 'unknown_action', origin);
  } catch {
    return err(res, 500, 'server_error', origin);
  }
}
