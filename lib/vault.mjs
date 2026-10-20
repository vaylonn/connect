// Coffres de synchronisation : le serveur ne garde que des données chiffrées par le navigateur.
// Il ne connaît ni la phrase de passe ni la clé de chiffrement, seulement l'empreinte du jeton d'accès.
//   Upstash Redis (Vercel) : KV_REST_API_URL + KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_URL/TOKEN)
//   Sinon, sur le serveur Node : fichiers dans CARNET_DATA_DIR (par défaut ./data)
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export const VAULT_RE = /^[a-f0-9]{64}$/;
export const MAX_BLOB = 3_500_000; // reste sous la limite de 4,5 Mo des fonctions Vercel

const sha = s => createHash('sha256').update(s).digest('hex');
const same = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ——— Upstash Redis (API REST) ———
// Vercel peut préfixer les variables (ex. STORAGE_KV_REST_API_URL) : on accepte tout préfixe.
function upstashEnv() {
  for (const k of Object.keys(process.env)) {
    const m = k.match(/^(.*?)(KV_REST_API|UPSTASH_REDIS_REST)_URL$/);
    const token = m && process.env[m[1] + m[2] + '_TOKEN'];
    if (m && process.env[k] && token) return { url: process.env[k], token };
  }
  return null;
}
function upstash() {
  const env = upstashEnv();
  if (!env) return null;
  const { url, token } = env;
  const cmd = async args => {
    const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(args) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('Stockage indisponible' + (j.error ? ' : ' + j.error : ''));
    return j.result;
  };
  // Écriture atomique : création (base 0) ou mise à jour si la version attendue est la bonne.
  const PUT = `
local auth = redis.call('HGET', KEYS[1], 'auth')
if not auth then
  if ARGV[2] ~= '0' then return {-404} end
  redis.call('HSET', KEYS[1], 'auth', ARGV[1], 'version', 1, 'blob', ARGV[3], 'updatedAt', ARGV[4])
  return {1}
end
if auth ~= ARGV[1] then return {-401} end
local v = tonumber(redis.call('HGET', KEYS[1], 'version'))
if tostring(v) ~= ARGV[2] then return {-409, v} end
redis.call('HSET', KEYS[1], 'version', v + 1, 'blob', ARGV[3], 'updatedAt', ARGV[4])
return {v + 1}`;
  const DEL = `
local auth = redis.call('HGET', KEYS[1], 'auth')
if not auth then return -404 end
if auth ~= ARGV[1] then return -401 end
redis.call('DEL', KEYS[1])
return 1`;
  const key = id => 'carnet:vault:' + id;
  return {
    async get(id) {
      const [auth, version, blob, updatedAt] = await cmd(['HMGET', key(id), 'auth', 'version', 'blob', 'updatedAt']);
      return auth ? { auth, version: +version, blob, updatedAt } : null;
    },
    async put(id, authHash, base, blob, updatedAt) {
      const [code, cur] = await cmd(['EVAL', PUT, '1', key(id), authHash, String(base), blob, updatedAt]);
      return code > 0 ? { version: code } : { error: -code, version: cur };
    },
    async del(id, authHash) {
      const code = await cmd(['EVAL', DEL, '1', key(id), authHash]);
      return code > 0 ? {} : { error: -code };
    },
  };
}

// ——— Fichiers locaux (serveur Node, Docker) ———
function files(dir) {
  const path = id => join(dir, id + '.json');
  const locks = new Map(); // un seul processus : une file d'attente par coffre suffit
  const locked = (id, fn) => {
    const run = (locks.get(id) || Promise.resolve()).then(fn, fn);
    locks.set(id, run.catch(() => {}));
    return run;
  };
  const read = async id => { try { return JSON.parse(await readFile(path(id), 'utf8')); } catch { return null; } };
  return {
    get: read,
    put: (id, authHash, base, blob, updatedAt) => locked(id, async () => {
      const cur = await read(id);
      if (!cur && base !== 0) return { error: 404 };
      if (cur && cur.auth !== authHash) return { error: 401 };
      if (cur && cur.version !== base) return { error: 409, version: cur.version };
      const rec = { auth: authHash, version: (cur?.version || 0) + 1, blob, updatedAt };
      await mkdir(dir, { recursive: true });
      await writeFile(path(id) + '.tmp', JSON.stringify(rec));
      await rename(path(id) + '.tmp', path(id));
      return { version: rec.version };
    }),
    del: (id, authHash) => locked(id, async () => {
      const cur = await read(id);
      if (!cur) return { error: 404 };
      if (cur.auth !== authHash) return { error: 401 };
      await unlink(path(id));
      return {};
    }),
  };
}

let backend;
function store() {
  if (backend === undefined) backend = upstash() || (process.env.VERCEL ? null : files(process.env.CARNET_DATA_DIR || join(process.cwd(), 'data')));
  return backend;
}

const ERR = { 401: 'Identifiant ou phrase de passe incorrect.', 404: 'Aucun coffre pour cet identifiant.', 409: 'Les données ont changé sur un autre appareil.' };

// method, en-têtes (minuscules), corps JSON déjà lu → [statut, réponse]
export async function handleSync(method, headers, body) {
  const s = store();
  if (!s) return [503, { error: Object.keys(process.env).some(k => /REDIS_URL$|KV_URL$/.test(k))
    ? 'Base Redis trouvée, mais sans API REST Upstash (KV_REST_API_URL / KV_REST_API_TOKEN) : utilisez une base Upstash.'
    : 'Synchronisation non configurée sur ce serveur : aucune base reliée à cet environnement (voir le README).' }];
  const id = String(headers['x-carnet-vault'] || '');
  const token = String(headers['x-carnet-token'] || ''); // pas « Authorization » : il sert déjà au mot de passe du serveur
  if (!VAULT_RE.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return [400, { error: 'Requête invalide.' }];
  const authHash = sha(token);

  if (method === 'GET') {
    const rec = await s.get(id);
    if (!rec) return [404, { error: ERR[404] }];
    if (!same(rec.auth, authHash)) return [401, { error: ERR[401] }];
    return [200, { version: rec.version, blob: rec.blob, updatedAt: rec.updatedAt }];
  }
  if (method === 'PUT') {
    const base = body?.base, blob = body?.blob;
    if (!Number.isInteger(base) || base < 0 || typeof blob !== 'string' || !blob || blob.length > MAX_BLOB) return [400, { error: blob?.length > MAX_BLOB ? 'Données trop volumineuses.' : 'Requête invalide.' }];
    const r = await s.put(id, authHash, base, blob, new Date().toISOString());
    if (r.error) return [r.error, { error: ERR[r.error], version: r.version }];
    return [200, { version: r.version }];
  }
  if (method === 'DELETE') {
    const r = await s.del(id, authHash);
    if (r.error) return [r.error, { error: ERR[r.error] }];
    return [200, { ok: true }];
  }
  return [405, { error: 'Méthode non autorisée.' }];
}

// Lecture du corps, limitée en taille (serveur Node et fonctions Vercel)
export async function readJson(req, limit = MAX_BLOB + 1000) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Données trop volumineuses.'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'); } catch { return null; }
}
