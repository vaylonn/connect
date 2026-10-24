// End-to-end tests in Chromium against the real server and a fake Yahoo (tests/mock-yahoo.mjs).
// Needs Playwright, which the app itself does not depend on:
//   npm install --no-save playwright && npx playwright install chromium
//   node --test tests/browser.e2e.mjs
// CI runs it in its own job. Each test starts from an empty browser profile.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSV } from './tr-export.mjs';
import { linxeaXlsx } from './linxea-export.mjs';
import { ceStatement } from './ce-statement.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright'); // CommonJS lookup also honours NODE_PATH
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOCK = 9917, PORT = 8137, BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(join(tmpdir(), 'carnet-e2e-'));
const procs = [];
let browser;

const wait = ms => new Promise(r => setTimeout(r, ms));
async function up(url) { for (let i = 0; i < 50; i++) { try { if ((await fetch(url)).status < 500) return; } catch { /* not yet */ } await wait(100); } throw new Error('not started: ' + url); }

before(async () => {
  const mockUrl = `http://127.0.0.1:${MOCK}`;
  procs.push(spawn(process.execPath, [join(ROOT, 'tests/mock-yahoo.mjs')], { env: { ...process.env, MOCK_PORT: String(MOCK) }, stdio: 'ignore' }));
  procs.push(spawn(process.execPath, [join(ROOT, 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', CARNET_DATA_DIR: join(TMP, 'data'), YAHOO_BASE: mockUrl, MORNINGSTAR_BASE: mockUrl, JUSTETF_BASE: mockUrl, REDIS_URL: '', KV_REST_API_URL: '', UPSTASH_REDIS_REST_URL: '' },
    stdio: 'ignore',
  }));
  await up(mockUrl); await up(BASE + '/api/health');
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); for (const p of procs) p.kill(); rmSync(TMP, { recursive: true, force: true }); });

// A phone-sized French page that records errors; demo: true loads the example data.
async function open({ locale = 'fr-FR', device = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, demo = false, hash = '' } = {}) {
  const ctx = await browser.newContext({ ...device, locale, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '/' + hash); await page.waitForLoadState('networkidle');
  if (demo) { await page.locator('[data-action="demo"]').click(); await page.waitForTimeout(300); }
  const done = async () => { assert.deepEqual(errors, [], 'page errors'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'no horizontal scroll'); await ctx.close(); };
  return { page, done };
}
const tab = async (page, name) => { await page.locator(`[data-tab="${name}"]:visible`).first().click(); await page.waitForTimeout(200); };
const section = async (page, key) => { await tab(page, 'donnees'); await page.locator(`#view [data-action="section"][data-v="${key}"]`).click(); await page.waitForTimeout(200); };
const total = page => page.locator('.hero .big').innerText().then(s => s.replace(/\s+/g, ' ').trim());
async function pick(page, trigger, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), trigger.click()]);
  await chooser.setFiles(file); await page.waitForTimeout(400);
}

test('Trade Republic import, refresh and every tab', async () => {
  const csv = join(TMP, 'export.csv');
  const H = 'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax';
  writeFileSync(csv, [H,
    '2025-01-02T10:00:00Z,2025-01-02,DEFAULT,CASH,CUSTOMER_INBOUND,,,,,,3000,,',
    '2025-01-10T10:00:00Z,2025-01-10,DEFAULT,TRADING,BUY,FUND,MSCI World,IE0002XZSHO1,200,6.5,-1300,-1,',
    '2025-02-10T10:00:00Z,2025-02-10,DEFAULT,TRADING,BUY,STOCK,Dassault Systèmes,FR0014003TT8,10,30,-300,-1,',
  ].join('\n'));
  const { page, done } = await open();
  await pick(page, page.getByRole('button', { name: 'Importer un CSV Trade Republic' }), csv);
  await page.waitForSelector('.sheet.open');
  await page.locator('.sheet [data-ok]').click(); await page.waitForTimeout(500);
  assert.match(await total(page), /2 998,00/, 'deposit minus the two 1 € fees, holdings at their purchase price');
  await page.locator('.refresh-btn.top').click();
  await page.locator('#toast', { hasText: 'actualisé' }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('#lines .line').count(), 3);
  for (const name of ['analyse', 'historique', 'simuler']) { await tab(page, name); assert.ok((await page.locator('#view').innerText()).length > 100, name); }
  await tab(page, 'historique');
  assert.equal(await page.locator('.hist-list .line').count(), 3, 'the deposit and both buys');
  await section(page, 'cours');
  assert.match(await page.locator('.card', { hasText: 'Dernière actualisation' }).locator('p.small').innerText(), /2 à jour, 0 sans cours/);
  await done();
});

