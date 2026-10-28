// Import of a BricksBoard file (bricksboard.fr: a bookmarklet run on app.bricks.co saves
// « bricksboard-AAAA-MM-JJ.html », a dashboard that carries the Bricks API's answers as JSON).
// Kept: the projects held (bricks, current brick price, yearly rate, status, repayment month, grade),
// the wallet's balance and its movements (deposits, coupons with the withheld tax, bonuses, project
// purchases and capital repayments). The investor's identity, address, IBAN and documents are never read.
// Amounts in the file are in cents. Pure module (no DOM).
import { t } from './i18n.js';
import { carryOver, carryAccount } from './importer.js';

export const ACCOUNT_ID = 'bricks';
const ENVELOPE = 'Immobilier';
const r2 = n => Math.round(n * 100) / 100;
const cents = v => (Number.isFinite(+v) ? r2(+v / 100) : 0);
const day = v => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : '');
const month = v => (/^\d{4}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const x = y * 12 + m - 1 + n; return `${Math.floor(x / 12)}-${String(x % 12 + 1).padStart(2, '0')}`; };

// Bricks' project statuses, as shown (French source, translated on display)
export const STATUS = {
  'funding-ongoing': 'En collecte',
  'reception-by-project-owner-pending': 'Démarrage en cours',
  'repayment-ongoing': 'Remboursement en cours',
  'repayment-delay': 'En retard',
  'repayment-default': 'En défaut',
  'repayment-finished': 'Remboursé',
};

// The dashboard file (its embedded data), or that data saved as JSON
export function readBricksboard(text) {
  const s = String(text || '').replace(/^﻿/, '').trim();
  let bd = null;
  try {
    if (s.startsWith('{')) bd = JSON.parse(s);
    else {
      const at = s.indexOf('window.__BD__=');
      if (at >= 0) {
        const from = at + 'window.__BD__='.length;
        const end = s.indexOf('</script>', from);
        bd = JSON.parse(s.slice(from, end < 0 ? undefined : end).trim().replace(/;$/, ''));
      }
    }
  } catch { bd = null; }
  if (!bd || typeof bd !== 'object' || !(Array.isArray(bd.financed) || bd.fundingProjects || bd.wallet)) {
    throw new Error(t('Ce fichier ne ressemble pas à un export BricksBoard : ses données Bricks sont introuvables.'));
  }
  return bd;
}

// Country of a project from its address: a flag when Bricks gives one, else France (where most projects are)
const FLAGS = { PT: 'Portugal', GB: 'Royaume-Uni', AE: 'Émirats arabes unis', ES: 'Espagne', IT: 'Italie', BE: 'Belgique', DE: 'Allemagne', LU: 'Luxembourg', CH: 'Suisse', NL: 'Pays-Bas', FR: 'France' };
function place(address) {
  const a = String(address || '');
  const flag = a.match(/(\p{Regional_Indicator})(\p{Regional_Indicator})/u);
  const code = flag ? String.fromCharCode(flag[1].codePointAt(0) - 0x1f1e6 + 65, flag[2].codePointAt(0) - 0x1f1e6 + 65) : '';
  const country = FLAGS[code] || (code ? 'Non renseigné' : /luxembourg/i.test(a) ? 'Luxembourg' : 'France');
  const city = (a.match(/\b\d{4,5}\s+([^,\p{Regional_Indicator}]+)/u)?.[1] || '').trim();
  return { country, city };
}

