// Import of a Caisse d'Épargne account statement (« Relevé de comptes », PDF read by pdf.js).
// Only its summary is read: the balance of each account and savings book on the statement date.
// The operations, the holder, the addresses and the account numbers are not kept.
// Pure module (no DOM).
import { t } from './i18n.js';
import { carryOver, carryAccount } from './importer.js';
import { settleCash } from './compute.js';

// « LIV.A EN CPTE N° 17515 00092 00784130620 Solde au 03/10/2026 + 4 400,00 »
const ROW = /^(.+?)\s*N°\s*((?:\d+\s*)+?)\s*Solde au\s*(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{2}\s*\d{2})\s*([+-])\s*(\d[\d .  ]*,\d{2})$/;
const fold = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
// Kind and name from the statement's label; null: not imported (loans, investments with their own statements)
const KINDS = [
  [/\bPRET\b|CREDIT|\bPTZ\b|EMPRUNT/, null],
  [/TITRE|\bPEA\b|BOURSE|ASSURANCE|CAPITALISATION/, null],
  [/^LIV ?A\b|LIVRET A\b/, 'livret', 'Livret A'],
  [/JEUNE/, 'livret', 'Livret Jeune'],
  [/^LDDS?\b|DEVELOPPEMENT DURABLE/, 'livret', 'LDDS'],
  [/^LEP\b|EPARGNE POPULAIRE/, 'livret', 'LEP'],
  [/^PEL\b|PLAN EPARGNE LOGEMENT/, 'livret', 'PEL'],
  [/^[LC]EL\b|EPARGNE LOGEMENT/, 'livret', 'LEL'],
  [/^LIV|LIVRET|EPARGNE|\bCSL\b/, 'livret', ''],
  [/DEPOT|CHEQUE|COURANT|CPTE|COMPTE/, 'courant', 'Caisse d’Épargne'],
];
const cap = s => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, m => m.toUpperCase());
// Short id from the account number, so the number itself is not stored (FNV-1a)
const hash = s => { let h = 0x811c9dc5; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0; return h.toString(36); };

export function importCe(pages) {
  const found = new Map(), skipped = [];
  for (const line of pages.flat()) {
    const m = ROW.exec(line);
    if (!m) continue;
    const label = m[1].trim(), number = m[2].replace(/\s/g, '');
    const date = `${m[5].replace(/\s/g, '')}-${m[4]}-${m[3]}`;
    const amount = (m[6] === '-' ? -1 : 1) * Number(m[7].replace(/[\s.  ]/g, '').replace(',', '.'));
    const k = KINDS.find(([re]) => re.test(fold(label)));
    if (!k || !k[1]) { skipped.push(cap(label)); continue; }
    if (found.has(number) || !isFinite(amount)) continue;
    found.set(number, { label, number, date, amount, kind: k[1], name: k[2] || cap(label.replace(/\s+EN CPTE\b.*/i, '')) });
  }
  if (!found.size) throw new Error(t('Ce fichier ne ressemble pas à un relevé de comptes Caisse d’Épargne : sa synthèse des comptes est introuvable.'));
  const accounts = [], lines = [];
  let to = '';
  for (const r of found.values()) {
    const id = 'ce-' + hash(r.number);
    const cash = r.kind === 'courant';
    if (r.date > to) to = r.date;
    accounts.push({ id, name: r.name, institution: 'Caisse d’Épargne', kind: r.kind, color: cash ? 'blue' : 'green', source: 'ce', asOf: r.date });
    lines.push({
      id: id + '-solde', source: 'ce', accountId: id, envelope: cash ? 'Espèces' : 'Livrets', type: cash ? 'especes' : 'livret',
      name: cash ? 'Solde' : r.name, isin: '', ticker: '', qty: 1, amount: r.amount, price: r.amount, cost: r.amount,
      priceDate: r.date, priceSource: 'ce', pending: 0, equity: 0, events: [[r.date, 1, r.amount, r.amount]],
    });
  }
  return { accounts, lines, stats: { rows: lines.length, to, skipped: [...new Set(skipped)] } };
}

