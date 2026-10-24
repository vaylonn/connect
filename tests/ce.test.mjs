// Caisse d'Épargne import: the PDF reader, the statement's summary, and the merge into existing data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPdf } from '../public/js/pdf.js';
import { importCe, mergeCe, duplicates } from '../public/js/importer-ce.js';
import { emptyData } from '../public/js/store.js';
import { totals, history } from '../public/js/compute.js';
import { ceStatement, ACCOUNTS } from './ce-statement.mjs';

const load = async opts => importCe(await readPdf(ceStatement(opts)));

test('pdf: lines of each page, in reading order, runs joined', async () => {
  const pages = await readPdf(ceStatement());
  assert.equal(pages.length, 2);
  assert.ok(pages[0].includes('Votre relevé de comptes N° 12 au 03/10/2026'), 'octal escapes in WinAnsi');
  assert.ok(pages[0].includes('LIV.A EN CPTE N° 17515 00001 09876543210 Solde au 03/10/2026 + 10 000,00'), 'TJ array, date in pieces');
  assert.ok(pages[0].includes('L.D.D. EN CPTE N° 17515 00001 05555555555 Solde au 03/10/2026 + 2 500,50'), 'hex string');
  assert.deepEqual(pages[0].slice(-2), ['04/09/2026 04/09/2026 CB BOULANGERIE FACT 020926', '04/09/2026 04/09/2026 VIR SEPA EMPLOYEUR'], 'Td moves');
  assert.deepEqual(pages[1], ['COMPTE DE DEPOT N° 17515 00001 01234567890 (suite)', 'SOLDE CREDITEUR AU 03/10/2026 + 1 234,56'], 'two content streams, an indirect length');
  await assert.rejects(readPdf(new TextEncoder().encode('bonjour')), /pas un PDF lisible/);
  await assert.rejects(readPdf(new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Encrypt 2 0 R >> endobj')), /protégé/);
});

test('the summary only: balances by account, nothing personal kept', async () => {
  const imp = await load();
  assert.deepEqual(imp.accounts.map(a => [a.name, a.kind, a.institution, a.source, a.asOf]), [
    ['Caisse d’Épargne', 'courant', 'Caisse d’Épargne', 'ce', '2026-10-03'],
    ['Livret A', 'livret', 'Caisse d’Épargne', 'ce', '2026-10-03'],
    ['LDDS', 'livret', 'Caisse d’Épargne', 'ce', '2026-10-03'],
  ]);
  assert.deepEqual(imp.lines.map(l => [l.type, l.envelope, l.amount, l.priceDate]), [['especes', 'Espèces', 1234.56, '2026-10-03'], ['livret', 'Livrets', 10000, '2026-10-03'], ['livret', 'Livrets', 2500.5, '2026-10-03']]);
  assert.deepEqual(imp.stats, { rows: 3, to: '2026-10-03', skipped: ['Pret Immobilier'] }, 'the loan is left out');
  const json = JSON.stringify(imp);
  for (const secret of ['01234567890', '09876543210', 'CAMILLE', 'FR76', 'BOULANGERIE']) assert.ok(!json.includes(secret), secret);
  assert.match(imp.accounts[0].id, /^ce-[a-z0-9]+$/);
  const data = mergeCe(emptyData(), imp);
  assert.equal(totals(data).total, 13735.06);
  assert.deepEqual(totals(data).envelopes.map(e => [e.name, e.value]), [['Livrets', 12500.5], ['Espèces', 1234.56]]);
  assert.equal((data.transactions || []).length, 0, 'no operation imported');
});

test('a statement a month later updates the balances; an older one only fills in the history', async () => {
  let data = mergeCe(emptyData(), await load());
  const la = () => data.lines.find(l => l.name === 'Livret A' || l.customName);
  Object.assign(data.accounts.find(a => a.name === 'Livret A'), { name: 'Mon livret A', color: 'pink', note: 'Plafond 22 950 €' });
  const later = ACCOUNTS.map(([l, n, v]) => [l, n, l === 'COMPTE DE DEPOT' ? -45.2 : l === 'LIV.A EN CPTE' ? 10500 : v]);
  data = mergeCe(data, await load({ date: '03/11/2026', accounts: later }));
  assert.deepEqual([la().amount, la().priceDate, la().events], [10500, '2026-11-03', [['2026-10-03', 1, 10000, 10000], ['2026-11-03', 1, 10500, 10500]]]);
  assert.equal(data.lines.find(l => l.type === 'especes').amount, -45.2, 'an overdraft is a negative balance');
  const acc = data.accounts.find(a => a.id === la().accountId);
  assert.deepEqual([acc.name, acc.color, acc.note, acc.asOf], ['Mon livret A', 'pink', 'Plafond 22 950 €', '2026-11-03']);
  // September's statement, imported afterwards: one more point, same balances
  const sept = ACCOUNTS.map(([l, n, v]) => [l, n, l === 'LIV.A EN CPTE' ? 9000 : v]);
  data = mergeCe(data, await load({ date: '03/09/2026', accounts: sept }));
  assert.deepEqual([la().amount, la().events.map(e => e[0])], [10500, ['2026-09-03', '2026-10-03', '2026-11-03']]);
  assert.equal(data.accounts.find(a => a.id === la().accountId).asOf, '2026-11-03');
  assert.equal(data.accounts.length, 3);
  assert.deepEqual(data.imports.map(i => i.to), ['2026-10-03', '2026-11-03', '2026-09-03']);
  // The chart follows the statements
  const h = history(data, new Date('2026-11-10T12:00:00Z'), l => l.accountId === la().accountId);
  assert.equal(h.find(p => p.d >= '2026-10-03' && p.d < '2026-11-03').value, 10000);
  assert.equal(h.at(-1).value, 10500);
});

test('accounts entered by hand merge with the statement’s: the most recent balance stays shown', async () => {
  const data = emptyData();
  data.accounts.push(
    { id: 'acc-1', name: 'Livret A', kind: 'livret', source: 'manual', color: 'pink' },
    { id: 'acc-2', name: 'Compte joint', institution: "Caisse d'Epargne", kind: 'courant', source: 'manual', note: 'Avec Dominique' },
    { id: 'acc-3', name: 'La Banque Postale', kind: 'courant', source: 'manual' },
  );
  const manual = (id, i, amount, priceDate) => ({ id: 'ln-' + i, source: 'manual', accountId: id, type: i ? 'especes' : 'livret', amount, qty: 1, price: amount, cost: amount, priceDate, since: priceDate, events: [] });
  // the Livret A was updated by hand after the statement; the current account before it
  data.lines.push(manual('acc-1', 0, 21950, '2026-10-24'), manual('acc-2', 1, 50, '2026-09-15'), manual('acc-3', 2, 199.2, '2026-10-24'));
  const imp = await load();
  const dup = duplicates(data, imp);
  assert.deepEqual(dup.map(d => [d.account.id, imp.accounts.find(a => a.id === d.into).name]), [['acc-1', 'Livret A'], ['acc-2', 'Caisse d’Épargne']], 'same name, or the bank’s current account; not another bank');
  assert.equal(mergeCe(data, imp).accounts.length, 6, 'both kept unless asked');
  const merged = mergeCe(data, imp, dup);
  assert.deepEqual(merged.accounts.map(a => [a.name, a.source]), [['Livret A', 'ce'], ['Compte joint', 'ce'], ['La Banque Postale', 'manual'], ['LDDS', 'ce']], 'same places, hand-chosen names kept');
  assert.equal(merged.accounts.find(a => a.name === 'Livret A').color, 'pink');
  assert.equal(merged.accounts.find(a => a.name === 'Compte joint').note, 'Avec Dominique');
  const livret = merged.lines.find(l => l.type === 'livret' && l.source === 'ce' && l.name === 'Livret A');
  assert.deepEqual([livret.amount, livret.priceDate, livret.events], [21950, '2026-10-24', [['2026-10-03', 1, 10000, 10000], ['2026-10-24', 1, 21950, 21950]]], 'a later hand-entered balance stays shown');
  const cash = merged.lines.find(l => l.type === 'especes' && l.source === 'ce');
  assert.deepEqual([cash.amount, cash.events.length], [1234.56, 2], 'an older one joins the history');
  assert.ok(!merged.lines.some(l => l.accountId === 'acc-1' || l.accountId === 'acc-2'));
  assert.equal(Math.round(totals(merged).total * 100) / 100, 25884.26, '21 950 + 1 234,56 + 2 500,50 + 199,20');
  // The next statement, older than the hand-entered Livret A balance, does not undo it
  const next = mergeCe(merged, await load({ date: '20/10/2026' }));
  assert.equal(next.lines.find(l => l.id === livret.id).amount, 21950);
  assert.equal(next.lines.find(l => l.id === cash.id).amount, 1234.56);
});

test('a PDF that is not a statement is refused clearly', async () => {
  await assert.rejects(load({ accounts: [] }), /synthèse des comptes est introuvable/);
});
