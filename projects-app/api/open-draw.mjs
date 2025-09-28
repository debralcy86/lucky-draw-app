export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

const GROUPS = ['A', 'B', 'C', 'D'];
const GROUP_SCHEDULE = {
  A: { hour: 0, next: 'B' },
  B: { hour: 6, next: 'C' },
  C: { hour: 12, next: 'D' },
  D: { hour: 18, next: 'A' },
};

function sanitizeCorsOrigin(val) {
  return String(val || '*').replace(/[\r\n]/g, '').split(',')[0].trim() || '*';
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseGroupToken(code) {
  if (!code || typeof code !== 'string') return null;
  const match = code.match(/-(A|B|C|D)-/i);
  return match ? match[1].toUpperCase() : null;
}

function fallbackNext({ group }) {
  const nowUtc = new Date();
  const tzOffsetHours = 8; // MYT UTC+8, no DST
  const myNow = new Date(nowUtc.getTime() + tzOffsetHours * 3600 * 1000);
  myNow.setSeconds(0, 0);

  const nextGroup = group && GROUP_SCHEDULE[group]?.next ? GROUP_SCHEDULE[group].next : GROUPS[0];
  const schedule = GROUP_SCHEDULE[nextGroup] || GROUP_SCHEDULE.A;
  const candidate = new Date(myNow);
  candidate.setHours(schedule.hour, 0, 0, 0);
  if (candidate <= myNow) candidate.setDate(candidate.getDate() + 1);

  const utcIso = new Date(candidate.getTime() - tzOffsetHours * 3600 * 1000).toISOString();
  return {
    id: `fallback-${nextGroup}-${utcIso}`,
    group: nextGroup,
    scheduled_at: utcIso,
    status: 'scheduled',
    created_at: utcIso,
  };
}

export default async function handler(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);
  res.setHeader('Access-Control-Allow-Origin', sanitizeCorsOrigin(process.env.CORS_ORIGIN));
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cron-Key');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET,OPTIONS');
    return send(res, 405, { ok: false, rid, error: 'Method Not Allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return send(res, 500, { ok: false, rid, error: 'Missing Supabase envs' });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const url = new URL(req.url, 'http://localhost');
    const groupQuery = (url.searchParams.get('group') || '').trim().toUpperCase();
    const requestNext = url.searchParams.has('next');
    const groupFilter = GROUPS.includes(groupQuery) ? groupQuery : null;

    let query = supabase
      .from('draws')
      .select('id, code, status, scheduled_at')
      .eq('status', 'open')
      .order('scheduled_at', { ascending: true })
      .limit(10);

    if (groupFilter) {
      query = query.like('code', `%-${groupFilter}-%`);
    }

    const { data, error } = await query;
    if (error) {
      return send(res, 500, { ok: false, rid, error: 'Open draw lookup failed', details: error.message });
    }

    const now = new Date();
    const openRows = Array.isArray(data) ? data.map((row) => ({ ...row, group: parseGroupToken(row.code) })) : [];

    let target = openRows[0] || null;
    if (target && new Date(target.scheduled_at) <= now && openRows.length > 1) {
      target = openRows.find((row) => new Date(row.scheduled_at) > now) || target;
    }

    if (!target && requestNext) {
      target = fallbackNext({ group: openRows[0]?.group || groupFilter || 'A' });
    }

    if (!target) {
      return send(res, 404, { ok: false, rid, error: 'No upcoming draws' });
    }

    const scheduled = new Date(target.scheduled_at);
    const timeMyt = scheduled.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', hour12: false });

    return send(res, 200, {
      ok: true,
      rid,
      draw: target,
      group: target.group,
      time_utc: scheduled.toISOString(),
      time_myt: timeMyt,
      status: target.status,
    });
  } catch (err) {
    console.error('open_draw_error', { rid, err: err?.message || err });
    return send(res, 500, { ok: false, rid, error: 'Server error' });
  }
}