// Accounts entered by hand that the statement also brings (same kind and name, or the bank's current account),
// each with the statement's account it matches: the import offers to merge them rather than count them twice.
export function duplicates(data, imp) {
  const name = s => fold(s).replace(/[^A-Z0-9]+/g, ' ').trim();
  const taken = new Set();
  const out = [];
  for (const a of data.accounts || []) {
    if (a.source && a.source !== 'manual') continue;
    const n = imp.accounts.find(x => !taken.has(x.id) && x.kind === a.kind
      && (name(x.name) === name(a.name) || (x.kind === 'courant' && /CAISSE|EPARGNE|\bCE\b/.test(name(a.name + ' ' + (a.institution || ''))))));
    if (n) { taken.add(n.id); out.push({ account: a, into: n.id }); }
  }
  return out;
}

// Updates the statement's accounts (other accounts stay), adds its balances to their history.
// An older statement only fills in the history: the balance shown stays the latest one.
// merge: duplicates() pairs to fold in; the hand-entered balance joins the history (and stays shown if more recent),
// the hand-chosen name, colour and note are kept.
export function mergeCe(data, imp, merge = []) {
  imp = { ...imp, accounts: imp.accounts.map(a => ({ ...a })), lines: imp.lines.map(l => ({ ...l, events: [...l.events] })) };
  for (const { account, into } of merge) {
    const a = imp.accounts.find(x => x.id === into);
    if (!a) continue;
    Object.assign(a, carryAccount(account, a));
    const l = imp.lines.find(x => x.accountId === into);
    for (const m of data.lines.filter(x => x.accountId === account.id && ['especes', 'livret'].includes(x.type))) {
      const date = m.priceDate || m.since || '';
      if (date && date !== l.priceDate) l.events.push([date, 1, +m.amount || 0, +m.amount || 0]);
    }
    l.events.sort((x, y) => (x[0] < y[0] ? -1 : 1));
    const [date, , amount] = l.events[l.events.length - 1];
    Object.assign(l, { amount, price: amount, cost: amount, priceDate: date });
  }
  const gone = new Set(merge.map(m => m.account.id));
  const keep = x => !gone.has(x.accountId);
  const base = { ...data, accounts: data.accounts.filter(a => !gone.has(a.id)), lines: data.lines.filter(keep), transactions: (data.transactions || []).filter(keep) };
  const old = new Map(base.lines.filter(l => l.source === 'ce').map(l => [l.id, l]));
  const fresh = new Map(imp.lines.map(l => [l.id, l]));
  const merged = l => {
    const o = old.get(l.id);
    if (!o) return l;
    const mine = new Set(l.events.map(e => e[0]));
    const events = [...(o.events || []).filter(e => !mine.has(e[0])), ...l.events].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const [date, , amount] = events[events.length - 1];
    return { ...carryOver(o, l), amount, price: amount, cost: amount, priceDate: date, events };
  };
  // Accounts keep their place: a known one is updated, a merged hand-entered one gives its place, new ones come last
  const into = new Map(merge.map(m => [m.account.id, m.into]));
  const byId = new Map(imp.accounts.map(a => [a.id, a]));
  const placed = new Set();
  const accounts = [];
  for (const a of data.accounts) {
    const id = byId.has(a.id) ? a.id : into.get(a.id);
    if (!id) { accounts.push(a); continue; }
    if (placed.has(id) || (id !== a.id && data.accounts.some(x => x.id === id))) continue;
    placed.add(id);
    const n = byId.get(id);
    // an older statement keeps the date of the latest one
    accounts.push(id === a.id ? { ...carryAccount(a, n), asOf: a.asOf > n.asOf ? a.asOf : n.asOf } : n);
  }
  return settleCash({
    ...base,
    accounts: [...accounts, ...imp.accounts.filter(a => !placed.has(a.id))],
    lines: [...base.lines.map(l => (fresh.has(l.id) ? merged(fresh.get(l.id)) : l)), ...imp.lines.filter(l => !old.has(l.id))],
    imports: [...(data.imports || []), { at: new Date().toISOString(), source: 'ce', rows: imp.stats.rows, to: imp.stats.to }].slice(-20),
  });
}
