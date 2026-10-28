// Net-worth calculations. Pure module (no DOM).
import { libraryFor, SECTORS } from './library.js';
import { t } from './i18n.js';
import { eur, num, qty as fqty } from './format.js';

export const CASH_TYPES = new Set(['especes', 'livret', 'fonds-euros']);
export const isCashLike = l => CASH_TYPES.has(l.type);
export const NEEDS_PRICE = l => !isCashLike(l) && !['non-cote', 'structure', 'autre-fixe', 'immo'].includes(l.type);
// A price Yahoo can refresh: a symbol, or an ISIN not yet found absent from Yahoo (noSymbol, set on refresh)
export const QUOTE_EXPECTED = l => NEEDS_PRICE(l) && !!(l.ticker || (l.isin && !l.noSymbol));

export const ENVELOPE_ORDER = ['PEA', 'Compte-titres', 'Assurance-vie', 'PER', 'Crypto', 'Immobilier', 'Livrets', 'Espèces', 'Autre'];

export function lineValue(l) {
  if (isCashLike(l)) return +(l.amount ?? 0) - (+l.moved || 0);
  return (+l.qty || 0) * (+l.price || 0) + (+l.pending || 0);
}
export function lineCost(l) {
  if (isCashLike(l)) return lineValue(l);
  return +l.cost || 0;
}
export function lineGain(l) { return isCashLike(l) ? 0 : lineValue(l) - lineCost(l); }
export function pru(l) { return l.qty ? (lineCost(l) - (+l.pending || 0)) / l.qty : 0; }
export function equityShare(l) {
  if (typeof l.equity === 'number') return l.equity;
  const lib = libraryFor(l.isin);
  if (lib && lib.equity != null) return lib.equity; // fetched compositions: no fixed share, follow the type
  return l.type === 'action' || l.type === 'etf' ? 1 : 0;
}

// Position actually held: attached to an existing account, and not a leftover from a sale
// (a few millionths of a share left after a full sale, or a zero quantity).
// Past sales stay in the history (events); only current positions
// count in totals, analysis, details and lists.
export function isHeld(l, accountIds) {
  if (accountIds && !accountIds.has(l.accountId)) return false;
  if (isCashLike(l) || +l.pending > 0.005 || l.estimateFromAmount) return true;
  const q = +l.qty || 0;
  if (q <= 1e-6) return false;
  return !(+l.price > 0) || q * l.price >= 0.01;
}
// The cash of accounts (type especes: current accounts, cash at brokers) can be left out of everything
// shown (settings.cash false, the default): a monthly statement's balance is soon stale, and money since
// moved to a broker would count twice. Savings books and euro funds always count.
export const cashCounted = data => data?.settings?.cash !== false;
export const shownLine = (data, l) => cashCounted(data) || l.type !== 'especes';
export function heldLines(data, { cash = cashCounted(data) } = {}) {
  const ids = new Set((data.accounts || []).map(a => a.id));
  return (data.lines || []).filter(l => isHeld(l, ids) && (cash || l.type !== 'especes'));
}

