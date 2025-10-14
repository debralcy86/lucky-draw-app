export const config = { runtime: 'nodejs' };

import { verifyTelegramInitData } from './_lib/telegramVerify.mjs';
import { withCors } from './_lib/cors.mjs';
import { createServiceClient, ensureWallet } from './_lib/wallet.js';
import extractInitData from './_lib/initData.mjs';

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try { return req.body ? JSON.parse(req.body) : {}; } catch { return {}; }
    }
    if (typeof req.body === 'object' && req.body !== null) {
      return req.body;
    }
    if (Buffer.isBuffer(req.body)) {
      try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; }
    }
  }

  let raw = '';
  await new Promise((resolve) => {
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', resolve);
    req.on('error', resolve);
  });
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function sanitizeDepositRequest(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    userId: row.user_id ?? null,
    amount: Number(row.amount ?? 0),
    method: row.method || null,
    ref: row.ref || null,
    slipUrl: row.slip_url || null,
    status: row.status || 'pending',
    createdAt: row.created_at || null,
  };
}

function sanitizeTxn(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    userId: row.user_id ?? null,
    type: row.type || 'deposit_pending',
    amount: Number(row.amount ?? 0),
    balanceAfter: Number(row.balance_after ?? row.balanceAfter ?? 0),
    note: row.note || null,
    createdAt: row.created_at || row.createdAt || null,
  };
}

function sanitizeWallet(row) {
  if (!row) return null;
  return {
    userId: row.user_id ?? null,
    balance: Number(row.balance ?? 0),
  };
}

async function handler(req, res) {
  const requestId = rid();

  try {
    if (req.method !== 'POST') {
      return send(res, 405, { ok: false, rid: requestId, error: 'Method not allowed' });
    }

    const body = await readBody(req);
    const initData = extractInitData(req, body);

    if (!initData) {
      return send(res, 400, { ok: false, rid: requestId, error: 'Missing initData' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!botToken) {
      return send(res, 500, { ok: false, rid: requestId, error: 'Missing TELEGRAM_BOT_TOKEN' });
    }

    const verified = verifyTelegramInitData(String(initData), botToken);
    if (!verified.ok) {
      return send(res, 401, {
        ok: false,
        rid: requestId,
        error: 'Invalid Telegram initData',
        reason: verified.reason || verified.error || null,
      });
    }

    const userId =
      verified.userId ||
      (verified.user && (verified.user.id || verified.user.user?.id)) ||
      '';
    if (!userId) {
      return send(res, 400, { ok: false, rid: requestId, error: 'Telegram user id missing' });
    }

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return send(res, 400, { ok: false, rid: requestId, error: 'Invalid amount' });
    }
    if (amount > 1_000_000) {
      return send(res, 400, { ok: false, rid: requestId, error: 'Amount too large' });
    }

    const method = String(body?.method || body?.paymentMethod || 'bank').trim() || 'bank';
    const reference = String(body?.ref || body?.reference || body?.note || '').trim();
    const slipUrl = String(body?.slipUrl || body?.slip_url || '').trim();

    let supabase;
    try {
      supabase = createServiceClient();
    } catch (err) {
      return send(res, 500, {
        ok: false,
        rid: requestId,
        error: 'Missing Supabase configuration',
        details: err?.message || String(err),
      });
    }

    const ensured = await ensureWallet(supabase, String(userId));
    if (ensured.error) {
      return send(res, 500, {
        ok: false,
        rid: requestId,
        error: 'Wallet provision failed',
        details: ensured.error.message,
      });
    }
    const walletRow = ensured.data;

    const { data: requestRow, error: requestErr } = await supabase
      .from('deposit_requests')
      .insert({
        user_id: String(userId),
        amount,
        method,
        ref: reference || null,
        slip_url: slipUrl || null,
      })
      .select()
      .single();

    if (requestErr) {
      return send(res, 500, {
        ok: false,
        rid: requestId,
        error: 'Deposit request failed',
        details: requestErr.message,
      });
    }

    const note = reference || 'deposit request';
    const balanceAfter = Number(walletRow?.balance ?? 0);
    const txnInsert = {
      user_id: String(userId),
      type: 'deposit_pending',
      amount,
      balance_after: balanceAfter,
      note,
    };

    const { data: txnRow, error: txnErr } = await supabase
      .from('wallet_txns')
      .insert(txnInsert)
      .select()
      .single();

    if (txnErr) {
      return send(res, 500, {
        ok: false,
        rid: requestId,
        error: 'Transaction insert failed',
        details: txnErr.message,
      });
    }

    return send(res, 200, {
      ok: true,
      rid: requestId,
      request: sanitizeDepositRequest(requestRow),
      txn: sanitizeTxn(txnRow),
      wallet: sanitizeWallet(walletRow),
    });
  } catch (err) {
    return send(res, 500, {
      ok: false,
      rid: requestId,
      error: 'SERVER_ERROR',
      details: err?.message || String(err),
    });
  }
}

export default withCors(handler, { methods: ['POST', 'OPTIONS'] });
