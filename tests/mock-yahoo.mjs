// Fake Yahoo Finance to test price refresh offline: YAHOO_BASE=http://127.0.0.1:9911
import http from 'node:http';
const P = { 'WPEA.PA': [7.25, 'EUR'], 'C40.PA': [139.4, 'EUR'], 'PAEEM.PA': [42.1, 'EUR'], 'XAIX.DE': [218.3, 'EUR'], 'XDEM.DE': [85.6, 'EUR'], 'DSY.PA': [24.9, 'EUR'], 'BTC-EUR': [90000, 'EUR'], 'ETH-EUR': [3300, 'EUR'], 'AAPL': [250, 'USD'], 'EURUSD=X': [1.10, 'USD'], '0P00000AZK.F': [61.2, 'EUR'], '0P0000JPMSC.F': [410.5, 'USD'] };
const SEARCH = { 'FR0010315770': [{ symbol: 'CW8.PA', quoteType: 'ETF', exchange: 'PAR', shortname: 'Amundi MSCI World' }], 'LU0099574567': [{ symbol: '0P00000AZK.F', quoteType: 'MUTUALFUND', exchange: 'FRA', shortname: 'Fidelity Global Technology' }], 'LU0210528922': [{ symbol: '0P0000JPMSC.F', quoteType: 'MUTUALFUND', exchange: 'FRA', shortname: 'JPM US Smaller Companies' }] };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const m = u.pathname.match(/^\/v8\/finance\/chart\/(.+)$/);
  res.setHeader('content-type', 'application/json');
  if (m) {
    const s = decodeURIComponent(m[1]); const p = P[s];
    if (!p) { res.statusCode = 404; return res.end(JSON.stringify({ chart: { result: null, error: { description: 'No data found, symbol may be delisted' } } })); }
    const daily = u.searchParams.get('interval') === '1d';
    const n = daily ? 252 : 260, step = daily ? 86400 : 7 * 86400;
    const now = Math.floor(Date.now() / 1000); const ts = [], cl = [];
    for (let i = n; i >= 0; i--) { ts.push(now - i * step); const t = daily ? (n - i) / n : (n - i) / n; cl.push(+(p[0] * (daily ? 0.85 + 0.15 * t : 0.6 + 0.4 * t) * (1 + 0.03 * Math.sin(i / 5))).toFixed(4)); }
    cl[cl.length - 1] = p[0];
    return res.end(JSON.stringify({ chart: { result: [{ meta: { currency: p[1], regularMarketPrice: p[0], regularMarketTime: now - 3600, shortName: s }, timestamp: ts, indicators: { quote: [{ close: cl }] } }], error: null } }));
  }
  if (u.pathname === '/v1/finance/search') return res.end(JSON.stringify({ quotes: SEARCH[u.searchParams.get('q')] || [] }));
  res.statusCode = 404; res.end('{}');
}).listen(9911, '127.0.0.1', () => console.log('mock yahoo :9911'));
