// Fonction Vercel : /api/search
import { handleApi } from '../lib/handlers.mjs';
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  try {
    const [status, body] = await handleApi('/api/search', url.searchParams);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.statusCode = status;
    res.end(JSON.stringify(body));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}
