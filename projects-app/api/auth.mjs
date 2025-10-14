// /api/auth.mjs — unified login/register (v1.0)
export const config = { runtime: 'nodejs' };
import { withTMA } from './_lib/tma.mjs';

function getAction(req) {
  const url = new URL(req.url, 'http://localhost');
  const qp = (url.searchParams.get('action') || '').toLowerCase();
  const bodyAction = (req.body?.action || '').toLowerCase();
  if (qp) return qp;
  if (bodyAction) return bodyAction;
  const p = url.pathname.toLowerCase();
  if (p.endsWith('/login')) return 'login';
  if (p.endsWith('/register')) return 'register';
  return '';
}

async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ ok:false, error:'method_not_allowed' });

  const action = getAction(req);
  try {
    if (action === 'login') {
      const mod = await import('../api-lib/login.js');
      return (mod.default ? mod.default(req, res) : mod.login(req, res));
    }
    if (action === 'register') {
      const mod = await import('../api-lib/register.js');
      return (mod.default ? mod.default(req, res) : mod.register(req, res));
    }
    return res.status(400).json({ ok:false, error:'unknown_action', actions:['login','register'] });
  } catch (e) {
    console.error('[auth.mjs]', e);
    return res.status(500).json({ ok:false, error:String(e?.message||e) });
  }
}
export default withTMA(handler);
