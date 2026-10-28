// Bricks import (BricksBoard file): the embedded data, the projects and wallet, and the merge into existing data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBricksboard, importBricks, mergeBricks, STATUS } from '../public/js/importer-bricks.js';
import { emptyData } from '../public/js/store.js';
import { totals, performance, lookthrough, history, heldLines } from '../public/js/compute.js';
import { setLang, t } from '../public/js/i18n.js';
import { bricksboardHtml, bricksData, PROJECTS, WALLET } from './bricksboard-export.mjs';

const load = opts => importBricks(readBricksboard(bricksboardHtml(opts)));
const line = (data, name) => data.lines.find(l => l.name === name);

test('the file: the dashboard’s embedded data, or that data as JSON', () => {
  const html = readBricksboard(bricksboardHtml());
  assert.equal(html.fetchedAt, '2026-10-28T13:11:12.405Z');
  assert.deepEqual(readBricksboard(JSON.stringify(bricksData())), html);
  assert.throws(() => readBricksboard('<html><body>Bonjour</body></html>'), /pas à un export BricksBoard/);
  assert.throws(() => readBricksboard('{"a":1}'), /pas à un export BricksBoard/);
  assert.throws(() => readBricksboard('window.__BD__={"financed":[{'), /pas à un export BricksBoard/);
});

test('projects held become lines: capital still owed, rate, maturity, status, country', () => {
  const imp = load();
  assert.deepEqual(imp.accounts, [{ id: 'bricks', name: 'Bricks', institution: 'Bricks', kind: 'immo', color: 'orange', source: 'bricks', asOf: '2026-10-28' }]);
  const rows = imp.lines.map(l => [l.name, l.type, l.envelope, l.qty, l.price, l.cost]);
  assert.deepEqual(rows, [
    ['Villa Exemplo', 'immo', 'Immobilier', 5, 10, 50],
    ['Résidence des Tilleuls', 'immo', 'Immobilier', 20, 10, 200],
    ['Hôtel du Port', 'immo', 'Immobilier', 30, 4, 120],
    ['Maison des Exemples', 'immo', 'Immobilier', 0, 10, 0],
    ['Immeuble Neuf', 'immo', 'Immobilier', 3, 10, 30],
    ['Solde Bricks', 'especes', 'Espèces', 1, 711.98, 711.98],
  ], 'listed once each, a project not held left out');
  const port = imp.lines[2];
  assert.deepEqual(port.project, { rate: 0.11, status: 'repayment-delay', maturity: '2027-01', city: 'Marseille', grade: 'C', coverage: 0.9 });
  assert.deepEqual(port.events, [['2025-01-10', 30, 300, 10], ['2026-10-28', 30, 120, 4]], 'bought at 10 €, 6 € of each brick repaid since');
  assert.deepEqual(imp.lines[0].lookthrough, { sector: 're', country: 'Portugal' });
  assert.equal(imp.lines[1].lookthrough.country, 'France');
  assert.deepEqual(imp.lines[3].events, [['2024-06-02', 10, 100, 10], ['2025-07-01', 0, 0, 10]], 'repaid: closed at the contract’s end');
  assert.deepEqual(imp.lines[4].project, { rate: 0.1, status: 'funding-ongoing', maturity: '2028-11', city: 'Bordeaux' }, 'maturity from the first revenue month and the horizon');
  assert.equal(imp.lines[4].id, 'bricks-11111111-aaaa-4bbb-8ccc-000000000005');
  assert.deepEqual({ ...imp.stats, unknown: undefined }, {
    rows: 15, from: '2024-06-01', to: '2026-10-28', held: 4, repaid: 1, late: 1, default: 1, cash: 711.98, capital: 400,
    deposits: 1100, coupons: 9.7, tax: -2.85, truncated: false, unknown: undefined,
  });
  // Nothing personal: identity, contact, IBAN, pictures and documents stay in the file
  const json = JSON.stringify(imp);
  for (const secret of ['Camille', 'camille@', 'FR76', '+336', 'Exempleville', 'CAMEX', 'documents.example']) assert.ok(!json.includes(secret), secret);
});

