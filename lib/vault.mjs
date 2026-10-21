// Sync vaults: the server only keeps data encrypted by the browser.
// It knows neither the passphrase nor the encryption key, only the hash of the access token.
//   Upstash Redis (Vercel): KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN)
//   Plain Redis: REDIS_URL (redis:// or rediss://)
//   Otherwise, on the Node server: files in CARNET_DATA_DIR (default ./data)
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { clientKey, memoryCounter, redisCounter } from './limits.mjs';

export const VAULT_RE = /^[a-f0-9]{64}$/;
export const MAX_BLOB = 3_500_000; // stays under the 4.5 MB limit of Vercel functions

const sha = s => createHash('sha256').update(s).digest('hex');
const same = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Storage failure details go to the server logs, not to the response.
const unavailable = detail => { console.error('Storage:', detail); return new Error('Stockage indisponible.'); };

// ——— Upstash Redis (REST API) ———
// Vercel may prefix the variables (e.g. STORAGE_KV_REST_API_URL): any prefix is accepted.
function upstashEnv() {
  for (const k of Object.keys(process.env)) {
    const m = k.match(/^(.*?)(KV_REST_API|UPSTASH_REDIS_REST)_URL$/);
    const token = m && process.env[m[1] + m[2] + '_TOKEN'];
    if (m && process.env[k] && token) return { url: process.env[k], token };
  }
  return null;
}
function upstashCmd() {
  const env = upstashEnv();
  if (!env) return null;
  const { url, token } = env;
  return async args => {
    const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(args) }).catch(e => { throw unavailable(e.message); });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw unavailable(j.error || 'HTTP ' + r.status);
    return j.result;
  };
}

// ——— Plain Redis (REDIS_URL, RESP protocol over TCP/TLS) ———
// One connection per command: few calls, and nothing survives from one Vercel function to the next.
function redisUrlCmd() {
  const key = Object.keys(process.env).find(k => /(^|_)REDIS_URL$/.test(k) && /^rediss?:\/\//.test(process.env[k]));
  if (!key) return null;
  const u = new URL(process.env[key]);
  const enc = args => Buffer.concat([Buffer.from(`*${args.length}\r\n`), ...args.map(a => { const b = Buffer.from(String(a)); return Buffer.concat([Buffer.from(`$${b.length}\r\n`), b, Buffer.from('\r\n')]); })]);
  // Reads a RESP reply starting at i → [value, end]; null if incomplete
  const parse = (buf, i) => {
    const eol = buf.indexOf('\r\n', i); if (eol < 0) return null;
    const t = String.fromCharCode(buf[i]), line = buf.toString('utf8', i + 1, eol);
    if (t === '+') return [line, eol + 2];
    if (t === '-') return [Object.assign(new Error(line), { redis: true }), eol + 2];
    if (t === ':') return [Number(line), eol + 2];
    if (t === '$') { const n = +line; if (n < 0) return [null, eol + 2]; if (buf.length < eol + 2 + n + 2) return null; return [buf.toString('utf8', eol + 2, eol + 2 + n), eol + 4 + n]; }
    if (t === '*') { const n = +line; if (n < 0) return [null, eol + 2]; const out = []; let j = eol + 2; for (let k = 0; k < n; k++) { const r = parse(buf, j); if (!r) return null; out.push(r[0]); j = r[1]; } return [out, j]; }
    throw new Error('Réponse Redis illisible');
  };
  return async args => {
    const { connect } = await import(u.protocol === 'rediss:' ? 'node:tls' : 'node:net');
    const cmds = [];
    if (u.password) cmds.push(u.username && u.username !== 'default' ? ['AUTH', decodeURIComponent(u.username), decodeURIComponent(u.password)] : ['AUTH', decodeURIComponent(u.password)]);
    const db = u.pathname.slice(1); if (db) cmds.push(['SELECT', db]);
    cmds.push(args);
    return new Promise((resolve, reject) => {
      const sock = connect({ host: u.hostname, port: +u.port || 6379, servername: u.hostname });
      let buf = Buffer.alloc(0); const replies = [];
      const fail = e => { sock.destroy(); reject(unavailable(e.message)); };
      sock.setTimeout(10000, () => fail(new Error('délai dépassé')));
      sock.on('error', fail);
      sock.on(u.protocol === 'rediss:' ? 'secureConnect' : 'connect', () => sock.write(Buffer.concat(cmds.map(enc))));
      sock.on('data', d => {
        buf = Buffer.concat([buf, d]);
        let r;
        try { while (replies.length < cmds.length && (r = parse(buf, 0))) { replies.push(r[0]); buf = buf.subarray(r[1]); } } catch (e) { return fail(e); }
        if (replies.length < cmds.length) return;
        sock.end();
        const err = replies.find(x => x instanceof Error);
        if (err) reject(unavailable(err.message)); else resolve(replies[replies.length - 1]);
      });
    });
  };
}

function redis() {
  const cmd = upstashCmd() || redisUrlCmd();
  if (!cmd) return null;
  // Atomic write: creation (base 0) or update if the expected version matches.
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
    // known: version already on the device; if it is current, the vault is not read again
    async get(id, known) {
      if (known) {
        const [auth, version] = await cmd(['HMGET', key(id), 'auth', 'version']);
        if (!auth) return null;
        if (+version === known) return { auth, version: known };
      }
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
    limits: redisCounter(cmd),
  };
}

// ——— Local files (Node server) ———
function files(dir) {
  const path = id => join(dir, id + '.json');
  const locks = new Map(); // single process: one queue per vault is enough
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
    limits: memoryCounter(),
  };
}

