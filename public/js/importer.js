// Import of Trade Republic's « Exportation de transactions » CSV.
// Pure module (no DOM): usable in the browser as well as in Node.
import { libraryFor } from './library.js';
import { t } from './i18n.js';

export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}

const REQUIRED = ['datetime', 'account_type', 'category', 'type', 'symbol', 'shares', 'price', 'amount'];
const toNum = s => { if (s === undefined || s === null || s === '') return 0; const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
const r9 = n => Math.round(n * 1e9) / 1e9;

export const TR_ACCOUNTS = {
  DEFAULT: { id: 'tr-cto', name: 'Trade Republic', institution: 'Trade Republic', kind: 'cto', color: 'ink' },
  PEA: { id: 'tr-pea', name: 'Trade Republic PEA', institution: 'Trade Republic', kind: 'pea', color: 'orange' },
};

function lineType(cls, isin) {
  const lib = libraryFor(isin);
  if (lib) return lib.type;
  if (cls === 'FUND') return 'etf';
  if (cls === 'STOCK') return 'action';
  if (cls === 'CRYPTO') return 'crypto';
  if (cls === 'PRIVATE_FUND') return 'non-cote';
  return 'autre';
}

export function importTradeRepublic(text) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error(t('Le fichier est vide.'));
  const missing = REQUIRED.filter(k => !(k in rows[0]));
  if (missing.length) throw new Error(t('Ce fichier ne ressemble pas à un export Trade Republic (colonnes manquantes : {cols}).', { cols: missing.join(', ') }));
  rows.sort((a, b) => a.datetime < b.datetime ? -1 : a.datetime > b.datetime ? 1 : 0);

  const pos = new Map();     // key account|symbol
  const trades = [];         // securities trades (excluding cash movements), for the history
  const cash = new Map();    // account -> { bal, byDay: Map }: balance at the end of each day with movements
  const stats = { rows: rows.length, from: rows[0].date || rows[0].datetime.slice(0, 10), to: '', dividends: 0, interest: 0, fees: 0, taxes: 0, saveback: 0, unknownTypes: {} };
  const known = new Set(['BUY', 'SELL', 'SPLIT', 'BONUS_ISSUE', 'FREE_RECEIPT', 'PRIVATE_MARKET_BUY']);

  const P = (acct, x) => {
    const k = acct + '|' + x.symbol;
    if (!pos.has(k)) pos.set(k, { acct, isin: x.symbol, name: x.name, cls: x.asset_class, q: 0, cost: 0, buyValue: 0, prepaid: 0, price: 0, priceDate: '', events: [] });
    const p = pos.get(k);
    if (x.name) p.name = x.name;
    if (x.asset_class) p.cls = x.asset_class;
    return p;
  };
  const snap = (p, date) => {
    const cost = p.cls === 'PRIVATE_FUND' ? p.prepaid : p.cost;
    const ev = [date, r9(p.q), r2(cost), p.price ? +p.price.toFixed(4) : 0];
    const last = p.events[p.events.length - 1];
    if (last && last[0] === date) p.events[p.events.length - 1] = ev; else p.events.push(ev);
  };

  for (const x of rows) {
    const acct = x.account_type || 'DEFAULT';
    const date = x.date || x.datetime.slice(0, 10);
    stats.to = date > stats.to ? date : stats.to;
    // Cash: amount + fees + taxes of each movement
    const delta = toNum(x.amount) + toNum(x.fee) + toNum(x.tax);
    if (!cash.has(acct)) cash.set(acct, { bal: 0, byDay: new Map() });
    const c = cash.get(acct);
    c.bal += delta;
    c.byDay.set(date, r2(c.bal));

    if (x.type === 'DIVIDEND') stats.dividends += toNum(x.amount) + toNum(x.tax);
    if (x.type === 'INTEREST_PAYMENT') stats.interest += toNum(x.amount) + toNum(x.tax);
    if (x.type === 'BENEFITS_SAVEBACK') stats.saveback += toNum(x.amount);
    stats.fees += toNum(x.fee);
    stats.taxes += toNum(x.tax);

    const t = x.type;
    if (!x.symbol || !known.has(t)) continue;
    const p = P(acct, x);
    const q = toNum(x.shares);
    const trade = { source: 'tr', date, acct, isin: x.symbol, name: x.name || p.name, cls: x.asset_class || p.cls, kind: t, category: x.category || '', shares: Math.abs(q), price: Math.abs(toNum(x.price)), amount: toNum(x.amount), fee: toNum(x.fee), tax: toNum(x.tax) };
    trades.push(trade);
    if (t === 'BUY' || t === 'SELL') {
      const price = Math.abs(toNum(x.price));
      if (price) { p.price = price; p.priceDate = date; }
      // The type is authoritative: a sale removes shares even if the export writes the quantity
      // unsigned (a buy with a negative quantity is still a cancellation).
      const dq = t === 'SELL' ? -Math.abs(q) : q;
      if (dq > 0) {
        p.q += dq;
        p.cost += Math.abs(toNum(x.amount)) + Math.abs(toNum(x.fee));
        p.buyValue += dq * price;
      } else if (dq < 0) {
        if (t === 'SELL' && p.q > 1e-12) { // realized gain: net proceeds minus the cost basis of the shares sold
          const costOut = p.cost * Math.min(1, -dq / p.q);
          trade.realized = r2(Math.abs(toNum(x.amount)) - Math.abs(toNum(x.fee)) - costOut);
        }
        if (p.q > 1e-12) { const keep = Math.max(0, p.q + dq) / p.q; p.cost *= keep; p.buyValue *= keep; }
        p.q += dq;
        if (p.q < 1e-9) { p.q = 0; p.cost = 0; p.buyValue = 0; } // all sold (or more than held)
      }
    } else if (t === 'SPLIT' || t === 'BONUS_ISSUE' || t === 'FREE_RECEIPT') {
      p.q += q; // the split does not change the total cost basis
    } else if (t === 'PRIVATE_MARKET_BUY') {
      p.prepaid += -toNum(x.amount);
    }
    snap(p, date);
  }

  const accounts = [];
  const lines = [];
  const accIds = {};
  for (const acct of new Set([...cash.keys(), ...[...pos.values()].map(p => p.acct)])) {
    const base = TR_ACCOUNTS[acct] || { id: 'tr-' + acct.toLowerCase(), name: 'Trade Republic ' + acct, institution: 'Trade Republic', kind: 'cto', color: 'blue' };
    accounts.push({ ...base, source: 'tr' });
    accIds[acct] = base.id;
  }

  for (const p of pos.values()) {
    const type = lineType(p.cls, p.isin);
    const isPrivate = type === 'non-cote';
    // Unlisted: advance payments not yet executed stay « en attente » (pending)
    // (value of executed shares at purchase price = sum of q×price over buys)
    const pending = isPrivate ? r2(Math.max(0, p.prepaid - p.buyValue)) : 0;
    // Closed positions included: the value chart needs them, the display filters them out (isHeld)
    const lib = libraryFor(p.isin);
    const acc = p.acct;
    const envelope = acc === 'PEA' ? 'PEA' : type === 'crypto' ? 'Crypto' : 'Compte-titres';
    lines.push({
      id: 'tr-' + acc.toLowerCase() + '-' + p.isin.toLowerCase(),
      source: 'tr',
      accountId: accIds[acc],
      envelope,
      type,
      name: lib ? lib.name : (isPrivate ? p.name + ' · ' + p.isin.slice(0, 6) + '…' : p.name),
      isin: p.isin,
      ticker: lib ? lib.ticker : '',
      qty: r9(p.q),
      cost: r2(isPrivate ? p.prepaid : p.cost),
      price: p.price,
      priceDate: p.priceDate,
      priceSource: 'transaction',
      pending,
      equity: lib ? lib.equity : (type === 'action' || type === 'etf' ? 1 : 0),
      events: p.events,
    });
  }

  for (const [acct, c] of cash) {
    const bal = r2(c.bal);
    const events = [...c.byDay];
    if (Math.abs(bal) < 0.005) continue; // empty cash account: no line
    lines.push({
      id: 'tr-' + acct.toLowerCase() + '-cash', source: 'tr', accountId: accIds[acct], envelope: 'Espèces', type: 'especes',
      name: 'Espèces', isin: '', ticker: '', qty: 1, cost: bal, price: bal, amount: bal, priceDate: stats.to, priceSource: 'transaction',
      pending: 0, equity: 0, events: events.map(([d, b]) => [d, 1, b, b]),
    });
  }

  const transactions = trades.map((x, i) => ({ id: 'tr-op-' + i, ...x, accountId: accIds[x.acct], envelope: x.acct === 'PEA' ? 'PEA' : x.cls === 'CRYPTO' ? 'Crypto' : 'Compte-titres', type: lineType(x.cls, x.isin) }));

  stats.dividends = r2(stats.dividends); stats.interest = r2(stats.interest);
  stats.fees = r2(-stats.fees); stats.taxes = r2(-stats.taxes); stats.saveback = r2(stats.saveback);
  stats.cash = Object.fromEntries([...cash].map(([a, c]) => [accIds[a], r2(c.bal)]));
  return { accounts, lines, stats, transactions };
}

