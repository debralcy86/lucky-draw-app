// api/verify.js
const crypto = require('crypto');

function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const A = Buffer.from(a, 'utf8');
  const B = Buffer.from(b, 'utf8');
  if (A.length !== B.length) return false;
  let r = 0;
  for (let i = 0; i < A.length; i++) r |= A[i] ^ B[i];
  return r === 0;
}

module.exports = async (req, res) => {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
  const DEBUG = !!process.env.DEBUG;

  if (!BOT_TOKEN) return res.status(500).send('TELEGRAM_BOT_TOKEN not set');

  const rawUrl = (req.originalUrl || req.url || '');
  const q = rawUrl.split('?')[1] || '';
  if (!q) return res.status(400).send('no query');

  const pairs = q.split('&');
  const params = Object.create(null);
  for (const p of pairs) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = decodeURIComponent(p.slice(0, idx));
    const v = decodeURIComponent(p.slice(idx + 1));
    params[k] = v;
  }

  const provided = params.hash;
  if (!provided) return res.status(400).send('no hash provided');
  delete params.hash;

  const keys = Object.keys(params).sort();
  const data_check_string = keys.map(k => `${k}=${params[k]}`).join('\n');

  const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(data_check_string).digest('hex');

  if (safeEq(computed, provided)) {
    return res.status(200).send('ok');
  }

  if (DEBUG) {
    return res.status(401).json({
      error: 'invalid_init_data',
      computed,
      provided,
      data_check_string
    });
  }

  return res.status(401).send('invalid init data');
};