test('accounts, backup, wipe and restore', async () => {
  const { page, done } = await open({ demo: true });
  await page.locator('[data-action="clear-demo"]').click(); await page.waitForTimeout(200);
  await section(page, 'comptes');
  await page.getByRole('button', { name: 'Ajouter un compte' }).click(); await page.waitForSelector('.sheet.open');
  await page.fill('#ac-name', 'Livret test'); await page.selectOption('#ac-kind', 'livret'); await page.fill('#ac-bal', '1 234,56');
  await page.locator('.sheet button[type=submit]').click(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Ajouter un compte' }).click(); await page.waitForSelector('.sheet.open');
  await page.fill('#ac-name', 'Assurance-vie test'); await page.selectOption('#ac-kind', 'av'); await page.locator('.sheet button[type=submit]').click(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Ajouter une ligne' }).click(); await page.waitForSelector('.sheet.open');
  await page.selectOption('#lf-acc', { label: 'Assurance-vie test' }); await page.selectOption('#lf-type', 'fonds-euros');
  await page.fill('#lf-name', 'Fonds euros'); await page.fill('#lf-amount', '2000');
  await page.locator('.sheet button[type=submit]').click(); await page.waitForTimeout(400);
  await tab(page, 'patrimoine');
  const before = await total(page);
  assert.match(before, /3 234,56/);
  await section(page, 'import');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter en clair' }).click()]);
  const file = join(TMP, 'sauvegarde.json'); await dl.saveAs(file);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).accounts.length, 2);
  assert.match(await page.locator('#view p.small.muted').last().innerText(), /Dernière sauvegarde depuis cet appareil/);
  await tab(page, 'donnees');
  await page.getByRole('button', { name: 'Effacer toutes les données' }).click(); await page.waitForSelector('.sheet.open');
  await page.locator('.sheet [data-ok]').click(); await page.waitForTimeout(400);
  assert.equal(await page.locator('.empty').count(), 1);
  await pick(page, page.getByRole('button', { name: 'Restaurer une sauvegarde' }), file);
  assert.equal(await total(page), before);
  await done();
});

test('Réglages: one page per section, back returns to the list', async () => {
  const { page, done } = await open({ demo: true });
  await tab(page, 'donnees');
  const keys = await page.locator('#view [data-action="section"]').evaluateAll(els => els.map(e => e.dataset.v));
  assert.deepEqual(keys, ['comptes', 'import', 'sync', 'cours', 'appareil', 'preferences']);
  for (const k of keys) {
    await page.locator(`#view [data-action="section"][data-v="${k}"]`).click(); await page.waitForTimeout(200);
    assert.equal(new URL(page.url()).hash, '#donnees/' + k);
    await page.goBack(); await page.waitForTimeout(200);
    assert.equal(await page.locator('#view [data-action="section"]').count(), keys.length, 'back to the list after ' + k);
  }
  await page.goto(BASE + '/#donnees/nope'); await page.waitForTimeout(300);
  assert.equal(await page.locator('#view [data-action="section"]').count(), keys.length, 'unknown section shows the list');
  await done();
});

test('language: device language, then a manual choice that sticks', async () => {
  const { page, done } = await open({ locale: 'en-US', demo: true });
  assert.deepEqual(await page.locator('.tabbar .lbl').allInnerTexts(), ['Net worth', 'Analysis', 'History', 'Simulate', 'Settings']);
  assert.match(await total(page), /^12,985\.20/);
  await section(page, 'preferences');
  await page.locator('[data-action="lang"][data-v="fr"]').click(); await page.waitForTimeout(200);
  await page.reload(); await page.waitForTimeout(300);
  assert.equal(await page.locator('.tabbar .lbl').first().innerText(), 'Patrimoine');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
  await done();
});

