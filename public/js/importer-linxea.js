// Import of Linxea's « Télécharger vos données » workbook (life insurance, PER…): one row per fund
// of each contract, with units, last price, amount, gain and the fund's own performance.
// Pure module (no DOM). It only holds positions: no operations, so each import adds a snapshot
// to the lines' history (events) instead of rebuilding it.
import { libraryFor } from './library.js';
import { t } from './i18n.js';
import { envelopeForAccount } from './compute.js';
import { carryOver, carryAccount } from './importer.js';

const COLS = {
  placement: 'placement', contract: 'n contrat', product: 'produit', category: 'categorie', subcategory: 'sous-categorie',
  name: 'nom du support', isin: 'isin', qty: 'nbre de parts', price: 'derniere cotation', date: 'date', amount: 'somme en compte',
  gain: 'plus ou moins value', pru: 'prix de revient moyen',
  ytd: 'perf.% deb. annee', w1: 'perf.% 1 sem.', m1: 'perf.% 1 mois', m6: 'perf.% 6 mois', y3: 'perf.% 3 ans', y5: 'perf.% 5 ans', y10: 'perf.% 10 ans',
};
const REQUIRED = ['name', 'amount'];
export const PERF_KEYS = ['ytd', 'w1', 'm1', 'm6', 'y3', 'y5', 'y10'];

const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[°º]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const r2 = n => Math.round(n * 100) / 100;
const r6 = n => Math.round(n * 1e6) / 1e6;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
// 1 234,56 · 1,234.56 · 0.322190 · -1,747390 %
export function num(v) {
  let s = String(v ?? '').replace(/[\s  €%]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s) ? Number(s) : NaN;
}
// 22/10/2026, 2026-10-22, or an Excel serial number
function isoDate(v) {
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if ((m = s.match(/^\d{4}-\d{2}-\d{2}/))) return m[0];
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000).toISOString().slice(0, 10);
  return '';
}

function kindOf(placement) {
  const p = fold(placement);
  if (/\bper\b|retraite/.test(p)) return 'per';
  if (/\bpea\b/.test(p)) return 'pea';
  if (/titre/.test(p)) return 'cto';
  return 'av'; // assurance vie, contrat de capitalisation
}

// Line type, share in stocks and default breakdown from Linxea's category (« Fonds Actions »…)
function classify(category, name, code) {
  const c = fold(category), n = fold(name);
  const lib = libraryFor(code);
  if (/fonds (en )?euros?\b/.test(c) || (!ISIN.test(code) && /fonds (en )?euros?\b/.test(n))) return { type: 'fonds-euros', equity: 0 };
  if (/structur/.test(c)) return { type: 'structure', equity: 0 };
  if (/private|non cote|capital[- ]investissement/.test(c)) return { type: 'non-cote', equity: 0 };
  const type = lib?.type || (/\b(etf|etc|etn|tracker)\b/.test(n) ? 'etf' : 'fonds');
  if (/action/.test(c)) return { type, equity: lib?.equity ?? 1 };
  if (/diversifi|flexible|mixte|allocation/.test(c)) return { type, equity: lib?.equity ?? 0.5 };
  if (/obligat|monetaire|tresorerie/.test(c)) return { type, equity: 0, sector: 'bonds' };
  if (/matiere|commodit|\bor\b/.test(c)) return { type, equity: 0, sector: 'commo' };
  if (/immobili|scpi|\bsci\b|opci/.test(c)) return { type, equity: 0, sector: 're' };
  return { type, equity: lib?.equity ?? (type === 'etf' ? 1 : 0) };
}

