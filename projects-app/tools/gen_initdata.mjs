#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'fs';

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : (def ?? '');
}
function has(name) {
  return process.argv.includes(`--${name}`);
}

const legacyToken = process.env.BOT_TOKEN;
if (legacyToken) {
  console.warn('[gen_initdata] BOT_TOKEN is deprecated. Rename it to TELEGRAM_BOT_TOKEN.');
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Missing TELEGRAM_BOT_TOKEN');
  process.exit(2);
}

const user = {
  id: Number(arg('user-id', '8013482840')),
  first_name: arg('first', 'Debra'),
  last_name: arg('last', 'Leong'),
  username: arg('username', ''),
  language_code: arg('lang', 'en'),
  allows_write_to_pm: true,
};

const p = new URLSearchParams();
// Required
p.set('user', JSON.stringify(user));
p.set('auth_date', String(Math.floor(Date.now() / 1000)));
// Optional extras if provided
const chatType = arg('chat-type');
if (chatType) p.set('chat_type', chatType);
const chatInst = arg('chat-instance');
if (chatInst) p.set('chat_instance', chatInst);
const queryId = arg('query-id');
if (queryId) p.set('query_id', queryId);

const entries = Array.from(p.entries());
entries.sort(([a], [b]) => a.localeCompare(b));
const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

let hash;
try {
  const secret = crypto.createHmac('sha256', 'WebAppData')
    .update(token, 'utf8')
    .digest();
  hash = crypto.createHmac('sha256', secret)
    .update(dataCheckString, 'utf8')
    .digest('hex');
} catch (err) {
  console.error('Failed to sign initData:', err?.message || String(err));
  process.exit(3);
}

const init = entries.map(([k, v]) => `${k}=${v}`).join('&');
const out = `${init}&hash=${hash}`;
try {
  fs.writeFileSync('/tmp/initdata.txt', out);
} catch (e) {
  console.error('Failed to write /tmp/initdata.txt:', e?.message || String(e));
  process.exit(4);
}

if (has('header') || has('tma')) {
  process.stdout.write(`tma ${out}`);
} else {
  process.stdout.write(out);
}

if (has('verbose')) {
  console.error(`\nWrote /tmp/initdata.txt (len=${out.length})`);
}
