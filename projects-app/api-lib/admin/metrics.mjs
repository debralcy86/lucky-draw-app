// AUTO-PATCHED: standardized TMA verification 2025-10-14
import { withTMA } from './_lib/tma.mjs';

export const config = { runtime: 'nodejs' };

async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Core dynamic import logic for multiplexers
    if (req.url.includes('/board/stream')) {
      const mod = await import('../api-lib/board/stream-handler.mjs');
      return mod.default ? mod.default(req, res) : res.status(500).json({ ok: false, error: 'missing stream-handler' });
    }

    // Admin endpoints check
    const adminRoutes = ['/api/admin-metrics', '/api/admin-draw-exec'];
    const requireAdmin = adminRoutes.some(r => req.url.includes(r));

    // Return basic status
    return res.status(200).json({
      ok: true,
      tag: 'standardized-tma-2025-10-14',
      route: req.url,
      method: req.method,
      requireAdmin,
      userId: req.tma?.userId || null,
      isAdmin: !!req.tma?.isAdmin
    });
  } catch (e) {
    console.error('[TMA handler error]', e);
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}

export default withTMA(handler);
