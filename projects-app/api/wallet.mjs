export const config = { runtime: 'nodejs' };

import { Buffer } from 'node:buffer';
import verifyInitData from './_lib/telegramVerify.mjs';
import { withCors } from './_lib/cors.mjs';
import {
  createServiceClient,
  ensureWallet,
  fetchWallet,
  adjustWalletBalance,
  insertTransaction,
} from './_lib/wallet.js';

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function respond(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function ok(res, data) {
  return respond(res, 200, { ok: true, ...data });
}

function bad(res, reason, extra) {
  return respond(res, 400, { ok: false, reason, ...(extra || {}) });
}

function err(res, reason, extra) {
  return respond(res, 500, { ok: false, reason, ...(extra || {}) });
}

async function readJSON(req) {
  if (typeof req.json === 'function') {
    try {
      return await req.json();
    } catch (_) {
      // fall through to manual reader
    }
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return null;
  }
}

function maskDestination(destination) {
  if (!destination) return '';
  const value = String(destination);
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

async function createDepositRequest(client, userId, { amount, method, ref, note }) {
  const ensured = await ensureWallet(client, userId);
  if (ensured.error) {
    return { error: ensured.error, code: 'wallet_upsert_failed' };
  }
  const balanceBefore = Number(ensured.data?.balance ?? 0);

  const insert = await client
    .from('deposit_requests')
    .insert({ user_id: userId, amount, method, ref, note, status: 'pending' })
    .select('id')
    .maybeSingle();
  if (insert.error) {
    return { error: insert.error, code: 'deposit_request_insert_failed' };
  }

  const requestId = insert.data?.id;
  const noteSuffix = `${method ? ` via ${method}` : ''}${ref ? ` ref:${ref}` : ''}`.trim();
  const txnNote = `deposit request #${requestId}${noteSuffix ? noteSuffix : ''}`;
  const { error: txnErr } = await insertTransaction(client, {
    user_id: userId,
    type: 'deposit_pending',
    amount: amount || 0,
    balance_after: balanceBefore,
    note: txnNote,
  });

  if (txnErr) {
    return { error: txnErr, code: 'txn_insert_failed', requestId };
  }

  return { requestId, status: 'pending' };
}

async function createWithdrawRequest(client, userId, { amount, destination, note }) {
  const { data: walletRow, error } = await fetchWallet(client, userId);
  if (error) {
    return { error, code: 'wallet_fetch_failed' };
  }
  const balanceBefore = Number(walletRow?.balance ?? 0);
  if (balanceBefore < amount) {
    const errObj = new Error('insufficient_balance');
    errObj.code = 'insufficient_balance';
    return { error: errObj, code: 'insufficient_balance', balance: balanceBefore };
  }

  const insert = await client
    .from('withdraw_requests')
    .insert({ user_id: userId, amount, destination, note, status: 'pending' })
    .select('id')
    .maybeSingle();
  if (insert.error) {
    return { error: insert.error, code: 'withdraw_request_insert_failed' };
  }

  const requestId = insert.data?.id;
  const masked = maskDestination(destination);
  const { error: txnErr } = await insertTransaction(client, {
    user_id: userId,
    type: 'withdraw_pending',
    amount: amount || 0,
    balance_after: balanceBefore,
    note: `withdraw request #${requestId} to ${masked}`,
  });
  if (txnErr) {
    return { error: txnErr, code: 'txn_insert_failed', requestId };
  }

  return { requestId, status: 'pending' };
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return bad(res, 'method_not_allowed');
  }

  let client;
  try {
    client = createServiceClient();
  } catch (e) {
    return err(res, 'server_misconfig', { message: e.message });
  }

  const body = await readJSON(req);
  if (!body || typeof body !== 'object') {
    return bad(res, 'invalid_json');
  }

  const adminSecret = process.env.ADMIN_TOKEN ? String(process.env.ADMIN_TOKEN).trim() : '';
  const adminHeader = String(req.headers['x-admin-token'] || '').trim();
  const isAdminToken = adminSecret && adminHeader && adminHeader === adminSecret;
  const action = String(body.action || '').trim();

  if (isAdminToken) {
    const userId = String(body.userId || '').trim();
    if (!userId) return bad(res, 'missing_userId');

    if (action === 'deposit') {
      const amount = Number(body.amount);
      const method = String(body.method || '').slice(0, 50);
      const ref = String(body.ref || '').slice(0, 64);
      const note = String(body.note || '').slice(0, 200);
      if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'invalid_amount');
      if (!method) return bad(res, 'missing_method');
      const result = await createDepositRequest(client, userId, { amount, method, ref, note });
      if (result.error) {
        const status = result.code === 'wallet_upsert_failed' ? 500 : 500;
        return respond(res, status, { ok: false, reason: result.code, message: String(result.error.message || result.error) });
      }
      return ok(res, { rid: rid(), requestId: result.requestId, status: result.status });
    }

    if (action === 'withdraw') {
      const amount = Number(body.amount);
      const destination = String(body.destination || '').slice(0, 120);
      const note = String(body.note || '').slice(0, 200);
      if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'invalid_amount');
      if (!destination) return bad(res, 'missing_destination');
      const result = await createWithdrawRequest(client, userId, { amount, destination, note });
      if (result.error) {
        if (result.code === 'insufficient_balance') return bad(res, 'insufficient_balance', { balance: result.balance });
        return err(res, result.code || 'withdraw_request_insert_failed', { message: String(result.error.message || result.error) });
      }
      return ok(res, { rid: rid(), requestId: result.requestId, status: result.status });
    }

    if (action === 'credit' || action === 'debit') {
      const delta = Number(body.delta);
      const note = String(body.note || '').slice(0, 200);
      if (!Number.isFinite(delta)) return bad(res, 'invalid_delta');
      const result = await adjustWalletBalance(client, {
        userId,
        delta,
        note,
        type: delta >= 0 ? 'credit' : 'debit',
      });
      if (result.error) {
        if (result.code === 'insufficient_balance') {
          return bad(res, 'insufficient_balance', { balance: result.balance });
        }
        return err(res, result.code || 'wallet_update_failed', { message: String(result.error.message || result.error) });
      }
      return ok(res, { rid: rid(), userId, balance: result.balance });
    }

    return bad(res, 'unknown_action');
  }

  const authHeader = String(req.headers.authorization || '');
  const adminOverrideHeader = String(req.headers['x-admin-token'] || '');
  let userId = '';

  if (authHeader.startsWith('tma ')) {
    const initData = authHeader.slice(4);
    const verified = verifyInitData(initData, process.env.TELEGRAM_BOT_TOKEN);
    if (!verified?.ok) {
      return bad(res, 'tma_invalid', { message: verified?.error || 'verify_failed' });
    }
    userId = String(verified.userId);
  } else if (adminSecret && adminOverrideHeader === adminSecret) {
    userId = String(body.userId || '').trim();
    if (!userId) return bad(res, 'missing_userId_for_admin');
  } else {
    return bad(res, 'missing_tma_or_admin_token');
  }

  if (action === 'deposit') {
    const amount = Number(body.amount);
    const method = String(body.method || '').slice(0, 50);
    const ref = String(body.ref || '').slice(0, 64);
    const note = String(body.note || '').slice(0, 200);
    if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'invalid_amount');
    if (!method) return bad(res, 'missing_method');
    const result = await createDepositRequest(client, userId, { amount, method, ref, note });
    if (result.error) {
      return err(res, result.code || 'deposit_request_insert_failed', { message: String(result.error.message || result.error), requestId: result.requestId, status: 'pending' });
    }
    return ok(res, { rid: rid(), requestId: result.requestId, status: result.status });
  }

  if (action === 'withdraw') {
    const amount = Number(body.amount);
    const destination = String(body.destination || '').slice(0, 120);
    const note = String(body.note || '').slice(0, 200);
    if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'invalid_amount');
    if (!destination) return bad(res, 'missing_destination');
    const result = await createWithdrawRequest(client, userId, { amount, destination, note });
    if (result.error) {
      if (result.code === 'insufficient_balance') return bad(res, 'insufficient_balance', { balance: result.balance });
      return err(res, result.code || 'withdraw_request_insert_failed', { message: String(result.error.message || result.error), requestId: result.requestId, status: 'pending' });
    }
    return ok(res, { rid: rid(), requestId: result.requestId, status: result.status });
  }

  return bad(res, 'unknown_action');
}

export default withCors(handler, {
  methods: ['POST', 'OPTIONS'],
  exposeHeaders: ['Content-Type'],
});
