export const config = { runtime: 'nodejs' };
export default async function (req, res) {
  const { withTMA } = await import('./_lib/tma.mjs');
  const inner = async (_req, _res) => {
    if (_req.method !== 'POST') return _res.status(405).json({ ok:false, error:'method_not_allowed' });
    const { user, userId, isAdmin, tag } = _req.tma || {};
    return _res.status(200).json({ ok:true, userId, isAdmin, user, tag: tag || 'whoami/unified' });
  };
  return withTMA(inner)(req, res);
}
