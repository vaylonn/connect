// Linxea import: the .xlsx reader, the contract's funds, and the merge into existing data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readXlsx } from '../public/js/xlsx.js';
import { importLinxea, mergeLinxea, num } from '../public/js/importer-linxea.js';
import { importTradeRepublic, mergeImport } from '../public/js/importer.js';
import { emptyData } from '../public/js/store.js';
import { totals, heldLines, lineValue, lineCost, equityShare, lookthrough, history, milestone, staleLines } from '../public/js/compute.js';
import { HEAD, ROWS, linxeaXlsx, zip } from './linxea-export.mjs';
import { CSV } from './tr-export.mjs';

const near = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const load = async (rows = ROWS, opts) => importLinxea(await readXlsx(linxeaXlsx(rows, opts)));
const line = (imp, isin) => imp.lines.find(l => l.id.endsWith('-' + isin.toLowerCase()));

test('xlsx: the first sheet as rows, inline or shared strings, entities decoded', async () => {
  for (const shared of [false, true]) {
    const rows = await readXlsx(linxeaXlsx(ROWS, { shared }));
    assert.deepEqual(rows[0], HEAD, 'header, shared: ' + shared);
    assert.equal(rows[2][7], 'Amundi Core S&P 500 Swap UCITS ETF EUR Dist', '&amp; decoded');
    assert.equal(rows[2][12], '706.5');
    assert.equal(rows[1][3], '', 'empty cell');
    assert.equal(rows.length, ROWS.length + 1);
  }
  await assert.rejects(readXlsx(new Uint8Array([1, 2, 3])), /pas un classeur Excel/);
  await assert.rejects(readXlsx(zip({ 'hello.txt': 'hi' })), /pas un classeur Excel/);
});

test('numbers in the French and English styles', () => {
  assert.deepEqual(['0.322190', '-1,747390 %', '1 234,56 €', '1,234.56', '1.234,56', '', 'abc'].map(num), [0.32219, -1.74739, 1234.56, 1234.56, 1234.56, NaN, NaN]);
});

test('one account per contract, one line per fund, holders left out', async () => {
  const imp = await load();
  assert.deepEqual(imp.accounts, [{ id: 'lx-0000012345', name: 'Linxea Spirit 2', institution: 'Linxea', kind: 'av', color: 'lilac', source: 'linxea', contract: '0000012345', asOf: '2026-10-23' }]);
  assert.deepEqual(imp.stats, { rows: 6, to: '2026-10-23', contracts: 1 });
  assert.doesNotMatch(JSON.stringify(imp), /Camille|Exemple/, 'the holders’ names are not kept');
  assert.ok(imp.lines.every(l => l.envelope === 'Assurance-vie' && l.source === 'linxea' && l.accountId === 'lx-0000012345'));

  const euro = imp.lines.find(l => l.type === 'fonds-euros');
  assert.deepEqual([euro.id, euro.isin, euro.amount, euro.equity], ['lx-0000012345-fondseurng', '', 1200, 0], 'the euro fund is a balance; its code is no ISIN');
  const sp = line(imp, 'LU0496786574');
  assert.deepEqual([sp.type, sp.qty, sp.price, sp.cost, sp.priceDate, sp.priceSource, sp.equity], ['etf', 10, 70.65, 650, '2026-10-22', 'linxea', 1], 'cost = amount − gain');
  assert.deepEqual([sp.category, sp.subcategory], ['Fonds Actions', 'Actions Amérique']);
  assert.deepEqual(sp.fundPerf, { ytd: 0.173698, w1: -0.003753, m1: 0.009262, m6: 0.125793, y3: 0.211627, y5: 0.133692, y10: 0.15018, asOf: '2026-10-22' });
  assert.deepEqual(sp.events, [['2026-10-23', 10, 650, 70.65]], 'one snapshot on the statement date');
  const bonds = line(imp, 'LU1623762843');
  assert.deepEqual([bonds.type, bonds.equity, bonds.lookthrough, bonds.cost], ['fonds', 0, { sector: 'bonds', country: '' }, 320]);
  assert.deepEqual(Object.keys(bonds.fundPerf), ['ytd', 'y3', 'asOf'], 'empty performance cells are left out');
  assert.equal(line(imp, 'FR001400MUT2').equity, 0.5, 'mixed fund');
  assert.deepEqual([line(imp, 'FR0013416716').type, line(imp, 'FR0013416716').equity, line(imp, 'FR0013416716').lookthrough.sector], ['etf', 0, 'commo'], 'gold ETC');
  const emtn = line(imp, 'FRC764210890');
  assert.deepEqual([emtn.type, emtn.qty, emtn.price, emtn.equity], ['structure', 0.1, 1000, 0]);
  assert.equal(imp.lines.reduce((s, l) => s + lineValue(l), 0).toFixed(2), '2665.63');
});

