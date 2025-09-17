// projects/api/handlers/debug-init-echo.mjs
export const config = { runtime: 'nodejs' };
// Echoes verification status and selected fields to help debug initData issues.
import { verifyTelegramInitData } from '../_lib/telegramVerify.mjs';
import crypto from 'crypto';

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const rid = Math.random().toString(36).slice(2, 10);
  try {
    if (req.method !== 'POST') return send(res, 405, { ok: false, rid, error: 'Method not allowed' });

    let raw = '';
    await new Promise(r => { req.on('data', c => raw += c); req.on('end', r); });
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch {}
    const auth = (req.headers?.authorization || req.headers?.Authorization || '').toString();
    const fromHeader = auth.startsWith('tma ') ? auth.slice(4).trim() : '';
    const initData = body?.initData || fromHeader || '';
    if (!initData) return send(res, 400, { ok: false, rid, error: 'missing_initData' });

    const token = (process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();
    const bot_id = token.split(':')[0] || 'unknown';
    if (!token) {
      console.error('debug-init-echo missing_bot_token', { rid });
      return send(res, 500, { ok: false, rid, error: 'missing_bot_token' });
    }

    const candidate = typeof initData === 'string' ? initData : String(initData || '');

    // Deep debug: log hash param and a short preview
    const params = new URLSearchParams(candidate);
    console.log('TAG: raw-initData (server)', { rid, raw: candidate });
    console.log('TAG: params-keys', { rid, keys: Array.from(params.keys()) });
    const hashParam = params.get('hash') || null;
    console.log('TAG: init-echo hash-param', { rid, hash: hashParam });
    console.log('TAG: init-echo raw-initData-preview', { rid, head: candidate.slice(0, 200) });

    // Compute signature using Telegram algorithm for comparison
    try {
      const pairs = [];
      for (const [k, v] of params.entries()) {
        if (k === 'hash') continue;
        pairs.push(`${k}=${v}`);
      }
      pairs.sort();
      const dataCheck = pairs.join('\n');
      const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
      const computedSig = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
      console.log('TAG: init-echo computed-signature', { rid, computedSig });
    } catch (e) {
      console.error('TAG: init-echo signature-compute-error', { rid, error: String(e?.message || e) });
    }

    const verificationResult = verifyTelegramInitData(candidate, token);
    console.log('debug-init-echo verify', { rid, ok: !!verificationResult?.ok, reason: verificationResult?.error || null, len: initData.length, bot_id });

    // Reuse params built above and extract user (for diagnostics only)
    let telegramUser = null;
    try {
      const u = params.get('user');
      telegramUser = u ? JSON.parse(decodeURIComponent(u)) : null;
    } catch {}
    const verifiedUser = verificationResult?.user || null;

    return send(res, 200, {
      ok: !!verificationResult?.ok,
      rid,
      reason: verificationResult?.ok ? null : (verificationResult?.error || 'verify_failed'),
      bot_id,
      init_len: candidate.length,
      user_id: (verifiedUser?.id ?? telegramUser?.id) || null,
      user_first: (verifiedUser?.first_name ?? telegramUser?.first_name) || null,
      auth_date: params.get('auth_date') || null,
    });
  } catch (e) {
    return send(res, 500, { ok: false, rid, error: String(e?.message || e) });
  }
}
