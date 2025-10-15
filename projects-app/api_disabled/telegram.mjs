import crypto from 'node:crypto';

console.log('[telegram.mjs] verifyInitData module loaded');

function timingSafeEqHex(aHex, bHex) {
  try {
    const a = Buffer.from(aHex, 'hex');
    const b = Buffer.from(bHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyInitData(initDataString, botToken) {
  if (!initDataString || typeof initDataString !== 'string') {
    return { ok: false, reason: 'missing_init_data' };
  }

  console.log('[verifyInitData] raw initData:', initDataString);

  const params = new URLSearchParams(initDataString);
  const hash = params.get('hash');
  console.log('[verifyInitData] extracted hash:', hash);

  if (!botToken) {
    return { ok: false, reason: 'missing_bot_token' };
  }

  // Parse key=value pairs
  if (!hash) {
    return { ok: false, reason: 'missing_hash' };
  }

  // Build data_check_string excluding hash, sorted by key
  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  // secret_key = HMAC_SHA256('WebAppData', botToken)
  const secretKey = crypto
    .createHash('sha256').update(botToken,'utf8').digest(); // binary buffer

  // expected = HMAC_SHA256(secret_key, data_check_string) (hex)
  const expected = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const ok = timingSafeEqHex(expected, hash);
  if (!ok) {
    return { ok: false, reason: 'invalid_hash' };
  }

  return { ok: true };
}

export function launchTelegramBot(botUsername, payload = '') {
  const url = `https://t.me/${botUsername}?start=${payload}`;
  const logPrefix = '[launchTelegramBot]';

  if (window.Telegram && Telegram.WebApp) {
    console.log(`${logPrefix} Detected Telegram WebApp context`);
    Telegram.WebApp.openTelegramLink(url);
  } else {
    console.warn(`${logPrefix} Not in Telegram WebApp, falling back to window.location`);
    window.location.href = url;
  }
}

