// Tests of the calculations (Trade Republic import, value history chart, backup) on a synthetic export: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTradeRepublic, mergeImport } from '../public/js/importer.js';
import { emptyData, backupPayload } from '../public/js/store.js';
import { totals, heldLines, history, milestone } from '../public/js/compute.js';

// Minimal export: one row per movement, on the brokerage account
const H = 'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax';
const row = (date, type, { isin = '', shares = '', price = '', amount = '', fee = '' } = {}) =>
  `${date}T10:00:00Z,${date},DEFAULT,TRADING,${type},${isin ? 'FUND' : ''},${isin ? 'Fonds ' + isin : ''},${isin},${shares},${price},${amount},${fee},`;
const load = rows => mergeImport(emptyData(), importTradeRepublic([H, ...rows].join('\n')));
const valueOn = (data, day, now) => history(data, new Date(now)).find(p => p.d === day)?.value;
const SP500 = 'IE00B5BMR087';

test('import: quantity, cost basis including fees, realized gain, cash', () => {
  const data = load([
    row('2025-01-02', 'CUSTOMER_INBOUND', { amount: 3000 }),
    row('2025-01-10', 'BUY', { isin: SP500, shares: 4, price: 500, amount: -2000, fee: -1 }),
    row('2025-03-10', 'SELL', { isin: SP500, shares: 1, price: 600, amount: 600, fee: -1 }),
  ]);
  const line = data.lines.find(l => l.isin === SP500);
  assert.equal(line.qty, 3);
  assert.equal(line.cost, 1500.75, '2001 € × 3/4');
  assert.equal(data.transactions.find(t => t.kind === 'SELL').realized, 98.75, '600 − 1 − 500.25');
  assert.equal(data.trStats.cash['tr-cto'], 1598);
});

test('a fully sold position counts in the chart, not in net worth', () => {
  const data = load([
    row('2024-12-20', 'CUSTOMER_INBOUND', { amount: 2000 }),
    row('2025-01-10', 'BUY', { isin: SP500, shares: 2, price: 500, amount: -1000 }),
    row('2025-06-10', 'SELL', { isin: SP500, shares: 2, price: 600, amount: 1200 }),
  ]);
  assert.equal(heldLines(data).some(l => l.isin === SP500), false);
  assert.equal(totals(data).total, 2200);
  assert.equal(valueOn(data, '2025-03-01', '2025-07-01T12:00:00Z'), 2000, '€1000 cash + 2 shares at €500');
});

test('a purchase paid with the account cash is not counted twice', () => {
  const data = load([
    row('2025-01-02', 'CUSTOMER_INBOUND', { amount: 3000 }),
    row('2025-01-28', 'CARD_TRANSACTION', { amount: -10 }),
    row('2025-02-05', 'BUY', { isin: SP500, shares: 2, price: 500, amount: -1000 }),
    row('2025-02-25', 'CARD_TRANSACTION', { amount: -10 }),
  ]);
  assert.equal(valueOn(data, '2025-02-15', '2025-03-31T12:00:00Z'), 2990, '€1990 cash + €1000 of fund');
});

test('the backup keeps the history transactions', () => {
  const data = load([row('2025-01-02', 'CUSTOMER_INBOUND', { amount: 1000 }), row('2025-01-10', 'BUY', { isin: SP500, shares: 1, price: 500, amount: -500 })]);
  assert.deepEqual(backupPayload(data).transactions.map(x => x.kind), ['BUY', 'DEPOSIT'], 'security transactions, then cash movements');
});

test('value history of one account or one envelope', () => {
  const data = load([
    row('2025-01-02', 'CUSTOMER_INBOUND', { amount: 3000 }),
    row('2025-01-10', 'BUY', { isin: SP500, shares: 4, price: 500, amount: -2000 }),
  ]);
  const now = '2025-03-31T12:00:00Z';
  const all = history(data, new Date(now)), fund = history(data, new Date(now), l => l.envelope === 'Compte-titres');
  assert.equal(all.at(-1).value, 3000);
  assert.equal(fund.at(-1).value, 2000, 'the fund alone, without the cash');
  assert.equal(fund.find(p => p.d === '2025-01-05'), undefined, 'starts with its first event');
  assert.deepEqual(history(data, new Date(now), () => false), []);
});

test('PEA: withdrawals free of income tax 5 years after the first deposit', () => {
  const data = load([row('2021-03-15', 'CUSTOMER_INBOUND', { amount: 100 })].map(r => r.replace(',DEFAULT,', ',PEA,')));
  const pea = data.accounts.find(a => a.kind === 'pea');
  assert.deepEqual(milestone(data, pea, new Date('2026-01-01')), { years: 5, start: '2021-03-15', free: '2026-03-15', guessed: true, done: false, days: 73 });
  assert.equal(milestone(data, pea, new Date('2026-03-15')).done, true);
  pea.openedAt = '2020-02-29';
  assert.deepEqual([milestone(data, pea).free, milestone(data, pea).guessed], ['2025-03-01', false], 'the date the user gave wins; 29 Feb rolls to 1 March');
  assert.equal(milestone({ accounts: [], lines: [], transactions: [] }, { id: 'x', kind: 'pea' }), null);
  assert.equal(milestone(data, { ...pea, kind: 'cto' }), null, 'no milestone for a brokerage account');
});
