export const config = { runtime: 'nodejs' };

import { Buffer } from 'node:buffer';
import { verifyTelegramInitData } from './_lib/telegramVerify.mjs';
import { withCors } from './_lib/cors.mjs';
import {
  createServiceClient,
  ensureWallet,
  listTransactions,
  adjustWalletBalance,
} from './_lib/wallet.js';

function isMissingGroupColumn(error) {
  if (!error) return false;
  const text = String(error.message || error.details || error.code || error).toLowerCase();
  return text.includes('column') && text.includes('group');
}

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function handler(req, res) {
  const requestId = rid();
  let supabase;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return send(res, 500, { ok: false, rid: requestId, error: 'Missing Supabase credentials', details: e.message });
  }

  const adminToken = process.env.ADMIN_TOKEN;

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));
      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));

      const authHeader = req.headers.authorization || req.headers.Authorization || '';
      if (!authHeader.startsWith('tma ')) {
        return send(res, 401, { ok: false, rid: requestId, error: 'missing_tma_header' });
      }
      const initData = authHeader.slice(4);
      const verification = verifyTelegramInitData(
        initData,
        process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN
      );
      if (!verification.ok) {
        return send(res, 401, {
          ok: false,
          rid: requestId,
          error: 'invalid_init_data',
          reason: verification.reason || 'verify_failed',
        });
      }
      const userId = verification.userId ? String(verification.userId) : '';
      if (!userId) {
        return send(res, 401, { ok: false, rid: requestId, error: 'no_user_in_initdata' });
      }

      const ensured = await ensureWallet(supabase, userId);
      if (ensured.error) {
        return send(res, 500, {
          ok: false,
          rid: requestId,
          error: 'Wallet lookup failed',
          details: ensured.error.message,
        });
      }

      const wallet = ensured.data || { user_id: userId, balance: 0 };

      const txnResult = await listTransactions(supabase, userId, { limit, offset });
      if (txnResult.error) {
        return send(res, 500, {
          ok: false,
          rid: requestId,
          error: 'Txn fetch failed',
          details: txnResult.error.message,
        });
      }
      const txns = txnResult.data;

      let betRows = [];
      let betError = null;
      const betQuery = await supabase
        .from('bets')
        .select('id,draw_id,group_code,figure,amount,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (betQuery.error) {
        if (isMissingGroupColumn(betQuery.error)) {
          const fallback = await supabase
            .from('bets')
            .select('id,draw_id,figure,amount,created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);
          if (fallback.error) {
            betError = fallback.error;
          } else {
            betRows = fallback.data || [];
          }
        } else {
          betError = betQuery.error;
        }
      } else {
        betRows = betQuery.data || [];
      }

      const bets = Array.isArray(betRows)
        ? betRows.map((row) => ({
            id: row.id,
            draw_id: row.draw_id,
            group: row.group_code || row.group || null,
            figure: row.figure,
            amount: Number(row.amount ?? 0),
            created_at: row.created_at,
          }))
        : [];

      return send(res, 200, {
        ok: true,
        tag: 'data-balance/v1.1-tma-verify-2025-09-28',
        rid: requestId,
        wallet,
        txns: txns ?? [],
        bets,
        page: { limit, offset, returned: (txns || []).length },
        ...(betError ? { bets_error: betError.message || String(betError) } : {}),
      });
    }

    if (req.method === 'POST') {
      let isAuthorized = false;
      if (adminToken && req.headers['x-admin-token'] === adminToken) {
        isAuthorized = true;
      } else {
        const authHeader = req.headers.authorization || req.headers.Authorization || '';
        if (authHeader.startsWith('tma ')) {
          const initData = authHeader.slice(4);
          try {
            const verification = verifyTelegramInitData(
              initData,
              process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN
            );
            if (!verification.ok) {
              throw new Error(verification.reason || 'verify_failed');
            }
            const uid = verification.userId ? String(verification.userId) : '';
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
      const deltaResult = await adjustWalletBalance(supabase, {
        userId,
        delta,
        note,
        type: delta > 0 ? 'credit' : 'debit',
      });

      if (deltaResult.error) {
        if (deltaResult.code === 'insufficient_balance') {
          return send(res, 400, {
            ok: false,
            rid: requestId,
            error: 'insufficient_balance',
            balance: deltaResult.balance,
          });
        }
        return send(res, 500, {
          ok: false,
          rid: requestId,
          error: deltaResult.code || 'Wallet update failed',
          details: deltaResult.error.message,
        });
      }

      return send(res, 200, {
        ok: true,
        tag: 'data-balance/v1.1-tma-verify-2025-09-28',
        rid: requestId,
        balance: deltaResult.balance,
      });
    }

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

export default withCors(handler);

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}
