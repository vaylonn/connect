// Calculs du patrimoine. Module pur (sans DOM).
import { libraryFor, SECTORS } from './library.js';

export const CASH_TYPES = new Set(['especes', 'livret', 'fonds-euros']);
export const isCashLike = l => CASH_TYPES.has(l.type);
export const NEEDS_PRICE = l => !isCashLike(l) && l.type !== 'non-cote' && l.type !== 'autre-fixe';

export const ENVELOPE_ORDER = ['PEA', 'Compte-titres', 'Assurance-vie', 'PER', 'Crypto', 'Livrets', 'Espèces', 'Autre'];

export function lineValue(l) {
  if (isCashLike(l)) return +(l.amount ?? 0);
  return (+l.qty || 0) * (+l.price || 0) + (+l.pending || 0);
}
export function lineCost(l) {
  if (isCashLike(l)) return +(l.amount ?? 0);
  return +l.cost || 0;
}
export function lineGain(l) { return isCashLike(l) ? 0 : lineValue(l) - lineCost(l); }
export function pru(l) { return l.qty ? (lineCost(l) - (+l.pending || 0)) / l.qty : 0; }
export function equityShare(l) {
  if (typeof l.equity === 'number') return l.equity;
  const lib = libraryFor(l.isin);
  if (lib) return lib.equity ?? 0;
  return l.type === 'action' || l.type === 'etf' ? 1 : 0;
}

export function totals(data) {
  const lines = data.lines || [];
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
  const accounts = (data.accounts || []).map(a => {
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
  return (data.lines || []).filter(l => NEEDS_PRICE(l) && (l.ticker || l.isin) && (!l.priceDate || l.priceDate < limit));
}

// ——— Transparence : secteurs, pays, entreprises ———
const label = k => SECTORS[k] || k;
function addTo(map, key, v) { map.set(key, (map.get(key) || 0) + v); }
function normalized(obj) {
  const s = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(obj).map(([k, w]) => [k, w / s]);
}

export function lookthrough(data) {
  const sectors = new Map(), countries = new Map(), companies = new Map();
  let base = 0, covered = 0, estimatedCompanies = 0;
  for (const l of data.lines || []) {
    if (isCashLike(l)) continue;
    const v = lineValue(l);
    if (v <= 0) continue;
    base += v;
    const lib = libraryFor(l.isin);
    const custom = l.lookthrough || {};
    if (lib && lib.holdings) {
      covered += v;
      for (const [k, w] of normalized(lib.sectors)) addTo(sectors, label(k), v * w);
      for (const [k, w] of normalized(lib.countries)) addTo(countries, k, v * w);
      for (const [name, w] of lib.holdings) { addTo(companies, name, v * w / 100); estimatedCompanies += v * w / 100; }
    } else if (l.type === 'action' || (lib && lib.type === 'action')) {
      covered += v;
      addTo(sectors, label(custom.sector || lib?.sector || 'other'), v);
      addTo(countries, custom.country || lib?.country || 'Non renseigné', v);
      addTo(companies, lib?.short || l.name, v);
    } else if (l.type === 'crypto') {
      covered += v;
      addTo(sectors, label('crypto'), v);
      addTo(countries, 'Sans pays (crypto)', v);
    } else if (l.type === 'non-cote') {
      addTo(sectors, label('pe'), v);
      addTo(countries, 'Non ventilé', v);
    } else {
      if (custom.sector || custom.country) covered += v;
      addTo(sectors, custom.sector ? label(custom.sector) : 'Non ventilé', v);
      addTo(countries, custom.country || 'Non ventilé', v);
    }
  }
  const list = m => [...m].map(([name, value]) => ({ name, value, pct: base > 0 ? value / base : 0 })).sort((a, b) => b.value - a.value);
  return { base, coverage: base > 0 ? covered / base : 0, sectors: list(sectors), countries: list(countries), companies: list(companies) };
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

// ——— Historique ———
function lastLE(arr, d, idx = 0) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m][idx] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans >= 0 ? arr[ans] : null;
}
const iso = d => d.toISOString().slice(0, 10);

export function history(data, now = new Date()) {
  const lines = data.lines || [];
  const ph = data.priceHistory || {};
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
        const b = l.events?.length ? c : lineValue(l);
        value += b; invested += b; continue;
      }
      invested += c;
      if (l.type === 'non-cote') { value += d >= today ? lineValue(l) : c; continue; }
      // cours le plus récent connu à la date d : historique Yahoo, prix de transaction ou cours actuel
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
  // dernier point = valeur exacte du moment
  const t = totals(data);
  if (points.length) { points[points.length - 1].value = t.total; }
  return points;
}

