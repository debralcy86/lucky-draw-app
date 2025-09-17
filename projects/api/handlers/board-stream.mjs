export const config = {
  runtime: 'nodejs'
};

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// moved to projects/api/handlers
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  // Flush immediately
  res.flushHeaders?.();

  // Parse desired group from query (?group=A|B|C|D), default A
  let group = 'A';
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const g = String(url.searchParams.get('group') || '').trim().toUpperCase();
    if (['A','B','C','D'].includes(g)) group = g;
  } catch {}

  // Simple heartbeat to keep connection open
  const keepAlive = setInterval(() => {
    try {
      res.write(`: keep-alive\n\n`);
    } catch {}
  }, 25000);

  // Initial hello
  try {
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ ok:true, msg:'SSE connected', group })}\n\n`);
  } catch {}

  // Poll Supabase for board snapshot and emit diffs
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    try {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ ok:false, error:'Missing Supabase envs' })}\n\n`);
    } catch {}
  }

  const supa = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

  let lastHash = '';
  let currentDrawId = null;
  let rtChannel = null;

  // helper to (re)subscribe to current draw's bet inserts
  async function resubscribeRealtime(drawId) {
    if (!supa) return;
    if (rtChannel) {
      try { await rtChannel.unsubscribe(); } catch (_) {}
      rtChannel = null;
    }
    currentDrawId = drawId || null;
    if (!currentDrawId) return; // no open draw yet

    rtChannel = supa
      .channel(`board-bets-${currentDrawId}-${group}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bets', filter: `draw_id=eq.${currentDrawId}&board_group=eq.${group}` },
        async (_payload) => {
          try {
            const n = _payload?.new || {};
            const mask = (s='') => {
              const str = String(s);
              return str.length <= 4 ? '****' : '****' + str.slice(-4);
            };
            const lastBet = {
              draw_id: n.draw_id,
              group: n.board_group || 'A',
              figure: Number(n.figure),
              amount: Number(n.amount),
              user_mask: mask(n.user_id),
              ts: n.created_at || new Date().toISOString()
            };

            const snap = await fetchBoardSnapshot();
            const payload = { ts: Date.now(), cause: 'realtime', ...snap, last_bet: lastBet };

            const maybeHash = JSON.stringify({ draw: snap?.draw?.id, group, totals: snap?.totals, grand_total: snap?.grand_total });
            const hash = crypto.createHash('sha1').update(maybeHash).digest('hex');
            // Always emit for realtime to keep admin recent feed flowing
            if (hash !== lastHash) lastHash = hash;
            res.write(`event: board\n`);
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          } catch (e) {
            try {
              res.write(`event: error\n`);
              res.write(`data: ${JSON.stringify({ ok:false, error:'realtime_emit_failed', details:String(e?.message||e) })}\n\n`);
            } catch {}
          }
        }
      );

    try { await rtChannel.subscribe(); }
    catch (e) {
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ ok:false, error:'realtime_subscribe_failed', details:String(e?.message||e) })}\n\n`);
      } catch {}
    }
  }

  async function fetchBoardSnapshot() {
    if (!supa) return { ok:false, error:'no_client' };
    // 1) find current open draw
    const { data: open, error: e1 } = await supa
      .from('draws')
      .select('id, code, scheduled_at, status, closed_at, executed_at, winning_figure')
      .eq('status', 'open')
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (e1) return { ok:false, error: 'open_draw_query_failed', details: e1.message };

    if (!open) {
      return { ok:true, group, draw:null, totals: Array(36).fill(0), grand_total: 0 };
    }

    // 2) aggregate bets for this draw and selected group
    const { data: rows, error: e2 } = await supa
      .from('bets')
      .select('board_group, figure, amount')
      .eq('draw_id', open.id)
      .eq('board_group', group);
    if (e2) return { ok:false, error: 'bets_aggregate_failed', details: e2.message };

    const totals = Array.from({ length: 36 }, () => 0);
    let grand_total = 0;
    for (const r of (rows || [])) {
      const idx = Math.max(1, Math.min(36, Number(r.figure))) - 1;
      const amt = Number(r.amount || 0);
      if (idx >= 0 && idx < 36) {
        totals[idx] += amt;
        grand_total += amt;
      }
    }

    return { ok:true, group, draw: { id: open.id, code: open.code, scheduled_at: open.scheduled_at }, totals, grand_total };
  }

  // 3) poll & emit on change
  const intervalMs = 3000;
  const poller = setInterval(async () => {
    try {
      const snap = await fetchBoardSnapshot();
      if (snap?.ok) {
        const newId = snap?.draw?.id || null;
        if (newId !== currentDrawId) {
          await resubscribeRealtime(newId);
        }
      }
      const maybeHash = JSON.stringify({ draw: snap?.draw?.id, group, totals: snap?.totals, grand_total: snap?.grand_total });
      const hash = crypto.createHash('sha1').update(maybeHash).digest('hex');
      if (hash !== lastHash) {
        lastHash = hash;
        const payload = { ts: Date.now(), cause: 'poll', ...snap };
        res.write(`event: board\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    } catch (err) {
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ ok:false, error:'poll_failed', details: String(err?.message || err) })}\n\n`);
      } catch {}
    }
  }, intervalMs);

  // Cleanup
  req.on('close', async () => {
    clearInterval(keepAlive);
    clearInterval(poller);
    if (rtChannel) {
      try { await rtChannel.unsubscribe(); } catch (_) {}
    }
  });
}