test('install tutorial: the device’s own steps, offered once on a phone', async () => {
  const iphone = await open({ device: devices['iPhone 13'] });
  await iphone.page.waitForSelector('.sheet.open', { timeout: 5000 });
  assert.deepEqual(await iphone.page.locator('.sheet .step b').allInnerTexts(), ['Touchez le bouton Partager', 'Choisissez « Sur l’écran d’accueil »', 'Touchez « Ajouter »']);
  await iphone.page.keyboard.press('Escape'); await iphone.page.reload(); await iphone.page.waitForTimeout(2200);
  assert.equal(await iphone.page.locator('.sheet.open').count(), 0, 'not offered twice');
  await iphone.done();
  const android = await open({ device: devices['Pixel 7'] });
  await android.page.waitForSelector('.sheet.open', { timeout: 5000 });
  assert.equal(await android.page.locator('.sheet .step b').first().innerText(), 'Ouvrez le menu ⋮');
  await android.done();
});

test('backup reminder after 30 days without an export', async () => {
  const { page, done } = await open({ demo: true });
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('carnet:data:v1')); delete d.demo;
    localStorage.setItem('carnet:data:v1', JSON.stringify(d));
    localStorage.setItem('carnet:device:v1', JSON.stringify({ firstData: new Date(Date.now() - 40 * 86400000).toISOString() }));
  });
  await page.reload(); await page.waitForTimeout(300);
  assert.match(await page.locator('.backup-hint').innerText(), /Aucune sauvegarde depuis 40 jours/);
  await page.locator('[data-action="backup-snooze"]').click(); await page.waitForTimeout(200);
  assert.equal(await page.locator('.backup-hint').count(), 0);
  await done();
});

test('old backup files restore through the app: replace, add, encrypted', async () => {
  const fx = name => join(ROOT, 'tests/fixtures', name);
  const { page, done } = await open();
  await pick(page, page.getByRole('button', { name: 'Restaurer une sauvegarde' }), fx('backup-v1.0.json'));
  assert.match(await total(page), /^1 570,00/, 'empty device: the v1.0 file replaces directly');
  await section(page, 'import');
  await pick(page, page.locator('#view [data-action="pick-backup"]'), fx('partial-accounts.json'));
  await page.locator('.sheet [data-choice="merge"]').click(); await page.waitForTimeout(400);
  assert.match(await total(page), /^4 070,00/, 'the partial file adds its account');
  await section(page, 'import');
  await pick(page, page.locator('#view [data-action="pick-backup"]'), fx('backup-v1.3-encrypted.json'));
  await page.fill('#pp1', 'phrase de test des sauvegardes'); await page.locator('.sheet button[type=submit]').click();
  await page.locator('.sheet [data-choice="replace"]').waitFor(); await page.locator('.sheet [data-choice="replace"]').click(); await page.waitForTimeout(400);
  assert.match(await total(page), /2,198\.00|^2 198,00/, 'the encrypted v1.3 file replaces everything (it switches to English)');
  await tab(page, 'historique');
  assert.equal(await page.locator('.hist-list .line').count(), 2);
  assert.equal(await page.locator('#view .callout [data-action="pick-csv"]').count(), 1, 'an import from before 1.4: a new import adds deposits and dividends');
  await done();
});

test('import sources: a dropdown, then the chosen source’s guide opens the file picker', async () => {
  const csv = join(TMP, 'guide.csv');
  writeFileSync(csv, 'datetime,date,account_type,category,type,asset_class,name,symbol,shares,price,amount,fee,tax\n2025-01-02T08:00:00Z,2025-01-02,DEFAULT,CASH,CUSTOMER_INBOUND,,,,,,1000,,\n');
  const { page, done } = await open({ hash: '#donnees/import' });
  assert.deepEqual(await page.locator('#imp-source option').allInnerTexts(), ['Trade Republic', 'Linxea', 'Caisse d’Épargne']);
  await page.locator('[data-action="import-source"]').click(); await page.waitForSelector('.sheet.open');
  assert.equal(await page.locator('.sheet .step').count(), 3);
  await pick(page, page.locator('.sheet [data-go]'), csv);
  await page.waitForSelector('.sheet.open'); await page.locator('.sheet [data-ok]').click(); await page.waitForTimeout(400);
  await section(page, 'import');
  assert.match(await page.locator('#view .kv').innerText(), /Trade Republic\s+importé le/);
  await done();
});

