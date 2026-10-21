// Price fetching from Yahoo Finance (server side only).
// Only ticker symbols are sent to Yahoo: never quantities or amounts.
const BASES = process.env.YAHOO_BASE
  ? [process.env.YAHOO_BASE.replace(/\/$/, '')]
  : ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const cache = new Map(); // key -> { at, value }
const TTL = 3 * 60 * 1000;
export const SYMBOL_RE = /^[A-Za-z0-9.\-=^]{1,24}$/;
export const MAX_SYMBOLS = 10; // per request (the app asks for 5): each symbol costs several Yahoo calls

class NotFound extends Error {}
async function getOnce(url, timeout) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctl.signal });
    if (r.status === 404) throw new NotFound('Symbole introuvable sur Yahoo Finance');
    if (!r.ok) throw new Error('Yahoo Finance a répondu ' + r.status + (r.status === 429 ? ' (trop de demandes, réessayez dans quelques minutes)' : ''));
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Yahoo Finance ne répond pas (délai dépassé)');
    if (e instanceof TypeError) throw new Error('Pas d’accès à Internet depuis le serveur Carnet (' + (e.cause?.code || e.message) + ')');
    throw e;
  } finally { clearTimeout(t); }
}
// Tries query1 then query2: Yahoo sometimes blocks one of them.
async function getJSON(path, timeout = 12000) {
  let last;
  for (const base of BASES) {
    try { return await getOnce(base + path, timeout); }
    catch (e) { if (e instanceof NotFound) throw e; last = e; }
  }
  throw last;
}
async function cached(key, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL) return c.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return value;
}
const day = s => new Date(s * 1000).toISOString().slice(0, 10);

async function rawChart(symbol, range, interval) {
  return cached(`c:${symbol}:${range}:${interval}`, async () => {
    const j = await getJSON(`/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`);
    const res = j?.chart?.result?.[0];
    if (!res) throw new Error(j?.chart?.error?.description || 'Symbole inconnu');
    const meta = res.meta || {};
    const ts = res.timestamp || [];
    const closes = res.indicators?.quote?.[0]?.close || [];
    const history = [];
    for (let i = 0; i < ts.length; i++) if (closes && closes[i] != null && isFinite(closes[i])) history.push([day(ts[i]), +closes[i]]);
    let price = meta.regularMarketPrice ?? (history.length ? history[history.length - 1][1] : null);
    let currency = meta.currency || 'EUR';
    const date = meta.regularMarketTime ? day(meta.regularMarketTime) : (history.length ? history[history.length - 1][0] : null);
    if (currency === 'GBp' || currency === 'GBX') { price /= 100; for (const h of history) h[1] /= 100; currency = 'GBP'; }
    if (currency === 'ZAc' || currency === 'ILA') { price /= 100; for (const h of history) h[1] /= 100; currency = currency === 'ZAc' ? 'ZAR' : 'ILS'; }
    return { symbol, price, currency, date, time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null, history, name: meta.longName || meta.shortName || '' };
  });
}

function lastLE(arr, d) { let lo = 0, hi = arr.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m][0] <= d) { ans = m; lo = m + 1; } else hi = m - 1; } return ans >= 0 ? arr[ans] : null; }

// Full history: 5 years weekly, then the last year daily.
async function fullChart(symbol) {
  const [weekly, daily] = await Promise.all([rawChart(symbol, '5y', '1wk'), rawChart(symbol, '1y', '1d')]);
  const cut = daily.history.length ? daily.history[0][0] : '9999';
  const history = [...weekly.history.filter(h => h[0] < cut), ...daily.history];
  return { ...daily, history, price: daily.price ?? weekly.price, date: daily.date || weekly.date };
}
async function chartFor(symbol, range) {
  if (range === 'full') return fullChart(symbol);
  return rawChart(symbol, range, range === '5y' || range === 'max' ? '1wk' : '1d');
}

// Price converted to euros
export async function quoteEUR(symbol, range = 'full') {
  const q = await chartFor(symbol, range);
  if (!(q.price > 0)) throw new Error('Aucun cours publié pour ce symbole');
  if (q.currency === 'EUR') return { ...q, priceEUR: q.price, historyEUR: q.history };
  const fx = await chartFor(`EUR${q.currency}=X`, range);
  const rate = fx.price;
  if (!(rate > 0)) throw new Error('Taux de change indisponible pour ' + q.currency);
  const historyEUR = q.history.map(([d, c]) => { const r = lastLE(fx.history, d); return [d, +(c / (r ? r[1] : rate)).toFixed(6)]; });
  return { ...q, priceEUR: +(q.price / rate).toFixed(6), historyEUR, fx: rate };
}

export async function quotes(symbols, range = 'full') {
  const out = {};
  const list = [...new Set(symbols)].filter(s => SYMBOL_RE.test(s)).slice(0, MAX_SYMBOLS);
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const s = list[i++];
      try {
        const q = await quoteEUR(s, range);
        out[s] = { price: q.priceEUR, date: q.date, time: q.time, currency: 'EUR', sourceCurrency: q.currency, history: q.historyEUR, name: q.name };
      } catch (e) { out[s] = { error: String(e.message || e) }; }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { quotes: out, fetchedAt: new Date().toISOString() };
}

const PREFERRED = ['.PA', '.DE', '.AS', '.MI', '.BR', '.F', '.MC', '.L'];
export async function searchSymbol(q) {
  q = String(q || '').trim();
  if (!/^[A-Za-z0-9 .\-]{2,40}$/.test(q)) throw new Error('Recherche invalide');
  return cached('s:' + q, async () => {
    const j = await getJSON(`/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`);
    const quotes = (j?.quotes || []).filter(x => x.symbol && ['EQUITY', 'ETF', 'MUTUALFUND', 'CRYPTOCURRENCY', 'INDEX'].includes(x.quoteType));
    if (!quotes.length) return { symbol: null, candidates: [] };
    const rank = s => { const i = PREFERRED.findIndex(suf => s.endsWith(suf)); return i < 0 ? 99 : i; };
    quotes.sort((a, b) => rank(a.symbol) - rank(b.symbol));
    return { symbol: quotes[0].symbol, name: quotes[0].longname || quotes[0].shortname || '', candidates: quotes.slice(0, 6).map(x => ({ symbol: x.symbol, name: x.longname || x.shortname || '', exchange: x.exchange, type: x.quoteType })) };
  });
}
