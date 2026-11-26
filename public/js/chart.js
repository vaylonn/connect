// Value-over-time chart in SVG, no dependencies.
import { eur, dateLong } from './format.js';
import { t } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

export function lineChart(host, points, { onHover } = {}) {
  host.innerHTML = '';
  if (points.length < 2) { host.innerHTML = `<p class="chart-empty">${t('Pas encore assez d’historique pour tracer une courbe.')}</p>`; return; }
  const W = Math.max(280, host.clientWidth || 600), H = Math.round(Math.min(260, Math.max(170, W * 0.42)));
  const pad = { l: 2, r: 8, t: 12, b: 12 };
  const vals = points.flatMap(p => [p.value, p.invested]);
  let min = Math.min(...vals), max = Math.max(...vals);
  // A nearly flat series (a single snapshot, savings): at least 2 % of height, so it does not look like a cliff
  const mid = (min + max) / 2, least = Math.max(Math.abs(mid) * 0.02, 1);
  if (max - min < least) { min = mid - least / 2; max = mid + least / 2; }
  const room = (max - min) * 0.06; min -= room; max += room;
  const t0 = new Date(points[0].d).getTime(), t1 = new Date(points[points.length - 1].d).getTime();
  const x = d => pad.l + (W - pad.l - pad.r) * ((new Date(d).getTime() - t0) / ((t1 - t0) || 1));
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / ((max - min) || 1));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': t('Évolution du patrimoine') });
  // No grid, axes or fill: the line, the amount invested, and a dotted level where the period starts.
  // Dates and amounts show on hover (onHover).
  svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y(points[0].value), y2: y(points[0].value), class: 'baseline' }));
  const path = key => points.map((p, i) => (i ? 'L' : 'M') + x(p.d).toFixed(1) + ' ' + y(p[key]).toFixed(1)).join(' ');
  svg.append(el('path', { d: path('invested'), class: 'line-invested', fill: 'none' }));
  svg.append(el('path', { d: path('value'), class: 'line-value', fill: 'none' }));
  const last = points[points.length - 1];
  svg.append(el('circle', { cx: x(last.d), cy: y(last.value), r: 4.5, class: 'dot' }));
  const cursor = el('line', { x1: 0, x2: 0, y1: pad.t, y2: H - pad.b, class: 'cursor', visibility: 'hidden' });
  const cdot = el('circle', { r: 4, class: 'dot', visibility: 'hidden' });
  svg.append(cursor, cdot);
  host.append(svg);

  const pick = ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    let best = 0, bd = Infinity;
    for (let i = 0; i < points.length; i++) { const dd = Math.abs(x(points[i].d) - px); if (dd < bd) { bd = dd; best = i; } }
    const p = points[best];
    cursor.setAttribute('x1', x(p.d)); cursor.setAttribute('x2', x(p.d)); cursor.setAttribute('visibility', 'visible');
    cdot.setAttribute('cx', x(p.d)); cdot.setAttribute('cy', y(p.value)); cdot.setAttribute('visibility', 'visible');
    onHover && onHover(p);
  };
  const leave = () => { cursor.setAttribute('visibility', 'hidden'); cdot.setAttribute('visibility', 'hidden'); onHover && onHover(null); };
  svg.addEventListener('pointermove', pick);
  svg.addEventListener('pointerdown', pick);
  svg.addEventListener('pointerleave', leave);
}

export function hoverText(p) { return p ? `${dateLong(p.d)} · ${eur(p.value, 0)} (${t('investi {x}', { x: eur(p.invested, 0) })})` : ''; }
