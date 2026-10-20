// Routes /api communes au serveur Node et aux fonctions Vercel.
import { quotes, searchSymbol, SYMBOL_RE } from './yahoo.mjs';

export async function handleApi(pathname, params) {
  if (pathname.endsWith('/api/health')) return [200, { ok: true, app: 'carnet', version: '1.2.0' }];
  if (pathname.endsWith('/api/quote')) {
    const syms = String(params.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!syms.length || syms.length > 60 || !syms.every(s => SYMBOL_RE.test(s))) return [400, { error: 'Paramètre symbols invalide.' }];
    const range = ['1mo', '6mo', '1y', '2y', '5y', 'max', 'full'].includes(params.get('range')) ? params.get('range') : 'full';
    return [200, await quotes(syms, range)];
  }
  if (pathname.endsWith('/api/search')) {
    try { return [200, await searchSymbol(params.get('q'))]; }
    catch (e) { return [400, { error: String(e.message || e) }]; }
  }
  return [404, { error: 'Route inconnue.' }];
}
