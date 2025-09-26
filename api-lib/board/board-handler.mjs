export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

export default async function handler(req, res) {
  const requestId = rid();
  try {
    if (req.method === 'OPTIONS') return res.end();
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET,OPTIONS');
      return send(res, 405, { ok: false, rid: requestId, error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return send(res, 500, { ok: false, rid: requestId, error: 'Missing Supabase envs' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const url = new URL(req.url, 'http://localhost');
    const drawIdParam = url.searchParams.get('drawId');
    let draw;

    if (drawIdParam) {
      const { data, error } = await supabase
        .from('draws')
        .select('id, code, status, scheduled_at, closed_at, executed_at, winning_figure')
        .eq('id', drawIdParam)
        .maybeSingle();
      if (error) return send(res, 500, { ok: false, rid: requestId, error: 'Failed to load draw', details: error.message });
      if (!data) return send(res, 404, { ok: false, rid: requestId, error: 'Draw not found' });
      draw = data;
    } else {
      const { data, error } = await supabase
        .from('draws')
        .select('id, code, status, scheduled_at, closed_at, executed_at, winning_figure')
        .eq('status', 'open')
        .order('scheduled_at', { ascending: true })
        .limit(1);
      if (error) return send(res, 500, { ok: false, rid: requestId, error: 'Failed to find open draw', details: error.message });
      if (!data?.length) return send(res, 404, { ok: false, rid: requestId, error: 'No open draw' });
      draw = data[0];
    }

    const { data: bets, error: betsErr } = await supabase
      .from('bets')
      .select('board_group, figure, amount')
      .eq('draw_id', draw.id);
    if (betsErr) {
      return send(res, 500, { ok: false, rid: requestId, error: 'Failed to fetch bets', details: betsErr.message });
    }

    const groups = {};
    const GROUPS = ['A', 'B', 'C', 'D'];
    for (const g of GROUPS) {
      groups[g] = Array.from({ length: 36 }, (_, i) => ({ figure: i + 1, total: 0 }));
    }

    for (const bet of bets || []) {
      const groupKey = String(bet.board_group || 'A').trim().toUpperCase();
      if (!GROUPS.includes(groupKey)) continue;
      const figure = Number(bet.figure);
      const amount = Number(bet.amount || 0);
      if (Number.isInteger(figure) && figure >= 1 && figure <= 36) {
        groups[groupKey][figure - 1].total += amount;
      }
    }

    const grandTotal = GROUPS.reduce((sum, g) => sum + groups[g].reduce((acc, row) => acc + row.total, 0), 0);

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
        winning_figure: draw.winning_figure ?? null,
      },
      groups,
      grand_total: grandTotal,
    });
  } catch (err) {
    return send(res, 500, { ok: false, rid: requestId, error: 'Unhandled', details: err?.message || String(err) });
  }
}
