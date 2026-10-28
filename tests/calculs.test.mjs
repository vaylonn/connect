// Tests of the calculations (Trade Republic import, value history chart, backup) on a synthetic export: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTradeRepublic, mergeImport } from '../public/js/importer.js';
import { emptyData, backupPayload } from '../public/js/store.js';
import { totals, heldLines, history, milestone, positions, positionsCsv } from '../public/js/compute.js';

// Minimal export: one row per movement, on the brokerage account
const H = 'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax';
const row = (date, type, { isin = '', shares = '', price = '', amount = '', fee = '' } = {}) =>
  `${date}T10:00:00Z,${date},DEFAULT,TRADING,${type},${isin ? 'FUND' : ''},${isin ? 'Fonds ' + isin : ''},${isin},${shares},${price},${amount},${fee},`;
const withCash = () => { const d = emptyData(); d.settings.cash = true; return d; }; // these tests count the accounts' cash
const load = rows => mergeImport(withCash(), importTradeRepublic([H, ...rows].join('\n')));
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

test('the accounts’ cash is left out unless counted; savings books always count', () => {
  const data = mergeImport(emptyData(), importTradeRepublic([H,
    row('2025-01-02', 'CUSTOMER_INBOUND', { amount: 3000 }),
    row('2025-01-10', 'BUY', { isin: SP500, shares: 4, price: 500, amount: -2000 }),
  ].join('\n')));
  data.accounts.push({ id: 'cc', name: 'Banque', kind: 'courant' }, { id: 'liv', name: 'Livret A', kind: 'livret' });
  data.lines.push({ id: 'cc-1', accountId: 'cc', type: 'especes', envelope: 'Espèces', amount: 500, qty: 1, price: 500, cost: 500, events: [] },
    { id: 'liv-1', accountId: 'liv', type: 'livret', envelope: 'Livrets', amount: 700, qty: 1, price: 700, cost: 700, events: [] });
  assert.equal(data.settings.cash, false, 'left out by default');
  const t = totals(data);
  assert.equal(t.total, 2700, 'fund 2000 + Livret A 700; not the broker’s 1000 nor the bank’s 500');
  assert.deepEqual(t.accounts.map(a => a.account.id), ['tr-cto', 'liv'], 'the cash-only bank account is not shown');
  assert.equal(heldLines(data).some(l => l.type === 'especes'), false);
  assert.equal(valueOn(data, '2025-02-15', '2025-03-31T12:00:00Z'), 2700, 'the chart leaves it out too: fund 2000 + Livret A 700, not the 1 000 € of cash');
  data.settings.cash = true;
  assert.equal(totals(data).total, 4200);
  assert.equal(totals(data).accounts.length, 3);
});

test('positions export: held lines only, raw numbers, spreadsheet-safe CSV', () => {
  const data = withCash();
  data.accounts.push({ id: 'pea', name: 'Mon PEA', kind: 'pea' }, { id: 'cc', name: 'Courant; perso', kind: 'courant' });
  data.lines.push(
    { id: 'a', accountId: 'pea', envelope: 'PEA', type: 'etf', name: 'World ETF', isin: 'FR0011869353', ticker: 'PAEEM.PA', qty: 10, price: 25.5, cost: 200, priceDate: '2026-10-27' },
    { id: 'b', accountId: 'pea', envelope: 'PEA', type: 'action', name: '=HYPERLINK("x")', isin: '', qty: 1e-7, price: 10, cost: 1 },
    { id: 'c', accountId: 'cc', envelope: 'Espèces', type: 'especes', name: 'Espèces', amount: 45 },
  );
  const rows = positions(data);
  assert.deepEqual(rows.map(r => r.id), ['a', 'c'], 'sale leftover dropped, PEA before cash');
  assert.equal(rows[0].value, 255);
  assert.equal(rows[0].pru, 20);
  assert.equal(rows[0].gainPct, 0.275);
  assert.equal(rows[1].qty, null);
  assert.equal(Math.round(rows[0].weight * 1000), 850);
  const fr = positionsCsv(rows).split('\r\n');
  assert.equal(fr[0], '﻿Nom;ISIN;Symbole;Compte;Enveloppe;Type;Quantité;Cours (€);Date du cours;Prix de revient unitaire (€);Prix de revient (€);Valeur (€);Plus-value (€);Plus-value (%);Poids (%)');
  assert.equal(fr[1], 'World ETF;FR0011869353;PAEEM.PA;Mon PEA;PEA;etf;10;25,5;2026-10-27;20;200;255;55;27,5;85');
  assert.equal(fr[2], 'Espèces;;;"Courant; perso";Espèces;especes;;;;;45;45;;;15');
  assert.equal(positionsCsv(rows, { lang: 'en' }).split('\r\n')[1].split(',')[7], '25.5');
  assert.equal(positionsCsv(rows, { tsv: true }).split('\r\n')[2].split('\t')[3], 'Courant; perso');
  data.lines[1].qty = 3;
  assert.match(positionsCsv(positions(data)), /\n"'=HYPERLINK\(""x""\)";/, 'formula neutralised');
  data.settings.cash = false;
  assert.deepEqual(positions(data).map(r => r.id), ['a', 'b'], 'cash follows the net worth setting');
});
