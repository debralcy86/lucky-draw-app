// projects-app/api/board.mjs  // TAG: board-mux v1
export const config = { runtime: 'nodejs' };
function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  try {
    if (p.endsWith('/board/stream')) {
      const mod = await import('../api-lib/board/stream-handler.mjs');
      return mod.default ? mod.default(req, res) : send(res, 500, { ok:false, error:'stream-handler missing default export' });
    }
    const mod = await import('../api-lib/board/board-handler.mjs');
    return mod.default ? mod.default(req, res) : send(res, 500, { ok:false, error:'board-handler missing default export' });
  } catch (e) {
    return send(res, 500, { ok:false, error:String(e?.message||e) });
  }
}