export function importBricks(bd) {
  const asOf = day(bd.fetchedAt) || new Date().toISOString().slice(0, 10);
  const contracts = bd.contractMap && typeof bd.contractMap === 'object' ? bd.contractMap : {};
  // Projects held: the financed ones (by month), then those still being funded
  const held = new Map();
  const listed = [...(Array.isArray(bd.financed) ? bd.financed : []).flatMap(g => g?.projects || []),
    ...['ongoing', 'upcoming', 'financed'].flatMap(k => bd.fundingProjects?.[k]?.projects || [])];
  for (const p of listed) {
    const owned = Math.floor(+(p?.investorBricks?.owned ?? p?.ownedBricks) || 0);
    const id = String(p?.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    if (owned > 0 && id && !held.has(id)) held.set(id, { p, owned, id });
  }

  const lines = [];
  const count = { held: 0, repaid: 0, late: 0, default: 0 };
  for (const { p, owned, id } of held.values()) {
    const f = p.funding || {};
    const price = cents(p.brickPrice ?? f.brickPrice);
    const orig = cents(f.brickPrice || p.brickPrice) || price;
    const status = String(p.financialStatus || '');
    const repaid = status === 'repayment-finished' || !(price > 0);
    const c = contracts[p.id] || {};
    const start = day(f.ended?.at) || day(f.startedAt) || day(f.propertyPublishDate) || asOf;
    const horizon = Math.max(0, Math.floor(+p.investmentHorizonInMonths || 0));
    const maturity = month(c.repaymentDate) || (month(f.revenueStartDate) && horizon ? addMonths(f.revenueStartDate, horizon) : '');
    const { country, city } = place(p.address?.fr || p.address?.en);
    const name = String(p.name?.fr || p.name?.en || '').trim() || 'Projet Bricks';
    const project = {
      rate: Number.isFinite(+p.yearlyTotalRentabilityPercentage) ? +p.yearlyTotalRentabilityPercentage / 100 : null,
      status: STATUS[status] ? status : '', maturity, city,
      ...(/^[A-E][+-]?$/.test(String(c.grade || '')) ? { grade: c.grade } : {}),
      ...(Number.isFinite(+c.coverage) && c.coverage != null ? { coverage: +c.coverage / 100 } : {}),
    };
    const events = [[start, owned, r2(owned * orig), orig]];
    if (repaid) {
      // the file does not date the last repayment: the contract's end, or the import date
      const end = maturity && `${maturity}-01` < asOf && `${maturity}-01` > start ? `${maturity}-01` : asOf;
      events.push([end, 0, 0, orig]);
      count.repaid++;
    } else {
      if (asOf > start) events.push([asOf, owned, r2(owned * price), price]);
      else events[0] = [start, owned, r2(owned * price), price];
      count.held++;
      if (status === 'repayment-delay') count.late++;
      if (status === 'repayment-default') count.default++;
    }
    lines.push({
      id: 'bricks-' + id, source: 'bricks', accountId: ACCOUNT_ID, envelope: ENVELOPE, type: 'immo',
      name, isin: '', ticker: '',
      // the capital still owed is both the value and the cost: the return comes as coupons
      qty: repaid ? 0 : owned, price: repaid ? orig : price, cost: repaid ? 0 : r2(owned * price),
      priceDate: asOf, priceSource: 'bricks', pending: 0, equity: 0,
      lookthrough: { sector: 're', country }, project, events,
    });
  }

  // Wallet movements, oldest first: confirmed ones, plus debits still waiting (already out of the balance)
  const moves = (Array.isArray(bd.wallet?.transactions) ? bd.wallet.transactions : [])
    .filter(x => x && (x.status === 'confirmed' || (x.status === 'waiting' && +x.value < 0)) && day(x.createdAt) && Number.isFinite(+x.value))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const taxAt = new Map();
  for (const x of moves) if (x.kind === 'withholding_tax') taxAt.set(x.createdAt, (taxAt.get(x.createdAt) || 0) + +x.value);
  const coupon = k => /^(recurring_revenue|revenue_obligation_coupon)/.test(k);
  const paired = new Set(moves.filter(x => coupon(x.kind)).map(x => x.createdAt));
  const transactions = [], unknown = {};
  const byDay = new Map();
  let bal = 0;
  const op = (x, kind, extra = {}) => transactions.push({ id: 'bricks-op-' + transactions.length, source: 'bricks', accountId: ACCOUNT_ID, envelope: ENVELOPE, date: day(x.createdAt), kind, amount: cents(x.value), type: 'especes', ...extra });
  for (const x of moves) {
    const k = String(x.kind || '');
    bal += +x.value;
    byDay.set(day(x.createdAt), cents(bal));
    if (/^topup_/.test(k)) op(x, 'DEPOSIT');
    else if (/withdraw|payout|transfer_out|cash_out/i.test(k)) op(x, 'WITHDRAWAL');
    else if (coupon(k)) {
      const tax = taxAt.get(x.createdAt) || 0;
      taxAt.delete(x.createdAt); // several coupons at once: the tax goes with the first
      op(x, 'INTEREST', { tax: cents(tax) });
    } else if (k === 'withholding_tax') { if (!paired.has(x.createdAt)) op(x, 'TAX'); }
    else if (k === 'boosted_balance_gain') op(x, 'INTEREST', { tax: 0 });
    else if (/^refer_|^gift_card_credit|^adjustment$/.test(k)) op(x, 'BONUS', { tax: 0 });
    else if (/^primary_purchase/.test(k)) op(x, 'BUY', { name: 'Bricks', type: 'immo' });
    else if (/^obligation_principal_repayment/.test(k)) op(x, 'REPAYMENT', { name: 'Bricks', type: 'immo' });
    else if (/^company_internal_fundraise|^gift_card_purchase/.test(k)) op(x, 'CASH_OTHER');
    else unknown[k] = (unknown[k] || 0) + 1;
  }
  const hasCash = bd.customer && Number.isFinite(+bd.customer.lemonwayBalance);
  const cash = hasCash ? cents(bd.customer.lemonwayBalance) : cents(bal);
  if (!lines.length && !moves.length) throw new Error(t('Aucun projet ni mouvement trouvé dans ce fichier BricksBoard.'));
  const cashEvents = [...byDay].map(([d, b]) => [d, 1, b, b]).filter(e => e[0] < asOf);
  cashEvents.push([asOf, 1, cash, cash]);
  lines.push({
    id: 'bricks-cash', source: 'bricks', accountId: ACCOUNT_ID, envelope: 'Espèces', type: 'especes', name: 'Solde Bricks',
    isin: '', ticker: '', qty: 1, amount: cash, price: cash, cost: cash, priceDate: asOf, priceSource: 'bricks', pending: 0, equity: 0, events: cashEvents,
  });
  const sum = kind => r2(transactions.filter(x => x.kind === kind).reduce((s, x) => s + x.amount, 0));
  return {
    accounts: [{ id: ACCOUNT_ID, name: 'Bricks', institution: 'Bricks', kind: 'immo', color: 'orange', source: 'bricks', asOf }],
    lines, transactions,
    stats: {
      rows: transactions.length, from: transactions[0]?.date || '', to: asOf, ...count, cash,
      capital: r2(lines.filter(l => l.type === 'immo').reduce((s, l) => s + l.qty * l.price, 0)),
      deposits: sum('DEPOSIT'), coupons: sum('INTEREST'), tax: r2(transactions.reduce((s, x) => s + (x.kind === 'TAX' ? x.amount : +x.tax || 0), 0)),
      truncated: !!bd.wallet?.truncated, unknown,
    },
  };
}

// Replaces the Bricks account's lines and operations (the file always holds the whole history), keeps the
// user's settings, and adds this snapshot to each project's history: partial repayments show up import after import.
export function mergeBricks(data, imp) {
  const old = new Map(data.lines.filter(l => l.source === 'bricks').map(l => [l.id, l]));
  const lines = imp.lines.map(l => {
    const o = old.get(l.id);
    if (!o) return l;
    let events = l.events;
    if (l.type !== 'especes') {
      const prev = (o.events || []).filter(e => e[0] > l.events[0][0]);
      if (l.qty === 0) {
        // repaid: closed after every snapshot already taken, at the latest
        const end = [l.events.at(-1)[0], ...prev.map(e => e[0])].sort().at(-1);
        events = [l.events[0], ...prev.filter(e => e[0] < end), [end, 0, 0, l.events.at(-1)[3]]];
      } else {
        const mine = new Set(l.events.map(e => e[0]));
        events = [...prev.filter(e => !mine.has(e[0])), ...l.events].sort((a, b) => (a[0] < b[0] ? -1 : 1));
      }
    }
    return { ...carryOver(o, l), events };
  });
  const had = data.accounts.some(a => a.id === ACCOUNT_ID);
  const fresh = imp.accounts[0];
  return {
    ...data,
    accounts: had ? data.accounts.map(a => (a.id === ACCOUNT_ID ? carryAccount(a, fresh) : a)) : [...data.accounts, fresh],
    lines: [...data.lines.filter(l => l.source !== 'bricks'), ...lines],
    transactions: [...(data.transactions || []).filter(x => x.source !== 'bricks'), ...imp.transactions],
    imports: [...(data.imports || []), { at: new Date().toISOString(), source: 'bricks', rows: imp.stats.rows, to: imp.stats.to }].slice(-20),
  };
}