// Merges an import into existing data: replaces what came from Trade Republic,
// keeps manually entered lines and per-line settings (name, symbol, more recent price).
export function mergeImport(data, imp) {
  const old = new Map(data.lines.filter(l => l.source === 'tr').map(l => [l.id, l]));
  const lines = imp.lines.map(l => {
    const o = old.get(l.id);
    if (!o) return l;
    const n = { ...l };
    if (o.customName) { n.name = o.name; n.customName = true; }
    if (o.ticker && o.customTicker) { n.ticker = o.ticker; n.customTicker = true; }
    if (l.type !== 'especes' && o.priceDate && o.priceDate > l.priceDate) { n.price = o.price; n.priceDate = o.priceDate; n.priceSource = o.priceSource; }
    if (o.lookthrough) n.lookthrough = o.lookthrough;
    return n;
  });
  const oldAcc = new Map(data.accounts.map(a => [a.id, a]));
  const accounts = imp.accounts.map(a => oldAcc.has(a.id) ? { ...a, name: oldAcc.get(a.id).name, color: oldAcc.get(a.id).color } : a);
  return {
    ...data,
    accounts: [...accounts, ...data.accounts.filter(a => a.source !== 'tr')],
    lines: [...lines, ...data.lines.filter(l => l.source !== 'tr')],
    trStats: imp.stats,
    transactions: [...(imp.transactions || []), ...(data.transactions || []).filter(t => t.source !== 'tr')],
    imports: [...(data.imports || []), { at: new Date().toISOString(), rows: imp.stats.rows, from: imp.stats.from, to: imp.stats.to }].slice(-20),
  };
}
