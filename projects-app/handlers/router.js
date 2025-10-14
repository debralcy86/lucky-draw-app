import whoami from './whoami.js';
import profile from './profile.mjs';

export default async function handler(req, res) {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.endsWith('/whoami'))  return whoami(req, res);
    if (path.endsWith('/profile')) return profile(req, res);
    res.statusCode = 404;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ ok:false, error:'not_found', path }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ ok:false, error:'router_crash', detail: String(e && e.message || e) }));
  }
}
