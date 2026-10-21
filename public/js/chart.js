// Value-over-time chart in SVG, no dependencies.
import { eur, dateLong, monthShort } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

function niceTicks(min, max, n = 3) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
  return out;
}
const compact = v => Math.abs(v) >= 10000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k' : v.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });

export function lineChart(host, points, { onHover } = {}) {
  host.innerHTML = '';
  if (points.length < 2) { host.innerHTML = '<p class="chart-empty">Pas encore assez d’historique pour tracer une courbe.</p>'; return; }
  const W = Math.max(280, host.clientWidth || 600), H = Math.round(Math.min(260, Math.max(170, W * 0.42)));
  const pad = { l: 4, r: 44, t: 12, b: 26 };
  const vals = points.flatMap(p => [p.value, p.invested]);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const ticks = niceTicks(min, max, 3);
  min = Math.min(min, ticks[0]); max = Math.max(max, ticks[ticks.length - 1]);
  const t0 = new Date(points[0].d).getTime(), t1 = new Date(points[points.length - 1].d).getTime();
  const x = d => pad.l + (W - pad.l - pad.r) * ((new Date(d).getTime() - t0) / ((t1 - t0) || 1));
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / ((max - min) || 1));
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart', role: 'img', 'aria-label': 'Évolution du patrimoine' });
  const defs = el('defs');
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  const grad = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(el('stop', { offset: '0%', 'stop-color': 'var(--orange)', 'stop-opacity': '0.28' }), el('stop', { offset: '100%', 'stop-color': 'var(--orange)', 'stop-opacity': '0' }));
  defs.append(grad); svg.append(defs);

  for (const v of ticks) {
    if (v < min - 1e-9 || v > max + 1e-9) continue;
    svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: 'grid' }));
    const tx = el('text', { x: W - pad.r + 6, y: y(v) + 4, class: 'axis' }); tx.textContent = compact(v); svg.append(tx);
  }
  // date markers
  const nLabels = W < 420 ? 3 : 5;
  for (let i = 0; i < nLabels; i++) {
    const p = points[Math.round(i * (points.length - 1) / (nLabels - 1))];
    const tx = el('text', { x: x(p.d), y: H - 6, class: 'axis', 'text-anchor': i === 0 ? 'start' : i === nLabels - 1 ? 'end' : 'middle' });
    tx.textContent = monthShort(p.d); svg.append(tx);
  }
  const path = key => points.map((p, i) => (i ? 'L' : 'M') + x(p.d).toFixed(1) + ' ' + y(p[key]).toFixed(1)).join(' ');
  const area = path('value') + ` L ${x(points[points.length - 1].d).toFixed(1)} ${H - pad.b} L ${x(points[0].d).toFixed(1)} ${H - pad.b} Z`;
  svg.append(el('path', { d: area, fill: `url(#${gid})`, stroke: 'none' }));
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

export function hoverText(p) { return p ? `${dateLong(p.d)} · ${eur(p.value, 0)} (investi ${eur(p.invested, 0)})` : ''; }