let backend;
function store() {
  if (backend === undefined) backend = redis() || (process.env.VERCEL ? null : files(process.env.CARNET_DATA_DIR || join(process.cwd(), 'data')));
  return backend;
}

const ERR = {
  401: 'Identifiant ou phrase de passe incorrect.',
  404: 'Aucun coffre pour cet identifiant.',
  409: 'Les données ont changé sur un autre appareil.',
  429: 'Trop d’essais refusés depuis cette adresse : réessayez dans un quart d’heure.',
  creations: 'Trop de coffres créés depuis cette adresse : réessayez dans une heure.',
};
// Per address: 20 rejected attempts in 15 minutes block all access until the window ends
// (guessing a passphrase online becomes impractical), at most 5 vault creations per hour.
const FAILS = { max: 20, seconds: 15 * 60 }, CREATIONS = { max: 5, seconds: 3600 };

// method, headers (lowercase), already-read JSON body, client address → [status, response]
export async function handleSync(method, headers, body, ip = '') {
  const s = store();
  if (!s) return [503, { error: 'Synchronisation non configurée sur ce serveur : aucune base Redis reliée à cet environnement (voir le README).' }];
  const id = String(headers['x-carnet-vault'] || '');
  const token = String(headers['x-carnet-token'] || ''); // not « Authorization »: it is already used for the server password
  if (!VAULT_RE.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return [400, { error: 'Requête invalide.' }];
  const who = clientKey(ip);
  if (await s.limits.count('fail:' + who) >= FAILS.max) return [429, { error: ERR[429] }];
  const authHash = sha(token);
  // Error response; a wrong token counts as a rejected attempt for the address
  const refuse = async (status, extra = {}) => {
    if (status === 401) await s.limits.hit('fail:' + who, FAILS.seconds);
    return [status, { error: ERR[status], ...extra }];
  };

  if (method === 'GET') {
    const known = Number(headers['x-carnet-version']) || 0; // version already on the device
    const rec = await s.get(id, known);
    if (!rec) return [404, { error: ERR[404] }];
    if (!same(rec.auth, authHash)) return refuse(401);
    if (rec.version === known) return [200, { version: known }]; // unchanged: nothing to send back
    return [200, { version: rec.version, blob: rec.blob, updatedAt: rec.updatedAt }];
  }
  if (method === 'PUT') {
    const base = body?.base, blob = body?.blob;
    if (!Number.isInteger(base) || base < 0 || typeof blob !== 'string' || !blob || blob.length > MAX_BLOB) return [400, { error: blob?.length > MAX_BLOB ? 'Données trop volumineuses.' : 'Requête invalide.' }];
    if (base === 0 && await s.limits.hit('create:' + who, CREATIONS.seconds) > CREATIONS.max) return [429, { error: ERR.creations }];
    const r = await s.put(id, authHash, base, blob, new Date().toISOString());
    if (r.error) return refuse(r.error, { version: r.version });
    return [200, { version: r.version }];
  }
  if (method === 'DELETE') {
    const r = await s.del(id, authHash);
    if (r.error) return refuse(r.error);
    return [200, { ok: true }];
  }
  return [405, { error: 'Méthode non autorisée.' }];
}

// Size-limited body reading (Node server and Vercel functions)
export async function readJson(req, limit = MAX_BLOB + 1000) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Données trop volumineuses.'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'); } catch { return null; }
}
