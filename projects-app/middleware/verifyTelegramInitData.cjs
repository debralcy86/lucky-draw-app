/*
  Middleware that validates Telegram initData using the shared verifier.
  It logs debug information and propagates the verification context on success.
*/
let verifierPromise = null;

function getVerifier() {
  if (!verifierPromise) {
    verifierPromise = import('../api/_lib/telegramVerify.mjs');
  }
  return verifierPromise;
}

function extractInitData(req) {
  const rawUrl = req.url || '';
  const idx = rawUrl.indexOf('?');
  if (idx === -1) return '';
  let qs = rawUrl.slice(idx + 1);
  try { qs = decodeURIComponent(qs); } catch (_) {}
  return qs.replace(/\\\//g, '/');
}

function verifyTelegramInitData(botToken) {
  return async (req, res, next) => {
    try {
      const qs = extractInitData(req);
      if (!qs) {
        res.statusCode = 401;
        res.end('missing initData');
        return;
      }

      const token = botToken || process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
      if (!token) {
        res.statusCode = 500;
        res.end('bot token not configured');
        return;
      }

      const { verifyTelegramInitData: verify } = await getVerifier();
      const result = verify(qs, token);
      if (!result?.ok) {
        console.error('[TMA-DEBUG] verification failed', {
          reason: result?.reason || 'verify_failed',
        });
        res.statusCode = 401;
        res.end('invalid initData hash');
        return;
      }

      req.telegramInit = {
        data_check_string: result.dataCheckString,
        hash: result.hash,
        mode: result.mode,
      };
      next();
    } catch (err) {
      console.error('[TMA-DEBUG] verification error:', err && err.stack ? err.stack : err);
      res.statusCode = 500;
      res.end('initData verification error');
    }
  };
}

module.exports = verifyTelegramInitData;
