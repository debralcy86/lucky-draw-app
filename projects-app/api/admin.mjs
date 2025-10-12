// /api/admin — merged endpoint to reduce serverless count
const ALLOW = (process.env.CORS_ORIGIN || '').split(',').map(s=>s.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOW.length === 0 || ALLOW.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve) => {
    let data=''; req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

function hasAdminCookie(req) {
  const cookie = req.headers.cookie || '';
  return /(?:^|;\s*)admin_session=ok\b/.test(cookie);
}

export default async function handler(req, res) {
  try {
    if (setCors(req, res)) return;

    const url = new URL(req.url, `https://${req.headers.host}`);
    const action = url.searchParams.get('action') || '';

    if (action === 'whoami') {
      if (!hasAdminCookie(req)) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ ok:false, error:'not_authenticated' }));
      }
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok:true, isAdmin:true }));
    }

    if (action === 'session-login' && req.method === 'POST') {
      const body = await readJson(req);
      if (!body?.token && !(body?.email && body?.password)) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok:false, error:'missing_credentials' }));
      }
      // demo cookie
      res.setHeader('Set-Cookie', 'admin_session=ok; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=86400');
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ ok:true, user:{ role:'admin' } }));
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok:false, error:'unknown_action' }));
  } catch (e) {
    console.error('admin handler error', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok:false, error:'server_error', detail:String(e) }));
  }
}
