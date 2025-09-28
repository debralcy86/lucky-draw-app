export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { verifyTelegramInitData } from '../api-lib/telegramVerify.mjs';

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
    return req.body && typeof req.body === 'object' ? req.body : {};
  }
  let raw = '';
  await new Promise((resolve) => {
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', resolve);
    req.on('error', resolve);
  });
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST,OPTIONS');
      return send(res, 405, { ok: false, error: 'Method not allowed' });
    }

    const body = await readBody(req);
    const cronSecret = (process.env.CRON_KEY || process.env.CRON_SECRET || '').trim();
    const cronHeader = (req.headers?.['x-cron-key'] || req.headers?.['X-Cron-Key'] || '').toString().trim();

    const authHeader = (req.headers?.authorization || req.headers?.Authorization || '').toString();
    const initFromHeader = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : '';
    const initData = body?.initData || initFromHeader;

    let userId = '';
    if (cronSecret && cronHeader && cronHeader === cronSecret) {
      userId = String(body?.user_id || body?.userId || '').trim();
      if (!userId) {
        return send(res, 400, { ok: false, rid, error: 'Missing user_id for cron request' });
      }
    } else {
      if (!initData) {
        return send(res, 400, { ok: false, rid, error: 'Missing initData' });
      }
      const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
      if (!botToken) {
        return send(res, 500, { ok: false, rid, error: 'Missing TELEGRAM_BOT_TOKEN' });
      }
      const verified = verifyTelegramInitData(String(initData), botToken);
      if (!verified.ok) {
        return send(res, 401, { ok: false, rid, error: 'Invalid Telegram initData', reason: verified.reason });
      }
      userId = verified?.data?.user?.id ? String(verified.data.user.id) : '';
      if (!userId) {
        return send(res, 400, { ok: false, rid, error: 'Telegram user id missing' });
      }
    }

    const amount = Number(body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return send(res, 400, { ok: false, rid, error: 'Invalid amount' });
    }
    if (amount > 1_000_000) {
      return send(res, 400, { ok: false, rid, error: 'Amount too large' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return send(res, 500, { ok: false, rid, error: 'Missing Supabase envs' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const { data: walletRow, error: walletErr } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletErr) {
      return send(res, 500, { ok: false, rid, error: 'Wallet read failed', details: walletErr.message });
    }

    if (!walletRow) {
      const { error: upsertErr } = await supabase
        .from('wallets')
        .upsert({ user_id: userId, balance: 0 });
      if (upsertErr) {
        return send(res, 500, { ok: false, rid, error: 'Wallet provision failed', details: upsertErr.message });
      }
    }

    const note = (body?.note || '').toString().trim() || null;
    const { data: requestRow, error: requestErr } = await supabase
      .from('withdraw_requests')
      .insert({ user_id: userId, amount, note, status: 'pending' })
      .select()
      .single();

    if (requestErr) {
      return send(res, 500, { ok: false, rid, error: 'Create failed', details: requestErr.message });
    }

    return send(res, 200, {
      ok: true,
      rid,
      request: {
        id: requestRow.id,
        amount: requestRow.amount,
        status: requestRow.status,
        created_at: requestRow.created_at,
      },
    });
  } catch (err) {
    return send(res, 500, { ok: false, rid, error: 'SERVER_ERROR', details: err?.message || String(err) });
  }
}
