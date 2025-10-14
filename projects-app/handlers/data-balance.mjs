export const config = { runtime: 'nodejs' };

import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import { validate, parse } from '@telegram-apps/init-data-node';
import { setCorsHeaders } from './_lib/cors.mjs';
import extractInitData from './_lib/initData.mjs';

function rid() { return Math.random().toString(36).slice(2, 10) }

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureWallet(supabase, userId) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (data) return { data };
  if (error && error.code !== 'PGRST116') return { error }; // not "no rows"
  const { data: inserted, error: insErr } = await supabase
    .from('wallets')
    .insert({ user_id: userId, balance: 0 })
    .select('*')
    .single();
  if (insErr) return { error: insErr };
  return { data: inserted };
}

async function listTransactions(supabase, userId, { limit, offset }) {
  return await supabase
    .from('wallet_txns')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
}

async function handlerCore(req, res) {
  const requestId = rid();
  const supabase = getAdminClient();

  const adminToken = process.env.ADMIN_TOKEN || '';

  if (req.method === 'GET') {
    // paging
    const url = new URL(req.url, 'http://localhost');
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)));
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));

    // TMA auth (accept header, body.initData, or ?initData=)
    const initData = extractInitData(req);
    if (!initData) {
      return send(res, 401, { ok: false, rid: requestId, error: 'missing_initdata' });
    }
    try {
      validate(initData, process.env.TELEGRAM_BOT_TOKEN);
    } catch {
      return send(res, 401, { ok: false, rid: requestId, error: 'invalid_init_data' });
    }
    let parsed;
    try { parsed = parse(initData); }
    catch { return send(res, 400, { ok: false, rid: requestId, error: 'parse_failed' }) }

    const userId = parsed?.user?.id ? String(parsed.user.id) : '';
    if (!userId) return send(res, 401, { ok: false, rid: requestId, error: 'no_user_in_initdata' });

    const ensured = await ensureWallet(supabase, userId);
    if (ensured.error) {
      return send(res, 500, { ok: false, rid: requestId, error: 'wallet_lookup_failed', details: ensured.error.message });
    }
    const wallet = ensured.data;

    const { data: txns, error: txnErr } = await listTransactions(supabase, userId, { limit, offset });
    if (txnErr) {
      return send(res, 500, { ok: false, rid: requestId, error: 'txn_fetch_failed', details: txnErr.message });
    }

    return send(res, 200, {
      ok: true,
      tag: 'data-balance/v2',
      rid: requestId,
      wallet,
      txns: txns || [],
      page: { limit, offset, returned: (txns || []).length },
    });
  }

  if (req.method === 'POST') {
    // admin-only balance adjust
    let isAuthorized = false;
    if (adminToken && req.headers['x-admin-token'] === adminToken) isAuthorized = true;

    if (!isAuthorized) {
      return send(res, 401, { ok: false, rid: requestId, error: 'unauthorized' });
    }

    const body = await readJson(req);
    const userId = (body.userId || '').toString().trim();
    const delta = Number(body.delta);
    const note = (body.note || '').toString().trim();
    if (!userId || Number.isNaN(delta)) {
      return send(res, 400, { ok: false, rid: requestId, error: 'invalid_user_or_delta' });
    }

    // upsert wallet
    const ensured = await ensureWallet(supabase, userId);
    if (ensured.error) {
      return send(res, 500, { ok: false, rid: requestId, error: 'wallet_lookup_failed', details: ensured.error.message });
    }
    const newBalance = (ensured.data?.balance || 0) + delta;
    if (newBalance < 0) {
      return send(res, 400, { ok: false, rid: requestId, error: 'insufficient_balance', balance: ensured.data?.balance || 0 });
    }

    const { error: updErr } = await supabase
      .from('wallets')
      .update({ balance: newBalance })
      .eq('user_id', userId);
    if (updErr) {
      return send(res, 500, { ok: false, rid: requestId, error: 'wallet_update_failed', details: updErr.message });
    }

    const { error: insTxnErr } = await supabase
      .from('wallet_txns')
      .insert({
        user_id: userId,
        amount: Math.abs(delta),
        type: delta >= 0 ? 'credit' : 'debit',
        note,
      });
    if (insTxnErr) {
      return send(res, 500, { ok: false, rid: requestId, error: 'txn_insert_failed', details: insTxnErr.message });
    }

    return send(res, 200, { ok: true, rid: requestId, balance: newBalance, tag: 'data-balance/v2' });
  }

  return send(res, 405, { ok: false, rid: requestId, error: 'method_not_allowed' });
}

export default async function handler(req, res) {
  setCorsHeaders(res, req.headers.origin || '');
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');
  try { return await handlerCore(req, res) }
  catch (e) { return send(res, 500, { ok: false, error: 'unhandled', details: e?.message || String(e) }) }
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? JSON.parse(raw) : {};
}
