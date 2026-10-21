// Local storage (localStorage), plain or encrypted backups.
import { t } from './i18n.js';
const KEY = 'carnet:data:v1';
export const SCHEMA = 1;

export function emptyData() {
  return {
    app: 'carnet', schema: SCHEMA,
    profile: { firstName: '' },
    settings: { theme: 'auto', lang: 'auto', taxRate: 31.4, staleDays: 4, snoozeUntil: '' },
    accounts: [], lines: [], priceHistory: {}, trStats: null, imports: [],
    updatedAt: new Date().toISOString(),
  };
}

let memory = null; // fallback if storage is blocked
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* storage unavailable */ }
  return memory ? normalize(memory) : emptyData();
}
export function save(data) {
  data.updatedAt = new Date().toISOString();
  memory = data;
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}
export function clearAll() {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* nothing */ }
}
export function storageWorks() {
  try { localStorage.setItem('carnet:probe', '1'); localStorage.removeItem('carnet:probe'); return true; } catch { return false; }
}

export function normalize(d) {
  const base = emptyData();
  const out = { ...base, ...d, profile: { ...base.profile, ...(d.profile || {}) }, settings: { ...base.settings, ...(d.settings || {}) } };
  out.accounts = Array.isArray(d.accounts) ? d.accounts : [];
  out.lines = Array.isArray(d.lines) ? d.lines.map(l => ({ pending: 0, events: [], ...l })) : [];
  out.priceHistory = d.priceHistory && typeof d.priceHistory === 'object' ? d.priceHistory : {};
  out.app = 'carnet'; out.schema = SCHEMA;
  return out;
}

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object') throw new Error(t('Ce fichier n’est pas une sauvegarde Carnet.'));
  if (obj.app !== 'carnet') throw new Error(t('Ce fichier n’est pas une sauvegarde Carnet.'));
  if (!Array.isArray(obj.lines) || !Array.isArray(obj.accounts)) throw new Error(t('La sauvegarde est incomplète (comptes ou lignes manquants).'));
  const out = normalize(obj);
  if (obj.partial) out.partial = true;
  return out;
}

// ——— Encryption: PBKDF2-SHA-256 (310,000 iterations) + 256-bit AES-GCM ———
const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ITER = 310000;

async function keyFrom(pass, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptBackup(data, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(pass, salt, ITER);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { app: 'carnet', encrypted: true, format: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITER, salt: b64(salt) }, cipher: 'AES-GCM', iv: b64(iv), data: b64(ct), exportedAt: new Date().toISOString() };
}
export async function decryptBackup(obj, pass) {
  const key = await keyFrom(pass, unb64(obj.kdf.salt), obj.kdf.iterations || ITER);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, key, unb64(obj.data));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch { throw new Error(t('Phrase de passe incorrecte, ou fichier abîmé.')); }
}

export function backupPayload(data) {
  const { app, schema, profile, settings, accounts, lines, priceHistory, trStats, imports, transactions } = data;
  return { app, schema, exportedAt: new Date().toISOString(), profile, settings: { ...settings, snoozeUntil: '' }, accounts, lines, priceHistory, trStats, imports, transactions };
}
