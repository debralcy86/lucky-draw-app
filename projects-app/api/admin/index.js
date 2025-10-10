import { applyCors } from '../_lib/cors.mjs';

function send(res, code, body) {
  res.statusCode = code;
  if (typeof body === 'string') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(body);
  } else {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const url = (req.url || '').split('?')[0];   // e.g. /api/admin/session-login
  const method = req.method || 'GET';

  // naive cookie read
  const hasAdminSession = /\badmin_session=/.test(req.headers.cookie || '');

  // Route: POST /api/admin/session-login
  if (url.endsWith('/session-login') && method === 'POST') {
    try {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      const body = raw ? JSON.parse(raw) : {};
      const { token, email, password } = body || {};

      if (!token && !(email && password)) {
        return send(res, 400, { ok: false, error: 'Missing token or email/password' });
      }

      // TODO: replace with real validation here
      res.setHeader('Set-Cookie', 'admin_session=ok; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=86400');
      return send(res, 200, { ok: true, user: { role: 'admin', email: email || 'token' } });
    } catch (e) {
      return send(res, 500, { ok: false, error: String(e?.message || e) });
    }
  }

  // Route: POST /api/admin/logout
  if (url.endsWith('/logout') && method === 'POST') {
    res.setHeader('Set-Cookie', 'admin_session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  // Route: GET /api/admin/whoami
  if (url.endsWith('/whoami') && method === 'GET') {
    if (!hasAdminSession) return send(res, 401, { ok: false, error: 'unauthorized' });
    return send(res, 200, { ok: true, user: { role: 'admin' } });
  }

  // Route: GET /api/admin/metrics
  if (url.endsWith('/metrics') && method === 'GET') {
    // TODO: replace stub with real metrics fetching
    const data = { users_count: 0, total_points: 0, ok: true };
    return send(res, 200, data);
  }

  return send(res, 404, { ok: false, error: 'not_found' });
}
