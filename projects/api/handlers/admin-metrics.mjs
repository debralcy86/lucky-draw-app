export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from './telegramVerify.mjs';

function parseAdminIds(env) {
  return (env || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  // Parse JSON body
  let raw = '';
  await new Promise(r => { req.on('data', c => raw += c); req.on('end', r); });
  let body = {};
  try { body = JSON.parse(raw || '{}'); } catch {}

  const authHeader = (req.headers?.authorization || req.headers?.Authorization || '').toString();
  const initFromHeader = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : '';
  const { initData: initFromBody } = body || {};
  const initData = initFromBody || initFromHeader;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allow = parseAdminIds(process.env.ADMIN_USER_IDS);
  const v = verifyInitData(String(initData || ''), botToken);
  if (!v.ok || (allow.length > 0 && !allow.includes(String(v.userId || '')))) {
    res.statusCode = 401;
    res.end(JSON.stringify({ ok: false, error: 'Unauthorized' }));
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: 'Missing Supabase envs' }));
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  try {
    const { count: userCount, error: countErr } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;

    const { data: balances, error: balErr } = await supabase
      .from('wallets')
      .select('balance');
    if (balErr) throw balErr;
    const totalBalance = (balances || []).reduce((a, b) => a + Number(b.balance || 0), 0);

    const { data: openDraw, error: drawErr } = await supabase
      .from('draws')
      .select('*')
      .eq('status', 'open')
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (drawErr && drawErr.code !== 'PGRST116') throw drawErr;

    // ---- Withdraw KPIs ----
    // 1) Pending count
    let withdraw_pending_count = 0;
    {
      const { count, error } = await supabase
        .from('withdraw_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      withdraw_pending_count = count || 0;
    }
    // 2) Approved today (MYT) total amount
    let withdraw_approved_today_sum = 0;
    {
      // Compute start-of-day in MYT then convert to UTC ISO for comparison
      const now = new Date();
      // Asia/Kuala_Lumpur is UTC+8 (no DST)
      const tzOffsetHours = 8;
      const utcMs = now.getTime();
      const mytMs = utcMs + tzOffsetHours * 3600 * 1000;
      const myt = new Date(mytMs);
      const sodMyt = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate(), 0, 0, 0));
      const sodUtc = new Date(sodMyt.getTime() - tzOffsetHours * 3600 * 1000).toISOString();

      const { data: rows, error } = await supabase
        .from('withdraw_requests')
        .select('amount, created_at')
        .eq('status', 'approved')
        .gte('created_at', sodUtc);
      if (error) throw error;
      withdraw_approved_today_sum = (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
    }

    res.statusCode = 200;
    res.end(JSON.stringify({
      ok: true,
      users: userCount || 0,
      totalBalance,
      openDraw: openDraw || null,
      // aliases for new admin.html expectations
      total_balance: totalBalance,
      open_draw: openDraw || null,
      // withdraw KPIs
      withdraw_pending_count,
      withdraw_approved_today_sum
    }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
  }
}
