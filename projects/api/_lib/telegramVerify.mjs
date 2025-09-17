// Stable re-export for Telegram initData verification used across handlers and router
// Some builds/files name it `verifyInitData`, others `verifyTelegramInitData`,
// and in older code it may be a default export. This wrapper normalizes all.

import crypto from "crypto";

/** Extracts URLSearchParams and the Telegram user from initData */
export function parseInitData(initData = "") {
  const params = new URLSearchParams(initData);
  const userRaw = params.get("user");
  let user = null;
  try { user = userRaw ? JSON.parse(userRaw) : null; } catch {}
  const userId = user?.id ? String(user.id) : "";
  return { params, user, userId };
}

/** Core HMAC verification; returns truthy if signature matches */
function verifySignature(initData = "", botToken = "") {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") || "";
  if (!hash || !botToken) return false;

  // Build check string (all pairs except hash, sorted by key)
  const data = [];
  params.forEach((v, k) => { if (k !== "hash") data.push(`${k}=${v}`); });
  data.sort();
  const checkString = data.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calcHash = crypto.createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex");

  return calcHash === hash;
}

/**
 * Named export used by some handlers. Returns a structured result.
 * { ok, error?, user?, userId?, payload? }
 */
export function verifyTelegramInitData(initData = "", botToken = "") {
  try {
    if (!initData || !botToken) {
      return { ok: false, error: "Missing initData or bot token" };
    }

    const ok = verifySignature(initData, botToken);
    if (!ok) return { ok: false, error: "Invalid signature" };

    const { params, user, userId } = parseInitData(initData);

    // Optional: expiry check (24h) similar to handler implementation
    const authDateStr = params.get("auth_date");
    if (authDateStr) {
      const authTs = Number(authDateStr) * 1000;
      const maxAgeMs = 24 * 60 * 60 * 1000;
      if (!Number.isFinite(authTs) || Date.now() - authTs > maxAgeMs) {
        return { ok: false, error: "initData expired" };
      }
    }

    return { ok: true, user, userId, payload: Object.fromEntries(params.entries()) };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/** Default export alias for compatibility: verifyInitData(initData, botToken) */
export default function verifyInitData(initData = "", botToken = "") {
  return verifyTelegramInitData(initData, botToken);
}

// Also expose a named export for compatibility with `import { verifyInitData } ...`
export { verifyInitData };
