export function applyCors(req, res) {
  // Read the caller's origin and the configured allow-list
  const requestOrigin = req.headers.origin || '';
  const rawList = process.env.CORS_ORIGIN || process.env.ADMIN_ORIGIN || '';
  const allowList = rawList
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const allowAll = allowList.includes('*');
  const isAllowed = allowAll || allowList.includes(requestOrigin);

  // With credentials, we must echo the request origin (cannot use '*')
  if (isAllowed && requestOrigin) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Inform caches a response may vary by Origin
  const prevVary = res.getHeader('Vary');
  res.setHeader('Vary', prevVary ? String(prevVary) + ', Origin' : 'Origin');

  // Standard preflight headers
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Early return for preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    try { res.end(); } catch {}
    return true;
  }

  return false;
}