export function changeOver(points, days) {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const target = iso(new Date(new Date(last.d).getTime() - days * 86400000));
  const p = lastLE(points.map(x => [x.d, x]), target);
  if (!p) return null;
  const a = p[1];
  const flows = (last.invested - a.invested);
  const delta = last.value - a.value - flows;
  return { delta, pct: a.value > 0 ? delta / a.value : 0 };
}

// ——— Simulation ———
export function simulate(data, sim) {
  const clone = JSON.parse(JSON.stringify({ accounts: data.accounts, lines: data.lines }));
  const before = { t: totals(data), lt: lookthrough(data) };
  const out = { ok: true, warnings: [], realized: 0, tax: 0, taxNote: '' };
  let line = sim.lineId ? clone.lines.find(l => l.id === sim.lineId) : null;
  const qty = +sim.qty || 0, price = +sim.price || 0, fees = +sim.fees || 0;
  if (!(qty > 0) || !(price > 0)) return { ok: false, error: 'Indiquez une quantité et un prix positifs.' };
  const gross = qty * price;

  if (!line && sim.mode === 'buy') {
    const lib = libraryFor(sim.isin);
    const acc = clone.accounts.find(a => a.id === sim.accountId) || clone.accounts[0];
    if (!acc) return { ok: false, error: 'Créez d’abord un compte.' };
    line = { id: 'sim-new', accountId: acc.id, envelope: envelopeForAccount(acc), type: lib?.type || 'etf', name: sim.name || lib?.name || sim.isin || 'Nouvelle ligne', isin: sim.isin || '', ticker: lib?.ticker || '', qty: 0, cost: 0, price, priceDate: '', pending: 0, equity: lib ? lib.equity : 1, events: [] };
    clone.lines.push(line);
  }
  if (!line) return { ok: false, error: 'Choisissez une ligne.' };
  const prevPru = pru(line), prevQty = line.qty;
  const acc = clone.accounts.find(a => a.id === line.accountId);
  const cashLine = clone.lines.find(l => l.accountId === line.accountId && l.type === 'especes');

  if (sim.mode === 'buy') {
    line.qty += qty; line.cost += gross + fees;
    if (line.id === 'sim-new') line.price = price;
    if (sim.useCash) {
      if (!cashLine) out.warnings.push('Ce compte n’a pas d’espèces enregistrées : l’achat est compté comme un nouvel apport.');
      else {
        if (cashLine.amount < gross + fees) out.warnings.push('Les espèces du compte ne suffisent pas (' + cashLine.amount.toFixed(2).replace('.', ',') + ' €).');
        cashLine.amount -= gross + fees;
      }
    }
  } else {
    if (qty > line.qty + 1e-9) return { ok: false, error: 'Vous ne détenez que ' + String(+line.qty.toFixed(6)).replace('.', ',') + ' parts.' };
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
    if (env === 'PEA') { out.tax = 0; out.taxNote = 'Vente à l’intérieur du PEA : pas d’impôt tant que l’argent reste dans le plan.'; }
    else if (env === 'Assurance-vie') { out.tax = 0; out.taxNote = 'Arbitrage dans l’assurance-vie : pas d’impôt tant que vous ne rachetez pas.'; }
    else { out.tax = Math.max(0, out.realized) * rate; out.taxNote = 'Estimation au prélèvement forfaitaire unique de ' + String(+(rate * 100).toFixed(1)).replace('.', ',') + ' %, sur la plus-value de cette vente seulement.'; }
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
  return { pea: 'PEA', cto: 'Compte-titres', av: 'Assurance-vie', per: 'PER', crypto: 'Crypto', livret: 'Livrets', courant: 'Espèces' }[acc?.kind] || 'Autre';
}
