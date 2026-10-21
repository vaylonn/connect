// Test de l'API /api/sync contre le stockage par fichiers, et des limites par adresse : node --test tests/*.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientKey } from '../lib/limits.mjs';

const SERVER = join(dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs');
const ID = 'a'.repeat(64), TOKEN = 'T'.repeat(43), OTHER = 'U'.repeat(43);
const servers = [];
let dir, base;

// Lance un serveur Carnet (coffres dans un dossier temporaire) → { url, dir }
async function start(port, env = {}) {
  const d = await mkdtemp(join(tmpdir(), 'carnet-sync-'));
  const srv = spawn(process.execPath, [SERVER], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', CARNET_DATA_DIR: d, KV_REST_API_URL: '', UPSTASH_REDIS_REST_URL: '', REDIS_URL: '', ...env }, stdio: 'ignore' });
  servers.push({ srv, dir: d });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${port}/api/health`); return { url: `http://127.0.0.1:${port}`, dir: d }; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error('serveur non démarré');
}
before(async () => { ({ url: base, dir } = await start(8123)); });
after(async () => { for (const s of servers) { s.srv.kill(); await rm(s.dir, { recursive: true, force: true }); } });

const req = (method, { token = TOKEN, id = ID, body, url = base, headers = {} } = {}) => fetch(url + '/api/sync', {
  method, headers: { 'x-carnet-vault': id, 'x-carnet-token': token, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
}).then(async r => ({ status: r.status, json: await r.json() }));

test('cycle complet d’un coffre', async () => {
  assert.equal((await req('GET')).status, 404);
  assert.equal((await req('PUT', { body: { base: 3, blob: 'x' } })).status, 404, 'mise à jour d’un coffre absent');
  assert.deepEqual((await req('PUT', { body: { base: 0, blob: 'v1' } })).json, { version: 1 });
  assert.equal((await req('PUT', { body: { base: 0, blob: 'v1bis' } })).status, 409, 'création en double');
  assert.equal((await req('PUT', { token: OTHER, body: { base: 0, blob: 'pirate' } })).status, 401, 'identifiant déjà pris');
  assert.equal((await req('GET', { token: OTHER })).status, 401);

  const g = await req('GET');
  assert.equal(g.status, 200); assert.equal(g.json.version, 1); assert.equal(g.json.blob, 'v1');

  assert.deepEqual((await req('PUT', { body: { base: 1, blob: 'v2' } })).json, { version: 2 });
  const stale = await req('PUT', { body: { base: 1, blob: 'v2-autre-appareil' } });
  assert.equal(stale.status, 409); assert.equal(stale.json.version, 2);
  assert.equal((await req('GET')).json.blob, 'v2');

  // le serveur ne garde jamais le jeton lui-même
  const [file] = await readdir(dir);
  assert.ok(!(await readFile(join(dir, file), 'utf8')).includes(TOKEN));

  assert.equal((await req('DELETE', { token: OTHER })).status, 401);
  assert.equal((await req('DELETE')).status, 200);
  assert.equal((await req('GET')).status, 404);
});

test('requêtes invalides', async () => {
  assert.equal((await req('GET', { id: 'nope' })).status, 400);
  assert.equal((await req('GET', { token: 'court' })).status, 400);
  assert.equal((await req('PUT', { body: { base: -1, blob: 'x' } })).status, 400);
  assert.equal((await req('PUT', { body: { base: 0, blob: '' } })).status, 400);
});

test('relevé sans changement : le coffre n’est pas renvoyé', async () => {
  const { url } = await start(8128);
  assert.equal((await req('PUT', { url, body: { base: 0, blob: 'v1' } })).status, 200);
  assert.deepEqual((await req('GET', { url, headers: { 'x-carnet-version': '1' } })).json, { version: 1 });
  assert.equal((await req('GET', { url, headers: { 'x-carnet-version': '7' } })).json.blob, 'v1', 'version différente');
  assert.equal((await req('GET', { url })).json.blob, 'v1', 'sans version connue');
  assert.equal((await req('GET', { url, token: OTHER, headers: { 'x-carnet-version': '1' } })).status, 401, 'le jeton reste vérifié');
});

test('5 créations de coffre par heure et par adresse', async () => {
  const { url } = await start(8124);
  const statuses = [];
  for (let i = 0; i < 7; i++) statuses.push((await req('PUT', { url, id: randomBytes(32).toString('hex'), body: { base: 0, blob: 'x' } })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429, 429]);
});

test('20 essais refusés bloquent l’adresse, même avec le bon jeton', async () => {
  const { url } = await start(8125);
  assert.equal((await req('PUT', { url, body: { base: 0, blob: 'v1' } })).status, 200);
  for (let i = 0; i < 20; i++) assert.equal((await req('GET', { url, token: OTHER })).status, 401);
  const blocked = await req('GET', { url, token: OTHER });
  assert.equal(blocked.status, 429); assert.match(blocked.json.error, /quart d’heure/);
  assert.equal((await req('GET', { url })).status, 429, 'plus aucun essai pendant le blocage');
});

test('adresse du client ramenée à son préfixe /64 en IPv6', () => {
  assert.equal(clientKey('203.0.113.7'), '203.0.113.7');
  assert.equal(clientKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(clientKey('2001:db8:aa:bb:1:2:3:4'), '2001:db8:aa:bb::/64');
  assert.equal(clientKey('2001:DB8:aa:bb::9'), '2001:db8:aa:bb::/64');
  assert.equal(clientKey('2001:0db8::1'), '2001:db8:0:0::/64');
  assert.equal(clientKey(''), '');
});
