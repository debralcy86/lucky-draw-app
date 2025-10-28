export default async function auth(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname || '';
    if (p.endsWith('/register')) {
      const mod = await import('./_disabled/register.js');
      return mod.default(req, res);
    }
    if (p.endsWith('/login')) {
      const mod = await import('./_disabled/login.js');
      return mod.default(req, res);
    }
    return res.status(400).json({ ok: false, error: 'unknown_auth_route' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'auth_crash', detail: String(e?.message || e) });
  }
}

