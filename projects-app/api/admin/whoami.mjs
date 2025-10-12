import { applyCors } from '../_lib/cors.mjs';

export default async function handler(req, res) {
  try {
    if (applyCors(req, res)) return;
    const cookie = req.headers.cookie || '';
    const ok = /(?:^|;\s*)admin_session=ok\b/.test(cookie);
    if (!ok) return res.status(401).json({ ok:false, error:'not_authenticated' });
    return res.status(200).json({ ok:true, isAdmin:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error:'server_error', detail:String(e) });
  }
}
