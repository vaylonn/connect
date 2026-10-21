const nf = (min, max) => { const f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max }); return { format: n => f.format(n).replace(/\u202f/g, '\u00a0') }; };
const N0 = nf(0, 0), N2 = nf(2, 2), P1 = nf(1, 1);

export const eur = (n, dec = 2) => (dec === 0 ? N0 : N2).format(n || 0) + ' €';
export const num = (n, dec = 2) => nf(dec, dec).format(n || 0);
export const qty = n => nf(0, 6).format(n || 0);
// For lists and the simulator: fewer decimals as the quantity grows (0,004235 · 4,123 · 139,28).
export const qtyShort = n => nf(0, Math.abs(n || 0) >= 10 ? 2 : Math.abs(n || 0) >= 1 ? 3 : 6).format(n || 0);
const sign = (n, unit) => { const r = Math.round(n / unit); return r > 0 ? '+' : r < 0 ? '−' : ''; };
export const signedEur = (n, dec = 2) => sign(n || 0, dec === 0 ? 1 : 0.01) + (dec === 0 ? N0 : N2).format(Math.abs(n || 0)).replace(/^−?/, '') + ' €';
export const pct = (x, dec = 1) => nf(dec, dec).format((x || 0) * 100) + ' %';
export const signedPct = (x, dec = 1) => sign((x || 0) * 100, Math.pow(10, -dec)) + nf(dec, dec).format(Math.abs(x || 0) * 100) + ' %';
export const pts = (x) => sign((x || 0) * 100, 0.1) + P1.format(Math.abs(x || 0) * 100) + ' pt';

const DF = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const DS = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const DM = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });
export const dateLong = s => s ? DF.format(new Date(s.length === 10 ? s + 'T12:00:00' : s)) : '—';
export const dateShort = s => s ? DS.format(new Date(s.length === 10 ? s + 'T12:00:00' : s)) : '—';
export const monthShort = s => DM.format(new Date(s + 'T12:00:00'));
export const daysAgo = s => { if (!s) return Infinity; return Math.floor((Date.now() - new Date(s + 'T12:00:00').getTime()) / 86400000); };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function parseNum(s) {
  if (typeof s === 'number') return s;
  const t = String(s || '').replace(/\s| | /g, '').replace('€', '').replace(',', '.');
  const n = parseFloat(t);
  return isFinite(n) ? n : NaN;
}
// Big figure: integer part and cents split
export function bigParts(n) {
  const s = N2.format(n || 0);
  const i = s.lastIndexOf(',');
  return { int: s.slice(0, i), dec: s.slice(i + 1) };
}
