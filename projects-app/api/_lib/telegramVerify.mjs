// api/_lib/telegramVerify.mjs — Telegram WebApp initData verification (single-bot, ESM)
import crypto from 'node:crypto';

function buildDataCheckString(params) {
  const keys = [];
  for (const [k] of params.entries()) {
    if (k === 'hash') continue;
    keys.push(k);
  }
  keys.sort();
  const parts = [];
  for (const k of keys) parts.push(`${k}=${params.get(k) ?? ''}`);
  return parts.join('\n');
}

function parseUser(params) {
  try {
    const raw = params.get('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function verifyTelegramInitData(initDataRaw, botToken, maxAgeSec = Number(process.env.TMA_MAX_AGE_SEC || 86400)) {
  if (!initDataRaw || typeof initDataRaw !== 'string') {
    return { ok: false, reason: 'missing_initData' };
  }
  if (!botToken) {
    return { ok: false, reason: 'missing_bot_token' };
  }

  const params = new URLSearchParams(String(initDataRaw));
  const providedHash = String(params.get('hash') || '');
  if (!providedHash) return { ok: false, reason: 'missing_hash' };

  const dataCheckString = buildDataCheckString(params);
  // Correct secret per spec: secret = SHA256(botToken) (raw bytes)
  const secret = crypto.createHash('sha256').update(botToken, 'utf8').digest();
  const expectedHex = crypto.createHmac('sha256', secret).update(dataCheckString, 'utf8').digest('hex');

  const a = Buffer.from(expectedHex, 'hex');
  const b = Buffer.from(providedHash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'hash_mismatch' };
  }

  const authDate = Number(params.get('auth_date') || 0);
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: 'bad_auth_date' };
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > maxAgeSec) return { ok: false, reason: 'stale_auth_date' };

  const user = parseUser(params);
  const userId = user?.id ? String(user.id) : '';
  if (!userId) return { ok: false, reason: 'missing_user' };

  const adminList = String(process.env.TMA_ADMIN_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const isAdmin = adminList.includes(userId);

  return {
    ok: true,
    user,
    userId,
    isAdmin,
    params: Object.fromEntries(params.entries()),
  };
}

export default function verifyInitData(initDataRaw, botToken = process.env.TELEGRAM_BOT_TOKEN || '', options = {}) {
  const res = verifyTelegramInitData(initDataRaw, botToken, options.maxAgeSec);
  if (!res.ok) return { ok: false, reason: res.reason || 'invalid_init_data' };
  return { ok: true, userId: res.userId, user: res.user, isAdmin: res.isAdmin, payload: res.params };
}

// Named alias used by middleware; avoid self-references
export const verifyTma = verifyInitData;
