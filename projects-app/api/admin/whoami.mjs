import { setCorsHeaders } from '../_lib/cors.mjs';
const CRON_KEY = process.env.CRON_KEY || 'test-12345-xyz';

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCorsHeaders(res, origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  res.setHeader('Cache-Control', 'no-store');

  const key = (req.headers['x-cron-key'] || '').toString().trim();
  if (key !== CRON_KEY) return res.status(401).json({ ok: false, error: 'unauthorized' });

  // Explicit admin boolean for UI
  return res.status(200).json({ ok: true, admin: true, user: { role: 'admin' } });
}
