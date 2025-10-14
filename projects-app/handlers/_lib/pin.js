import crypto from 'node:crypto';

export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pin), salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPin(pin, stored, options = {}) {
  const value = String(stored || '');
  if (!value) return false;

  if (value.startsWith('s1$')) {
    const [, saltB64, keyB64] = value.split('$');
    if (!saltB64 || !keyB64) return false;
    try {
      const salt = Buffer.from(saltB64, 'base64');
      const expected = Buffer.from(keyB64, 'base64');
      const got = crypto.scryptSync(String(pin), salt, expected.length, { N: 16384, r: 8, p: 1 });
      return crypto.timingSafeEqual(got, expected);
    } catch (_) {
      return false;
    }
  }

  if (options.userId) {
    const legacyHash = crypto.createHash('sha256').update(`${pin}:${options.userId}`).digest('hex');
    return value === legacyHash;
  }

  return false;
}
