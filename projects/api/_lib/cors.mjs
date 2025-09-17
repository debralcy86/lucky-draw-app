// Minimal CORS wrapper for API routes
// Usage: export default withCors(handler)

export function withCors(handler) {
  return async function corsWrapped(req, res) {
    const origin = req.headers?.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204; // No Content
      return res.end();
    }

    return handler(req, res);
  };
}

export default withCors;

