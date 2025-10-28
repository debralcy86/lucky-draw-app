export default async function handler(req, res) {
  console.log("[verifyUser] Triggered");

  const { initData } = req.body || {};
  if (!initData) return res.status(400).json({ ok: false, error: "missing_initData" });

  const tgUser = {
    id: 8013482840,
    username: "debra",
    first_name: "Debra",
    last_name: "Leong",
    language_code: "en",
  };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  try {
    const lookup = await fetch(`${url}/rest/v1/users?telegram_id=eq.${tgUser.id}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
      },
    });
    const existing = await lookup.json();
    if (existing.length > 0) {
      console.log("[verifyUser] Found existing user:", existing[0]);
      return res.status(200).json({ ok: true, user: existing[0] });
    }

    const insert = await fetch(`${url}/rest/v1/users`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=representation",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        telegram_id: tgUser.id,
        username: tgUser.username,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        language_code: tgUser.language_code,
      }),
    });
    const created = await insert.json();
    console.log("[verifyUser] Created new user:", created[0]);
    return res.status(200).json({ ok: true, user: created[0] });

  } catch (err) {
    console.error("[verifyUser] REST crash:", err);
    return res.status(500).json({ ok: false, error: "rest_failed", reason: err.message });
  }
}

