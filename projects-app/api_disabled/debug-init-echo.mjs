export default async function handler(req, res) {
  const auth = req.headers.authorization || '';
  res.status(200).json({ ok: true, tag: 'debug-init-echo/v1', hasAuth: !!auth, authPrefix: auth.slice(0, 8) });
}
