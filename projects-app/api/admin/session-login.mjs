import { applyCors } from '../_lib/cors.mjs';

export default async function handler(req, res) {
  try {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method Not Allowed' });

    const body = (req.body && typeof req.body === 'object') ? req.body : await new Promise((resolve) => {
      let data=''; req.on('data', c => data+=c); req.on('end', ()=>{ try{ resolve(JSON.parse(data||'{}')); } catch { resolve({}); } });
    });

    const { token, email, password } = body;
    if (!token && !(email && password)) return res.status(400).json({ ok:false, error:'Missing token or credentials' });

    res.setHeader('Set-Cookie', 'admin_session=ok; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400');
    return res.status(200).json({ ok:true, user:{ role:'admin', email: email || 'token' } });
  } catch (err) {
    console.error('session-login failed', err);
    return res.status(500).json({ ok:false, error:'server_error', detail:String(err) });
  }
}