export function totals(data) {
  const lines = heldLines(data);
  let total = 0, cost = 0, invested = 0, cash = 0, equity = 0, liquid = 0;
  const byAcc = new Map(), byEnv = new Map();
  for (const l of lines) {
    const v = lineValue(l);
    total += v;
    if (isCashLike(l)) cash += v; else { invested += v; cost += lineCost(l); }
    if (l.type === 'especes' || l.type === 'livret') liquid += v;
    equity += v * equityShare(l);
    byAcc.set(l.accountId, (byAcc.get(l.accountId) || 0) + v);
    const env = l.envelope || 'Autre';
    byEnv.set(env, (byEnv.get(env) || 0) + v);
  }
  const gain = invested - cost;
  // an account that only holds left-out cash is not shown
  const cashOnly = a => !cashCounted(data) && (data.lines || []).some(l => l.accountId === a.id) && (data.lines || []).every(l => l.accountId !== a.id || l.type === 'especes');
  const accounts = (data.accounts || []).filter(a => !cashOnly(a)).map(a => {
    const ls = lines.filter(l => l.accountId === a.id);
    const v = byAcc.get(a.id) || 0;
    const c = ls.filter(l => !isCashLike(l)).reduce((s, l) => s + lineCost(l), 0);
    const iv = ls.filter(l => !isCashLike(l)).reduce((s, l) => s + lineValue(l), 0);
    return { account: a, value: v, share: total > 0 ? v / total : 0, gain: iv - c, lines: ls.length };
  }).sort((a, b) => b.value - a.value);
  const envelopes = [...byEnv].map(([name, value]) => ({ name, value, share: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
  return { total, cost, invested, cash, liquid, gain, gainPct: cost > 0 ? gain / cost : 0, equity, equityPct: total > 0 ? equity / total : 0, accounts, envelopes, count: lines.length };
}

export function staleLines(data, now = new Date(), days = 4) {
  const limit = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  return heldLines(data).filter(l => QUOTE_EXPECTED(l) && (!l.priceDate || l.priceDate < limit));
}

// ——— Look-through: sectors, countries, companies ———
const label = k => SECTORS[k] || k;
function addTo(map, key, v) { map.set(key, (map.get(key) || 0) + v); }
function normalized(obj) {
  const s = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(obj).map(([k, w]) => [k, w / s]);
}

// Each bucket (sector, country, company) keeps the breakdown of what makes it up (parts):
//   company: a company, held through one or more funds (via) or directly
//   rest   : the rest of a fund in this bucket, excluding its known top holdings
//   line   : a whole line (crypto, unlisted, product without breakdown)
//   fund / direct: for a company, the fund that holds it or the direct line
export const DIRECT = 'en direct';
const OTHER_ASSETS = SECTORS.bonds;
export function lookthrough(data) {
  const sectors = new Map(), countries = new Map(), companies = new Map();
  const parts = { sectors: new Map(), countries: new Map(), companies: new Map() };
  const addPart = (dim, bucket, name, kind, v, via, weight) => {
    let b = parts[dim].get(bucket); if (!b) parts[dim].set(bucket, b = new Map());
    const key = kind + '|' + name;
    let p = b.get(key); if (!p) b.set(key, p = { name, kind, value: 0, via: new Map(), weight: 0 });
    p.value += v; p.weight += weight || 0;
    if (via) p.via.set(via, (p.via.get(via) || 0) + v);
  };
  let base = 0, covered = 0, estimatedCompanies = 0;
  for (const l of heldLines(data)) {
    if (isCashLike(l)) continue;
    const v = lineValue(l);
    if (v <= 0) continue;
    base += v;
    const lib = libraryFor(l.isin);
    const custom = l.lookthrough || {};
    const own = lib?.short || l.name;
    if (lib && lib.holdings) {
      covered += v;
      // mixed fund: countries and sectors describe the equity part, the rest is kept separate
      const eq = Math.min(1, Math.max(0, lib.equity ?? 1));
      const sw = new Map(normalized(lib.sectors).map(([k, w]) => [label(k), w * eq]));
      const cw = new Map(normalized(lib.countries).map(([k, w]) => [k, w * eq]));
      if (eq < 1) {
        const r = v * (1 - eq);
        addTo(sectors, OTHER_ASSETS, r); addPart('sectors', OTHER_ASSETS, own, 'line', r);
        addTo(countries, 'Non ventilé', r); addPart('countries', 'Non ventilé', own, 'line', r);
      }
      const named = { sectors: new Map(), countries: new Map() };
      for (const [name, w, s, c] of lib.holdings) {
        const a = v * w / 100;
        addTo(companies, name, a); estimatedCompanies += a;
        addPart('companies', name, own, 'fund', a, null, w / 100);
        if (sw.has(label(s))) { addPart('sectors', label(s), name, 'company', a, own); addTo(named.sectors, label(s), a); }
        if (cw.has(c)) { addPart('countries', c, name, 'company', a, own); addTo(named.countries, c, a); }
      }
      for (const [dim, weights, totalsMap] of [['sectors', sw, sectors], ['countries', cw, countries]]) {
        for (const [k, w] of weights) {
          addTo(totalsMap, k, v * w);
          const rest = v * w - (named[dim].get(k) || 0);
          if (rest > 0.005) addPart(dim, k, own, 'rest', rest);
        }
      }
    } else if (l.type === 'action' || (lib && lib.type === 'action')) {
      covered += v;
      const s = label(custom.sector || lib?.sector || 'other'), c = custom.country || lib?.country || 'Non renseigné';
      addTo(sectors, s, v); addPart('sectors', s, own, 'company', v, DIRECT);
      addTo(countries, c, v); addPart('countries', c, own, 'company', v, DIRECT);
      addTo(companies, own, v); addPart('companies', own, l.name || own, 'direct', v);
    } else {
      let s, c;
      if (l.type === 'crypto') { covered += v; s = label('crypto'); c = 'Sans pays (crypto)'; }
      else if (l.type === 'non-cote') { s = label('pe'); c = 'Non ventilé'; }
      else {
        if (custom.sector || custom.country) covered += v;
        s = custom.sector ? label(custom.sector) : 'Non ventilé'; c = custom.country || 'Non ventilé';
      }
      addTo(sectors, s, v); addPart('sectors', s, own, 'line', v);
      addTo(countries, c, v); addPart('countries', c, own, 'line', v);
    }
  }
  const order = p => (p.kind === 'rest' ? 1 : 0);
  const list = (m, dim) => [...m].map(([name, value]) => ({
    name, value, pct: base > 0 ? value / base : 0,
    parts: [...(parts[dim].get(name)?.values() || [])]
      .map(p => ({ ...p, pct: value > 0 ? p.value / value : 0, via: [...p.via].map(([n, x]) => ({ name: n, value: x })).sort((a, b) => b.value - a.value) }))
      .sort((a, b) => order(a) - order(b) || b.value - a.value),
  })).sort((a, b) => b.value - a.value);
  return { base, coverage: base > 0 ? covered / base : 0, sectors: list(sectors, 'sectors'), countries: list(countries, 'countries'), companies: list(companies, 'companies') };
}

export function lineComposition(l) {
  const lib = libraryFor(l.isin);
  const v = lineValue(l);
  if (!lib || !lib.holdings) return null;
  return {
    index: lib.index,
    holdings: lib.holdings.map(([name, w, s, c]) => ({ name, weight: w / 100, amount: v * w / 100, sector: label(s), country: c })),
    sectors: normalized(lib.sectors).map(([k, w]) => ({ name: label(k), pct: w })).sort((a, b) => b.pct - a.pct),
    countries: normalized(lib.countries).map(([k, w]) => ({ name: k, pct: w })).sort((a, b) => b.pct - a.pct),
  };
}

// ——— Bank balance since its statement ———
// A bank statement's current-account balance (Caisse d'Épargne) is soon stale, and the money deposited since
// at a broker would count twice: once on the statement, once on the broker's account. The deposits into the
// other accounts after the statement's date (withdrawals back, the other way) are taken from that balance;
// never below zero, as the balance itself may not hold the whole deposit (pay arrived since).
// The bank's account must be the only current account imported from a statement, so the money's origin is plain.
const FEED_KINDS = new Set(['DEPOSIT', 'WITHDRAWAL']);
export function feeder(data) {
  const ce = new Set((data.accounts || []).filter(a => a.source === 'ce').map(a => a.id));
  const ls = (data.lines || []).filter(l => l.source === 'ce' && l.type === 'especes' && ce.has(l.accountId));
  if (ls.length !== 1) return null;
  const ids = new Set((data.accounts || []).map(a => a.id));
  const flows = (data.transactions || []).filter(tr => FEED_KINDS.has(tr.kind) && ids.has(tr.accountId) && !ce.has(tr.accountId) && tr.date)
    .map(tr => [tr.date.slice(0, 10), +tr.amount || 0]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { line: ls[0], flows };
}
// Money moved out of the balance [date, amount] known on `from`, up to `to` (included)
export function movedOut(flows, from, to, amount) {
  const sum = flows.reduce((s, [d, v]) => s + (d > from && d <= to ? v : 0), 0);
  return Math.min(sum, Math.max(amount, 0));
}
// Sets `moved` on the bank's line, removes it elsewhere. Called whenever the data changes; returns new data,
// where only the lines whose `moved` changed are new objects.
export function settleCash(data) {
  const f = feeder(data);
  const want = l => (l === f?.line ? Math.round(movedOut(f.flows, l.priceDate || '', '9999-12-31', +l.amount || 0) * 100) / 100 : 0);
  const lines = (data.lines || []).map(l => {
    const m = want(l);
    if ((+l.moved || 0) === m) return l;
    const { moved, ...n } = l;
    return m ? { ...n, moved: m } : n;
  });
  return { ...data, lines };
}

// ——— History ———
function lastLE(arr, d, idx = 0) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m][idx] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans >= 0 ? arr[ans] : null;
}
const iso = d => d.toISOString().slice(0, 10);

// keep (optional) narrows the chart to some lines: one account, one envelope.
export function history(data, now = new Date(), keep = null) {
  const accIds = new Set((data.accounts || []).map(a => a.id));
  const lines = (data.lines || []).filter(l => accIds.has(l.accountId) && shownLine(data, l) && (!keep || keep(l))); // past sales included
  const ph = data.priceHistory || {};
  const feed = feeder(data);
  let start = null;
  for (const l of lines) {
    const first = l.events?.length ? l.events[0][0] : (l.since || null);
    if (first && (!start || first < start)) start = first;
  }
  const today = iso(now);
  if (!start) return [];
  const points = [];
  const d0 = new Date(start + 'T00:00:00Z');
  const span = (now - d0) / 86400000;
  const step = span > 900 ? 7 : span > 200 ? 3 : 1;
  const dates = [];
  for (let t = d0.getTime(); t < now.getTime(); t += step * 86400000) dates.push(iso(new Date(t)));
  if (dates[dates.length - 1] !== today) dates.push(today);
  for (const d of dates) {
    let value = 0, invested = 0;
    for (const l of lines) {
      let q, c, evPrice = 0, evDate = '';
      if (l.events?.length) {
        const e = lastLE(l.events, d);
        if (!e) continue;
        [, q, c, evPrice] = e; evDate = e[0];
      } else {
        if (l.since && d < l.since) continue;
        q = l.qty; c = lineCost(l);
      }
      if (isCashLike(l)) {
        let b = l.events?.length ? c : lineValue(l);
        if (l === feed?.line && l.events?.length) b -= movedOut(feed.flows, evDate, d, b);
        value += b; invested += b; continue;
      }
      invested += c;
      if (l.type === 'non-cote') { value += d >= today ? lineValue(l) : c; continue; }
      // latest known price at date d: Yahoo history, transaction price or current price
      let p = 0, pd = '';
      const h = l.ticker && ph[l.ticker] ? lastLE(ph[l.ticker], d) : null;
      if (h) { p = h[1]; pd = h[0]; }
      if (evPrice && evDate >= pd) { p = evPrice; pd = evDate; }
      if (l.price && l.priceDate && l.priceDate <= d && l.priceDate >= pd) { p = l.price; pd = l.priceDate; }
      if (!p) p = q ? c / q : 0;
      value += q * p;
    }
    points.push({ d, value, invested });
  }
  // last point = exact current value
  if (points.length) points[points.length - 1].value = heldLines(data).filter(l => !keep || keep(l)).reduce((s, l) => s + lineValue(l), 0);
  return points;
}

// ——— Simulation ———
export function simulate(data, sim) {
  const clone = JSON.parse(JSON.stringify({ accounts: data.accounts, lines: data.lines, settings: data.settings }));
  const before = { t: totals(data), lt: lookthrough(data) };
  const out = { ok: true, warnings: [], realized: 0, tax: 0, taxNote: '' };
  let line = sim.lineId ? clone.lines.find(l => l.id === sim.lineId) : null;
  const qty = +sim.qty || 0, price = +sim.price || 0, fees = +sim.fees || 0;
  if (!(qty > 0) || !(price > 0)) return { ok: false, error: t('Indiquez une quantité et un prix positifs.') };
  const gross = qty * price;

  if (!line && sim.mode === 'buy') {
    const lib = libraryFor(sim.isin);
    const acc = clone.accounts.find(a => a.id === sim.accountId) || clone.accounts[0];
    if (!acc) return { ok: false, error: t('Créez d’abord un compte.') };
    line = { id: 'sim-new', accountId: acc.id, envelope: envelopeForAccount(acc), type: lib?.type || 'etf', name: sim.name || lib?.name || sim.isin || 'Nouvelle ligne', isin: sim.isin || '', ticker: lib?.ticker || '', qty: 0, cost: 0, price, priceDate: '', pending: 0, equity: lib ? lib.equity : 1, events: [] };
    clone.lines.push(line);
  }
  if (!line) return { ok: false, error: t('Choisissez une ligne.') };
  const prevPru = pru(line), prevQty = line.qty;
  const acc = clone.accounts.find(a => a.id === line.accountId);
  const cashLine = clone.lines.find(l => l.accountId === line.accountId && l.type === 'especes');

  if (sim.mode === 'buy') {
    line.qty += qty; line.cost += gross + fees;
    if (line.id === 'sim-new') line.price = price;
    if (sim.useCash) {
      if (!cashLine) out.warnings.push(t('Ce compte n’a pas d’espèces enregistrées : l’achat est compté comme un nouvel apport.'));
      else {
        if (cashLine.amount < gross + fees) out.warnings.push(t('Les espèces du compte ne suffisent pas ({x}).', { x: eur(cashLine.amount) }));
        cashLine.amount -= gross + fees;
      }
    }
  } else {
    if (qty > line.qty + 1e-9) return { ok: false, error: t('Vous ne détenez que {n} parts.', { n: fqty(line.qty) }) };
    const share = qty / line.qty;
    const costOut = (line.cost - (line.pending || 0)) * share;
    const proceeds = gross - fees;
    out.realized = proceeds - costOut;
    line.cost -= costOut; line.qty -= qty;
    if (line.qty < 1e-9) { line.qty = 0; line.cost = line.pending || 0; }
    if (sim.useCash) {
      if (cashLine) cashLine.amount += proceeds;
      else clone.lines.push({ id: 'sim-cash', accountId: line.accountId, envelope: 'Espèces', type: 'especes', name: 'Espèces', amount: proceeds, qty: 1, cost: proceeds, price: proceeds, equity: 0, events: [] });
    }
    const env = line.envelope;
    const rate = (sim.taxRate ?? 31.4) / 100;
    if (env === 'PEA') { out.tax = 0; out.taxNote = t('Vente à l’intérieur du PEA : pas d’impôt tant que l’argent reste dans le plan.'); }
    else if (env === 'Assurance-vie') { out.tax = 0; out.taxNote = t('Arbitrage dans l’assurance-vie : pas d’impôt tant que vous ne rachetez pas.'); }
    else { out.tax = Math.max(0, out.realized) * rate; out.taxNote = t('Estimation au prélèvement forfaitaire unique de {rate} %, sur la plus-value de cette vente seulement.', { rate: num(rate * 100, 1).replace(/[,.]0$/, '') }); }
  }
  const after = { t: totals(clone), lt: lookthrough(clone) };
  out.before = before; out.after = after;
  out.line = { name: line.name, prevQty, qty: line.qty, prevPru, pru: line.qty ? pru(line) : 0, account: acc?.name || '' };
  const w = (t, id) => { const l = (id === 'sim-new' ? clone.lines : data.lines).find(x => x.id === id); return l && t.total ? lineValue(l) / t.total : 0; };
  out.weightBefore = line.id === 'sim-new' ? 0 : w(before.t, line.id);
  out.weightAfter = t2w(after.t, line);
  out.deltas = {
    sectors: diffLists(before.lt.sectors, after.lt.sectors, before.t.total, after.t.total),
    countries: diffLists(before.lt.countries, after.lt.countries, before.t.total, after.t.total),
  };
  return out;
}
function t2w(t, line) { return t.total ? lineValue(line) / t.total : 0; }
function diffLists(a, b) {
  const m = new Map();
  for (const x of a) m.set(x.name, { name: x.name, before: x.pct, after: 0 });
  for (const x of b) { const e = m.get(x.name) || { name: x.name, before: 0, after: 0 }; e.after = x.pct; m.set(x.name, e); }
  return [...m.values()].map(e => ({ ...e, delta: e.after - e.before })).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

export function envelopeForAccount(acc) {
  return { pea: 'PEA', cto: 'Compte-titres', av: 'Assurance-vie', per: 'PER', crypto: 'Crypto', immo: 'Immobilier', livret: 'Livrets', courant: 'Espèces' }[acc?.kind] || 'Autre';
}

// ——— Real performance ———
// Cash movements kept at import: external flows (money in or out of the account) and income.
export const FLOW_KINDS = new Set(['DEPOSIT', 'WITHDRAWAL', 'CARD', 'CASH_OTHER']);
export const INCOME_KINDS = new Set(['DIVIDEND', 'INTEREST', 'BONUS']);
export const netAmount = tr => (+tr.amount || 0) + (INCOME_KINDS.has(tr.kind) ? +tr.tax || 0 : 0);

// Money-weighted annual rate (XIRR) of dated flows [{ d: 'YYYY-MM-DD', v }], seen from the investor:
// deposits negative, withdrawals and today's value positive. null when it has no solution.
export function xirr(flows) {
  if (flows.length < 2) return null;
  const t0 = Date.parse(flows[0].d);
  const ys = flows.map(f => (Date.parse(f.d) - t0) / (365 * 86400000));
  const npv = r => flows.reduce((s, f, i) => s + f.v / Math.pow(1 + r, ys[i]), 0);
  let lo = -0.9999, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200 && hi - lo > 1e-10; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (fm * flo > 0) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

// Performance of the accounts whose deposits are known (imported with their history):
// what was paid in, what it is worth today, and the annual rate that links the two.
// The gain includes dividends, interest, realized gains, fees and taxes.
export function performance(data, now = new Date(), onlyAccount = null) {
  const accIds = new Set((data.accounts || []).map(a => a.id));
  const txs = (data.transactions || []).filter(tr => accIds.has(tr.accountId) && (!onlyAccount || tr.accountId === onlyAccount));
  const flowsTx = txs.filter(tr => FLOW_KINDS.has(tr.kind)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const ids = new Set(flowsTx.map(tr => tr.accountId));
  const deposits = flowsTx.reduce((s, tr) => s + Math.max(0, tr.amount), 0);
  if (!ids.size || deposits <= 0) return null;
  const withdrawals = flowsTx.reduce((s, tr) => s - Math.min(0, tr.amount), 0);
  // the account's cash counts here whatever the setting: deposits land there first
  const value = heldLines(data, { cash: true }).filter(l => ids.has(l.accountId)).reduce((s, l) => s + lineValue(l), 0);
  const today = iso(now);
  const from = flowsTx[0].date;
  const days = Math.max(0, (Date.parse(today) - Date.parse(from)) / 86400000);
  const rate = xirr([...flowsTx.map(tr => ({ d: tr.date, v: -tr.amount })), { d: today, v: value }]);
  const sum = kind => txs.filter(tr => ids.has(tr.accountId) && tr.kind === kind).reduce((s, tr) => s + netAmount(tr), 0);
  return {
    accounts: [...ids], from, days, deposits, withdrawals, net: deposits - withdrawals, value, gain: value - deposits + withdrawals,
    rate, periodRate: rate == null ? null : Math.pow(1 + rate, days / 365) - 1,
    count: flowsTx.filter(tr => tr.kind === 'DEPOSIT').length,
    income: { dividends: sum('DIVIDEND'), interest: sum('INTEREST'), bonus: sum('BONUS') },
  };
}

// ——— Target allocation ———
// Each held line can carry a target share (l.target, in %); the lines with a target form the portfolio
// it is measured on, so a target can cover one account as well as everything.
export function allocation(data) {
  const ls = heldLines(data).filter(l => +l.target > 0);
  if (!ls.length) return null;
  const base = ls.reduce((s, l) => s + lineValue(l), 0);
  const sumTarget = ls.reduce((s, l) => s + +l.target, 0);
  const rows = ls.map(l => {
    const value = lineValue(l), target = +l.target / sumTarget, cur = base > 0 ? value / base : 0;
    return { line: l, value, pct: cur, target, gap: cur - target, gapEur: value - target * base };
  }).sort((a, b) => b.target - a.target || b.value - a.value);
  return { base, sumTarget, rows, drift: Math.max(...rows.map(r => Math.abs(r.gap))) };
}

// How to move toward the target with `amount` of new money. Without selling, the money goes
// to the lines furthest below their target (levelling their shortfall); with selling, every line
// is brought exactly to its target. Amounts below 1 € are dropped.
export function rebalance(data, amount = 0, sell = false) {
  const a = allocation(data);
  if (!a) return null;
  const add = Math.max(0, +amount || 0);
  const total = a.base + add;
  const want = a.rows.map(r => r.target * total - r.value);
  let moves;
  if (sell) moves = want;
  else {
    // shortfall levelling: x_i = max(0, want_i − μ), with μ ≥ 0 such that Σ x_i = add
    let lo = 0, hi = Math.max(0, ...want);
    const spent = mu => want.reduce((s, w) => s + Math.max(0, w - mu), 0);
    for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (spent(mid) > add) lo = mid; else hi = mid; }
    moves = want.map(w => Math.max(0, w - hi));
  }
  const rows = a.rows.map((r, i) => ({ ...r, move: Math.round(moves[i]), after: total > 0 ? (r.value + moves[i]) / total : 0 }))
    .filter(r => Math.abs(r.move) >= 1);
  return { ...a, add, total, rows };
}

// ——— Tax milestones ———
// PEA: withdrawals free of income tax 5 years after the first deposit (social charges remain).
// Life insurance: after 8 years, gains withdrawn get a yearly allowance and a lower rate.
// The date is the one the user gave (acc.openedAt), else the account's first known operation.
export const MILESTONE_YEARS = { pea: 5, av: 8 };
export function accountStart(data, acc) {
  if (acc.openedAt) return acc.openedAt;
  const dates = [
    ...(data.transactions || []).filter(tr => tr.accountId === acc.id).map(tr => tr.date),
    ...(data.lines || []).filter(l => l.accountId === acc.id).map(l => l.events?.[0]?.[0] || l.since),
  ].filter(Boolean).sort();
  return dates[0] || '';
}
export function milestone(data, acc, now = new Date()) {
  const years = MILESTONE_YEARS[acc?.kind];
  const start = years ? accountStart(data, acc) : '';
  if (!start) return null;
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + years);
  const free = iso(d);
  return { years, start, free, guessed: !acc.openedAt, done: free <= iso(now), days: Math.round((Date.parse(free) - Date.parse(iso(now))) / 86400000) };
}

// ——— Positions export ———
// One row per position held and shown (heldLines), with raw numbers: the Positions tab lists them and
// positionsCsv() writes them. Cash lines have a balance only (no quantity, price or gain).
// Sorted by envelope, then account, then value.
export function positions(data) {
  const accs = new Map((data.accounts || []).map(a => [a.id, a]));
  const lines = heldLines(data);
  const total = lines.reduce((s, l) => s + lineValue(l), 0);
  const envRank = e => { const i = ENVELOPE_ORDER.indexOf(e); return i < 0 ? ENVELOPE_ORDER.length : i; };
  return lines.map(l => {
    const cash = isCashLike(l), value = lineValue(l), cost = lineCost(l);
    return {
      id: l.id, name: cash && !l.customName ? t(l.name) : l.name, isin: l.isin || '', ticker: l.ticker || '',
      account: accs.get(l.accountId)?.name || '', envelope: l.envelope || 'Autre', type: l.type || 'autre', cash,
      qty: cash ? null : +l.qty || 0, price: cash ? null : +l.price || 0, priceDate: l.priceDate || '',
      pru: cash || !l.qty ? null : pru(l), cost, value,
      gain: cash ? null : value - cost, gainPct: cash || !(cost > 0) ? null : (value - cost) / cost,
      weight: total > 0 ? value / total : 0,
    };
  }).sort((a, b) => envRank(a.envelope) - envRank(b.envelope) || a.account.localeCompare(b.account) || b.value - a.value);
}

// Spreadsheet-ready CSV: French files use « ; » and decimal commas (what Excel expects in France),
// English ones « , » and dots. Raw numbers without currency signs or thousands separators.
// tsv: tab-separated, without the byte order mark, to paste into a spreadsheet.
// Texts come from imports and backups: a leading = + − @ is neutralised so a spreadsheet never runs it.
export function positionsCsv(rows, { lang = 'fr', typeLabel = k => k, tsv = false } = {}) {
  const sep = tsv ? '\t' : lang === 'en' ? ',' : ';';
  const n = (x, dec) => x == null || !Number.isFinite(x) ? '' : (lang === 'en' ? String(+x.toFixed(dec)) : String(+x.toFixed(dec)).replace('.', ','));
  const cell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (tsv) return s.replace(/[\t\r\n]+/g, ' ');
    return /["\n\r]/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = [t('Nom'), 'ISIN', t('Symbole'), t('Compte'), t('Enveloppe'), t('Type'), t('Quantité'), t('Cours (€)'), t('Date du cours'),
    t('Prix de revient unitaire (€)'), t('Prix de revient (€)'), t('Valeur (€)'), t('Plus-value (€)'), t('Plus-value (%)'), t('Poids (%)')];
  const body = rows.map(r => [cell(r.name), cell(r.isin), cell(r.ticker), cell(r.account), cell(t(r.envelope)), cell(typeLabel(r.type)),
    n(r.qty, 6), n(r.price, 4), r.cash ? '' : r.priceDate, n(r.pru, 4), n(r.cost, 2), n(r.value, 2), n(r.gain, 2),
    n(r.gainPct == null ? null : r.gainPct * 100, 2), n(r.weight * 100, 2)].join(sep));
  return '﻿' + [head.map(cell).join(sep), ...body].join('\r\n') + '\r\n';
}
