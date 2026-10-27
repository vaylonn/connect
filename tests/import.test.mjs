// Trade Republic import on a realistic export (tests/tr-export.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTradeRepublic, mergeImport } from '../public/js/importer.js';
import { emptyData } from '../public/js/store.js';
import { totals, heldLines } from '../public/js/compute.js';
import { HEAD, ROWS, CSV } from './tr-export.mjs';

const withCash = () => { const d = emptyData(); d.settings.cash = true; return d; }; // these tests count the accounts' cash
const line = (imp, id) => imp.lines.find(l => l.id === id);

test('realistic export: positions, cost basis, cash and statistics', () => {
  const imp = importTradeRepublic(CSV);
  assert.deepEqual(imp.accounts.map(a => a.id), ['tr-cto', 'tr-pea']);
  assert.equal(imp.stats.rows, 15);
  assert.equal(imp.stats.from, '2025-01-02'); assert.equal(imp.stats.to, '2025-05-20');

  const apple = line(imp, 'tr-default-us0378331005');
  assert.equal(apple.qty, 12, '10 bought, 4 sold (unsigned quantity), +6 from the split');
  assert.equal(apple.cost, 1200.6, '(2000 + 1 fee) × 6/10, the split keeps the total cost');
  assert.equal(apple.price, 250, 'last trade price; the split does not set a price');
  assert.equal(apple.type, 'action'); assert.equal(apple.envelope, 'Compte-titres');

  const world = line(imp, 'tr-pea-ie0002xzsho1');
  assert.deepEqual([world.qty, world.cost, world.price, world.envelope], [200, 1250, 6.5, 'PEA']);
  assert.equal(world.events.length, 2, 'one snapshot per savings plan execution');

  const btc = line(imp, 'tr-default-xf000btc0017');
  assert.deepEqual([btc.qty, btc.cost, btc.type, btc.envelope], [0.01, 601, 'crypto', 'Crypto']);

  const fund = line(imp, 'tr-default-lu9999999999');
  assert.deepEqual([fund.type, fund.qty, fund.cost, fund.pending], ['non-cote', 8, 1000, 200], 'paid 1000, 8 × 100 executed, 200 pending');
  assert.match(fund.name, /^Fonds privé, Elevate · LU9999/);

  assert.deepEqual(imp.stats.cash, { 'tr-cto': 2361.37, 'tr-pea': 1750 });
  assert.equal(line(imp, 'tr-default-cash').amount, 2361.37);
  assert.deepEqual([imp.stats.dividends, imp.stats.interest, imp.stats.saveback, imp.stats.fees, imp.stats.taxes], [2.97, 8.5, 5, 3, 14.43]);
});

const CASH_KINDS = new Set(['DEPOSIT', 'WITHDRAWAL', 'CARD', 'CASH_OTHER', 'DIVIDEND', 'INTEREST', 'BONUS', 'TAX', 'FEE']);
const trades = imp => imp.transactions.filter(x => !CASH_KINDS.has(x.kind));

test('realistic export: history of security transactions', () => {
  const imp = importTradeRepublic(CSV);
  assert.deepEqual(trades(imp).map(x => x.kind), ['BUY', 'BUY', 'BUY', 'SELL', 'SPLIT', 'BUY', 'PRIVATE_MARKET_BUY', 'BUY']);
  const sell = imp.transactions.find(x => x.kind === 'SELL');
  assert.equal(sell.realized, 198.6, '1000 − 1 fee − 800.40 cost of the 4 shares sold');
  assert.equal(sell.shares, 4);
  assert.equal(imp.transactions.filter(x => /SAVING/.test(x.category)).length, 2);
  assert.ok(imp.transactions.every(x => x.accountId === 'tr-cto' || x.accountId === 'tr-pea'));
});

test('realistic export: cash movements for the history and the performance', () => {
  const imp = importTradeRepublic(CSV);
  const cash = imp.transactions.filter(x => CASH_KINDS.has(x.kind));
  assert.deepEqual(cash.map(x => [x.kind, x.accountId, x.amount, x.tax]), [
    ['DEPOSIT', 'tr-cto', 5000, 0], ['DEPOSIT', 'tr-pea', 3000, 0],
    ['DIVIDEND', 'tr-cto', 3.5, -0.53], ['INTEREST', 'tr-cto', 12.4, -3.9], ['BONUS', 'tr-cto', 5, 0],
    ['CARD', 'tr-cto', -42.1, 0],
  ], 'gross dividend and interest with their tax apart; the zero-amount unknown row is left out');
  assert.equal(cash.find(x => x.kind === 'DIVIDEND').isin, 'US0378331005');
  assert.equal(cash.find(x => x.kind === 'CARD').count, 1);
  // Every movement is accounted for: the operations add up to the recomputed cash of each account
  for (const [id, bal] of Object.entries(imp.stats.cash)) {
    const sum = imp.transactions.filter(x => x.accountId === id).reduce((s, x) => s + x.amount + (CASH_KINDS.has(x.kind) ? x.tax : x.fee + x.tax), 0);
    assert.equal(Math.round(sum * 100) / 100, bal, id);
  }
});

