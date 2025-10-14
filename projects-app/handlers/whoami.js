import { requireTma } from './_lib/initData.mjs';

export default async function handler(req, res) {
  const auth = await requireTma(req, res);
  if (!auth) return;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok:true, userId: auth.userId, isAdmin: false }));
}
