import { setCorsHeaders } from '../_lib/cors.mjs';

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  setCorsHeaders(res, origin);
  if (req.method === 'OPTIONS') return res.status(204).end();
  return res.status(200).json({ ok: true });
}
