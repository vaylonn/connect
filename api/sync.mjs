// Fonction Vercel : /api/sync (coffre chiffré, voir lib/vault.mjs)
import { handleSync, readJson } from '../lib/vault.mjs';
export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  try {
    const body = req.method === 'PUT' ? await readJson(req) : null;
    const [status, out] = await handleSync(req.method, req.headers, body);
    res.statusCode = status;
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = e.status || 502;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}
