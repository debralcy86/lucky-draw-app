export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import verifyInitData, { verifyTelegramInitData } from '../api-lib/telegramVerify.mjs';

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

function getInitData(req, body) {
  const auth = (req.headers?.authorization || req.headers?.Authorization || '').toString();
  const fromHeader = auth.startsWith('tma ') ? auth.slice(4).trim() : '';
  const fromBody = typeof body.initData === 'string' ? body.initData.trim() : '';
  return fromBody || fromHeader;
}

function sanitizeProfilePayload(input = {}) {
  const out = {};
  if (typeof input.name === 'string') out.name = input.name.trim();
  if (typeof input.contact === 'string') out.contact = input.contact.trim();
  if (typeof input.pin === 'string') out.pin = input.pin.trim();
  if (typeof input.userId === 'string') out.userId = input.userId.trim();
  if (typeof input.user_id === 'string') out.userId = input.user_id.trim();
  return out;
}

function maskProfileRow(row, { pin } = {}) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    name: row.name || '',
    contact: row.contact || '',
    has_pin: Boolean(pin && String(pin).length),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}


export default async function profile(req, res) {
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

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_BOT_TOKEN) {
    return send(res, 500, { ok: false, error: 'Missing server configuration', rid: requestId });
  }

  try {
    const body = await readJsonBody(req);
    const initData = getInitData(req, body);
    if (!initData) {
      return send(res, 400, { ok: false, error: 'Missing initData', rid: requestId });
    }

    const check = verifyTelegramInitData(initData, TELEGRAM_BOT_TOKEN) || verifyInitData(initData, TELEGRAM_BOT_TOKEN);
    if (!check?.ok) {
      return send(res, 401, { ok: false, error: check?.error || 'Invalid Telegram session', rid: requestId });
    }

    const payload = check?.payload || check?.params || {};
    const verifiedUser = check?.user || {};
    const userIdRaw = check?.userId || verifiedUser?.id || verifiedUser?.user?.id;
    const authDateRaw = payload?.auth_date || payload?.authDate;

    const userId = userIdRaw ? String(userIdRaw) : '';
    const authDate = Number(authDateRaw || 0);

    if (!userId || !Number.isFinite(authDate) || authDate <= 0) {
      return send(res, 400, { ok: false, error: 'Missing required Telegram fields', rid: requestId });
    }

    console.log('profile_request', {
      rid: requestId,
      init_len: initData.length,
      user_id: userId,
      auth_date: authDate,
    });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const profilePayload = sanitizeProfilePayload(body.profile);
    if (profilePayload.userId && profilePayload.userId !== userId) {
      return send(res, 400, { ok: false, error: 'User mismatch', rid: requestId });
    }

    const isSave = profilePayload && (profilePayload.name !== undefined || profilePayload.contact !== undefined || profilePayload.pin !== undefined);
    let profileRow = null;

    let pinValue = profilePayload.pin || '';

    if (isSave) {
      const name = profilePayload.name || '';
      const contact = profilePayload.contact || '';
      if (!name || !contact || !pinValue) {
        return send(res, 400, { ok: false, error: 'Missing profile fields', rid: requestId });
      }

      const nextRow = {
        user_id: userId,
        name,
        contact,
        updated_at: new Date().toISOString(),
      };

      const { data: upserted, error: upsertErr } = await sb
        .from('profiles')
        .upsert(nextRow, { onConflict: 'user_id' })
        .select('user_id,name,contact,created_at,updated_at')
        .maybeSingle();
      if (upsertErr) {
        console.error('profile_save_error', { rid: requestId, error: upsertErr.message });
        return send(res, 500, { ok: false, error: 'Profile save failed', rid: requestId });
      }
      profileRow = upserted || { ...nextRow };
    }

    if (!profileRow) {
      const { data: found, error: fetchErr } = await sb
        .from('profiles')
        .select('user_id,name,contact,created_at,updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (fetchErr) {
        console.error('profile_fetch_error', { rid: requestId, error: fetchErr.message });
        return send(res, 500, { ok: false, error: 'Profile lookup failed', rid: requestId });
      }
      profileRow = found || null;
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
      profile: maskProfileRow(profileRow, { pin: pinValue }),
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
