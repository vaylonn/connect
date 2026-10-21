// Fonction Vercel : /api/sync (coffre chiffré, voir lib/vault.mjs)
import { handleSync, readJson } from '../lib/vault.mjs';
export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  try {
    const body = req.method === 'PUT' ? await readJson(req) : null;
    // Adresse du client : Vercel la place dans x-forwarded-for, en remplaçant celle qu'enverrait le client
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress;
    const [status, out] = await handleSync(req.method, req.headers, body, ip);
    res.statusCode = status;
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = e.status || 502;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}