test('figures in the app: total, gain, share in stocks, breakdown, no stale prices', async () => {
  const data = mergeLinxea(emptyData(), await load());
  const tot = totals(data);
  near(tot.total, 2665.625);
  near(tot.gain, 56.5 - 9.62 + 5.365 + 3.38, 0.01);
  near(tot.equity, 706.5 + 205.365 * 0.5);
  const lt = lookthrough(data);
  assert.deepEqual(lt.sectors.map(s => s.name).sort(), ['Matières premières', 'Non ventilé', 'Obligations et liquidités'].sort(), 'no composition fetched: the category gives a first breakdown');
  // The value chart starts with the statement
  const h = history(data, new Date('2026-10-30T12:00:00Z'));
  assert.equal(h[0].d, '2026-10-23');
  near(h.at(-1).value, 2665.625);
  // A structured product has no public price; a fund Yahoo does not know stops counting as stale
  const now = new Date('2026-11-30T12:00:00Z');
  assert.ok(!staleLines(data, now).some(l => l.type === 'structure'));
  assert.ok(staleLines(data, now).some(l => l.isin === 'LU1623762843'));
  data.lines.find(l => l.isin === 'LU1623762843').noSymbol = '2026-10-24';
  assert.ok(!staleLines(data, now).some(l => l.isin === 'LU1623762843'));
  // Life insurance: 8 years after the first known snapshot, or the date the user gives
  const acc = data.accounts[0];
  assert.deepEqual([milestone(data, acc).years, milestone(data, acc).free, milestone(data, acc).guessed], [8, '2034-10-23', true]);
  acc.openedAt = '2019-02-01';
  assert.deepEqual([milestone(data, acc).free, milestone(data, acc, new Date('2027-03-01')).done], ['2027-02-01', true]);
});

test('a new import updates the contract, keeps the user’s settings and adds a point to the history', async () => {
  let data = mergeImport(emptyData(), importTradeRepublic(CSV));
  const trLines = data.lines.length;
  data = mergeLinxea(data, await load());
  const sp = data.lines.find(l => l.isin === 'LU0496786574');
  Object.assign(sp, { name: 'S&P 500', customName: true, target: 30, note: 'Versements programmés' });
  Object.assign(data.accounts.find(a => a.id === 'lx-0000012345'), { name: 'Mon assurance-vie', color: 'green', openedAt: '2024-05-02' });
  // A month later: more S&P 500 units, the gold ETC sold, a new fund
  const later = ROWS.filter(r => r[8] !== 'FR0013416716').map(r => r.map(v => (v === '22/10/2026' || v === '23/10/2026' ? '24/11/2026' : v)));
  Object.assign(later.find(r => r[8] === 'LU0496786574'), { 9: '12.000000', 10: 72, 12: 864, 13: 84 });
  later.push(['Assurance vie', '0000012345', 'Camille Exemple', '', 'Linxea Spirit 2', 'Fonds Actions', 'Actions Europe', 'JPMorgan Funds - Europe Dynamic Fund A (acc) - EUR', 'LU0210530662', '2.000000', 47.55, '24/11/2026', 95.1, -4.9, 50, '', '', '', '', '', '', '']);
  data = mergeLinxea(data, await load(later));
  const sp2 = data.lines.find(l => l.isin === 'LU0496786574');
  assert.deepEqual([sp2.name, sp2.target, sp2.note, sp2.qty, sp2.cost, sp2.price], ['S&P 500', 30, 'Versements programmés', 12, 780, 72]);
  assert.deepEqual(sp2.events, [['2026-10-23', 10, 650, 70.65], ['2026-11-24', 12, 780, 72]], 'history grows with each import');
  const gold = data.lines.find(l => l.isin === 'FR0013416716');
  assert.deepEqual([gold.qty, gold.events.at(-1)], [0, ['2026-11-24', 0, 0, 143.38]], 'sold: kept closed for the chart, hidden from holdings');
  assert.ok(!heldLines(data).includes(gold));
  assert.ok(data.lines.some(l => l.isin === 'LU0210530662'));
  const acc = data.accounts.find(a => a.id === 'lx-0000012345');
  assert.deepEqual([acc.name, acc.color, acc.openedAt, acc.asOf], ['Mon assurance-vie', 'green', '2024-05-02', '2026-11-24']);
  assert.equal(data.lines.filter(l => l.source === 'tr').length, trLines, 'Trade Republic lines untouched');
  assert.equal(data.accounts.length, 3);
  assert.deepEqual(data.imports.map(i => i.source), ['tr', 'linxea', 'linxea']);
  // Importing the same statement twice changes nothing
  const again = mergeLinxea(data, await load(later));
  assert.deepEqual(again.lines.find(l => l.isin === 'LU0496786574').events, sp2.events);
  assert.equal(again.lines.length, data.lines.length);
});

test('several contracts in one file, and another contract left alone', async () => {
  const other = ROWS.slice(0, 2).map(r => ['Contrat de capitalisation', '0000099999', ...r.slice(2)]);
  const imp = await load([...ROWS, ...other]);
  assert.deepEqual(imp.accounts.map(a => [a.id, a.name, a.kind]), [['lx-0000012345', 'Linxea Spirit 2 · 2345', 'av'], ['lx-0000099999', 'Linxea Spirit 2 · 9999', 'av']]);
  const data = mergeLinxea(emptyData(), imp);
  const one = mergeLinxea(data, await load(ROWS.slice(0, 1)));
  assert.equal(one.lines.filter(l => l.accountId === 'lx-0000099999').length, 2, 'the contract not in the file stays as it was');
  assert.equal(heldLines(one).filter(l => l.accountId === 'lx-0000012345').length, 1);
});

test('files that are not Linxea exports are refused clearly', async () => {
  await assert.rejects(async () => importLinxea(await readXlsx(zip({ 'xl/workbook.xml': '<workbook><sheets><sheet r:id="a"/></sheets></workbook>', 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c t="inlineStr"><is><t>Bonjour</t></is></c></row></sheetData></worksheet>' }))), /pas à un export Linxea/);
  assert.throws(() => importLinxea([['Nom du support', 'Somme en Compte']]), /Aucun support/);
});
