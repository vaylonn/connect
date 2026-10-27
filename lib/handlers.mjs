// /api routes shared by the Node server and the Vercel functions.
import { quotes, searchSymbol, SYMBOL_RE, MAX_SYMBOLS } from './yahoo.mjs';
import { composition, ISIN_RE } from './composition.mjs';

export async function handleApi(pathname, params) {
  if (pathname.endsWith('/api/health')) return [200, { ok: true, app: 'carnet', version: '1.8.0' }];
  if (pathname.endsWith('/api/quote')) {
    const syms = String(params.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!syms.length || syms.length > MAX_SYMBOLS || !syms.every(s => SYMBOL_RE.test(s))) return [400, { error: 'Paramètre symbols invalide.' }];
    const range = ['1mo', '6mo', '1y', '2y', '5y', 'max', 'full'].includes(params.get('range')) ? params.get('range') : 'full';
    return [200, await quotes(syms, range)];
  }
  if (pathname.endsWith('/api/composition')) {
    const isin = String(params.get('isin') || '').trim().toUpperCase();
    if (!ISIN_RE.test(isin)) return [400, { error: 'Paramètre isin invalide.' }];
    return [200, await composition(isin)];
  }
  if (pathname.endsWith('/api/search')) {
    try { return [200, await searchSymbol(params.get('q'))]; }
    catch (e) { return [400, { error: String(e.message || e) }]; }
  }
  return [404, { error: 'Route inconnue.' }];
}

// Vercel function for a handleApi route: api/health.mjs, api/quote.mjs…
export const vercelRoute = path => async (req, res) => {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  try {
    const [status, body] = await handleApi(path, new URL(req.url, 'http://localhost').searchParams);
    res.statusCode = status;
    res.end(JSON.stringify(body));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
};
