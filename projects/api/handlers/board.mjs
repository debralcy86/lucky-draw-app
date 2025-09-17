// api/board.mjs
// moved to projects/api/handlers
export const config = { runtime: 'nodejs' };
import { createClient } from '@supabase/supabase-js';

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
const rid = () => Math.random().toString(36).slice(2, 10);

export default async function handler(req, res) {
  const requestId = rid();
  try {
    if (req.method === 'OPTIONS') return res.end();
    if (req.method !== 'GET') return send(res, 405, { ok:false, rid:requestId, error:'Method not allowed' });

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      return send(res, 500, { ok:false, rid:requestId, error:'Missing SUPABASE envs' });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } });

    // Resolve drawId (?drawId=...) or latest open
    const url = new URL(req.url, 'http://x');
    const qDrawId = url.searchParams.get('drawId');
    let draw;

    if (qDrawId) {
      const { data, error } = await sb.from('draws')
        .select('id, code, status, scheduled_at, closed_at, executed_at, winning_figure')
        .eq('id', qDrawId).maybeSingle();
      if (error) return send(res, 500, { ok:false, rid:requestId, error:'Failed to load draw', details:error.message });
      if (!data) return send(res, 404, { ok:false, rid:requestId, error:'Draw not found' });
      draw = data;
    } else {
      const { data, error } = await sb.from('draws')
        .select('id, code, status, scheduled_at, closed_at, executed_at, winning_figure')
        .eq('status', 'open')
        .order('scheduled_at', { ascending:true })
        .limit(1);
      if (error) return send(res, 500, { ok:false, rid:requestId, error:'Failed to find open draw', details:error.message });
      if (!data || !data.length) return send(res, 404, { ok:false, rid:requestId, error:'No open draw' });
      draw = data[0];
    }

    // 1) Aggregate totals by board_group + figure for this draw (client-side build)
    const { data: bets, error: betsErr } = await sb
      .from('bets')
      .select('board_group, figure, amount')
      .eq('draw_id', draw.id);
    if (betsErr) {
      return send(res, 500, { ok:false, rid: requestId, error:'Failed to fetch bets', details: betsErr.message });
    }

    // 2) Build fixed 1..36 list for each group A–D (fill missing as 0)
    const GROUPS = ['A','B','C','D'];
    const groups = {};
    for (const g of GROUPS) {
      groups[g] = Array.from({ length: 36 }, (_, i) => ({ figure: i + 1, total: 0 }));
    }
    for (const b of (bets || [])) {
      const g = ((b.board_group || 'A').toString().trim().toUpperCase());
      if (!GROUPS.includes(g)) continue;
      const f = Number(b.figure);
      const amt = Number(b.amount || 0);
      if (Number.isInteger(f) && f >= 1 && f <= 36) {
        groups[g][f - 1].total += amt;
      }
    }

    // 3) Grand totals across all groups (sum of A..D)
    const grand_total = GROUPS.reduce((sum, g) => sum + groups[g].reduce((s, r) => s + r.total, 0), 0);

    // 4) Respond (unchanged draw fields)
    return send(res, 200, {
      ok: true,
      rid: requestId,
      draw: {
        id: draw.id,
        code: draw.code,
        status: draw.status,
        scheduled_at: draw.scheduled_at,
        closed_at: draw.closed_at,
        executed_at: draw.executed_at,
        winning_figure: draw.winning_figure ?? null
      },
      groups,        // { A:[{figure,total}×36], B:[…], C:[…], D:[…] }
      grand_total
    });
  } catch (e) {
    return send(res, 500, { ok:false, rid:requestId, error:'Unhandled', details:String(e?.message || e) });
  }
}
