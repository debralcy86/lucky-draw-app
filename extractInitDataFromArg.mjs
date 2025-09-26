// extractInitDataFromArg.mjs — return RAW initData without stripping fields
export default function extractInitDataFromArg(req = {}, body = {}) {
  const h = req.headers || {};
  const auth = (h.authorization || h.Authorization || '').toString().trim();

  const fromHeader = auth.startsWith('tma ') ? auth.slice(4).trim() : '';
  const fromBodyA = typeof body.initData === 'string' ? body.initData.trim() : '';
  const fromBodyB = typeof body.tgWebAppData === 'string' ? body.tgWebAppData.trim() : '';
  const fromXHeader =
    (h['x-telegram-webapp-init-data'] || h['x-telegram-init-data'] || '').toString().trim();

  return fromHeader || fromBodyA || fromBodyB || fromXHeader || '';
}