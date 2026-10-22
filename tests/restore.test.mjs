// Backups from earlier versions must keep restoring: friends keep old files around.
// tests/fixtures holds files frozen in the format of each version; never regenerate them, add new ones.
//   backup-v1.0.json            first format: no history, no import log, lines without pending/events
//   backup-v1.3.json            Trade Republic import with history, statistics and language setting
//   backup-v1.3-encrypted.json  the same, encrypted with « phrase de test des sauvegardes »
//   backup-v1.4.json            cash movements in the history, targets and notes (tests/tr-export.mjs)
//   backup-v1.5.json            a manual PEA with the date of its first deposit
//   partial-accounts.json       a few accounts to add to existing data (« partial »)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBackup, decryptBackup, backupPayload } from '../public/js/store.js';
import { totals, heldLines, history, performance, allocation, peaStatus } from '../public/js/compute.js';

const fixture = name => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url), 'utf8'));
const total = d => Math.round(totals(d).total * 100) / 100;

test('a v1.0 backup restores with today’s defaults', () => {
  const d = validateBackup(fixture('backup-v1.0.json'));
  assert.equal(d.profile.firstName, 'Ancien');
  assert.deepEqual([d.settings.theme, d.settings.taxRate, d.settings.lang], ['dark', 30, 'auto'], 'new settings get their default');
  assert.ok(d.lines.every(l => l.pending === 0 && Array.isArray(l.events)), 'missing line fields are filled in');
  assert.equal(heldLines(d).length, 2);
  assert.equal(total(d), 1570, '1500 savings + 10 × 7');
  assert.deepEqual(history(d), [], 'no dates nor events: the chart says there is not enough history, without failing');
  assert.equal(d.partial, undefined);
});

test('a v1.3 backup keeps history, statistics and settings', () => {
  const d = validateBackup(fixture('backup-v1.3.json'));
  assert.equal(d.transactions.length, 2);
  assert.equal(d.transactions.find(x => x.kind === 'SELL').realized, 48.75, '250 − 1 − 801 × 1/4');
  assert.equal(d.trStats.rows, 3);
  assert.equal(d.settings.lang, 'en');
  assert.equal(total(d), 2198, 'cash 2000 − 801 + 249, plus 3 × 250');
});

test('an encrypted v1.3 backup decrypts to the same data', async () => {
  const enc = fixture('backup-v1.3-encrypted.json');
  assert.equal(enc.encrypted, true);
  // updatedAt is not in backups: normalize() stamps it at restore time, so it is left out of the comparison
  const strip = ({ updatedAt, ...d }) => d;
  assert.deepEqual(strip(validateBackup(await decryptBackup(enc, 'phrase de test des sauvegardes'))), strip(validateBackup(fixture('backup-v1.3.json'))));
  await assert.rejects(decryptBackup(enc, 'mauvaise phrase'), /Phrase de passe incorrecte/);
});

test('a v1.4 backup keeps cash movements, targets and notes', () => {
  const d = validateBackup(fixture('backup-v1.4.json'));
  assert.deepEqual(d.transactions.filter(x => x.kind === 'DEPOSIT').map(x => x.amount), [5000, 3000]);
  const p = performance(d, new Date('2026-05-20T12:00:00Z'));
  assert.deepEqual([p.deposits, Math.round(p.value * 100) / 100], [8000, 10011.37]);
  assert.deepEqual(allocation(d).rows.map(r => [r.line.id, r.target]), [['tr-pea-ie0002xzsho1', 0.7], ['tr-default-us0378331005', 0.2], ['tr-default-xf000btc0017', 0.1]]);
  assert.equal(d.lines.find(l => l.id === 'tr-default-us0378331005').note, 'Achetée pour le dividende');
  assert.equal(d.accounts.find(a => a.id === 'tr-pea').note, 'Ouvert le 2 janvier 2025');
  // an older backup has no cash movement: no performance, no failure
  assert.equal(performance(validateBackup(fixture('backup-v1.3.json'))), null);
});

test('a v1.5 backup keeps the PEA’s first deposit date', () => {
  const d = validateBackup(fixture('backup-v1.5.json'));
  const pea = d.accounts[0];
  assert.deepEqual([peaStatus(d, pea).free, peaStatus(d, pea).guessed], ['2024-06-03', false]);
  assert.equal(total(d), 3000);
  assert.equal(peaStatus(validateBackup(fixture('backup-v1.0.json')), { id: 'x', kind: 'pea' }), null, 'older files: no date, no failure');
});

test('a partial file is flagged so the app adds it instead of replacing', () => {
  const d = validateBackup(fixture('partial-accounts.json'));
  assert.equal(d.partial, true);
  assert.equal(total(d), 2500);
});

test('exporting a restored backup gives a file that restores the same way', () => {
  for (const name of ['backup-v1.0.json', 'backup-v1.3.json', 'backup-v1.4.json', 'backup-v1.5.json']) {
    const d = validateBackup(fixture(name));
    const again = validateBackup(JSON.parse(JSON.stringify(backupPayload(d))));
    assert.equal(total(again), total(d), name);
    assert.deepEqual(again.transactions, d.transactions, name);
    assert.deepEqual(again.lines, d.lines, name);
    assert.deepEqual(again.accounts, d.accounts, name);
  }
});

test('files that are not Carnet backups are refused clearly', () => {
  assert.throws(() => validateBackup({ app: 'autre', lines: [], accounts: [] }), /pas une sauvegarde Carnet/);
  assert.throws(() => validateBackup({ app: 'carnet', accounts: [] }), /incomplète/);
  assert.throws(() => validateBackup(null), /pas une sauvegarde Carnet/);
});
