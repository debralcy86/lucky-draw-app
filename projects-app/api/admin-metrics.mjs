import { setCorsHeaders } from './_lib/cors.mjs';

export default async function handler(req, res) {
  setCorsHeaders(res, req.headers.origin || '');
  if (req.method === 'OPTIONS') return res.status(204).end();

  res.setHeader('Cache-Control', 'no-store');

  const key = req.headers['x-cron-key'];
  if (key !== 'test-12345-xyz') {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  // TODO: replace with real Supabase metrics
  const metrics = {
    users: 0,
    total_balance: 0,
    open_draw: null,
    updated_at: new Date().toISOString()
  };

  return res.status(200).json({ ok: true, metrics });
}
