import { setCorsHeaders } from '../_lib/cors.mjs';

const CRON_KEY = process.env.CRON_KEY || 'test-12345-xyz';

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCorsHeaders(res, origin);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (_) { body = {}; }

  const headerKey = (req.headers['x-cron-key'] || '').toString().trim();
  const token = (body.token || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const password = (body.password || '').toString().trim();

  const authorized =
    headerKey === CRON_KEY ||
    token === CRON_KEY ||
    (email && password && headerKey === CRON_KEY); // temporarily allow email/password when header key is present

  if (!authorized) return res.status(401).json({ ok: false, error: 'unauthorized' });

  // no real session cookies yet; frontend keeps CRON_KEY
  return res.status(200).json({ ok: true, user: { role: 'admin' } });
}
