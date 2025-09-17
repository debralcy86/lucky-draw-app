// api/open-draw.mjs
// moved to projects/api/handlers
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

function sanitizeCorsOrigin(val) {
  return String(val || '*').replace(/[\r\n]/g, '').split(',')[0].trim() || '*';
}
function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
function rid() { return Math.random().toString(36).slice(2, 10); }

export default async function handler(req, res) {
  const R = rid();
  res.setHeader('Access-Control-Allow-Origin', sanitizeCorsOrigin(process.env.CORS_ORIGIN));
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();
  if (req.method !== 'GET') return send(res, 405, { ok:false, rid:R, error:'Method Not Allowed' });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, { ok:false, rid:R, error:'Missing envs (SUPABASE)' });
  }

  try {
    // Parse optional group filter (?group=A|B|C|D)
    let groupFilter = null;
    try {
      const u = new URL(req.url, 'http://x');
      const g = (u.searchParams.get('group') || '').toString().trim().toUpperCase();
      if (['A','B','C','D'].includes(g)) groupFilter = g;
    } catch {}

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
    let q = sb
      .from('draws')
      .select('id, code, status, scheduled_at')
      .eq('status','open');
    if (groupFilter) {
      // Code format includes -{GROUP}- (e.g., 2025-09-11-B-0600)
      q = q.like('code', `%-${groupFilter}-%`);
    }
    const { data, error } = await q
      .order('scheduled_at', { ascending:true })
      .limit(1);

    if (error) return send(res, 500, { ok:false, rid:R, error:'Open draw lookup failed', details:String(error?.message||error) });

    const parseGroup = (code) => {
      if (!code || typeof code !== 'string') return null;
      const m = code.match(/-(A|B|C|D)-/i);
      return m ? m[1].toUpperCase() : null;
    };

    const row = data?.[0] ?? null;
    const open = row ? { ...row, group: parseGroup(row.code) } : null;
    return send(res, 200, { ok:true, rid:R, open });
  } catch (e) {
    return send(res, 500, { ok:false, rid:R, error:'Open draw error', details:String(e?.message||e) });
  }
}
