// Synchronisation entre appareils, chiffrée de bout en bout.
// Identifiant + phrase de passe → PBKDF2 (310 000 itérations) → 512 bits :
//   - 256 bits pour la clé AES-GCM, qui ne quitte jamais le navigateur ;
//   - 256 bits pour le jeton d'accès, dont le serveur ne garde que l'empreinte.
// Le serveur ne reçoit qu'un bloc chiffré (compressé avant chiffrement) et un numéro de version.
const STATE = 'carnet:sync:v1';
const ITER = 310000;
const enc = new TextEncoder();

const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = buf => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export const USER_RE = /^[a-z0-9._-]{3,40}$/;
export const normUser = u => String(u || '').normalize('NFC').trim().toLowerCase();

// ——— État local de la synchronisation (clé dérivée, jamais la phrase) ———
export function syncState() {
  try { const s = JSON.parse(localStorage.getItem(STATE) || 'null'); return s && s.id && s.token && s.key ? s : null; } catch { return null; }
}
export function saveSyncState(s) { try { localStorage.setItem(STATE, JSON.stringify(s)); } catch { /* stockage indisponible */ } }
export function clearSyncState() { try { localStorage.removeItem(STATE); } catch { /* rien */ } }

export async function deriveAccount(userInput, pass) {
  const user = normUser(userInput);
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('carnet-sync-v1:' + user), iterations: ITER }, base, 512));
  const id = hex(await crypto.subtle.digest('SHA-256', enc.encode('carnet-vault-v1:' + user)));
  return { user, id, key: b64(bits.slice(0, 32)), token: b64url(bits.slice(32)), version: 0, dirty: false, at: '' };
}

// ——— Chiffrement du contenu ———
const aesKey = acc => crypto.subtle.importKey('raw', unb64(acc.key), 'AES-GCM', false, ['encrypt', 'decrypt']);
const canZip = typeof CompressionStream === 'function';
const pipe = (bytes, stream) => new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();

async function seal(acc, obj) {
  let bytes = enc.encode(JSON.stringify(obj));
  if (canZip) bytes = await pipe(bytes, new CompressionStream('gzip'));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(acc.id) }, await aesKey(acc), bytes);
  return JSON.stringify({ v: 1, z: canZip ? 1 : 0, iv: b64(iv), ct: b64(ct) });
}
async function open(acc, blob) {
  const o = JSON.parse(blob);
  let pt;
  try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv), additionalData: enc.encode(acc.id) }, await aesKey(acc), unb64(o.ct)); }
  catch { throw new Error('Impossible de déchiffrer le coffre.'); }
  if (o.z) {
    if (typeof DecompressionStream !== 'function') throw new Error('Ce navigateur est trop ancien pour lire ce coffre.');
    pt = await pipe(pt, new DecompressionStream('gzip'));
  }
  return JSON.parse(new TextDecoder().decode(pt));
}

// ——— Appels au serveur ———
async function call(acc, method, body, headers = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  let r, j;
  try {
    r = await fetch('api/sync', {
      method, cache: 'no-store', signal: ctl.signal,
      headers: { accept: 'application/json', 'x-carnet-vault': acc.id, 'x-carnet-token': acc.token, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    j = await r.json().catch(() => ({}));
  } catch (e) {
    throw Object.assign(new Error(e.name === 'AbortError' ? 'Le serveur met trop de temps à répondre.' : 'Serveur injoignable (hors ligne ?).'), { status: 0 });
  } finally { clearTimeout(t); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Erreur ' + r.status), { status: r.status, version: j.version });
  return j;
}

// → { version, data, updatedAt } ; data vaut null si le coffre est encore à la version known
export async function pullVault(acc, known = 0) {
  const j = await call(acc, 'GET', null, known ? { 'x-carnet-version': String(known) } : {});
  return { version: j.version, data: j.blob ? await open(acc, j.blob) : null, updatedAt: j.updatedAt };
}
// base : version sur laquelle s'appuient les changements (0 pour créer). → { version }
export async function pushVault(acc, base, data) {
  return call(acc, 'PUT', { base, blob: await seal(acc, data) });
}
export const deleteVault = acc => call(acc, 'DELETE');
