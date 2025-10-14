import { requireTma, readJson } from './_lib/initData.mjs';
import { createClient } from '@supabase/supabase-js';

function sb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('missing_supabase_env');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  const auth = await requireTma(req, res);
  if (!auth) return;
  const supabase = sb();

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
    const profile = body && body.profile || {};
    const userId = auth.userId;

    // upsert minimal profile
    const payload = {
      user_id: userId,
      name: profile.name || null,
      contact: profile.contact || null
    };
    const up = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();
    if (up.error) {
      res.statusCode = 500;
      res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({ ok:false, error:'db_profile_upsert_failed' }));
    }

    // ensure wallet
    const wsel = await supabase.from('wallets').select('*').eq('user_id', userId).maybeSingle();
    let wallet = wsel.data;
    if (!wallet) {
      const ins = await supabase.from('wallets').insert({ user_id: userId, balance: 0 }).select().single();
      if (ins.error) {
        res.statusCode = 500;
        res.setHeader('Content-Type','application/json');
        return res.end(JSON.stringify({ ok:false, error:'db_wallet_create_failed' }));
      }
      wallet = ins.data;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({ ok:true, profile: up.data, wallet }));
  }

  // default: lookup
  if (req.method === 'GET') {
    const userId = auth.userId;
    const prof = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
    const wsel = await supabase.from('wallets').select('*').eq('user_id', userId).maybeSingle();

    const exists = !!(prof.data && prof.data.user_id);
    res.statusCode = 200;
    res.setHeader('Content-Type','application/json');
    return res.end(JSON.stringify({
      ok:true,
      profile_exists: exists,
      profile: prof.data || null,
      wallet: wsel.data || null
    }));
  }

  res.statusCode = 405;
  res.setHeader('Allow','GET,POST');
  res.end(JSON.stringify({ ok:false, error:'method_not_allowed' }));
}