test('history of cash movements, real performance, target allocation and notes', async () => {
  const csv = join(TMP, 'realistic.csv'); writeFileSync(csv, CSV);
  const { page, done } = await open();
  await pick(page, page.getByRole('button', { name: 'Importer un CSV Trade Republic' }), csv);
  await page.waitForSelector('.sheet.open'); await page.locator('.sheet [data-ok]').click(); await page.waitForTimeout(500);
  await tab(page, 'historique');
  assert.equal(await page.locator('.hist-list .line').count(), 14);
  await page.locator('[data-action="hist-kind"][data-v="income"]').click(); await page.waitForTimeout(150);
  assert.deepEqual(await page.locator('.hist-list .line .n').allInnerTexts(), ['Bonus', 'Intérêts', 'Apple']);
  await page.locator('[data-action="hist-kind"][data-v="flows"]').click(); await page.waitForTimeout(150);
  assert.match(await page.locator('.sums').innerText(), /Versé\s+8\s000\s€/);
  await tab(page, 'analyse');
  assert.match(await page.locator('.sums').nth(1).innerText(), /Versé\s+7\s958\s€[\s\S]*Gain réel\s+\+2\s053\s€/);
  // Target: 70 % MSCI World, 30 % Apple
  await page.locator('#view [data-action="targets"]').click(); await page.waitForSelector('.sheet.open');
  await page.fill('.sheet [data-tid="tr-pea-ie0002xzsho1"]', '70'); await page.fill('.sheet [data-tid="tr-default-us0378331005"]', '20');
  assert.match(await page.locator('#tg-sum').innerText(), /il manque 10 points/);
  await page.locator('.sheet button[type=submit]').click(); await page.waitForTimeout(200);
  assert.equal(await page.locator('.sheet.open').count(), 1, 'not saved while the total is not 100 %');
  await page.fill('.sheet [data-tid="tr-default-us0378331005"]', '30'); await page.locator('.sheet button[type=submit]').click(); await page.waitForTimeout(400);
  assert.equal(await page.locator('#view .compare .cmp').count(), 2);
  await page.locator('#view [data-action="go-rebalance"]').click(); await page.waitForTimeout(300);
  // 1300 € MSCI World and 3000 € Apple: 500 € more all go to MSCI World
  assert.match(await page.locator('#reb-out').innerText(), /Acheter 500\s€/);
  await page.locator('#reb-out .reb-row').first().click(); await page.waitForTimeout(300);
  assert.equal(await page.locator('#sim-line').inputValue(), 'tr-pea-ie0002xzsho1');
  assert.equal(await page.locator('#sim-amount').inputValue(), '500');
  // Note on a holding, kept after a reload
  await tab(page, 'patrimoine');
  await page.locator('#lines [data-id="tr-default-us0378331005"]').click(); await page.waitForSelector('.sheet.open');
  await page.locator('.sheet [data-act="edit"]').click(); await page.waitForSelector('#lf-note');
  await page.fill('#lf-note', 'Achetée pour le dividende'); await page.locator('.sheet.open button[type=submit]').click(); await page.waitForTimeout(400);
  await page.reload(); await page.waitForTimeout(300);
  await page.locator('#lines [data-id="tr-default-us0378331005"]').click(); await page.waitForSelector('.sheet.open');
  assert.equal(await page.locator('.sheet .note-text').innerText(), 'Achetée pour le dividende');
  await done();
});

