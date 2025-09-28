import crypto from 'node:crypto';

export function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pin), salt, 32, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPin(pin, stored) {
  const [ver, saltB64, keyB64] = String(stored).split('$');
  if (ver !== 's1') return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const got = crypto.scryptSync(String(pin), salt, expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(got, expected);
}
