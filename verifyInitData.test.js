// verifyInitData.test.js — clean CLI verifier
// Usage:
//   BOT_TOKEN=123456:AA... INIT_DATA="user=...&auth_date=...&hash=..." node verifyInitData.test.js
//   BOT_TOKEN=123456:AA... node verifyInitData.test.js "tma user=...&auth_date=...&hash=..."
//   BOT_TOKEN=123456:AA... node verifyInitData.test.js "Authorization: tma user=...&auth_date=...&hash=..."

import { validate } from '@telegram-apps/init-data-node';

function stripWrapper(s = '') {
  let x = s.trim();
  if (x.startsWith('Authorization:')) x = x.slice('Authorization:'.length).trim();
  if (x.startsWith('tma ')) x = x.slice(4).trim();
  return x;
}

const token =
  (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();

if (!token) {
  console.error('Missing bot token. Set BOT_TOKEN or TELEGRAM_BOT_TOKEN.');
  process.exit(1);
}

const arg = process.argv[2] || process.env.INIT_DATA || '';
const raw = stripWrapper(arg);
if (!raw) {
  console.error('Missing INIT_DATA (arg or env).');
  process.exit(2);
}

const botId = token.split(':')[0] || 'unknown';
console.log('TAG: verify-start', {
  bot_id: botId,
  token_len: token.length,
  init_len: raw.length,
  preview: raw.slice(0, 80)
});

try {
  // Throws on failure
  await validate(raw, token);

  const p = new URLSearchParams(raw);
  let user = null;
  try {
    user = p.get('user') ? JSON.parse(decodeURIComponent(p.get('user'))) : null;
  } catch {}

  // Dump all fields for clarity
  const all = {};
  for (const [k, v] of p.entries()) all[k] = v;

  console.log('✅ Verified');
  console.log('User:', user);
  console.log('All initData fields:', all);
  process.exit(0);
} catch (err) {
  console.error('❌ Verification failed:', err?.message || String(err));
  process.exit(3);
}