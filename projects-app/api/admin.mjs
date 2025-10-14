// /api/admin.mjs — unified admin (v1.0)
export const config = { runtime: 'nodejs' };
import { withTMA } from './_lib/tma.mjs';

function pickAdminAction(req) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname.toLowerCase();
  const a = (url.searchParams.get('action') || req.body?.action || '').toLowerCase();
  if (p.endsWith('/admin-metrics')) return 'metrics';
  if (p.endsWith('/admin-draw-exec')) return 'draw-exec';
  if (a) return a;
  return 'main';
}

async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ ok:false, error:'method_not_allowed' });

  const act = pickAdminAction(req);
  try {
    if (act === 'metrics') {
      const mod = await import('../api-lib/admin/metrics.mjs');
      return (mod.default ? mod.default(req, res) : mod.metrics(req, res));
    }
    if (act === 'draw-exec') {
      const mod = await import('../api-lib/admin/draw-exec.mjs');
      return (mod.default ? mod.default(req, res) : mod.drawExec(req, res));
    }
    const mod = await import('../api-lib/admin/main.mjs');
    return (mod.default ? mod.default(req, res) : mod.admin(req, res));
  } catch (e) {
    console.error('[admin.mjs]', e);
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
}
export default withTMA(handler, { requireAdmin: true });