test('card payments are summed per account and month; movement kinds follow the type', () => {
  const rows = ['2025-05-03', '2025-05-20', '2025-06-01'].map((d, i) => `${d}T18:00:00Z,${d},DEFAULT,CASH,CARD_TRANSACTION,,,,,,-10,,,EUR,Card,c${i}`);
  rows.push('2025-06-02T08:00:00Z,2025-06-02,DEFAULT,CASH,CUSTOMER_OUTBOUND_REQUEST,,,,,,-100,,,EUR,Withdrawal,w1');
  const imp = importTradeRepublic([HEAD, ...rows].join('\n'));
  assert.deepEqual(imp.transactions.map(x => [x.kind, x.date, x.amount, x.count]), [
    ['WITHDRAWAL', '2025-06-02', -100, undefined], ['CARD', '2025-05-20', -20, 2], ['CARD', '2025-06-01', -10, 1],
  ]);
});

test('a semicolon export with decimal commas gives the same positions', () => {
  const semi = [HEAD, ...ROWS].map(r => r.match(/("([^"]|"")*"|[^,]*)(,|$)/g).filter(Boolean).map(c => c.replace(/,$/, '')).map(c => /^-?\d+\.\d+$/.test(c) ? c.replace('.', ',') : c).join(';')).join('\n');
  const a = importTradeRepublic(CSV), b = importTradeRepublic(semi);
  assert.deepEqual(b.lines.map(l => [l.id, l.qty, l.cost]), a.lines.map(l => [l.id, l.qty, l.cost]));
  assert.deepEqual(b.stats.cash, a.stats.cash);
});

test('a new import replaces Trade Republic lines and keeps manual data and overrides', () => {
  let data = mergeImport(withCash(), importTradeRepublic(CSV));
  const apple = data.lines.find(l => l.id === 'tr-default-us0378331005');
  Object.assign(apple, { name: 'Mon Apple', customName: true, target: 40, note: 'Achetée pour le dividende' });
  Object.assign(data.accounts.find(a => a.id === 'tr-pea'), { note: 'Ouvert le 2 janvier 2025', openedAt: '2024-12-30' });
  data.accounts.push({ id: 'acc-livret', name: 'Livret', kind: 'livret', source: 'manual' });
  data.lines.push({ id: 'ln-livret', source: 'manual', accountId: 'acc-livret', type: 'livret', envelope: 'Livrets', name: 'Livret', qty: 1, amount: 500, price: 500, cost: 500, events: [] });
  data = mergeImport(data, importTradeRepublic(CSV));
  const again = data.lines.find(l => l.id === 'tr-default-us0378331005');
  assert.deepEqual([again.name, again.target, again.note], ['Mon Apple', 40, 'Achetée pour le dividende'], 'name, target and note kept');
  const pea = data.accounts.find(a => a.id === 'tr-pea');
  assert.deepEqual([pea.note, pea.openedAt], ['Ouvert le 2 janvier 2025', '2024-12-30'], 'account note and first deposit date kept');
  assert.equal(data.lines.filter(l => l.id === 'tr-default-us0378331005').length, 1, 'no duplicate');
  assert.ok(data.lines.some(l => l.id === 'ln-livret'));
  assert.equal(data.transactions.length, 14, 'history replaced, not appended: 8 trades and 6 cash movements');
  assert.equal(data.imports.length, 2);
  assert.equal(heldLines(data).length, 7, '4 positions, cash on both TR accounts, the manual savings account');
  // 12 × 250 + 200 × 6.5 + 0.01 × 60000 + (8 × 100 + 200 pending) + 2361.37 + 1750 + 500
  assert.equal(Math.round(totals(data).total * 100) / 100, 10511.37);
});

test('files that are not Trade Republic exports are refused clearly', () => {
  assert.throws(() => importTradeRepublic(''), /vide/);
  assert.throws(() => importTradeRepublic('date,montant\n2025-01-01,10'), /colonnes manquantes : datetime/);
});
