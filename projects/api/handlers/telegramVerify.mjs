import crypto from 'crypto';

export function verifyInitData(initData, botToken) {
  try {
    if (!initData || !botToken) {
      return { ok: false, error: 'Missing initData or bot token' };
    }
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { ok: false, error: 'Missing hash in initData' };
    const pairs = [];
    for (const [key, value] of params.entries()) {
      if (key === 'hash') continue;
      pairs.push(`${key}=${value}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join('\n');
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    const calcHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    if (calcHash !== hash) {
      return { ok: false, error: 'Invalid signature' };
    }
    const authDateStr = params.get('auth_date');
    if (authDateStr) {
      const authTs = Number(authDateStr) * 1000;
      const maxAgeMs = 24 * 60 * 60 * 1000;
      if (!Number.isFinite(authTs) || Date.now() - authTs > maxAgeMs) {
        return { ok: false, error: 'initData expired' };
      }
    }
    let userId;
    const userJson = params.get('user');
    if (userJson) {
      try {
        const u = JSON.parse(userJson);
        if (u && (u.id || u.user?.id)) {
          userId = String(u.id || u.user?.id);
        }
      } catch {}
    }
    return { ok: true, userId, payload: Object.fromEntries(params.entries()) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

