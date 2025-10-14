import whoami from '../handlers/whoami.js';
import profile from '../handlers/profile.mjs';
import dataBalance from '../handlers/data-balance.mjs';
import wallet from '../handlers/wallet.mjs';
import bet from '../handlers/bet.mjs';
import withdrawCreate from '../handlers/withdraw-create.mjs';
import adminMetrics from '../handlers/admin-metrics.mjs';
import adminSessionLogin from '../handlers/admin/session-login.mjs';
import adminWhoami from '../handlers/admin/whoami.mjs';
import adminLogout from '../handlers/admin/logout.mjs';

export default async function handler(req, res) {
  const path = new URL(req.url, 'http://localhost').pathname;

  if (path.startsWith('/api/whoami')) return whoami(req, res);
  if (path.startsWith('/api/profile')) return profile(req, res);
  if (path.startsWith('/api/data-balance')) return dataBalance(req, res);
  if (path.startsWith('/api/wallet')) return wallet(req, res);
  if (path.startsWith('/api/bet')) return bet(req, res);
  if (path.startsWith('/api/withdraw-create')) return withdrawCreate(req, res);
  if (path.startsWith('/api/admin/session-login')) return adminSessionLogin(req, res);
  if (path.startsWith('/api/admin/whoami')) return adminWhoami(req, res);
  if (path.startsWith('/api/admin/logout')) return adminLogout(req, res);
  if (path.startsWith('/api/admin-metrics')) return adminMetrics(req, res);

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok:false, error:'not_found', path }));
}
