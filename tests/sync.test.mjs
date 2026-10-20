// Test de l'API /api/sync contre le stockage par fichiers : node --test tests/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8123, BASE = `http://127.0.0.1:${PORT}/api/sync`;
const ID = 'a'.repeat(64), TOKEN = 'T'.repeat(43), OTHER = 'U'.repeat(43);
let dir, srv;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'carnet-sync-'));
  srv = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', CARNET_DATA_DIR: dir, KV_REST_API_URL: '', UPSTASH_REDIS_REST_URL: '' }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/api/health`); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error('serveur non démarré');
});
after(async () => { srv.kill(); await rm(dir, { recursive: true, force: true }); });

const req = (method, { token = TOKEN, id = ID, body } = {}) => fetch(BASE, {
  method, headers: { 'x-carnet-vault': id, 'x-carnet-token': token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
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
