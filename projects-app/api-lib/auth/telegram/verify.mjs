import { withCors } from '../../api/_lib/cors.mjs';
import { verifyInitData } from '../../api/_lib/telegram.mjs';
import { getSupabaseAdmin } from '../../api/_lib/supabaseClient.mjs';

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'server_misconfig', reason: 'missing_bot_token' });
  }

  let body = null;
  try {
    body = req.body || (await parseJson(req));
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }
  const initData = body?.initData;
  if (!initData || typeof initData !== 'string') {
    return res.status(400).json({ ok: false, error: 'missing_init_data' });
  }

  const verified = verifyInitData(initData, token);
  if (!verified.ok) {
    return res.status(401).json({ ok: false, error: 'unauthorized', reason: verified.reason });
  }

  const params = new URLSearchParams(initData);
  const userJson = params.get('user');
  if (!userJson) {
    return res.status(400).json({ ok: false, error: 'missing_user' });
  }

  let tgUser = null;
  try { tgUser = JSON.parse(userJson); } catch { return res.status(400).json({ ok: false, error: 'invalid_user_json' }); }
  const telegram_id = tgUser?.id;
  if (!telegram_id) {
    return res.status(400).json({ ok: false, error: 'missing_user_id' });
  }

  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  const upsertPayload = {
    telegram_id,
    username: tgUser.username || null,
    first_name: tgUser.first_name || null,
    last_name: tgUser.last_name || null,
    photo_url: tgUser.photo_url || null,
    last_seen: nowIso,
  };

  let userRow;
  {
    const { data, error } = await supabase
      .from('users')
      .upsert(upsertPayload, { onConflict: 'telegram_id' })
      .select()
      .single();
    if (error) {
      return res.status(500).json({ ok: false, error: 'db_upsert_user_failed' });
    }
    userRow = data;
  }

  let walletRow;
  {
    let { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userRow.id)
      .maybeSingle();
    if (!wallet) {
      const ins = await supabase
        .from('wallets')
        .insert({ user_id: userRow.id, balance: 0 })
        .select()
        .single();
      if (ins.error) {
        return res.status(500).json({ ok: false, error: 'db_create_wallet_failed' });
      }
      wallet = ins.data;
    }
    walletRow = wallet;
  }

  return res.status(200).json({
    ok: true,
    user: {
      id: userRow.id,
      username: userRow.username,
      first_name: userRow.first_name,
      last_name: userRow.last_name,
    },
    wallet: walletRow,
  });
}

async function parseJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

export default withCors(handler);
