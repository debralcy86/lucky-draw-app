const fs = require('fs');
const crypto = require('crypto');
const raw = fs.readFileSync('raw.txt','utf8');
const m = raw.match(/\?(.+)/s);
const qs = m ? m[1] : raw;
const parts = qs.split('&');

// Extract request-provided hash
const hashPart = parts.find(p => p.startsWith('hash='));
const reqHash = hashPart ? hashPart.split('=')[1] : '';

// Build remaining parts using raw percent-decoding but DO NOT reserialize JSON
const remaining = parts
  .filter(p => !p.startsWith('hash='))
  .map(p => {
    // decodeURIComponent leaves backslash characters (from %5C) intact as backslashes
    // decode only percent-encodings; do not replace or re-escape slashes
    const idx = p.indexOf('=');
    const key = idx >= 0 ? p.slice(0, idx) : p;
    const val = idx >= 0 ? p.slice(idx + 1) : '';
    // decodeURIComponent on key and value individually
    const k = decodeURIComponent(key);
    let v = decodeURIComponent(val);
    if (typeof v === 'string' && v[0] === '{') {
      // preserve Telegram's escaped forward slashes inside JSON-like values
      v = v.replace(/\//g, '\\/');
    }
    return k + '=' + v;
  });

// Sort by key name and join with '\n'
remaining.sort((a,b) => a.split('=')[0].localeCompare(b.split('=')[0]));
const dataCheck = remaining.join('\n');

// Derive secret and compute HMAC as Telegram specifies
const botToken = process.env.BOT_TOKEN || '';
const secret = crypto.createHmac('sha256', 'WebAppData').update(Buffer.from(botToken, 'utf8')).digest();
const calc = crypto.createHmac('sha256', secret).update(Buffer.from(dataCheck, 'utf8')).digest('hex');

// Output
console.log('REQ_HASH:', reqHash);
console.log('CALC   :', calc);
console.log('');
console.log('DATA_CHECK_PREVIEW:');
console.log(dataCheck);
