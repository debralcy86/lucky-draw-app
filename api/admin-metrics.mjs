export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { verifyTelegramInitData } from '../api-lib/telegramVerify.mjs';

function parseAdminIds(list) {
  return (list || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
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

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }

  const body = await readBody(req);
  const authHeader = (req.headers?.authorization || req.headers?.Authorization || '').toString();
  const headerInit = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : '';
  const initData = body?.initData || headerInit;
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!botToken) {
    return send(res, 500, { ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' });
  }
  const allow = parseAdminIds(process.env.ADMIN_USER_IDS);
  const verification = verifyTelegramInitData(String(initData || ''), botToken);
  const userId = verification?.data?.user?.id ? String(verification.data.user.id) : '';

  if (!verification.ok || (allow.length > 0 && (!userId || !allow.includes(userId)))) {
    return send(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return send(res, 500, { ok: false, error: 'Missing Supabase envs' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  try {
    const { count: userCount, error: userErr } = await supabase
      .from('wallets')
      .select('*', { count: 'exact', head: true });
    if (userErr) throw userErr;

    const { data: balances, error: balanceErr } = await supabase
      .from('wallets')
      .select('balance');
    if (balanceErr) throw balanceErr;

    const totalBalance = (balances || []).reduce((sum, row) => sum + Number(row.balance || 0), 0);

    const { data: openDraw, error: drawErr } = await supabase
      .from('draws')
      .select('*')
      .eq('status', 'open')
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (drawErr && drawErr.code !== 'PGRST116') throw drawErr;

    let withdrawPendingCount = 0;
    {
      const { count, error } = await supabase
        .from('withdraw_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      withdrawPendingCount = count || 0;
    }

    let withdrawApprovedTodaySum = 0;
    {
      const tzOffsetHours = 8; // MYT UTC+8 with no DST
      const now = new Date();
      const utcMs = now.getTime();
      const mytMs = utcMs + tzOffsetHours * 3600 * 1000;
      const mytDate = new Date(mytMs);
      const sodMyt = new Date(Date.UTC(mytDate.getUTCFullYear(), mytDate.getUTCMonth(), mytDate.getUTCDate(), 0, 0, 0));
      const sodUtcIso = new Date(sodMyt.getTime() - tzOffsetHours * 3600 * 1000).toISOString();

      const { data, error } = await supabase
        .from('withdraw_requests')
        .select('amount, created_at')
        .eq('status', 'approved')
        .gte('created_at', sodUtcIso);
      if (error) throw error;
      withdrawApprovedTodaySum = (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    }

    return send(res, 200, {
      ok: true,
      users: userCount || 0,
      totalBalance,
      openDraw: openDraw || null,
      total_balance: totalBalance,
      open_draw: openDraw || null,
      withdraw_pending_count: withdrawPendingCount,
      withdraw_approved_today_sum: withdrawApprovedTodaySum,
    });
  } catch (err) {
    return send(res, 500, { ok: false, error: err?.message || String(err) });
  }
}
