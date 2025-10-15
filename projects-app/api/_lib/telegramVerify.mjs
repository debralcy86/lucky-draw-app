import crypto from 'crypto';

/*
### Overview
Telegram initData is a short, signed payload the Telegram client passes to your Mini App at launch so your app can identify the user and trust the launch context. For the lucky-draw Mini App the flow is: Telegram client builds initData → front-end receives it and forwards or attaches it to API calls → backend verifies the signature using the bot token → backend returns authenticated user context for drawings, entries, and admin actions.

---

### Frontend Launch and initData creation
- When a user opens the Mini App inside Telegram the Telegram client generates initData and exposes it to the page via tgWebApp or the SDK.
- The initData is URL-style key=value pairs joined with & and always includes a hash field that signs the whole payload.
- Typical keys: auth_date, user (JSON-encoded), chat_instance, chat_type, and hash.
- The front-end must capture the raw initData string because the backend verification uses the exact canonical form.

---

### Data structure and how the hash is produced
- Canonical payload: all key=value pairs except the hash/signature, keys sorted lexicographically, each pair rendered as key=value, then joined with newline characters to form data_check_string.
- Signing secret: compute SHA-256 of the bot token (secret = SHA256(botToken) raw bytes).
- Compute HMAC: HMAC-SHA256(secret, data_check_string) and hex-encode the result.
- Provided hash in initData must exactly match that hex HMAC for the payload to be trusted.

---

### Client-side handling in the lucky-draw app
- On launch, capture the raw initData and forward it to backend endpoints that require authentication.
- Attach initData to requests via Authorization: tma <initData>, X-Telegram-InitData header, or JSON body { initData }.
- Actions that require identity (enter draw, claim prize, admin moves) must be validated server-side using verified initData.

---

### Backend verification sequence
1. Extract raw initData string from header, query, or body.
2. Parse into key/value pairs and remove the hash/signature param while saving providedHash.
3. Produce data_check_string by sorting remaining keys and joining key=value lines with "\n".
4. For each candidate token (TELEGRAM_BOT_TOKENS list or TELEGRAM_BOT_TOKEN):
   - Compute secret = SHA256(botToken) raw bytes.
   - Compute expected = HMAC-SHA256(secret, data_check_string) hex.
   - If expected === providedHash accept the request and build req.tma (user, userId, isAdmin).
5. If none match return 401 invalid_init_data.
6. Enforce admin-only endpoints by checking derived isAdmin or environment ADMIN list.

---

### How this fits lucky-draw features
- Entry submission: server verifies initData then records the entry with the authenticated userId.
- One-entry-per-user: rely on verified user.id and auth_date to enforce limits.
- Admin actions (draw, payout): require verified admin identity and extra server-side checks.
- Replay protection: check auth_date and optionally reject stale initData or rate-limit.

---

### Security and operational notes
- Keep the bot token secret; load from TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKENS.
- Never accept unsigned initData in production; dev bypass only when NODE_ENV !== 'production'.
- Use Node crypto exactly as described: secret = SHA256(botToken), then HMAC-SHA256 over data_check_string.
- Log minimal debug info (presence of initData, success/failure) and avoid logging full payloads.
- When diagnosing mismatches compute expected HMAC locally with candidate tokens.

---

### Quick checklist
- Frontend: capture raw initData and forward on protected API requests.
- Backend: canonicalization, hash extraction, SHA256 secret, HMAC check, per-token loop, admin derivation.
- Env: configure TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_TOKENS.
- Dev: guard local bypasses and remove before deploying.
*/

function normalizeToken(token) {
  if (token == null) return '';
  let value = String(token).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function normalizeTokens(source) {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source
      .flat()
      .map(normalizeToken)
      .filter(Boolean);
  }
  return String(source)
    .split(',')
    .map(normalizeToken)
    .filter(Boolean);
}

function parseInitData(initDataRaw) {
  const raw = String(initDataRaw ?? '');
  const params = new URLSearchParams(raw);
  const providedHash = params.get('hash') || params.get('signature') || '';
  if (!providedHash) {
    return {
      ok: false,
      reason: 'missing_hash_signature',
    };
  }

  const keys = [];
  for (const [key] of params.entries()) {
    if (key !== 'hash' && key !== 'signature') {
      keys.push(key);
    }
  }
  keys.sort((a, b) => a.localeCompare(b));

  const dataCheckString = keys
    .map((key) => `${key}=${params.get(key) ?? ''}`)
    .join('\n');

  return {
    ok: true,
    params,
    providedHash,
    dataCheckString,
  };
}

function compareHashes(providedHash, expectedBuffer) {
  let providedBuffer;
  try {
    providedBuffer = Buffer.from(providedHash, 'hex');
  } catch {
    return false;
  }
  return (
    providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

export function verifyTelegramInitData(initDataRaw, botToken) {
  const token = normalizeToken(botToken);
  if (!token) {
    return { ok: false, reason: 'missing_bot_token' };
  }

  const parsed = parseInitData(initDataRaw);
  if (!parsed.ok) {
    return parsed;
  }

  // follows canonical SHA256(botToken) → HMAC(data_check_string)
  const secret = crypto.createHash('sha256').update(token, 'utf8').digest();
  const expectedBuffer = crypto.createHmac('sha256', secret).update(parsed.dataCheckString, 'utf8').digest();

  if (!compareHashes(parsed.providedHash, expectedBuffer)) {
    return { ok: false, reason: 'hash_mismatch' };
  }

  let user = null;
  try {
    const userRaw = parsed.params.get('user');
    if (userRaw) {
      user = JSON.parse(userRaw);
    }
  } catch {
    user = null;
  }

  const authDateRaw = parsed.params.get('auth_date');
  let authDate = null;
  if (authDateRaw != null && authDateRaw !== '') {
    const n = Number(authDateRaw);
    if (Number.isFinite(n)) {
      authDate = n;
    }
  }

  const paramsObject = {};
  for (const [key, value] of parsed.params.entries()) {
    paramsObject[key] = value;
  }

  const userId =
    (user && (user.id ?? user.user_id ?? user.user?.id)) ??
    parsed.params.get('user_id') ??
    null;

  return {
    ok: true,
    user,
    userId,
    authDate,
    payload: paramsObject,
    params: paramsObject,
    tokenUsed: token,
    dataCheckString: parsed.dataCheckString,
    hash: parsed.providedHash,
    tag: 'telegramVerify/hmac-sha256-2025-10',
  };
}

export function verifyTma(initDataRaw, tokensSource) {
  let tokens = normalizeTokens(tokensSource);
  if (!tokens.length) {
    tokens = normalizeTokens(
      process.env.TELEGRAM_BOT_TOKENS || process.env.TELEGRAM_BOT_TOKEN || ''
    );
  }

  if (!tokens.length) {
    return { ok: false, reason: 'missing_bot_token' };
  }

  let lastReason = 'hash_mismatch';
  for (const token of tokens) {
    const result = verifyTelegramInitData(initDataRaw, token);
    if (result.ok) {
      return result;
    }
    lastReason = result.reason || lastReason;
  }

  return { ok: false, reason: lastReason };
}

export default function verifyInitData(
  initDataRaw,
  botToken = process.env.TELEGRAM_BOT_TOKEN || ''
) {
  return verifyTelegramInitData(initDataRaw, botToken);
}
