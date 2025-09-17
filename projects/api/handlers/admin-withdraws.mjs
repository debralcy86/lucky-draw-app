// projects/api/handlers/admin-withdraws.mjs
import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from './telegramVerify.mjs';

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function parseAdmins(env) {
  return (env || '').split(',').map(s => s.trim()).filter(Boolean);
}

function maskUser(uid = '') {
  const s = String(uid);
  return s.length <= 4 ? '****' : '****' + s.slice(-4);
}

export async function adminWithdraws(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);
  try {
    if (req.method !== 'POST') {
      return send(res, 405, { ok: false, rid, error: 'Method not allowed' });
    }

    // body
    let raw = '';
    await new Promise(r => { req.on('data', c => raw += c); req.on('end', r); });
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch {}

    const authHeader = (req.headers?.authorization || req.headers?.Authorization || '').toString();
    const initFromHeader = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : '';
    const { initData: initFromBody, status = 'pending', limit = 50, offset = 0 } = body || {};
    const initData = initFromBody || initFromHeader;

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.TELEGRAM_BOT_TOKEN) {
      return send(res, 500, { ok: false, rid, error: 'Missing envs' });
    }

    // Admin check
    const v = verifyInitData(String(initData || ''), process.env.TELEGRAM_BOT_TOKEN);
    const allowed = parseAdmins(process.env.ADMIN_USER_IDS);
    if (!v.ok || (allowed.length && !allowed.includes(String(v.userId || '')))) {
      return send(res, 401, { ok: false, rid, error: 'Unauthorized' });
    }

    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const lim = Math.max(1, Math.min(100, Number(limit) || 50));
    const off = Math.max(0, Number(offset) || 0);

    let q = supa.from('withdraw_requests')
      .select('id,user_id,amount,note,status,created_at')
      .order('created_at', { ascending: false })
      .range(off, off + lim - 1);

    if (status) q = q.eq('status', String(status));

    const { data, error } = await q;
    if (error) return send(res, 500, { ok: false, rid, error: 'Query failed', details: error.message });

    const rows = (data || []).map(r => ({
      id: r.id,
      user_id: r.user_id,
      user_mask: maskUser(r.user_id),
      amount: Number(r.amount || 0),
      note: r.note || null,
      status: r.status || 'pending',
      created_at: r.created_at
    }));

    return send(res, 200, { ok: true, rid, rows, page: { limit: lim, offset: off, returned: rows.length } });
  } catch (e) {
    return send(res, 500, { ok: false, rid, error: String(e?.message || e) });
  }
}
