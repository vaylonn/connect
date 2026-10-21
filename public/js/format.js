// Numbers, amounts and dates in the interface language: « 1 234,50 € » in French, « €1,234.50 » in English.
import { lang, locale } from './i18n.js';

const cache = new Map();
const memo = (key, make) => { const k = lang() + key; if (!cache.has(k)) cache.set(k, make()); return cache.get(k); };
const nf = (min, max) => memo(`n${min}.${max}`, () => {
  const f = new Intl.NumberFormat(locale(), { minimumFractionDigits: min, maximumFractionDigits: max });
  return { format: n => f.format(n).replace(/ /g, ' ') };
});
const money = (abs, dec) => { const s = nf(dec, dec).format(abs); return lang() === 'en' ? '€' + s : s + ' €'; };
const sign = (n, unit) => { const r = Math.round(n / unit); return r > 0 ? '+' : r < 0 ? '−' : ''; };
const percent = s => (lang() === 'en' ? s + '%' : s + ' %');

export const eur = (n, dec = 2) => (sign(n || 0, dec === 0 ? 1 : 0.01) === '−' ? '−' : '') + money(Math.abs(n || 0), dec);
export const num = (n, dec = 2) => nf(dec, dec).format(n || 0);
export const qty = n => nf(0, 6).format(n || 0);
// For lists and the simulator: fewer decimals as the quantity grows (0.004235 · 4.123 · 139.28).
export const qtyShort = n => nf(0, Math.abs(n || 0) >= 10 ? 2 : Math.abs(n || 0) >= 1 ? 3 : 6).format(n || 0);
export const signedEur = (n, dec = 2) => sign(n || 0, dec === 0 ? 1 : 0.01) + money(Math.abs(n || 0), dec);
export const pct = (x, dec = 1) => percent(nf(dec, dec).format((x || 0) * 100));
export const signedPct = (x, dec = 1) => sign((x || 0) * 100, Math.pow(10, -dec)) + percent(nf(dec, dec).format(Math.abs(x || 0) * 100));
export const pts = (x) => sign((x || 0) * 100, 0.1) + nf(1, 1).format(Math.abs(x || 0) * 100) + ' pt';
// Value for an input field: no thousands separator, the language's decimal mark.
export const inputNum = (n, dec = 2) => { const s = String(+(+n || 0).toFixed(dec)); return lang() === 'en' ? s : s.replace('.', ','); };

const df = opts => memo('d' + JSON.stringify(opts), () => new Intl.DateTimeFormat(locale(), opts));
const day = s => new Date(s.length === 10 ? s + 'T12:00:00' : s);
export const dateLong = s => s ? df({ day: 'numeric', month: 'short', year: 'numeric' }).format(day(s)) : '—';
export const dateShort = s => s ? df({ day: 'numeric', month: 'short' }).format(day(s)) : '—';
export const monthShort = s => df({ month: 'short', year: '2-digit' }).format(new Date(s + 'T12:00:00'));
export const monthLong = s => df({ month: 'long', year: 'numeric' }).format(new Date(s + '-15T12:00:00'));
export const timeShort = d => df({ hour: '2-digit', minute: '2-digit' }).format(d);
export const dateTime = d => df({ dateStyle: 'long', timeStyle: 'short' }).format(d);
export const daysAgo = s => { if (!s) return Infinity; return Math.floor((Date.now() - new Date(s + 'T12:00:00').getTime()) / 86400000); };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Accepts « 1 234,5 », « 1234.5 » and « 1,234.5 »: when both marks appear, the last one is the decimal
// mark; a lone comma is decimal, except « 1,234 »-style grouping in English.
export function parseNum(s) {
  if (typeof s === 'number') return s;
  let t = String(s || '').replace(/[\s  €]/g, '');
  const c = t.lastIndexOf(','), d = t.lastIndexOf('.');
  if (c >= 0 && d >= 0) t = c > d ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (c >= 0) t = lang() === 'en' && /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const n = parseFloat(t);
  return isFinite(n) ? n : NaN;
}
// Big figure: integer part and cents split
export function bigParts(n) {
  const s = nf(2, 2).format(n || 0);
  const sep = lang() === 'en' ? '.' : ',';
  const i = s.lastIndexOf(sep);
  return { int: s.slice(0, i), dec: s.slice(i + 1), sep };
}
