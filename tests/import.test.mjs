// Trade Republic import on a realistic export: BOM, quoted names with commas, unsorted rows, both
// accounts, savings plan, dividend and interest with withholding tax, unsigned sale, split, crypto,
// private market fund paid in advance, card payment and an unknown movement type.
// The CSV lives here rather than in a file: .gitignore excludes *.csv (personal exports).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTradeRepublic, mergeImport } from '../public/js/importer.js';
import { emptyData } from '../public/js/store.js';
import { totals, heldLines } from '../public/js/compute.js';

const HEAD = 'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax,currency,description,transaction_id';
const ROWS = [
  // Out of order on purpose: the importer sorts by datetime
  '2025-03-10T09:30:00Z,2025-03-10,DEFAULT,TRADING,SELL,STOCK,"Apple Inc., ""Common""",US0378331005,4,250,1000,-1,-10,EUR,Sell,t07',
  '2025-01-02T08:00:00Z,2025-01-02,DEFAULT,CASH,CUSTOMER_INBOUND,,,,,,5000,,,EUR,Deposit,t01',
  '2025-01-02T08:05:00Z,2025-01-02,PEA,CASH,CUSTOMER_INBOUND,,,,,,3000,,,EUR,Deposit,t02',
  '2025-01-10T10:00:00Z,2025-01-10,DEFAULT,TRADING,BUY,STOCK,"Apple Inc., ""Common""",US0378331005,10,200,-2000,-1,,EUR,Buy,t03',
  '2025-01-15T07:00:00Z,2025-01-15,PEA,SAVINGS_PLAN,BUY,FUND,iShares MSCI World Swap PEA,IE0002XZSHO1,100,6,-600,,,EUR,Savings plan,t04',
  '2025-02-15T07:00:00Z,2025-02-15,PEA,SAVINGS_PLAN,BUY,FUND,iShares MSCI World Swap PEA,IE0002XZSHO1,100,6.5,-650,,,EUR,Savings plan,t05',
  '2025-03-01T06:00:00Z,2025-03-01,DEFAULT,CASH,DIVIDEND,STOCK,"Apple Inc., ""Common""",US0378331005,10,,3.5,,-0.53,EUR,Dividend,t06',
  '2025-04-01T06:00:00Z,2025-04-01,DEFAULT,CORPORATE_ACTION,SPLIT,STOCK,"Apple Inc., ""Common""",US0378331005,6,,0,,,EUR,Split,t08',
  '2025-04-05T12:00:00Z,2025-04-05,DEFAULT,TRADING,BUY,CRYPTO,Bitcoin,XF000BTC0017,0.01,60000,-600,-1,,EUR,Buy,t09',
  '2025-04-20T12:00:00Z,2025-04-20,DEFAULT,TRADING,PRIVATE_MARKET_BUY,PRIVATE_FUND,"Fonds privé, Elevate",LU9999999999,,,-1000,,,EUR,Subscription,t10',
  '2025-05-20T12:00:00Z,2025-05-20,DEFAULT,TRADING,BUY,PRIVATE_FUND,"Fonds privé, Elevate",LU9999999999,8,100,0,,,EUR,Execution,t11',
  '2025-05-01T06:00:00Z,2025-05-01,DEFAULT,CASH,INTEREST_PAYMENT,,,,,,12.4,,-3.9,EUR,Interest,t12',
  '2025-05-02T06:00:00Z,2025-05-02,DEFAULT,CASH,BENEFITS_SAVEBACK,,,,,,5,,,EUR,Saveback,t13',
  '2025-05-03T18:00:00Z,2025-05-03,DEFAULT,CASH,CARD_TRANSACTION,,,,,,-42.10,,,EUR,Card payment,t14',
  '2025-05-04T18:00:00Z,2025-05-04,DEFAULT,CASH,SOMETHING_NEW,,,,,,0,,,EUR,Unknown,t15',
];
const CSV = '﻿' + [HEAD, ...ROWS].join('\r\n') + '\r\n';
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

test('realistic export: history of security transactions', () => {
  const imp = importTradeRepublic(CSV);
  assert.deepEqual(imp.transactions.map(x => x.kind), ['BUY', 'BUY', 'BUY', 'SELL', 'SPLIT', 'BUY', 'PRIVATE_MARKET_BUY', 'BUY'],
    'no deposits, dividends, interest, card payments or unknown types');
  const sell = imp.transactions.find(x => x.kind === 'SELL');
  assert.equal(sell.realized, 198.6, '1000 − 1 fee − 800.40 cost of the 4 shares sold');
  assert.equal(sell.shares, 4);
  assert.equal(imp.transactions.filter(x => /SAVING/.test(x.category)).length, 2);
  assert.ok(imp.transactions.every(x => x.accountId === 'tr-cto' || x.accountId === 'tr-pea'));
});

test('a semicolon export with decimal commas gives the same positions', () => {
  const semi = [HEAD, ...ROWS].map(r => r.match(/("([^"]|"")*"|[^,]*)(,|$)/g).filter(Boolean).map(c => c.replace(/,$/, '')).map(c => /^-?\d+\.\d+$/.test(c) ? c.replace('.', ',') : c).join(';')).join('\n');
  const a = importTradeRepublic(CSV), b = importTradeRepublic(semi);
  assert.deepEqual(b.lines.map(l => [l.id, l.qty, l.cost]), a.lines.map(l => [l.id, l.qty, l.cost]));
  assert.deepEqual(b.stats.cash, a.stats.cash);
});

test('a new import replaces Trade Republic lines and keeps manual data and overrides', () => {
  let data = mergeImport(emptyData(), importTradeRepublic(CSV));
  const apple = data.lines.find(l => l.id === 'tr-default-us0378331005');
  Object.assign(apple, { name: 'Mon Apple', customName: true });
  data.accounts.push({ id: 'acc-livret', name: 'Livret', kind: 'livret', source: 'manual' });
  data.lines.push({ id: 'ln-livret', source: 'manual', accountId: 'acc-livret', type: 'livret', envelope: 'Livrets', name: 'Livret', qty: 1, amount: 500, price: 500, cost: 500, events: [] });
  data = mergeImport(data, importTradeRepublic(CSV));
  assert.equal(data.lines.find(l => l.id === 'tr-default-us0378331005').name, 'Mon Apple');
  assert.equal(data.lines.filter(l => l.id === 'tr-default-us0378331005').length, 1, 'no duplicate');
  assert.ok(data.lines.some(l => l.id === 'ln-livret'));
  assert.equal(data.transactions.length, 8, 'history replaced, not appended');
  assert.equal(data.imports.length, 2);
  assert.equal(heldLines(data).length, 7, '4 positions, cash on both TR accounts, the manual savings account');
  // 12 × 250 + 200 × 6.5 + 0.01 × 60000 + (8 × 100 + 200 pending) + 2361.37 + 1750 + 500
  assert.equal(Math.round(totals(data).total * 100) / 100, 10511.37);
});

test('files that are not Trade Republic exports are refused clearly', () => {
  assert.throws(() => importTradeRepublic(''), /vide/);
  assert.throws(() => importTradeRepublic('date,montant\n2025-01-01,10'), /colonnes manquantes : datetime/);
});
