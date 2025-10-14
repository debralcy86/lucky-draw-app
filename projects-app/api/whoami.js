// whoami/v4.0-standardized-2025-10-14 (ESM)
export const config = { runtime: 'nodejs' };

import { withTMA } from './_lib/tma.mjs';

export default withTMA(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // Unified Telegram verification already done by withTMA
  // It attaches { user, userId, isAdmin, tag } to req.tma
  const { user, userId, isAdmin, tag } = req.tma || {};

  return res.status(200).json({
    ok: true,
    tag: tag || 'whoami/v4.0-standardized-2025-10-14',
    userId,
    isAdmin,
    user
  });
}, { requireAdmin: false });
