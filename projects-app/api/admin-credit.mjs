export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { verifyInitData } from './telegramVerify.mjs';

function parseAdminIds(env) {
  return (env || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

async function sendTelegramMessage(botToken, chatId, text, rid) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(chatId),
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      console.error(JSON.stringify({ ok:false, rid, msg:'tg_send_failed', status: res.status, errText }));
    }
  } catch (e) {
    console.error(JSON.stringify({ ok:false, rid, msg:'tg_send_error', error: String(e?.message||e) }));
  }
}

export default async function handler(req, res) {
  const rid = Math.random().toString(36).slice(2,10);
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, rid, error:'Method Not Allowed' }));
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!url || !key || !botToken) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok:false, rid, error:'Missing envs (SUPABASE or TELEGRAM_BOT_TOKEN)' }));
    }

    // --- Read JSON body (expects { initData, userId, delta, note })
    let raw = '';
    await new Promise(resolve => {
      req.on('data', chunk => { raw += chunk; });
      req.on('end', resolve);
    });

    let body;
    try { body = JSON.parse(raw || '{}'); }
    catch {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, rid, error:'Invalid JSON body' }));
    }

    const authHeader = (req.headers?.authorization || req.headers?.Authorization || '').toString();
    const initFromHeader = authHeader.startsWith('tma ') ? authHeader.slice(4).trim() : '';
    const { initData: initFromBody, userId, delta, note } = body || {};
    const initData = initFromBody || initFromHeader;
    if (!initData) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok:false, rid, error:'Missing initData' }));
    }

    // --- Verify Telegram initData signature
    const v = verifyInitData(initData, botToken);
    if (!v.ok) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok:false, rid, error:'Invalid Telegram initData', details: v.error }));
    }
    const callerId = v.userId || '';

    // Optional allow-list (defense in depth)
    const allow = parseAdminIds(process.env.ADMIN_USER_IDS);
    if (allow.length > 0 && !allow.includes(callerId)) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ ok:false, rid, error:'Unauthorized (not in admin allow-list)' }));
    }

    // --- Validate payload
    if (!userId || typeof delta !== 'number') {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, rid, error:'Missing or invalid userId/delta' }));
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Fetch current balance
    const { data: walletRow, error: fetchErr } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    const currentBalance = Number(walletRow?.balance ?? 0);
    const newBalance = currentBalance + delta;
    if (!Number.isFinite(newBalance)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:'Computed balance is invalid' }));
    }
    if (newBalance < 0) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:'Insufficient balance' }));
    }

    // Upsert wallet
    const { error: upsertErr } = await supabase
      .from('wallets')
      .upsert({ user_id: userId, balance: newBalance });
    if (upsertErr) throw upsertErr;

    // Insert txn
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
    // Fire-and-forget Telegram notification (does not block response)
    const isCredit = delta > 0;
    const sign = isCredit ? '+' : '';
    const prettyAmt = `${sign}${Number(delta).toFixed(2)}`;
    const prettyBal = Number(newBalance).toFixed(2);
    const noteText = note ? `\n📝 Note: ${note}` : '';
    const msg = `💳 <b>Wallet ${isCredit ? 'Credit' : 'Debit'}</b>\n` +
                `Amount: <b>${prettyAmt}</b>\n` +
                `New Balance: <b>${prettyBal}</b>${noteText}`;
    // userId is the recipient's Telegram numeric ID (your API contract)
    // Do not await; keep non-blocking
    sendTelegramMessage(botToken, userId, msg, rid);

    return res.end(JSON.stringify({ ok:true, rid, balance: newBalance, admin: callerId }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok:false, rid, error:String(e?.message||e) }));
  }
}
