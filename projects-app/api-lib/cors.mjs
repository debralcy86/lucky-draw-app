// Simple CORS wrapper for Vercel Functions
// Allowed methods: GET, POST, OPTIONS
// Origin: process.env.APP_ORIGIN || '*'

const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];
const ALLOWED_HEADERS = 'Content-Type, x-admin-token';

export function withCors(handler) {
  return async function corsWrapped(req, res) {
    const origin = process.env.APP_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS.join(','));
    res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    if (!ALLOWED_METHODS.includes(req.method)) {
      res.setHeader('Allow', ALLOWED_METHODS.join(','));
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    return handler(req, res);
  };
}

