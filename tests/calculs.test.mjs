// Tests des calculs (import Trade Republic, courbe d'évolution, sauvegarde) sur un export synthétique : node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importTradeRepublic, mergeImport } from '../public/js/importer.js';
import { emptyData, backupPayload } from '../public/js/store.js';
import { totals, heldLines, history } from '../public/js/compute.js';

// Export minimal : une ligne par mouvement, sur le compte-titres
const H = 'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax';
const row = (date, type, { isin = '', shares = '', price = '', amount = '', fee = '' } = {}) =>
  `${date}T10:00:00Z,${date},DEFAULT,TRADING,${type},${isin ? 'FUND' : ''},${isin ? 'Fonds ' + isin : ''},${isin},${shares},${price},${amount},${fee},`;
const load = rows => mergeImport(emptyData(), importTradeRepublic([H, ...rows].join('\n')));
const valueOn = (data, day, now) => history(data, new Date(now)).find(p => p.d === day)?.value;
const SP500 = 'IE00B5BMR087';

test('import : quantité, prix de revient frais compris, plus-value réalisée, espèces', () => {
  const data = load([
    row('2025-01-02', 'CUSTOMER_INBOUND', { amount: 3000 }),
    row('2025-01-10', 'BUY', { isin: SP500, shares: 4, price: 500, amount: -2000, fee: -1 }),
    row('2025-03-10', 'SELL', { isin: SP500, shares: 1, price: 600, amount: 600, fee: -1 }),
  ]);
  const line = data.lines.find(l => l.isin === SP500);
  assert.equal(line.qty, 3);
  assert.equal(line.cost, 1500.75, '2001 € × 3/4');
  assert.equal(data.transactions.find(t => t.kind === 'SELL').realized, 98.75, '600 − 1 − 500,25');
  assert.equal(data.trStats.cash['tr-cto'], 1598);
});

test('une position entièrement vendue compte dans la courbe, pas dans le patrimoine', () => {
  const data = load([
    row('2024-12-20', 'CUSTOMER_INBOUND', { amount: 2000 }),
    row('2025-01-10', 'BUY', { isin: SP500, shares: 2, price: 500, amount: -1000 }),
    row('2025-06-10', 'SELL', { isin: SP500, shares: 2, price: 600, amount: 1200 }),
  ]);
  assert.equal(heldLines(data).some(l => l.isin === SP500), false);
  assert.equal(totals(data).total, 2200);
  assert.equal(valueOn(data, '2025-03-01', '2025-07-01T12:00:00Z'), 2000, '1000 € d’espèces + 2 parts à 500 €');
});

test('un achat payé avec les espèces du compte n’est pas compté deux fois', () => {
  const data = load([
    row('2025-01-02', 'CUSTOMER_INBOUND', { amount: 3000 }),
    row('2025-01-28', 'CARD_TRANSACTION', { amount: -10 }),
    row('2025-02-05', 'BUY', { isin: SP500, shares: 2, price: 500, amount: -1000 }),
    row('2025-02-25', 'CARD_TRANSACTION', { amount: -10 }),
  ]);
  assert.equal(valueOn(data, '2025-02-15', '2025-03-31T12:00:00Z'), 2990, '1990 € d’espèces + 1000 € de fonds');
});

test('la sauvegarde garde les opérations de l’historique', () => {
  const data = load([row('2025-01-02', 'CUSTOMER_INBOUND', { amount: 1000 }), row('2025-01-10', 'BUY', { isin: SP500, shares: 1, price: 500, amount: -500 })]);
  assert.equal(backupPayload(data).transactions.length, 1);
});
