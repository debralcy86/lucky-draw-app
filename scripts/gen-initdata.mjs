#!/usr/bin/env node
// scripts/gen-initdata.mjs
// Generate a signed Telegram Mini App initData string for local testing.
// Usage examples:
//   TELEGRAM_BOT_TOKEN=123456:AA... node scripts/gen-initdata.mjs --user-id=111222333 --first=Test --username=dummy
//   TELEGRAM_BOT_TOKEN=123456:AA... node scripts/gen-initdata.mjs --user-id=1 --tma    # prints with 'tma ' prefix

import crypto from 'node:crypto';

function arg(name, def = '') {
  const key = `--${name}`;
  for (const a of process.argv.slice(2)) {
    if (a === key) return 'true';
    if (a.startsWith(key + '=')) return a.slice(key.length + 1);
  }
  return def;
}

const legacyToken = (process.env.BOT_TOKEN || '').trim();
if (legacyToken) {
  console.warn('[gen-init] BOT_TOKEN is deprecated. Rename it to TELEGRAM_BOT_TOKEN.');
}

const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required.');
  process.exit(1);
}

const userId = Number(arg('user-id', process.env.TG_USER_ID || '111222333'));
const first = arg('first', process.env.TG_FIRST_NAME || 'Test');
const username = arg('username', process.env.TG_USERNAME || 'dummy');
const queryId = arg('query', process.env.TG_QUERY_ID || 'AA-LocalTest');
const authDate = Number(arg('auth-date', '')) || Math.floor(Date.now() / 1000);
const withTma = arg('tma', '') === 'true';
const withHeader = arg('header', '') === 'true';

const params = new URLSearchParams();
params.set('auth_date', String(authDate));
params.set('query_id', queryId);
params.set('user', JSON.stringify({ id: userId, first_name: first, username }));

// data-check-string (sorted key=value pairs, excluding hash)
const pairs = [];
for (const [k, v] of params.entries()) pairs.push(`${k}=${v}`);
pairs.sort();
const dcs = pairs.join('\n');

const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
params.set('hash', hash);

const raw = params.toString();
if (withHeader) {
  console.log(`Authorization: tma ${raw}`);
} else if (withTma) {
  console.log(`tma ${raw}`);
} else {
  console.log(raw);
}

// Optional debug to stderr
console.error('generated', {
  bot_id: token.split(':')[0] || 'unknown',
  init_len: raw.length,
  preview: raw.slice(0, 60),
});
