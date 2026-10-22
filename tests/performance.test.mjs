// Real performance (money-weighted return of the imported accounts) and target allocation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTradeRepublic, mergeImport } from '../public/js/importer.js';
import { emptyData } from '../public/js/store.js';
import { xirr, performance, allocation, rebalance, lineValue } from '../public/js/compute.js';
import { CSV } from './tr-export.mjs';

const near = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const NOW = new Date('2026-05-20T12:00:00Z');

test('xirr: the annual rate that brings dated flows to zero', () => {
  near(xirr([{ d: '2024-01-01', v: -1000 }, { d: '2025-01-01', v: 1100 }]), 0.1, 0.002); // 366 days: just under 10 %
  near(xirr([{ d: '2023-01-01', v: -1000 }, { d: '2025-01-01', v: 1210 }]), 0.1, 0.001);
  near(xirr([{ d: '2024-01-01', v: -1000 }, { d: '2025-01-01', v: 500 }]), -0.5, 0.002);
  // a later deposit counts for less time: the same final gain gives a higher rate
  const early = xirr([{ d: '2024-01-01', v: -2000 }, { d: '2025-01-01', v: 2200 }]);
  const late = xirr([{ d: '2024-01-01', v: -1000 }, { d: '2024-07-01', v: -1000 }, { d: '2025-01-01', v: 2200 }]);
  assert.ok(late > early);
  assert.equal(xirr([{ d: '2024-01-01', v: -1000 }]), null);
  assert.equal(xirr([{ d: '2024-01-01', v: 1000 }, { d: '2025-01-01', v: 1000 }]), null, 'no sign change: no rate');
});

test('performance of the imported accounts: paid in, real gain and annual rate', () => {
  const data = mergeImport(emptyData(), importTradeRepublic(CSV));
  const p = performance(data, NOW);
  assert.deepEqual(p.accounts.sort(), ['tr-cto', 'tr-pea']);
  assert.equal(p.from, '2025-01-02');
  assert.deepEqual([p.deposits, Math.round(p.withdrawals * 100) / 100, p.count], [8000, 42.1, 2], 'two deposits; the card payment leaves the account');
  // value of both accounts: 12 × 250 + 200 × 6.5 + 0.01 × 60000 + 1000 (private fund) + cash 2361.37 + 1750
  near(p.value, 10011.37, 1e-6);
  near(p.gain, 10011.37 - 8000 + 42.1, 1e-6);
  near(p.income.dividends, 2.97, 1e-9); near(p.income.interest, 8.5, 1e-9); near(p.income.bonus, 5, 1e-9);
  // the rate is the one that zeroes the flows
  const flows = [[ '2025-01-02', -5000 ], [ '2025-01-02', -3000 ], [ '2025-05-03', 42.1 ], [ '2026-05-20', p.value ]];
  const npv = flows.reduce((s, [d, v]) => s + v / Math.pow(1 + p.rate, (Date.parse(d) - Date.parse('2025-01-02')) / (365 * 86400000)), 0);
  near(npv, 0, 1e-3);
  assert.equal(p.days, 503);
  near(p.rate, 0.181, 0.001); // a 25.8 % gain over 503 days is 18.1 % a year
  near(p.periodRate, 0.2577, 0.001);

  const pea = performance(data, NOW, 'tr-pea');
  assert.deepEqual([pea.deposits, pea.withdrawals], [3000, 0]);
  near(pea.value, 200 * 6.5 + 1750, 1e-6);
  assert.equal(performance(data, NOW, 'nope'), null);
});

test('no dated deposits, no performance', () => {
  const data = emptyData();
  data.accounts.push({ id: 'a', name: 'Livret', kind: 'livret' });
  data.lines.push({ id: 'l', accountId: 'a', type: 'livret', amount: 1000, qty: 1, price: 1000, cost: 1000, events: [] });
  assert.equal(performance(data, NOW), null);
});

function portfolio(targets) {
  const data = emptyData();
  data.accounts.push({ id: 'a', name: 'PEA', kind: 'pea' });
  const mk = (id, value, target) => ({ id, accountId: 'a', type: 'etf', name: id, qty: 1, price: value, cost: value, events: [], ...(target ? { target } : {}) });
  data.lines = Object.entries(targets).map(([id, [value, target]]) => mk(id, value, target));
  return data;
}

test('allocation: current share against target, on the lines that have one', () => {
  const data = portfolio({ world: [6000, 70], em: [3000, 20], small: [1000, 10], other: [5000, 0] });
  const a = allocation(data);
  assert.equal(a.base, 10000, 'the line without a target is left out');
  assert.deepEqual(a.rows.map(r => [r.line.id, r.pct, r.target]), [['world', 0.6, 0.7], ['em', 0.3, 0.2], ['small', 0.1, 0.1]]);
  near(a.rows[0].gapEur, -1000, 1e-9);
  near(a.drift, 0.1, 1e-9);
  assert.equal(allocation(portfolio({ x: [100, 0] })), null);
});

test('rebalance without selling levels the shortfalls; with selling every line reaches its target', () => {
  const data = portfolio({ world: [6000, 70], em: [3000, 20], small: [1000, 10] });
  // 3000 € to invest: total 13000, wanted 9100 / 2600 / 1300 → shortfalls 3100, −400, 300
  const add = rebalance(data, 3000);
  assert.deepEqual(add.rows.map(r => [r.line.id, r.move]), [['world', 2900], ['small', 100]], 'levelled: both end 200 € short');
  assert.deepEqual(rebalance(data, 1000).rows.map(r => [r.line.id, r.move]), [['world', 1000]], 'a smaller amount goes to the furthest line');
  const all = rebalance(data, 0, true);
  assert.deepEqual(all.rows.map(r => [r.line.id, r.move]), [['world', 1000], ['em', -1000]]);
  assert.ok(all.rows.every(r => Math.abs(r.after - r.target) < 1e-9));
  assert.deepEqual(rebalance(data, 0).rows, [], 'nothing to invest and no sales: nothing to do');
  assert.equal(lineValue(data.lines[0]), 6000, 'the data is left untouched');
});
