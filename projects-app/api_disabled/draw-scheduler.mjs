// api/draw-scheduler.mjs
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

function isoNow() { return new Date().toISOString(); }
function mkCode(d) {
  // e.g., 2025-09-10-2015 (YYYY-MM-DD-HHMM)
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  return `${y}-${m}-${day}-${hh}${mm}`;
}

export default async function handler(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);
  const PAYOUT_MULTIPLIER = Number(process.env.PAYOUT_MULTIPLIER || 33);
  try {
    // Always respond JSON
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'GET') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok: false, rid, error: 'Method Not Allowed' }));
    }

    // Auth: only x-cron-key header (strict)
    const got = String(req.headers['x-cron-key'] || '').trim();
    const need = String(process.env.CRON_KEY || '').trim();
    if (!need || got !== need) {
      try { console.log(JSON.stringify({ ok:false, rid, msg: 'cron-key-mismatch', got_len: got.length, need_len: need.length })); } catch {}
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok: false, rid, error: 'Unauthorized (cron key mismatch)' }));
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok:false, rid, error:'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }));
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const nowIso = isoNow();

    // Parse query params (dry-run, force winning number, timing windows)
    const isDryRun = (() => {
      try {
        const url = new URL(req.url, 'http://localhost');
        return url.searchParams.get('dry') === '1';
      } catch { return false; }
    })();
    const forcedWin = (() => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const val = url.searchParams.get('force');
        const n = val ? Number(val) : NaN;
        return Number.isFinite(n) && n >= 1 && n <= 36 ? n : null;
      } catch { return null; }
    })();
    // Execute window: keep existing execute lag parsing via URL param for compatibility
    const executeLagMin = (() => {
      try {
        const url = new URL(req.url, 'http://localhost');
        const e = Number(url.searchParams.get('executeLagMin') || '15');
        return Number.isFinite(e) && e >= 0 ? e : 15;
      } catch {
        return 15;
      }
    })();

    // Closing window: enforce 1-minute default lead; allow optional override via req.query.closeLeadMin
    const defaultLead = 1; // minutes
    const lead = (() => {
      try {
        const q = req?.query?.closeLeadMin;
        const n = Number(q);
        return Number.isFinite(n) && n >= 0 ? n : defaultLead;
      } catch { return defaultLead; }
    })();
    const closeLeadMin = lead; // keep original name for summary output

    // 1) Close draws that are near start (open & within lead window)
    const now = new Date();
    const closeCutoffIso = new Date(now.getTime() + lead * 60000).toISOString();
    try { console.log(JSON.stringify({ rid, tag: 'close_start', closeCutoffIso })); } catch {}
    const { data: toClose, error: openDueErr } = await supabase
      .from('draws')
      .select('*')
      .eq('status', 'open')
      .lte('scheduled_at', closeCutoffIso);

    if (openDueErr) throw openDueErr;

    let closedCount = 0;
    if (toClose && toClose.length > 0) {
      const ids = toClose.map(r => r.id);
      if (!isDryRun) {
        const { error: updErr, count } = await supabase
          .from('draws')
          .update({ status: 'closed', closed_at: nowIso })
          .in('id', ids)
          .select('id', { count: 'exact', head: true });
        if (updErr) throw updErr;
        closedCount = count ?? ids.length;
      } else {
        closedCount = ids.length;
      }
    }
    try { console.log(JSON.stringify({ rid, tag: 'close_done', candidates: toClose?.length || 0, closedCount })); } catch {}

    // 2) Ensure there is at least one upcoming open draw (scheduled > now)
    try { console.log(JSON.stringify({ rid, tag: 'seed_start' })); } catch {}
    const { data: openUpcoming, error: upcomingErr } = await supabase
      .from('draws')
      .select('id, scheduled_at')
      .eq('status', 'open')
      .gt('scheduled_at', nowIso)
      .order('scheduled_at', { ascending: true })
      .limit(1);

    if (upcomingErr) throw upcomingErr;

    let seeded = null;
    if (!openUpcoming || openUpcoming.length === 0) {
      // === BEGIN group-timed seeding (MYT) ===
      const MYT_TZ = 'Asia/Kuala_Lumpur';
      function nextGroupSlot(now = new Date()) {
        // compute next slot in MYT, then return { whenUtc: Date, group: 'A'|'B'|'C'|'D' }
        const z = new Intl.DateTimeFormat('en-GB', {
          timeZone: MYT_TZ, hour12: false,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        });
        const parts = z.formatToParts(now).reduce((m, p) => (m[p.type]=p.value, m), {});
        const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
        const slots = [
          { h: 0,  group: 'A' },  // 00:00
          { h: 6,  group: 'B' },  // 06:00
          { h: 12, group: 'C' },  // 12:00
          { h: 18, group: 'D' },  // 18:00
        ];
        // helper: MYT → UTC Date
        const toUtc = (yy,mm,dd,hh,min=0) => {
          // build a UTC date for the same wall-clock time, then shift -8h to get UTC of MYT time
          const local = new Date(Date.UTC(yy, mm-1, dd, hh, min));
          local.setUTCHours(local.getUTCHours() - 8); // MYT = UTC+8
          return local;
        };
        // figure current MYT hour/min
        const curH = Number(parts.hour), curM = Number(parts.minute);
        // pick next slot today or tomorrow
        for (const s of slots) {
          if (curH < s.h || (curH === s.h && curM < 1)) {
            return { whenUtc: toUtc(y, m, d, s.h, 0), group: s.group };
          }
        }
        // otherwise first slot tomorrow
        const dt = new Date(Date.UTC(y, m-1, d));
        dt.setUTCDate(dt.getUTCDate() + 1);
        const ny = dt.getUTCFullYear(), nm = dt.getUTCMonth()+1, nd = dt.getUTCDate();
        const first = slots[0];
        return { whenUtc: toUtc(ny, nm, nd, first.h, 0), group: first.group };
      }

      const { whenUtc, group } = nextGroupSlot(new Date());
      const schedAt = whenUtc.toISOString();
      // code like: 2025-09-11-A-0000  (date + group + HHMM in MYT)
      const mytDt = new Intl.DateTimeFormat('en-GB', { timeZone: MYT_TZ, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })
        .formatToParts(whenUtc).reduce((m,p)=>(m[p.type]=p.value,m),{});
      const code = `${mytDt.year}-${mytDt.month}-${mytDt.day}-${group}-${mytDt.hour}${mytDt.minute}`;
      // === END group-timed seeding (MYT) ===

      if (!isDryRun) {
        const { data: ins, error: insErr } = await supabase
          .from('draws')
          .insert({ status: 'open', scheduled_at: schedAt, code })
          .select('id, code, scheduled_at')
          .single();
        if (insErr) throw insErr;
        seeded = ins;
      } else {
        // Dry-run: indicate what would be seeded
        seeded = { id: null, code, scheduled_at: schedAt };
      }
    }
    try { console.log(JSON.stringify({ rid, tag: 'seed_done', seeded: Boolean(seeded), seedId: seeded?.id || null })); } catch {}

    // 3) Execute closed draws that are beyond execution lag
    const MAX_DRAWS = 3;
    const execCutoffIso = new Date(Date.now() - executeLagMin * 60 * 1000).toISOString();
    const { data: toExec, error: toExecErr } = await supabase
      .from('draws')
      .select('id')
      .eq('status', 'closed')
      .is('executed_at', null)
      .lte('closed_at', execCutoffIso)
      .order('closed_at', { ascending: true })
      .limit(MAX_DRAWS);

    if (toExecErr) throw toExecErr;

    const executed = [];
    if (toExec && toExec.length > 0) {
      for (const r of toExec) {
        const id = r.id;
        const winning = forcedWin ?? (Math.floor(Math.random() * 36) + 1);
        try { console.log(JSON.stringify({ rid, tag: 'execute_pick', drawId: id, winning })); } catch {}
        if (!isDryRun) {
          const { data: up, error: execErr } = await supabase
            .from('draws')
            .update({ status: 'executed', winning_figure: winning, executed_at: isoNow() })
            .eq('id', id)
            .select('id, winning_figure, executed_at')
            .single();
          if (execErr) throw execErr;
          // Safety: skip payouts if already applied (in case of manual resets)
          try {
            const { data: dRow, error: dErr } = await supabase
              .from('draws')
              .select('payouts_applied')
              .eq('id', id)
              .maybeSingle();
            if (dErr) {
              try { console.error(JSON.stringify({ rid, tag: 'payout_check_failed', drawId: id, error: String(dErr?.message || dErr) })); } catch {}
            } else if (dRow?.payouts_applied) {
              try { console.log(JSON.stringify({ rid, tag: 'payout_skip_already_applied', drawId: id })); } catch {}
              executed.push({ id: up.id, drawId: id, winning_figure: up.winning_figure, executed_at: up.executed_at, winners: 0, unique_users_paid: 0, payouts_applied: 0, already_paid: true, dryRun: false });
              continue;
            }
          } catch {}
          // Fetch winning bets
          const { data: winners, error: winErr } = await supabase
            .from('bets')
            .select('id, user_id, amount')
            .eq('draw_id', id)
            .eq('figure', winning);
          if (winErr) {
            try { console.error(JSON.stringify({ rid, tag: 'execute_fetch_winners_failed', drawId: id, error: String(winErr?.message || winErr) })); } catch {}
            executed.push({ id: up.id, winning_figure: up.winning_figure, executed_at: up.executed_at, winners: 0, payouts_applied: 0, unique_users_paid: 0 });
            continue;
          }
          try { console.log(JSON.stringify({ rid, tag: 'execute_winners', drawId: id, winners: winners?.length || 0 })); } catch {}
          // Apply payouts per bet
          const userSet = new Set();
          let applied = 0;
          for (const bet of (winners || [])) {
            const userId = bet.user_id;
            const payout = Number(bet.amount || 0) * PAYOUT_MULTIPLIER;
            userSet.add(userId);
            try {
              const { data: wRow, error: wErr } = await supabase
                .from('wallets')
                .select('balance')
                .eq('user_id', userId)
                .maybeSingle();
              if (wErr) throw wErr;

              const curr = Number(wRow?.balance || 0);
              const newBal = curr + payout;

              const { error: upErr } = await supabase
                .from('wallets')
                .upsert({ user_id: userId, balance: newBal })
                .select('user_id', { head: true });
              if (upErr) throw upErr;

              const { error: txErr } = await supabase
                .from('wallet_txns')
                .insert({ user_id: userId, type: 'credit', amount: payout, balance_after: newBal, note: `draw payout ${id} (x${PAYOUT_MULTIPLIER})` })
                .select('id', { head: true });
              if (txErr) throw txErr;

              applied++;
            } catch (e) {
              try { console.error(JSON.stringify({ rid, tag: 'payout_failed', drawId: id, userId, delta: payout, error: String(e?.message || e) })); } catch {}
            }
          }
          try { console.log(JSON.stringify({ rid, tag: 'payout_done', drawId: id, winners: winners?.length || 0, unique_users_paid: userSet.size, payouts_applied: applied })); } catch {}
          // Mark payouts_applied flag (best-effort)
          try {
            const { error: paidErr } = await supabase
              .from('draws')
              .update({ payouts_applied: true })
              .eq('id', id)
              .select('id', { head: true });
            if (paidErr) {
              try { console.error(JSON.stringify({ rid, tag: 'payout_flag_update_failed', drawId: id, error: String(paidErr?.message || paidErr) })); } catch {}
            } else {
              try { console.log(JSON.stringify({ rid, tag: 'payout_flag_set_true', drawId: id })); } catch {}
            }
          } catch {}
          executed.push({ id: up.id, winning_figure: up.winning_figure, executed_at: up.executed_at, winners: (winners || []).length, payouts_applied: applied, unique_users_paid: userSet.size });
        } else {
          // Dry-run: report candidates without applying
          const { data: winners, error: winErr } = await supabase
            .from('bets')
            .select('id, user_id, amount')
            .eq('draw_id', id)
            .eq('figure', winning);
          if (winErr) {
            executed.push({ id, winning_figure: winning, executed_at: null, winners: 0, payouts_applied: 0, unique_users_paid: 0, dryRun: true });
          } else {
            const userSet = new Set((winners || []).map(b => b.user_id));
            executed.push({ id, winning_figure: winning, executed_at: null, winners: (winners || []).length, payouts_applied: userSet.size, unique_users_paid: userSet.size, dryRun: true });
          }
        }
      }
    }

    // 4) Return summary
    const summary = {
      ok: true,
      rid,
      dryRun: isDryRun,
      windows: { closeLeadMin, executeLagMin },
      closed_overdue: closedCount,
      seeded_open_draw: seeded ? { id: seeded.id, code: seeded.code, scheduled_at: seeded.scheduled_at } : null,
      executed
    };

    try { console.log(JSON.stringify({ ...summary, tag: 'scheduler_summary' })); } catch {}
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    return res.end(JSON.stringify(summary));

  } catch (e) {
    try { console.error(JSON.stringify({ rid, tag: 'scheduler_error', error: String(e?.message || e) })); } catch {}
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: false, rid, error: String(e?.message || e) }));
  }
}
