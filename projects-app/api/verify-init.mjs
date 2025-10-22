import verifyInitData, { verifyTma } from './_lib/telegramVerify.mjs';

function pickInitData(req) {
  const hAuth = req.headers['authorization'] || '';
  const hInit = req.headers['x-telegram-initdata'] || req.headers['x-telegram-init-data'] || '';
  const qInit = (req.query && (req.query.initData || req.query.initdata)) || '';
  const b = req.body || {};
  const bInit = typeof b === 'string' ? b : (b.initData || b.initdata || '');
  const raw = hAuth || hInit || qInit || bInit || '';
  return raw;
}

export default async function handler(req, res) {
  try {
    const initDataRaw = pickInitData(req);
    const result = verifyTma(initDataRaw);
    res.status(200).json({
      ok: result.ok,
      mode: result.mode || null,
      reason: result.reason || null,
      userId: result.userId ?? null,
      user: result.user ?? null,
      authDate: result.authDate ?? null,
      tag: result.tag || 'verify-init',
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'server_error', message: String((err && err.message) || err) });
  }
}
