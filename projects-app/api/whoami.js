// whoami/v3.3-production-2025-09-28 (ESM)
export const config = { runtime: 'nodejs' };

import { validate, parse } from '@telegram-apps/init-data-node';
import crypto from 'node:crypto';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, reason: 'method_not_allowed' });
  }
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.status(500).json({ ok: false, reason: 'missing_bot_token_runtime' });
    }

    const token_fp8 = crypto.createHash('sha256').update(botToken).digest('hex').slice(0, 8);
    try { res.setHeader('X-BotToken-FP', token_fp8); } catch {}

    const auth = req.headers.authorization || req.headers.Authorization || '';
    if (!auth.startsWith('tma ')) {
      return res.status(401).json({ ok: false, reason: 'missing_tma_header' });
    }

    // Extract initData string from header and normalize
    const initData = auth.slice(4).trim();
    if (!initData) {
      return res.status(400).json({ ok: false, reason: 'empty_initdata' });
    }

    // Validate signed payload; throws on failure/expiry
    validate(typeof initData === 'string' ? initData : String(initData), botToken, {
      expiresIn: 86400 // 24 hours tolerance
    });
    const parsed = parse(initData);

    const user = parsed.user || {};
    const userId = user.id ? String(user.id) : '';

    const adminList = (process.env.ADMIN_USER_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const isAdmin = !!userId && adminList.includes(userId);

    return res.status(200).json({
      ok: true,
      tag: 'whoami/v3.3-production-2025-09-28',
      userId,
      isAdmin,
      user,
      token_fp8
    });
  } catch (err) {
    console.error('[whoami error]', (err && err.stack) || err);
    return res.status(400).json({
      ok: false,
      reason: 'verify_failed',
      message: String((err && err.message) || err)
    });
  }
}

export default async function wrappedHandler(req, res) {
  const { withCors } = await import('./_lib/cors.mjs');
  return withCors(handler, { methods: ['POST', 'OPTIONS'] })(req, res);
}
