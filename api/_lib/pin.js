import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const DKLEN = 32;
const LEGACY_SALT = process.env.PIN_SALT || 'pin_salt_v1';

function toB64(buf){ return Buffer.from(buf).toString('base64'); }
function fromB64(s){ return Buffer.from(s, 'base64'); }

export function hashPin(pin) {
  const p = String(pin);
  if (!/^\d{4,6}$/.test(p)) throw new Error('pin_format_invalid');
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(p, salt, DKLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return `s1$${toB64(salt)}$${toB64(dk)}`;
}

export function verifyPin(pin, stored, { userId } = {}) {
  const p = String(pin);
  if (!stored) return false;
  try {
    if (stored.startsWith('s1$')) {
      const [, sb64, kb64] = stored.split('$');
      if (!sb64 || !kb64) return false;
      const salt = fromB64(sb64);
      const expected = fromB64(kb64);
      const dk = crypto.scryptSync(p, salt, DKLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
      return crypto.timingSafeEqual(dk, expected);
    }
    if (stored.startsWith('v1$')) {
      const mac = crypto.createHmac('sha256', LEGACY_SALT).update(p).digest('hex');
      return stored === `v1$${mac}`;
    }
    if (/^[a-f0-9]{64}$/.test(stored)) {
      const sha = crypto.createHash('sha256').update(p).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(sha, 'hex'), Buffer.from(stored, 'hex'));
    }
    return false;
  } catch {
    return false;
  }
}


