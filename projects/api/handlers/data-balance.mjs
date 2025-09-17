// moved to projects/api/handlers
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);
  const log = (msg, extra={}) => console.log(JSON.stringify({ ok:true, rid, msg, ...extra }));
  const logErr = (msg, extra={}) => console.error(JSON.stringify({ ok:false, rid, msg, ...extra }));
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok:false, error:'Missing envs', rid }));
    }
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x');
      const userId = (u.searchParams.get('userId') || '').trim();
      const limit = Math.max(1, Math.min(100, Number(u.searchParams.get('limit') || 5)));
      const offset = Math.max(0, Number(u.searchParams.get('offset') || 0));
      if (!userId) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok:false, error:'Missing userId', rid }));
      }

      let { data: wallet, error: werr } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (werr) throw werr;

      // Auto-provision wallet with balance 0 if missing
      if (!wallet) {
        const { error: insErr } = await supabase
          .from('wallets')
          .insert({ user_id: userId, balance: 0 });
        if (insErr) throw insErr;
        wallet = { user_id: userId, balance: 0 };
        log('autoprovisioned_wallet', { userId });
      }

      const { data: txns, error: terr } = await supabase
        .from('wallet_txns')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (terr) throw terr;

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      return res.end(JSON.stringify({
        ok:true,
        rid,
        wallet: wallet ?? null,
        txns: txns ?? [],
        page: { limit, offset, returned: (txns||[]).length }
      }));
    }

    if (req.method === 'POST') {
      if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ ok:false, error:'Unauthorized', rid }));
      }

      let body = '';
      await new Promise((resolve) => {
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', resolve);
      });

      let parsed;
      try { parsed = JSON.parse(body); } 
      catch { 
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok:false, error:'Invalid JSON body', rid }));
      }

      const { userId, delta, note } = parsed;
      if (!userId || typeof delta !== 'number') {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok:false, error:'Missing or invalid userId/delta', rid }));
      }

      // Fetch current balance
      const { data: walletRow, error: fetchErr } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      const currentBalance = walletRow?.balance ?? 0;
      const newBalance = currentBalance + delta;

      // Upsert wallet row
      const { error: upsertErr } = await supabase
        .from('wallets')
        .upsert({ user_id: userId, balance: newBalance });
      if (upsertErr) throw upsertErr;

      // Insert txn row
      const { error: txnErr } = await supabase
        .from('wallet_txns')
        .insert({
          user_id: userId,
          type: delta > 0 ? 'credit' : 'debit',
          amount: delta,
          balance_after: newBalance,
          note: note || null
        });
      if (txnErr) throw txnErr;

      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok:true, rid, balance: newBalance }));
    }

    // Fallback
    res.statusCode = 405;
    res.end(JSON.stringify({ ok:false, error:'Method Not Allowed', rid }));
  } catch (e) {
    logErr('handler_error', { error: String(e?.message||e) });
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok:false, rid, error:String(e?.message||e) }));
  }
}