export function importLinxea(rows) {
  const at = rows.findIndex(r => r.some(c => fold(c) === COLS.name));
  if (at < 0) throw new Error(t('Ce fichier ne ressemble pas à un export Linxea (colonnes manquantes : {cols}).', { cols: 'Nom du support, Somme en Compte' }));
  const head = rows[at].map(fold);
  const col = Object.fromEntries(Object.entries(COLS).map(([k, h]) => [k, head.indexOf(h)]));
  const missing = REQUIRED.filter(k => col[k] < 0);
  if (missing.length) throw new Error(t('Ce fichier ne ressemble pas à un export Linxea (colonnes manquantes : {cols}).', { cols: missing.map(k => COLS[k]).join(', ') }));
  const get = (r, k) => (col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '');

  const accounts = new Map(), lines = [];
  let to = '';
  for (const r of rows.slice(at + 1)) {
    const name = get(r, 'name');
    const amount = num(get(r, 'amount'));
    if (!name || !isFinite(amount) || (/^total\b/i.test(name) && !get(r, 'isin'))) continue; // blank and total rows
    const contract = get(r, 'contract').replace(/[^A-Za-z0-9]/g, '') || fold(get(r, 'product')).replace(/[^a-z0-9]+/g, '-') || 'contrat';
    const accId = 'lx-' + contract.toLowerCase();
    if (!accounts.has(accId)) accounts.set(accId, { id: accId, name: get(r, 'product') || 'Linxea', institution: 'Linxea', kind: kindOf(get(r, 'placement')), color: 'lilac', source: 'linxea', contract });
    const acc = accounts.get(accId);
    const code = get(r, 'isin').toUpperCase();
    const date = isoDate(get(r, 'date'));
    if (date > to) to = date;
    const cls = classify(get(r, 'category'), name, code);
    const lib = ISIN.test(code) ? libraryFor(code) : null;
    const gain = num(get(r, 'gain'));
    const perf = {};
    for (const k of PERF_KEYS) { const x = num(get(r, k)); if (isFinite(x)) perf[k] = r6(x / 100); }
    const line = {
      id: accId + '-' + (code || fold(name).replace(/[^a-z0-9]+/g, '-')).toLowerCase(),
      source: 'linxea', accountId: accId, envelope: envelopeForAccount(acc), type: cls.type,
      name, isin: ISIN.test(code) ? code : '', ticker: lib?.ticker || '',
      category: get(r, 'category'), subcategory: get(r, 'subcategory'),
      priceDate: date, priceSource: 'linxea', pending: 0, equity: cls.equity,
      ...Object.keys(perf).length ? { fundPerf: { ...perf, asOf: date } } : {},
      ...cls.sector ? { lookthrough: { sector: cls.sector, country: '' } } : {},
    };
    if (cls.type === 'fonds-euros') Object.assign(line, { qty: 1, amount: r2(amount), price: r2(amount), cost: r2(amount) });
    else {
      const qty = num(get(r, 'qty')), price = num(get(r, 'price'));
      const q = qty > 0 ? r6(qty) : 1;
      Object.assign(line, {
        qty: q,
        price: price > 0 && qty > 0 ? price : r2(amount / q),
        // the amount minus the gain is exact; units × average cost can be off by a few cents
        cost: r2(isFinite(gain) ? amount - gain : (num(get(r, 'pru')) || 0) * q),
      });
    }
    lines.push(line);
  }
  if (!lines.length) throw new Error(t('Aucun support trouvé dans ce fichier Linxea.'));
  // Each import is a snapshot of the contract on its date: the history chart starts there
  for (const l of lines) l.events = [[to || l.priceDate, l.qty, l.type === 'fonds-euros' ? l.amount : l.cost, l.price]];
  for (const a of accounts.values()) a.asOf = to;
  // Two contracts of the same product: the end of their number tells them apart
  const names = [...accounts.values()].map(a => a.name);
  for (const a of accounts.values()) if (names.filter(n => n === a.name).length > 1) a.name += ' · ' + a.contract.slice(-4);
  return { accounts: [...accounts.values()], lines, stats: { rows: lines.length, to, contracts: accounts.size } };
}

// Replaces the lines of the imported contracts only (other contracts, other brokers and manual lines stay),
// keeps the user's settings, and adds this snapshot to each line's history.
// A fund that left the contract stays as a closed line, so the chart keeps its past.
export function mergeLinxea(data, imp) {
  const ids = new Set(imp.accounts.map(a => a.id));
  const ours = l => l.source === 'linxea' && ids.has(l.accountId);
  const old = new Map(data.lines.filter(ours).map(l => [l.id, l]));
  const date = imp.stats.to;
  const addEvent = (events, ev) => [...(events || []).filter(e => e[0] !== ev[0]), ev].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const lines = imp.lines.map(l => {
    const o = old.get(l.id);
    return o ? { ...carryOver(o, l), events: addEvent(o.events, l.events[0]) } : l;
  });
  for (const [id, o] of old) {
    if (imp.lines.some(l => l.id === id) || o.type === 'fonds-euros') continue; // an emptied euro fund simply goes
    lines.push(o.qty > 0 ? { ...o, qty: 0, cost: 0, events: addEvent(o.events, [date || o.priceDate, 0, 0, o.price]) } : o);
  }
  // accounts already there keep their place; new ones come last
  const fresh = new Map(imp.accounts.map(a => [a.id, a]));
  const accounts = data.accounts.map(a => fresh.has(a.id) ? carryAccount(a, fresh.get(a.id)) : a);
  return {
    ...data,
    accounts: [...accounts, ...imp.accounts.filter(a => !data.accounts.some(x => x.id === a.id))],
    lines: [...data.lines.filter(l => !ours(l)), ...lines],
    imports: [...(data.imports || []), { at: new Date().toISOString(), source: 'linxea', rows: imp.stats.rows, to: imp.stats.to, contracts: imp.stats.contracts }].slice(-20),
  };
}
