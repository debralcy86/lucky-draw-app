import { createClient } from '@supabase/supabase-js';
import { verifyTelegramInitData } from '../api/_lib/telegramVerify.mjs';

function isTmaAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('tma ')) return false;
  const initData = auth.slice(4);
  try {
    const check = verifyTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN);
    if (!check.ok) return false;
    const uid = check.userId ? String(check.userId) : '';
    const admins = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    return uid && admins.includes(uid);
  } catch { return false; }
}

function isHeaderAdmin(req) {
  const token = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
  return !!(process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN);
}

function requireAdmin(req) {
  return isHeaderAdmin(req) || isTmaAdmin(req);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, reason: 'Unauthorized' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { action, payload } = req.body || {};
  const tag = 'admin/v1.0-mux-2025-09-28';

  try {
    switch (action) {
      case 'credit': {
        const { userId, delta, note } = payload || {};
        if (!userId || !Number.isFinite(delta)) return res.status(400).json({ ok: false, reason: 'missing_fields' });

        const change = Number(delta);
        const type = change >= 0 ? 'credit' : 'debit';
        const amount = Math.abs(change);

        const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', userId).maybeSingle();
        const current = wallet?.balance || 0;

        if (type === 'debit' && current < amount) {
          return res.status(400).json({ ok: false, reason: 'insufficient_funds', balance: current, amount });
        }

        const newBalance = type === 'credit' ? current + amount : current - amount;

        if (!wallet) {
          const { error: wInsErr } = await supabase.from('wallets').insert({ user_id: userId, balance: newBalance });
          if (wInsErr) return res.status(500).json({ ok: false, reason: 'wallet_insert_failed' });
        } else {
          const { error: wUpdErr } = await supabase.from('wallets').update({ balance: newBalance }).eq('user_id', userId);
          if (wUpdErr) return res.status(500).json({ ok: false, reason: 'wallet_update_failed' });
        }

        const { error: tErr } = await supabase.from('wallet_txns').insert({
          user_id: userId,
          type,
          amount,
          balance_after: newBalance,
          note: note || `admin ${type}`
        });
        if (tErr) {
          console.error('[admin credit] wallet_txns insert error:', tErr);
          return res.status(500).json({ ok: false, reason: 'txn_insert_failed' });
        }

        return res.status(200).json({ ok: true, tag, action, type, amount, balance: newBalance });
      }

      case 'metrics': {
        const { count: users } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
        const { count: txns } = await supabase.from('wallet_txns').select('*', { count: 'exact', head: true });
        return res.status(200).json({ ok: true, tag, action, metrics: { users: users ?? null, txns: txns ?? null } });
      }

      case 'drawExec': {
        const { draw_id, winners } = payload || {};
        if (!draw_id || !Array.isArray(winners)) return res.status(400).json({ ok: false, reason: 'missing_fields' });
        const { error } = await supabase.from('draw_results').insert({ draw_id, winners });
        if (error) return res.status(500).json({ ok: false, reason: 'draw_insert_failed' });
        return res.status(200).json({ ok: true, tag, action, draw_id, winners_count: winners.length });
      }

      default:
        return res.status(400).json({ ok: false, reason: 'unknown_action' });
    }
  } catch (err) {
    return res.status(500).json({ ok: false, reason: 'unexpected', message: String(err) });
  }
}
