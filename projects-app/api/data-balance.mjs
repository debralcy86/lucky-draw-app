export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { validate, parse } from '@telegram-apps/init-data-node';

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const requestId = rid();
  const env = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    adminToken: process.env.ADMIN_TOKEN,
  };

  if (!env.url || !env.key) {
    return send(res, 500, { ok: false, rid: requestId, error: 'Missing Supabase credentials' });
  }

  const supabase = createClient(env.url, env.key, { auth: { persistSession: false } });

  try {
    if (req.method === 'OPTIONS') return res.end();

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));

      const authHeader = req.headers.authorization || req.headers.Authorization || '';
      if (!authHeader.startsWith('tma ')) {
        return send(res, 401, { ok: false, rid: requestId, error: 'missing_tma_header' });
      }
      const initData = authHeader.slice(4);
      try {
        validate(initData, process.env.TELEGRAM_BOT_TOKEN);
      } catch (e) {
        return send(res, 401, { ok: false, rid: requestId, error: 'invalid_init_data' });
      }
      let parsed;
      try {
        parsed = parse(initData);
      } catch (e) {
        return send(res, 400, { ok: false, rid: requestId, error: 'parse_failed' });
      }
      const userId = parsed?.user?.id ? String(parsed.user.id) : '';
      if (!userId) {
        return send(res, 401, { ok: false, rid: requestId, error: 'no_user_in_initdata' });
      }

      let { data: wallet, error: walletErr } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (walletErr) {
        return send(res, 500, { ok: false, rid: requestId, error: 'Wallet lookup failed', details: walletErr.message });
      }

      if (!wallet) {
        const { error: createErr } = await supabase
          .from('wallets')
          .insert({ user_id: userId, balance: 0 });
        if (createErr) {
          return send(res, 500, { ok: false, rid: requestId, error: 'Wallet create failed', details: createErr.message });
        }
        wallet = { user_id: userId, balance: 0 };
      }

      const { data: txns, error: txErr } = await supabase
        .from('wallet_txns')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (txErr) {
        return send(res, 500, { ok: false, rid: requestId, error: 'Txn fetch failed', details: txErr.message });
      }

      return send(res, 200, {
        ok: true,
        tag: 'data-balance/v1.1-tma-verify-2025-09-28',
        rid: requestId,
        wallet,
        txns: txns ?? [],
        page: { limit, offset, returned: (txns || []).length },
      });
    }

    if (req.method === 'POST') {
      let isAuthorized = false;
      if (env.adminToken && req.headers['x-admin-token'] === env.adminToken) {
        isAuthorized = true;
      } else {
        const authHeader = req.headers.authorization || req.headers.Authorization || '';
        if (authHeader.startsWith('tma ')) {
          const initData = authHeader.slice(4);
          try {
            validate(initData, process.env.TELEGRAM_BOT_TOKEN);
            const parsed = parse(initData);
            const uid = parsed?.user?.id ? String(parsed.user.id) : '';
            const adminList = (process.env.ADMIN_USER_IDS || '')
              .split(',')
              .map(s => s.trim())
              .filter(Boolean);
            if (uid && adminList.includes(uid)) {
              isAuthorized = true;
            }
          } catch (_) {
            // fallthrough: not authorized
          }
        }
      }
      if (!isAuthorized) {
        return send(res, 401, { ok: false, rid: requestId, error: 'Unauthorized' });
      }

      const body = await readJson(req);
      const userId = (body.userId || '').toString().trim();
      const delta = Number(body.delta);
      const note = (body.note || '').toString().trim();

      if (!userId || Number.isNaN(delta)) {
        return send(res, 400, { ok: false, rid: requestId, error: 'Missing or invalid userId/delta' });
      }

      const { data: walletRow, error: walletErr } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();

      if (walletErr) {
        return send(res, 500, { ok: false, rid: requestId, error: 'Wallet read failed', details: walletErr.message });
      }

      const currentBalance = walletRow?.balance ?? 0;
      const newBalance = currentBalance + delta;

      const { error: upsertErr } = await supabase
        .from('wallets')
        .upsert({ user_id: userId, balance: newBalance });

      if (upsertErr) {
        return send(res, 500, { ok: false, rid: requestId, error: 'Wallet update failed', details: upsertErr.message });
      }

      const { error: txnErr } = await supabase
        .from('wallet_txns')
        .insert({
          user_id: userId,
          type: delta > 0 ? 'credit' : 'debit',
          amount: delta,
          balance_after: newBalance,
          note: note || null,
        });

      if (txnErr) {
        return send(res, 500, { ok: false, rid: requestId, error: 'Txn write failed', details: txnErr.message });
      }

      return send(res, 200, { ok: true, tag: 'data-balance/v1.1-tma-verify-2025-09-28', rid: requestId, balance: newBalance });
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return send(res, 405, { ok: false, rid: requestId, error: 'Method Not Allowed' });
  } catch (err) {
    return send(res, 500, {
      ok: false,
      rid: requestId,
      error: 'Unhandled',
      details: err?.message || String(err),
    });
  }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}