test('the wallet: deposits, coupons with their tax, bonuses, purchases and repayments', () => {
  const imp = load();
  const ops = imp.transactions.map(x => [x.date, x.kind, x.amount, x.tax ?? null]);
  assert.deepEqual(ops.filter(o => o[1] !== 'BUY'), [
    ['2024-06-01', 'DEPOSIT', 500, null],
    ['2025-01-05', 'DEPOSIT', 600, null],
    ['2025-03-04', 'INTEREST', 3, -0.9],
    ['2025-04-04', 'INTEREST', 2.5, -0.75],
    ['2025-06-01', 'REPAYMENT', 100, null],
    ['2026-02-10', 'REPAYMENT', 180, null],
    ['2026-03-01', 'BONUS', 5, 0],
    ['2026-04-01', 'BONUS', 0.13, 0],
    ['2026-10-05', 'INTEREST', 4, -1.2],
    ['2026-10-06', 'INTEREST', 0.2, 0],
  ], 'declined and canceled movements left out, the tax paired with its coupon');
  assert.deepEqual(ops.filter(o => o[1] === 'BUY').map(o => o[2]), [-100, -300, -200, -50, -30]);
  assert.ok(imp.transactions.every(x => x.accountId === 'bricks' && x.source === 'bricks'));
  const cash = imp.lines.at(-1);
  assert.deepEqual(cash.events.slice(0, 3), [['2024-06-01', 1, 500, 500], ['2024-06-02', 1, 400, 400], ['2025-01-05', 1, 1000, 1000]]);
  assert.deepEqual(cash.events.at(-1), ['2026-10-28', 1, 711.98, 711.98]);
  // A tax without its coupon stays a tax; an unknown movement is counted, not guessed
  const odd = load({ wallet: [...WALLET, { kind: 'withholding_tax', createdAt: '2026-01-01T00:00:00.000Z', value: -50, status: 'confirmed' }, { kind: 'mystery', createdAt: '2026-01-02T00:00:00.000Z', value: 1, status: 'confirmed' }] });
  assert.deepEqual(odd.transactions.filter(x => x.kind === 'TAX').map(x => x.amount), [-0.5]);
  assert.deepEqual(odd.stats.unknown, { mystery: 1 });
});

test('totals, real performance and breakdown of the Bricks account', () => {
  const data = mergeBricks(emptyData(), load());
  assert.equal(totals(data).total, 400, 'the wallet’s cash is left out by default, like other accounts’ cash');
  assert.deepEqual(totals(data).envelopes.map(e => [e.name, e.value]), [['Immobilier', 400]]);
  data.settings.cash = true;
  assert.equal(Math.round(totals(data).total * 100) / 100, 1111.98);
  const p = performance(data, new Date('2026-10-28T12:00:00Z'));
  assert.deepEqual([p.deposits, Math.round(p.value * 100) / 100, Math.round(p.gain * 100) / 100, p.count], [1100, 1111.98, 11.98, 2]);
  assert.deepEqual([Math.round(p.income.interest * 100) / 100, Math.round(p.income.bonus * 100) / 100], [6.85, 5.13]);
  assert.ok(p.rate > 0 && p.rate < 0.02);
  const lt = lookthrough(data);
  assert.deepEqual(lt.sectors.map(s => [s.name, s.value]), [['Immobilier', 400]]);
  assert.deepEqual(lt.countries.map(s => [s.name, s.value]), [['France', 350], ['Portugal', 50]]);
  assert.equal(lt.coverage, 1);
  assert.equal(heldLines(data).filter(l => l.type === 'immo').length, 4, 'the repaid project is history only');
  // The chart: the projects held at each date, at their price then
  const h = history(data, new Date('2026-10-28T12:00:00Z'), l => l.type === 'immo');
  assert.equal(h.find(p => p.d >= '2024-07-01').value, 100);
  assert.equal(h.find(p => p.d >= '2025-02-01').value, 600);
  assert.equal(h.find(p => p.d >= '2025-08-01').value, 500);
  assert.equal(h.at(-1).value, 400);
});

