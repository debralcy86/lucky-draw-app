// whoami/v3.3-production-2025-09-28 (ESM)
export const config = { runtime: 'nodejs' };

import { validate, parse } from '@telegram-apps/init-data-node';

export default async function handler(req, res) {
  try {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    if (!BOT_TOKEN) {
      return res.status(500).json({ ok: false, reason: 'missing_bot_token_runtime' });
    }

    const auth = req.headers.authorization || req.headers.Authorization || '';
    if (!auth.startsWith('tma ')) {
      return res.status(401).json({ ok: false, reason: 'missing_tma_header' });
    }

    const initData = auth.slice(4);

    // Validate signed payload; throws on failure/expiry
    validate(initData, BOT_TOKEN);
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
      user
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