test('PEA 5-year reminder, chart of one account, anonymous view to share', async () => {
  const csv = join(TMP, 'comfort.csv'); writeFileSync(csv, CSV);
  const { page, done } = await open({ device: { viewport: { width: 1280, height: 900 } } });
  await pick(page, page.getByRole('button', { name: 'Importer un CSV Trade Republic' }), csv);
  await page.waitForSelector('.sheet.open'); await page.locator('.sheet [data-ok]').click(); await page.waitForTimeout(500);
  assert.equal(await page.locator('.milestone-hint').count(), 0, 'the PEA opened in 2025: nothing to say yet');
  // First deposit five years ago minus a month: the reminder shows, once
  const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - 5); d.setUTCDate(d.getUTCDate() + 30);
  await page.locator('.acc', { hasText: 'Trade Republic PEA' }).click(); await page.waitForSelector('.sheet.open');
  assert.match(await page.locator('.sheet').innerText(), /à partir du 2 janv\. 2030/);
  await page.locator('.sheet [data-act="edit"]').click(); await page.waitForSelector('#ac-open');
  await page.fill('#ac-open', d.toISOString().slice(0, 10)); await page.locator('.sheet.open button[type=submit]').click(); await page.waitForTimeout(400);
  assert.match(await page.locator('.milestone-hint').innerText(), /Trade Republic PEA aura 5 ans le/);
  await page.locator('[data-action="milestone-seen"]').click(); await page.waitForTimeout(200);
  await page.reload(); await page.waitForTimeout(300);
  assert.equal(await page.locator('.milestone-hint').count(), 0, 'dismissed for good');
  // The chart narrows to one account
  await page.selectOption('#chart-scope', 'acc:tr-pea'); await page.waitForTimeout(200);
  assert.equal(await page.locator('.scope-label').innerText(), 'Trade Republic PEA');
  assert.match(await page.locator('#chart-hover').innerText(), /Sur la période/);
  // Anonymous view: an image and a text without any amount
  await tab(page, 'analyse');
  await page.locator('[data-action="share"]').click(); await page.waitForSelector('.sheet.open');
  await page.waitForFunction(() => document.querySelector('.share-img')?.naturalWidth === 1080);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('.sheet [data-copy]').click(); await page.waitForTimeout(200);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /Enveloppes\n• Espèces : 41 %/);
  assert.match(text, /• Apple : 30 %/);
  assert.doesNotMatch(text, /€|10\s?011|2\s?361|3\s?000/, 'no amount');
  await page.locator('.sheet [data-part="lines"]').click(); await page.waitForTimeout(300);
  await page.locator('.sheet [data-copy]').click(); await page.waitForTimeout(200);
  assert.doesNotMatch(await page.evaluate(() => navigator.clipboard.readText()), /Lignes|Apple/, 'holdings left out');
  await done();
});