test('a later file updates the account, keeps the user’s changes and each project’s past', () => {
  let data = emptyData();
  data.accounts.push({ id: 'acc-1', name: 'Livret A', kind: 'livret', source: 'manual' });
  data.lines.push({ id: 'ln-1', source: 'manual', accountId: 'acc-1', type: 'livret', amount: 1000, qty: 1, price: 1000, cost: 1000, events: [] });
  data = mergeBricks(data, load());
  Object.assign(data.accounts.find(a => a.id === 'bricks'), { name: 'Mes briques', color: 'pink', note: 'Compte ouvert en 2024' });
  Object.assign(line(data, 'Résidence des Tilleuls'), { name: 'Les Tilleuls', customName: true, note: 'Mon premier projet', target: 20 });
  // A month later: the Tilleuls repay half, the new building's funding ends, the port is fully repaid
  const projects = {
    ...PROJECTS,
    tilleuls: { ...PROJECTS.tilleuls, brickPrice: 500 },
    neuf: { ...PROJECTS.neuf, financialStatus: 'reception-by-project-owner-pending', funding: { ...PROJECTS.neuf.funding, ended: { type: 'success', at: '2026-11-02T08:00:00.000Z' } } },
    port: { ...PROJECTS.port, brickPrice: 0, financialStatus: 'repayment-finished' },
  };
  const wallet = [{ kind: 'obligation_principal_repayment_partial', createdAt: '2026-11-20T10:00:00.000Z', value: 10000, status: 'confirmed' },
    { kind: 'obligation_principal_repayment_final', createdAt: '2026-11-20T10:00:00.000Z', value: 12000, status: 'confirmed' }, ...WALLET];
  data = mergeBricks(data, load({ fetchedAt: '2026-11-28T09:00:00.000Z', projects, wallet }));
  const acc = data.accounts.find(a => a.id === 'bricks');
  assert.deepEqual([acc.name, acc.color, acc.note, acc.asOf], ['Mes briques', 'pink', 'Compte ouvert en 2024', '2026-11-28']);
  assert.equal(data.accounts.length, 2);
  const til = line(data, 'Les Tilleuls');
  assert.deepEqual([til.customName, til.note, til.target, til.qty, til.price], [true, 'Mon premier projet', 20, 20, 5]);
  assert.deepEqual(til.events, [['2025-01-10', 20, 200, 10], ['2026-10-28', 20, 200, 10], ['2026-11-28', 20, 100, 5]], 'the previous snapshot stays');
  const port = line(data, 'Hôtel du Port');
  assert.equal(port.qty, 0);
  assert.deepEqual(port.events, [['2025-01-10', 30, 300, 10], ['2026-10-28', 30, 120, 4], ['2026-11-28', 0, 0, 10]], 'closed after the last snapshot that held it');
  assert.deepEqual(line(data, 'Immeuble Neuf').events.map(e => e[0]), ['2026-11-02', '2026-11-28'], 'now dated from the end of its funding');
  assert.equal(data.transactions.length, 17, 'the movements are replaced, not added twice');
  assert.equal(line(data, 'Solde Bricks').amount, 931.98);
  assert.equal(data.lines.filter(l => l.source === 'manual').length, 1);
  assert.deepEqual(data.imports.map(i => [i.source, i.to]), [['bricks', '2026-10-28'], ['bricks', '2026-11-28']]);
});

test('Bricks’ statuses are translated', () => {
  setLang('en');
  assert.deepEqual(Object.values(STATUS).map(s => t(s)), ['Funding', 'Starting', 'Repaying', 'Late', 'In default', 'Repaid']);
  setLang('fr');
});
