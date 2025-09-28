export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

function parseGroup(req) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const g = String(url.searchParams.get('group') || '').trim().toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(g)) return g;
  } catch {}
  return 'A';
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const group = parseGroup(req);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    : null;

  const keepAlive = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch {}
  }, 25000);

  try {
    res.write('event: connected\n');
    res.write(`data: ${JSON.stringify({ ok: true, msg: 'SSE connected', group })}\n\n`);
  } catch {}

  if (!supabase) {
    try {
      res.write('event: error\n');
      res.write(`data: ${JSON.stringify({ ok: false, error: 'Missing Supabase envs' })}\n\n`);
    } catch {}
  }

  let lastHash = '';
  let currentDrawId = null;
  let channel = null;

  const fetchSnapshot = async () => {
    if (!supabase) return { ok: false, error: 'no_supabase' };

    const { data: openDraw, error: openErr } = await supabase
      .from('draws')
      .select('id, code, scheduled_at, status, closed_at, executed_at, winning_figure')
      .eq('status', 'open')
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (openErr) return { ok: false, error: 'open_draw_query_failed', details: openErr.message };
    if (!openDraw) {
      return { ok: true, group, draw: null, totals: Array(36).fill(0), grand_total: 0 };
    }

    const { data: rows, error: betsErr } = await supabase
      .from('bets')
      .select('figure, amount')
      .eq('draw_id', openDraw.id)
      .eq('board_group', group);
    if (betsErr) return { ok: false, error: 'bets_query_failed', details: betsErr.message };

    const totals = Array.from({ length: 36 }, () => 0);
    let grandTotal = 0;
    for (const row of rows || []) {
      const idx = Math.max(1, Math.min(36, Number(row.figure))) - 1;
      const amt = Number(row.amount || 0);
      if (idx >= 0 && idx < 36) {
        totals[idx] += amt;
        grandTotal += amt;
      }
    }

    return {
      ok: true,
      group,
      draw: { id: openDraw.id, code: openDraw.code, scheduled_at: openDraw.scheduled_at },
      totals,
      grand_total: grandTotal,
    };
  };

  const resubscribe = async (drawId) => {
    if (!supabase) return;
    if (channel) {
      try { await channel.unsubscribe(); } catch {}
      channel = null;
    }
    currentDrawId = drawId || null;
    if (!currentDrawId) return;

    channel = supabase.channel(`board-bets-${currentDrawId}-${group}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bets', filter: `draw_id=eq.${currentDrawId}&board_group=eq.${group}` },
        async (payload) => {
          try {
            const lastBetRaw = payload?.new || {};
            const mask = (value = '') => {
              const str = String(value);
              return str.length <= 4 ? '****' : '****' + str.slice(-4);
            };
            const snapshot = await fetchSnapshot();
            const lastBet = {
              draw_id: lastBetRaw.draw_id,
              group: lastBetRaw.board_group || 'A',
              figure: Number(lastBetRaw.figure),
              amount: Number(lastBetRaw.amount),
              user_mask: mask(lastBetRaw.user_id),
              ts: lastBetRaw.created_at || new Date().toISOString(),
            };
            const payloadKey = JSON.stringify({ draw: snapshot?.draw?.id, group, totals: snapshot?.totals, grand_total: snapshot?.grand_total });
            const hash = crypto.createHash('sha1').update(payloadKey).digest('hex');
            lastHash = hash;
            res.write('event: board\n');
            res.write(`data: ${JSON.stringify({ ts: Date.now(), cause: 'realtime', ...snapshot, last_bet: lastBet })}\n\n`);
          } catch (err) {
            try {
              res.write('event: error\n');
              res.write(`data: ${JSON.stringify({ ok: false, error: 'realtime_emit_failed', details: err?.message || String(err) })}\n\n`);
            } catch {}
          }
        },
      );

    try {
      await channel.subscribe();
    } catch (err) {
      try {
        res.write('event: error\n');
        res.write(`data: ${JSON.stringify({ ok: false, error: 'realtime_subscribe_failed', details: err?.message || String(err) })}\n\n`);
      } catch {}
    }
  };

  const poller = setInterval(async () => {
    try {
      const snapshot = await fetchSnapshot();
      const drawId = snapshot?.draw?.id || null;
      if (drawId !== currentDrawId) {
        await resubscribe(drawId);
      }
      const payloadKey = JSON.stringify({ draw: snapshot?.draw?.id, group, totals: snapshot?.totals, grand_total: snapshot?.grand_total });
      const hash = crypto.createHash('sha1').update(payloadKey).digest('hex');
      if (hash !== lastHash) {
        lastHash = hash;
        res.write('event: board\n');
        res.write(`data: ${JSON.stringify({ ts: Date.now(), cause: 'poll', ...snapshot })}\n\n`);
      }
    } catch (err) {
      try {
        res.write('event: error\n');
        res.write(`data: ${JSON.stringify({ ok: false, error: 'poll_failed', details: err?.message || String(err) })}\n\n`);
      } catch {}
    }
  }, 3000);

  req.on('close', async () => {
    clearInterval(keepAlive);
    clearInterval(poller);
    if (channel) {
      try { await channel.unsubscribe(); } catch {}
    }
  });
}
