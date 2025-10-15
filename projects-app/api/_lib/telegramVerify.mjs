import crypto from 'node:crypto';

function buildDataCheckString(params) {
  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  return pairs.join('\n');
}

function parseUser(params) {
  try {
    const raw = params.get('user');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function verifyTelegramInitData(initDataRaw, botToken, maxAgeSec = 86400) {
  if (!initDataRaw || typeof initDataRaw !== 'string') {
    return { ok: false, reason: 'missing_initData' };
  }
  if (!botToken) {
    return { ok: false, reason: 'missing_bot_token' };
  }

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash) {
    return { ok: false, reason: 'missing_hash' };
  }

  const dataCheckString = buildDataCheckString(params);
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const calcHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  if (hash.length !== calcHash.length || !crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calcHash, 'hex'))) {
    return { ok: false, reason: 'bad_hash' };
  }

  const authDateStr = params.get('auth_date');
  if (authDateStr) {
    const authTs = Number(authDateStr) * 1000;
    if (!Number.isFinite(authTs)) {
      return { ok: false, reason: 'bad_auth_date' };
    }
    const maxAgeMs = maxAgeSec > 0 ? maxAgeSec * 1000 : 0;
    if (maxAgeMs && Date.now() - authTs > maxAgeMs) {
      return { ok: false, reason: 'stale_auth_date' };
    }
  }

  const user = parseUser(params);
  const userId = user?.id ? String(user.id) : undefined;

  return {
    ok: true,
    user,
    userId,
    params: Object.fromEntries(params.entries()),
  };
}

export default function verifyInitData(initDataRaw, botToken, options = {}) {
  const result = verifyTelegramInitData(initDataRaw, botToken, options.maxAgeSec ?? 86400);
  if (!result.ok) {
    return { ok: false, error: result.reason || 'invalid_init_data' };
  }
  return {
    ok: true,
    userId: result.userId,
    user: result.user || null,
    payload: result.params,
  };
}

export const verifyTma = verifyTma || verifyInitData || verifyTelegramInitData;
