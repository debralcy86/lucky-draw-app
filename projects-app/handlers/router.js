export default async function handler(req, res) {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;

    if (path.endsWith('/ping')) {
      res.statusCode = 200;
      res.setHeader('Content-Type','application/json');
      return res.end(JSON.stringify({ ok:true, route:'ping' }));
    }

    if (path.endsWith('/whoami')) {
      const mod = await import('./whoami.js');
      return mod.default(req, res);
    }

    if (path.endsWith('/profile')) {
      const mod = await import('./profile.mjs');
      return mod.default(req, res);
    }

    res.statusCode = 404;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ ok:false, error:'not_found', path }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ ok:false, error:'router_crash', detail: String(e && e.message || e) }));
  }
}
