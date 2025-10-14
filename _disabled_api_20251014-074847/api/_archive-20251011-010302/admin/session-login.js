import { applyCors } from '../_lib/cors.mjs';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    res.status(405).json({ ok:false, error:'Method Not Allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body||'{}') : (req.body||{});
  const { token, email, password } = body;
  if (!token && !(email && password)) {
    res.status(400).json({ ok:false, error:'Missing token or credentials' });
    return;
  }
  res.setHeader('Set-Cookie', `admin_session=ok; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400`);
  res.status(200).json({ ok:true, user:{ role:'admin', email: email||'token' } });
}
