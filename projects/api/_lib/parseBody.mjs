// projects/api/_lib/parseBody.mjs

/**
 * Parse JSON body from a Node.js HTTP request.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<any>} Parsed body object
 */
export async function parseBody(req) {
  let raw = '';
  await new Promise((resolve, reject) => {
    req.on('data', chunk => { raw += chunk; });
    req.on('end', resolve);
    req.on('error', reject);
  });
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}