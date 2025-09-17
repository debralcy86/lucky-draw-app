// verifyInitData.test.js
// Usage examples:
//   BOT_TOKEN=123456:AA.... INIT_DATA="query_id=...&user=...&auth_date=...&hash=..." npm run verify:init
//   BOT_TOKEN=123456:AA.... npm run verify:init -- "tma query_id=...&user=...&auth_date=...&hash=..."
//   BOT_TOKEN=123456:AA.... npm run verify:init -- "query_id=...&user=...&auth_date=...&hash=..."

// Prefer @telegram-apps/init-data-node for CLI to avoid ESM resolver issues
import { validate } from '@telegram-apps/init-data-node';

const token = (process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '').trim();
if (!token) {
  console.error('Missing bot token. Set BOT_TOKEN or TELEGRAM_BOT_TOKEN.');
  process.exit(1);
}

import { validate } from 'telegram-web-app-init-data';
import dotenv from 'dotenv';
dotenv.config();

function extractInitDataFromArg(arg = '') {
  const initDataRaw = process.argv[2];
  const botToken = process.env.BOT_TOKEN;
  const initData = validate(initDataRaw, botToken);

  console.log({ initDataRaw, initData, botToken });
}

try {
  const result = validate(initDataRaw, botToken);
  const userId = result.user?.id;
  const username = result.user?.username;

  if (userId === '123456789') { // Replace with your actual admin ID
    console.log('✅ Admin verified:', username);
  } else {
    console.log('👤 Regular user:', username);
  }
} catch (err) {
  console.error('❌ Verification failed:', err.message);
}

const botId = token.split(':')[0] || 'unknown';
const preview = initDataRaw.slice(0, 50);
console.log('TAG: verify-start', { bot_id: botId, token_len: token.length, init_len: initDataRaw.length, preview });

try {
  await validate(initDataRaw, token);
  const p = new URLSearchParams(initDataRaw);
  let user = null;
  try { user = p.get('user') ? JSON.parse(decodeURIComponent(p.get('user'))) : null; } catch {}
  console.log('✅ Verified');
  console.log('User:', user);

  // Dump all initData fields for full visibility
  const all = {};
  for (const [k, v] of p.entries()) {
    all[k] = v;
  }
  console.log('All initData fields:', all);
} catch (err) {
  console.error('❌ Verification failed:', err?.message || String(err));
  process.exit(2);
}
