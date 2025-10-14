export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { withTMA } from './_lib/tma.mjs';
import { hashPin } from './_lib/pin.js';

const ALLOW_HEADERS = 'Content-Type, Authorization, X-Telegram-InitData, X-Debug-RID';

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  if (req.body !== undefined) {
    if (typeof req.body === 'object' && req.body !== null) return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    if (Buffer.isBuffer(req.body)) {
      try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; }
    }
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function sanitizeProfilePayload(input = {}) {
  const out = {};
  if (typeof input.name === 'string') out.name = input.name.trim();
  if (typeof input.contact === 'string') out.contact = input.contact.trim();
  if (typeof input.pin === 'string') out.pin = input.pin.trim();
  if (typeof input.userId === 'string') out.userId = input.userId.trim();
  if (typeof input.user_id === 'string') out.userId = input.user_id.trim();
  if (typeof input.withdrawMethod === 'string') out.withdrawMethod = input.withdrawMethod.trim();
  if (typeof input.withdraw_method === 'string') out.withdrawMethod = input.withdraw_method.trim();
  if (typeof input.withdrawDest === 'string') out.withdrawDest = input.withdrawDest.trim();
  if (typeof input.withdraw_dest === 'string') out.withdrawDest = input.withdraw_dest.trim();
  if (typeof input.withdrawHolder === 'string') out.withdrawHolder = input.withdrawHolder.trim();
  if (typeof input.withdraw_holder === 'string') out.withdrawHolder = input.withdraw_holder.trim();
  return out;
}

function maskProfileRow(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    name: row.name || '',
    contact: row.contact || '',
    has_pin: Boolean(row.pin_hash),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    is_admin: Boolean(row.is_admin),
    withdraw_method: row.withdraw_method || null,
    withdraw_dest: row.withdraw_dest || null,
    withdraw_holder: row.withdraw_holder || null,
  };
}


async function profile(req, res) {
  const requestId = rid();
  const allowOrigin = String(process.env.CORS_ORIGIN || '*')
    .replace(/[\r\n]/g, ' ')
    .split(',')[0]
    .trim() || '*';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return send(res, 405, { ok: false, error: 'Method Not Allowed', rid: requestId });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { ok: false, error: 'Missing server configuration', rid: requestId });
  }

  try {
    const body = await readJsonBody(req);

    const userId = req.tma?.userId ? String(req.tma.userId) : '';
    if (!userId) {
      return send(res, 401, { ok: false, error: 'invalid_init_data', rid: requestId });
    }

    console.log('profile_request', {
      rid: requestId,
      user_id: userId,
    });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const profilePayload = sanitizeProfilePayload(body.profile);
    if (profilePayload.userId && profilePayload.userId !== userId) {
      return send(res, 400, { ok: false, error: 'User mismatch', rid: requestId });
    }

    const PROFILE_SELECT = 'user_id,name,contact,pin_hash,created_at,updated_at,is_admin,withdraw_method,withdraw_dest,withdraw_holder';

    const { data: existingProfile, error: existingErr } = await sb
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingErr && existingErr.code !== 'PGRST116') {
      console.error('profile_fetch_error', { rid: requestId, error: existingErr.message });
      return send(res, 500, { ok: false, error: 'Profile lookup failed', rid: requestId });
    }

    let profileRow = existingProfile || null;

    const needsProfileSave = profilePayload.name !== undefined
      || profilePayload.contact !== undefined
      || profilePayload.pin !== undefined;
    const needsWithdrawSave = profilePayload.withdrawMethod !== undefined
      || profilePayload.withdrawDest !== undefined
      || profilePayload.withdrawHolder !== undefined;
    const isSave = needsProfileSave || needsWithdrawSave;

    let pinHash = profileRow?.pin_hash ?? null;
    if (profilePayload.pin !== undefined) {
      const trimmedPin = profilePayload.pin.trim();
      pinHash = trimmedPin ? hashPin(trimmedPin) : null;
    }

    if (needsProfileSave) {
      const name = profilePayload.name ?? profileRow?.name ?? '';
      const contact = profilePayload.contact ?? profileRow?.contact ?? '';
      if (!name || !contact || (!pinHash && !profileRow?.pin_hash)) {
        return send(res, 400, { ok: false, error: 'Missing profile fields', rid: requestId });
      }
    }

    if (needsWithdrawSave) {
      const method = profilePayload.withdrawMethod ?? profileRow?.withdraw_method ?? '';
      const dest = profilePayload.withdrawDest ?? profileRow?.withdraw_dest ?? '';
      const holder = profilePayload.withdrawHolder ?? profileRow?.withdraw_holder ?? '';
      if (!method || !dest || !holder) {
        return send(res, 400, { ok: false, error: 'Missing withdraw fields', rid: requestId });
      }
    }

    if (needsProfileSave || needsWithdrawSave || !profileRow) {
      const nextRow = {
        user_id: userId,
        name: profilePayload.name !== undefined ? profilePayload.name : (profileRow?.name || ''),
        contact: profilePayload.contact !== undefined ? profilePayload.contact : (profileRow?.contact || ''),
        updated_at: new Date().toISOString(),
        withdraw_method: profilePayload.withdrawMethod !== undefined ? (profilePayload.withdrawMethod || null) : (profileRow?.withdraw_method || null),
        withdraw_dest: profilePayload.withdrawDest !== undefined ? (profilePayload.withdrawDest || null) : (profileRow?.withdraw_dest || null),
        withdraw_holder: profilePayload.withdrawHolder !== undefined ? (profilePayload.withdrawHolder || null) : (profileRow?.withdraw_holder || null),
        pin_hash: pinHash,
      };

      const { data: upserted, error: upsertErr } = await sb
        .from('profiles')
        .upsert(nextRow, { onConflict: 'user_id' })
        .select(PROFILE_SELECT)
        .maybeSingle();
      if (upsertErr) {
        console.error('profile_save_error', { rid: requestId, error: upsertErr.message });
        return send(res, 500, { ok: false, error: 'Profile save failed', rid: requestId });
      }
      profileRow = upserted || { ...nextRow, created_at: profileRow?.created_at || new Date().toISOString() };
    }
    const { data: walletRow, error: walletErr } = await sb
      .from('wallets')
      .select('user_id,balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (walletErr) {
      const message = String(walletErr.message || '');
      if (message.includes('Could not find the table')) {
        console.warn('wallets_table_missing', { rid: requestId });
      } else {
        console.error('wallet_fetch_error', { rid: requestId, error: message });
        return send(res, 500, { ok: false, error: 'Wallet lookup failed', rid: requestId });
      }
    }
    let wallet = walletRow || null;
    if (!wallet) {
      const { data: createdWallet, error: createWalletErr } = await sb
        .from('wallets')
        .insert({ user_id: userId, balance: 0 })
        .select('user_id,balance')
        .maybeSingle();
      if (createWalletErr) {
        console.error('wallet_autocreate_error', { rid: requestId, error: createWalletErr.message });
      } else {
        wallet = createdWallet || { user_id: userId, balance: 0 }; // best effort
      }
    }

    const response = {
      ok: true,
      rid: requestId,
      profile_exists: Boolean(profileRow),
      profile: maskProfileRow(profileRow),
      wallet: wallet ? { user_id: wallet.user_id, balance: Number(wallet.balance ?? 0) } : null,
    };

    if (isSave) {
      response.saved = true;
    }

    return send(res, 200, response);
  } catch (err) {
    console.error('profile_handler_error', { rid: requestId, error: err?.message || err });
    return send(res, 500, { ok: false, error: 'Server error', rid: requestId });
  }
}

export default withTMA(profile);