test('Linxea: the guide, the workbook, and the contract in every view', async () => {
  const xlsx = join(TMP, 'linxea.xlsx'); writeFileSync(xlsx, linxeaXlsx());
  const { page, done } = await open();
  // From the empty screen, « Autres imports » leads to the list of sources
  await page.getByRole('button', { name: 'Autres imports' }).click(); await page.waitForTimeout(200);
  assert.equal(new URL(page.url()).hash, '#donnees/import');
  await page.selectOption('#imp-source', 'linxea'); await page.locator('[data-action="import-source"]').click(); await page.waitForSelector('.sheet.open');
  assert.deepEqual(await page.locator('.sheet .step b').allInnerTexts(), ['Sur l’espace client Linxea, ouvrez votre contrat', 'Sous « Composition du contrat », touchez « Télécharger vos données »', 'Importez le fichier ici']);
  assert.equal(await page.locator('.sheet .step a').getAttribute('href'), 'https://espaceclient.linxea.com');
  await pick(page, page.locator('.sheet [data-go]'), xlsx);
  await page.waitForSelector('.sheet.open');
  assert.match(await page.locator('.sheet .sheet-head').innerText(), /6 supports au 23 oct\. 2026/);
  assert.equal(await page.locator('.sheet .holding').count(), 6);
  await page.locator('.sheet [data-ok]').click(); await page.waitForTimeout(500);
  assert.match(await total(page), /^2 665,6/);
  assert.match(await page.locator('.acc').innerText(), /Assurance-vie[\s\S]*Linxea Spirit 2/);
  // A fund: its category, Linxea's price and the fund's own performance
  await page.locator('#lines .line', { hasText: 'Amundi Core S&P 500' }).click(); await page.waitForSelector('.sheet.open');
  const sheet = await page.locator('.sheet.open').innerText();
  assert.match(sheet, /Actions Amérique · LU0496786574/);
  assert.match(sheet, /22 oct\. 2026 · Linxea/);
  assert.match(sheet, /Performance du support[\s\S]*Depuis janvier\s+\+17,4 %[\s\S]*3 ans\s+\+21,2 %\s+par an/);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  // The contract: values date and the 8-year milestone
  await page.locator('.acc').click(); await page.waitForSelector('.sheet.open');
  assert.match(await page.locator('.sheet.open').innerText(), /Dernier import Linxea : valeurs du 23 oct\. 2026[\s\S]*Rachats avec abattement sur les gains à partir du 23 oct\. 2034/);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await tab(page, 'analyse');
  assert.match(await page.locator('.bars').innerText(), /Obligations et liquidités/);
  await tab(page, 'historique');
  assert.match(await page.locator('#view .card').innerText(), /L’export Linxea et les lignes ajoutées à la main ne donnent que des positions/);
  // The same file again: nothing doubles
  await section(page, 'import');
  assert.match(await page.locator('#view .kv').innerText(), /Linxea\s+importé le[\s\S]*Valeurs au\s+23 oct\. 2026/);
  await page.selectOption('#imp-source', 'linxea'); await page.locator('[data-action="import-source"]').click(); await page.waitForSelector('.sheet.open');
  await pick(page, page.locator('.sheet [data-go]'), xlsx);
  await page.waitForSelector('.sheet.open'); await page.locator('.sheet [data-ok]').click(); await page.waitForTimeout(500);
  assert.equal(await page.locator('#lines .line').count(), 6);
  assert.match(await total(page), /^2 665,6/);
  await done();
});

test('Caisse d’Épargne: the statement’s balances, in place of the accounts entered by hand', async () => {
  const pdf = join(TMP, 'releve.pdf'); writeFileSync(pdf, ceStatement({ date: '03/10/2020' }));
  const { page, done } = await open({ hash: '#donnees/comptes' });
  // A Livret A entered by hand beforehand
  await page.getByRole('button', { name: 'Ajouter un compte' }).click(); await page.waitForSelector('.sheet.open');
  await page.fill('#ac-name', 'Livret A'); await page.selectOption('#ac-kind', 'livret'); await page.fill('#ac-bal', '9 000');
  await page.locator('.sheet button[type=submit]').click(); await page.waitForTimeout(400);
  await section(page, 'import');
  await page.selectOption('#imp-source', 'ce'); await page.locator('[data-action="import-source"]').click(); await page.waitForSelector('.sheet.open');
  assert.equal(await page.locator('.sheet .step').count(), 3);
  await pick(page, page.locator('.sheet [data-go]'), pdf);
  await page.waitForSelector('#ce-dup');
  assert.match(await page.locator('.sheet .sheet-head').innerText(), /3 comptes au 3 oct\. 2020/);
  assert.match(await page.locator('.sheet.open').innerText(), /Non importés : Pret Immobilier/);
  assert.match(await page.locator('label.check').innerText(), /Fusionner avec les comptes saisis à la main : Livret A/);
  await page.locator('.sheet [data-ok]').click(); await page.waitForTimeout(500);
  // 9 000 entered today is more recent than the statement's 10 000: it stays, counted once
  assert.match(await total(page), /^12 735,06/);
  assert.equal(await page.locator('.acc', { hasText: 'Livret A' }).count(), 1);
  await page.locator('[data-action="group"][data-v="envelopes"]').click(); await page.waitForTimeout(200);
  assert.match(await page.locator('.accounts').innerText(), /Livrets[\s\S]*11\s501\s€[\s\S]*Espèces[\s\S]*1\s235\s€/);
  const body = await page.evaluate(() => localStorage.getItem('carnet:data:v1'));
  assert.ok(!/01234567890|CAMILLE|BOULANGERIE/.test(body), 'no account number, name or operation stored');
  await done();
});
