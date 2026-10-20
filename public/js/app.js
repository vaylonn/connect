// Carnet — interface. Aucune donnée ne quitte le navigateur en clair : le serveur Carnet
// (facultatif) interroge Yahoo Finance avec les symboles, jamais avec les montants, et la
// synchronisation (facultative) ne lui envoie qu'un coffre chiffré ici (voir sync.js).
import { eur, signedEur, pct, signedPct, pts, qty as fqty, num, dateLong, dateShort, daysAgo, esc, parseNum, bigParts } from './format.js';
import { load, save, clearAll, emptyData, normalize, validateBackup, encryptBackup, decryptBackup, backupPayload, storageWorks } from './store.js';
import { syncState, saveSyncState, clearSyncState, deriveAccount, pullVault, pushVault, deleteVault, normUser, USER_RE } from './sync.js';
import { importTradeRepublic, mergeImport } from './importer.js';
import { totals, staleLines, lookthrough, DIRECT, lineComposition, history as buildHistory, lineValue, lineCost, lineGain, pru, isCashLike, NEEDS_PRICE, simulate, envelopeForAccount, ENVELOPE_ORDER } from './compute.js';
import { libraryFor, libraryChoices, SECTORS, COMPOSITION_NOTE, setFetchedLibrary, inLibrary } from './library.js';
import { lineChart, hoverText } from './chart.js';

const PREVIEW = !!window.CARNET_PREVIEW;
const VERSION = '1.2.0';
let data = load();
const ui = {
  tab: 'patrimoine', range: '1A', filter: 'all', analyse: 'sectors', server: PREVIEW ? 'preview' : 'unknown', busy: false, progress: '', lineRange: '1A',
  sim: { mode: 'buy', lineId: '', newIsin: '', newName: '', accountId: '', by: 'amount', amount: '1000', qty: '', price: '', fees: '1', useCash: true },
};
const TABS = [
  ['patrimoine', 'Patrimoine'], ['analyse', 'Analyse'], ['simuler', 'Simuler'], ['donnees', 'Données'],
];
const COLORS = ['ink', 'orange', 'blue', 'pink', 'lilac', 'green'];
const KINDS = [['courant', 'Compte courant'], ['livret', 'Livret d’épargne'], ['cto', 'Compte-titres'], ['pea', 'PEA'], ['av', 'Assurance-vie'], ['per', 'PER'], ['crypto', 'Crypto'], ['autre', 'Autre']];
const TYPES = [['etf', 'ETF'], ['fonds', 'Fonds (OPCVM, unité de compte)'], ['action', 'Action'], ['crypto', 'Crypto'], ['fonds-euros', 'Fonds en euros'], ['livret', 'Livret'], ['especes', 'Espèces'], ['non-cote', 'Non coté'], ['autre', 'Autre']];
const TYPE_LABEL = Object.fromEntries(TYPES);

const ICONS = {
  patrimoine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5.5h5V20"/></svg>',
  analyse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6"/></svg>',
  simuler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
  donnees: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6"/><path d="M4.5 12v6c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
};

// ——— Utilitaires ———
const $ = (s, root = document) => root.querySelector(s);
const accById = id => data.accounts.find(a => a.id === id);
const lineById = id => data.lines.find(l => l.id === id);
const initials = s => (String(s || '?').replace(/[^\p{L}\p{N}\s&]/gu, ' ').trim().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w)).slice(0, 2).map(w => w[0]).join('') || String(s || '?')[0] || '?').toUpperCase();
const shortName = l => libraryFor(l.isin)?.short || l.name;
const isWide = () => matchMedia('(min-width: 1100px)').matches;
const today = () => new Date().toISOString().slice(0, 10);
function commit(msg) { data.updatedAt = new Date().toISOString(); if (!save(data) && !commit.warned) { commit.warned = true; toast('Stockage du navigateur indisponible : vos changements seront perdus en fermant la page.'); } else if (msg) toast(msg); render(); scheduleSync(); setTimeout(autoCompositions, 0); }

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3600);
}

// ——— Thème ———
function applyTheme() {
  const th = data.settings.theme;
  const root = document.documentElement;
  if (th === 'light' || th === 'dark') root.dataset.theme = th; else delete root.dataset.theme;
  const dark = th === 'dark' || (th !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', dark ? '#121010' : '#F5F1EB');
}

// ——— Rendu principal ———
function render() {
  setFetchedLibrary(data.compositions);
  applyTheme();
  const name = data.profile.firstName || '';
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false');
  for (const a of document.querySelectorAll('.avatar')) a.textContent = name ? name[0].toUpperCase() : 'C';
  const sideName = $('#side-name'); if (sideName) sideName.textContent = name || 'Votre profil';
  const v = $('#view');
  const fn = { patrimoine: viewHome, analyse: viewAnalyse, simuler: viewSimuler, donnees: viewData }[ui.tab] || viewHome;
  v.innerHTML = (data.demo ? demoBanner() : '') + fn();
  after[ui.tab]?.();
  setRefreshUI();
}
const after = {};

function demoBanner() {
  return `<div class="demo-banner"><span>Données d’exemple. Rien ici ne vous appartient.</span><button class="btn-pill light" data-action="clear-demo">Effacer l’exemple</button></div>`;
}

function headline(t) {
  const n = data.profile.firstName;
  const hi = n ? `Bonjour ${esc(n)},` : 'Bonjour,';
  if (t.cost > 0) {
    const up = t.gain >= 0;
    return `${hi} votre patrimoine est en ${up ? 'hausse' : 'baisse'} de <span class="hl ${up ? '' : 'down'}">${pct(Math.abs(t.gainPct))}</span>.`;
  }
  return `${hi} voici votre patrimoine.`;
}

// ——— Onglet Patrimoine ———
function viewHome() {
  if (!data.lines.length && !data.accounts.length) return emptyState();
  const t = totals(data);
  const parts = bigParts(t.total);
  const hero = `<section class="hero" aria-label="Patrimoine total">
    <div class="eyebrow">Patrimoine total</div>
    <div class="big num"><span>${parts.int}<span class="dec">,${parts.dec}</span></span><span class="unit">euros</span></div>
    <div class="pills">
      ${t.cost > 0 ? `<span class="pill"><span class="dotc"></span>${signedEur(t.gain)} de plus-value</span>` : ''}
      <span class="pill">${pct(t.equityPct, 0)} en actions</span>
      ${t.liquid > 0 ? `<span class="pill">${eur(t.liquid, 0)} d’espèces</span>` : ''}
    </div>
    <div class="meta">${t.cost > 0 ? `Plus-value latente de ${signedPct(t.gainPct)} sur ${eur(t.cost, 0)} investis.` : 'Ajoutez des placements pour suivre leur plus-value.'}</div>
  </section>`;
  const stale = staleCard();
  const chart = `<section class="card chart-card" aria-label="Évolution">
    <div class="chart-top"><h3>Évolution</h3>
      <div class="chips" role="group" aria-label="Période">${['1M', '6M', '1A', 'Tout'].map(r => `<button class="chip" data-action="range" data-v="${r}" aria-pressed="${ui.range === r}">${r}</button>`).join('')}</div>
    </div>
    <div class="chart-hover" id="chart-hover"></div>
    <div class="chart-host" id="chart-host"></div>
    <div class="legend"><span><i></i>Valeur</span><span><i class="dash"></i>Montant investi</span></div>
    ${Object.keys(data.priceHistory || {}).length ? '' : '<div class="chart-note">Courbe reconstruite à partir des prix de vos transactions. Actualisez les cours pour un historique complet.</div>'}
  </section>`;
  const accounts = `<div><div class="section-head"><h2>Comptes</h2><span class="aside">${t.accounts.length} compte${t.accounts.length > 1 ? 's' : ''}</span></div>
    <div class="accounts">${t.accounts.map(accountCard).join('') || '<p class="muted">Aucun compte.</p>'}</div></div>`;
  const envs = t.envelopes.filter(e => e.value > 0);
  const maxEnv = Math.max(...envs.map(e => e.value), 1);
  const envelopes = `<div><div class="section-head"><h2>Enveloppes</h2><span class="aside">part du total</span></div>
    <div class="card"><div class="env-chart">${envs.map((e, i) => `<div class="env ${i === 0 ? 'top' : ''}" title="${esc(e.name)} : ${eur(e.value)}">
      <span class="v">${pct(e.share, 0)}</span><span class="b" style="height:${Math.max(4, 100 * e.value / maxEnv * 0.78)}%"></span><span class="l">${esc(e.name)}</span></div>`).join('')}</div>
      <dl class="kv">${envs.map(e => `<dt>${esc(e.name)}</dt><dd>${eur(e.value, 0)}</dd>`).join('')}</dl></div></div>`;
  const lines = linesSection();
  if (isWide()) return `<h1 class="title">${headline(t)}<em>Ce que vous détenez, vraiment.</em></h1>
    <div class="grid-home"><div class="col">${hero}${chart}${lines}</div><div class="col">${stale}${accounts}${envelopes}</div></div>`;
  return `<h1 class="title">${headline(t)}<em>Ce que vous détenez, vraiment.</em></h1>
    <div class="grid-home">${hero}${stale}${chart}${accounts}${envelopes}${lines}</div>`;
}
after.patrimoine = () => {
  const host = $('#chart-host'); if (!host) return;
  const pts_ = buildHistory(data);
  const days = { '1M': 31, '6M': 183, '1A': 366, 'Tout': 1e6 }[ui.range];
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const shown = pts_.filter(p => p.d >= from);
  const hover = $('#chart-hover');
  const base = shown.length > 1 ? (() => { const a = shown[0], b = shown[shown.length - 1]; const d = b.value - a.value - (b.invested - a.invested); return `Sur la période : ${signedEur(d, 0)} hors versements`; })() : '';
  hover.textContent = base;
  lineChart(host, shown, { onHover: p => { hover.textContent = p ? hoverText(p) : base; } });
};

function staleCard() {
  const st = staleLines(data, new Date(), data.settings.staleDays || 4);
  if (!st.length) return '';
  if (data.settings.snoozeUntil && data.settings.snoozeUntil > new Date().toISOString()) return '';
  const oldest = st.map(l => l.priceDate).filter(Boolean).sort()[0];
  const n = st.length;
  return `<section class="night" aria-label="Cours à actualiser">
    <p class="lead">${n === 1 ? 'Un cours a' : n + ' cours ont'} plus de ${data.settings.staleDays || 4} jours.</p>
    <p class="sub">${oldest ? `Le plus ancien date du ${dateLong(oldest)}.` : 'Certains cours n’ont jamais été actualisés.'} Les montants affichés en dépendent.</p>
    <div class="row"><button class="btn-pill light refresh-btn" data-action="refresh"><span class="ic">${ICONS.refresh}</span>Actualiser</button><button class="btn-pill ghost" data-action="snooze">Plus tard</button></div>
  </section>`;
}

function accountCard(a) {
  const acc = a.account;
  const on = Math.round(a.share * 20);
  return `<button class="acc" data-action="open-account" data-id="${esc(acc.id)}">
    <span class="tile c-${esc(acc.color || 'ink')}">${esc(initials(acc.name))}</span>
    <span class="name">${esc(KINDS.find(k => k[0] === acc.kind)?.[1] || 'Compte')}</span><span class="val">${eur(a.value, 0)}</span>
    <span class="sub">${esc(acc.name)}${a.gain && Math.abs(a.gain) >= 0.5 ? ` · <span class="${a.gain >= 0 ? 'pos' : 'neg'}">${signedEur(a.gain, 0)}</span>` : ''}</span><span class="share">${pct(a.share, 0)}</span>
    <span class="segs" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i class="${i < on ? 'on c-' + esc(acc.color || 'ink') : ''}"></i>`).join('')}</span>
  </button>`;
}

function linesSection() {
  const envs = [...new Set(data.lines.map(l => l.envelope || 'Autre'))].sort((a, b) => ENVELOPE_ORDER.indexOf(a) - ENVELOPE_ORDER.indexOf(b));
  if (ui.filter !== 'all' && !envs.includes(ui.filter)) ui.filter = 'all';
  const ls = data.lines.filter(l => ui.filter === 'all' || (l.envelope || 'Autre') === ui.filter).sort((a, b) => lineValue(b) - lineValue(a));
  return `<div><div class="section-head"><h2>Lignes</h2><button class="linkish" data-action="add-line">Ajouter</button></div>
    <div class="filters" role="group" aria-label="Filtrer par enveloppe">
      <button class="filter" data-action="filter" data-v="all" aria-pressed="${ui.filter === 'all'}">Toutes</button>
      ${envs.map(e => `<button class="filter" data-action="filter" data-v="${esc(e)}" aria-pressed="${ui.filter === e}">${esc(e)}</button>`).join('')}
    </div>
    <div class="lines">${ls.map(lineRow).join('') || '<p class="muted" style="padding:16px">Aucune ligne.</p>'}</div></div>`;
}

function lineRow(l) {
  const acc = accById(l.accountId);
  const g = lineGain(l), c = lineCost(l);
  const stale = NEEDS_PRICE(l) && daysAgo(l.priceDate) > (data.settings.staleDays || 4);
  const sub = isCashLike(l) ? `${esc(acc?.name || '')} · ${esc(l.envelope || '')}` : l.estimateFromAmount ? `${esc(acc?.name || '')} · ${eur(l.cost)} investis` : `${esc(acc?.name || '')} · ${fqty(+l.qty.toFixed(l.qtyEstimated ? 3 : 6))} part${l.qty > 1 ? 's' : ''}${l.qtyEstimated ? ' (estim.)' : ''}${l.pending ? ' · ' + eur(l.pending, 0) + ' en attente' : ''}`;
  return `<button class="line" data-action="open-line" data-id="${esc(l.id)}">
    <span class="mono t-${esc(l.type)}">${esc(initials(shortName(l)))}</span>
    <span class="n">${esc(shortName(l))}${stale ? '<span class="badge warn">cours ancien</span>' : ''}</span><span class="v">${eur(lineValue(l))}</span>
    <span class="s">${sub}</span>
    <span class="g ${c > 0 && Math.abs(g / c) >= 0.0005 ? (g > 0 ? 'pos' : 'neg') : 'muted'}">${isCashLike(l) ? '<span class="muted">—</span>' : c > 0 ? signedPct(g / c) : ''}</span>
  </button>`;
}

function emptyState() {
  return `<div class="empty">
    <div class="orb" aria-hidden="true"><i class="ring"></i><i class="core"></i><i class="s1"></i><i class="s2"></i><i class="s3"></i></div>
    <div class="wordmark">Carnet<span class="dot">.</span></div>
    <h1 class="title" style="text-align:center;margin:6px auto 4px">Votre patrimoine, en un seul endroit.<em>Et seulement sur cet appareil.</em></h1>
    <p>Importez l’export de vos transactions Trade Republic, restaurez une sauvegarde, ou ajoutez vos comptes à la main.</p>
    <div class="btn-row">
      <button class="btn primary" data-action="pick-csv">${ICONS.upload}Importer un CSV Trade Republic</button>
      <button class="btn" data-action="pick-backup">Restaurer une sauvegarde</button>
      <button class="btn" data-action="add-account">${ICONS.plus}Ajouter un compte</button>
    </div>
    <button class="linkish" data-action="demo" style="margin-top:14px">Essayer avec des données d’exemple</button>
  </div>`;
}

// ——— Onglet Analyse ———
function viewAnalyse() {
  const t = totals(data);
  if (!data.lines.length) return `<h1 class="title">Où va votre argent.<em>Secteurs, pays et entreprises.</em></h1>${emptyHint()}`;
  const lt = lookthrough(data);
  const top10 = lt.companies.slice(0, 10).reduce((s, c) => s + c.value, 0);
  const first = lt.companies[0];
  const st = data.trStats;
  const tiles = [
    { k: 'Patrimoine total', v: eur(t.total, 0), d: `${t.count} ligne${t.count > 1 ? 's' : ''}`, feature: true },
    { k: 'Plus-value latente', v: signedEur(t.gain, 0), d: t.cost > 0 ? signedPct(t.gainPct) + ' sur ' + eur(t.cost, 0) : '—', cls: t.gain >= 0 ? 'pos' : 'neg' },
    { k: 'Part en actions', v: pct(t.equityPct, 0), d: eur(t.equity, 0) },
    { k: 'Espèces et livrets', v: eur(t.liquid, 0), d: pct(t.total ? t.liquid / t.total : 0, 0) + ' du total' },
    { k: 'Première entreprise', v: first ? esc(first.name) : '—', d: first ? `${eur(first.value, 0)} · ${pct(t.total ? first.value / t.total : 0)} du total` : '' },
    { k: '10 premières entreprises', v: pct(t.total ? top10 / t.total : 0), d: eur(top10, 0) + ' au total' },
    { k: 'Dividendes reçus', v: st ? eur(st.dividends) : '—', d: st ? 'Trade Republic, nets de retenue' : 'Après un import Trade Republic' },
    { k: 'Frais payés', v: st ? eur(st.fees) : '—', d: st ? `Trade Republic, depuis ${dateShort(st.from)} ${st.from.slice(0, 4)}` : 'Après un import Trade Republic' },
  ];
  const list = { sectors: lt.sectors, countries: lt.countries, companies: lt.companies.slice(0, 15) }[ui.analyse];
  const max = Math.max(...list.map(x => x.value), 1);
  return `<h1 class="title">Où va votre argent.<em>Secteurs, pays et entreprises, à travers vos fonds.</em></h1>
    <div class="tiles">${tiles.map(x => `<div class="tile-k ${x.feature ? 'feature' : ''}"><span class="k">${x.k}</span><span class="v ${x.cls || ''}">${x.v}</span><span class="d">${x.d}</span></div>`).join('')}</div>
    <div class="section-head"><h2>Répartition</h2><span class="aside">hors espèces · ${eur(lt.base, 0)}</span></div>
    <div class="card">
      <div class="seg" role="group" aria-label="Répartition">${[['sectors', 'Secteurs'], ['countries', 'Pays'], ['companies', 'Entreprises']].map(([k, l]) => `<button data-action="analyse" data-v="${k}" aria-pressed="${ui.analyse === k}">${l}</button>`).join('')}</div>
      <div class="bars">${list.map((x, i) => `<button class="barrow" data-action="open-split" data-v="${i}" aria-label="${esc(x.name)} : détail"><span class="n">${esc(x.name)}</span><span class="p"><b>${eur(x.value, 0)}</b>${pct(x.pct)}</span><span class="track"><i style="width:${(100 * x.value / max).toFixed(1)}%"></i></span></button>`).join('') || '<p class="muted">Rien à afficher.</p>'}</div>
      <p class="note">${ui.analyse === 'companies' ? 'Montants détenus à travers vos ETF (principales positions de chaque fonds) et en direct. ' : ''}${pct(lt.coverage, 0)} des placements sont ventilés ; le reste (non coté, fonds inconnus) apparaît en « Non ventilé » ou « Capital-investissement ». ${COMPOSITION_NOTE}</p>
    </div>`;
}
// Détail d'une case de la répartition : ce qui compose le montant, du plus gros au plus petit
const SPLIT_WORD = { sectors: 'du secteur', countries: 'du pays', companies: 'de la position' };
function openSplit(i) {
  const dim = ui.analyse;
  const lt = lookthrough(data);
  const x = lt[dim]?.[+i]; if (!x) return;
  const of = SPLIT_WORD[dim];
  const row = (p, r, sub) => `<div class="holding"><span class="r">${r}</span><span class="n">${esc(p.name)}</span><span class="a">${eur(p.value)}</span>
    <span class="w">${pct(p.pct)} ${of}${sub ? ' · ' + sub : ''}</span><span class="track"><i style="width:${(100 * Math.min(1, p.pct)).toFixed(1)}%"></i></span></div>`;
  const via = p => {
    if (!p.via.length) return '';
    if (p.via.length === 1) return p.via[0].name === DIRECT ? 'en direct' : 'via ' + esc(p.via[0].name);
    return 'via ' + p.via.map(v => `${v.name === DIRECT ? 'en direct' : esc(v.name)} ${eur(v.value, 0)}`).join(', ');
  };
  let body;
  if (dim === 'companies') {
    body = `<div class="section-head" style="margin-top:22px"><h2>Détenue à travers</h2><span class="aside">${x.parts.length} ligne${x.parts.length > 1 ? 's' : ''}</span></div>
      <div class="holdings">${x.parts.map((p, r) => row(p, r + 1, p.kind === 'direct' ? 'en direct' : `${pct(p.weight)} du fonds`)).join('')}</div>`;
  } else {
    const named = x.parts.filter(p => p.kind !== 'rest'), rest = x.parts.filter(p => p.kind === 'rest');
    const restSum = rest.reduce((s, p) => s + p.value, 0);
    body = `${named.length ? `<div class="section-head" style="margin-top:22px"><h2>${named.some(p => p.kind === 'company') ? 'Entreprises' : 'Lignes'}</h2><span class="aside">classées par montant</span></div>
      <div class="holdings">${named.map((p, r) => row(p, r + 1, p.kind === 'line' ? 'ligne entière' : via(p))).join('')}</div>` : ''}
      ${rest.length ? `<div class="section-head" style="margin-top:22px"><h2>Reste des fonds</h2><span class="aside">${eur(restSum, 0)} · ${pct(x.value ? restSum / x.value : 0)}</span></div>
      <p class="note" style="margin:0 2px 6px">Autres entreprises de ces fonds ${of === 'du pays' ? 'dans ce pays' : 'dans ce secteur'}, au-delà de leurs principales positions.</p>
      <div class="holdings">${rest.map(p => row(p, '·', 'autres positions du fonds')).join('')}</div>` : ''}`;
  }
  const label = { sectors: 'Secteur', countries: 'Pays', companies: 'Entreprise' }[dim];
  openSheet(`${sheetHead(esc(x.name), `${label} · ${pct(x.pct)} des placements hors espèces`)}
    <div class="detail-big">${eur(x.value)}</div>
    ${body}
    <p class="note">${COMPOSITION_NOTE}</p>`, { label: x.name });
}

function emptyHint() {
  return `<div class="card"><p class="muted" style="margin:0 0 12px">Aucune donnée pour l’instant.</p><div class="btn-row"><button class="btn primary" data-action="go" data-v="donnees">Importer ou ajouter des lignes</button></div></div>`;
}

// ——— Onglet Simuler ———
function simOptions() {
  const groups = data.accounts.map(a => {
    const ls = data.lines.filter(l => l.accountId === a.id && !isCashLike(l));
    if (!ls.length) return '';
    return `<optgroup label="${esc(a.name)}">${ls.map(l => `<option value="${esc(l.id)}" ${ui.sim.lineId === l.id ? 'selected' : ''}>${esc(shortName(l))} · ${eur(lineValue(l), 0)}</option>`).join('')}</optgroup>`;
  }).join('');
  const lib = libraryChoices().map(c => `<option value="new:${c.isin}" ${ui.sim.lineId === 'new:' + c.isin ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return groups + `<optgroup label="Nouvelle ligne">${lib}<option value="new:custom" ${ui.sim.lineId === 'new:custom' ? 'selected' : ''}>Autre produit…</option></optgroup>`;
}
function viewSimuler() {
  if (!data.accounts.length) return `<h1 class="title">Et si vous…<em>achetiez ou vendiez, avant de le faire.</em></h1>${emptyHint()}`;
  const s = ui.sim;
  if (!s.lineId) { const first = data.lines.filter(l => !isCashLike(l)).sort((a, b) => lineValue(b) - lineValue(a))[0]; s.lineId = first ? first.id : 'new:IE0002XZSHO1'; }
  const isNew = s.lineId.startsWith('new:');
  if (isNew) s.mode = 'buy';
  const line = isNew ? null : lineById(s.lineId);
  if (!s.price) s.price = line && line.price ? String(+line.price.toFixed(4)).replace('.', ',') : '';
  if (!s.accountId || !accById(s.accountId)) s.accountId = data.accounts[0].id;
  return `<h1 class="title">Et si vous…<em>achetiez ou vendiez, avant de le faire.</em></h1>
  <div class="sim-grid">
    <form class="card form" id="sim-form" autocomplete="off">
      <div class="seg" role="group" aria-label="Opération">
        <button type="button" data-action="sim-mode" data-v="buy" aria-pressed="${s.mode === 'buy'}">Achat</button>
        <button type="button" data-action="sim-mode" data-v="sell" aria-pressed="${s.mode === 'sell'}" ${isNew ? 'disabled' : ''}>Vente</button>
      </div>
      <label class="field"><span>Produit</span><select class="input" id="sim-line" data-sim="lineId">${simOptions()}</select></label>
      ${isNew ? `
        ${s.lineId === 'new:custom' ? `<div class="row2"><label class="field"><span>Nom</span><input class="input" id="sim-newname" data-sim="newName" value="${esc(s.newName)}" placeholder="ex. Fonds Linxea"></label>
        <label class="field"><span>ISIN</span><input class="input" id="sim-newisin" data-sim="newIsin" value="${esc(s.newIsin)}" placeholder="facultatif"></label></div>` : ''}
        <label class="field"><span>Sur le compte</span><select class="input" id="sim-acc" data-sim="accountId">${data.accounts.map(a => `<option value="${esc(a.id)}" ${s.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : ''}
      <div class="seg" role="group" aria-label="Saisir"><button type="button" data-action="sim-by" data-v="amount" aria-pressed="${s.by === 'amount'}">Montant</button><button type="button" data-action="sim-by" data-v="qty" aria-pressed="${s.by === 'qty'}">Quantité</button></div>
      <div class="row2">
        ${s.by === 'amount' ? `<label class="field"><span>Montant (€)</span><input class="input" id="sim-amount" inputmode="decimal" data-sim="amount" value="${esc(s.amount)}"></label>`
          : `<label class="field"><span>Quantité</span><input class="input" id="sim-qty" inputmode="decimal" data-sim="qty" value="${esc(s.qty)}"></label>`}
        <label class="field"><span>Prix unitaire (€)</span><input class="input" id="sim-price" inputmode="decimal" data-sim="price" value="${esc(s.price)}" placeholder="cours"></label>
      </div>
      <div class="row2"><label class="field"><span>Frais (€)</span><input class="input" id="sim-fees" inputmode="decimal" data-sim="fees" value="${esc(s.fees)}"></label><span></span></div>
      <label class="check"><input type="checkbox" id="sim-cash" data-sim="useCash" ${s.useCash ? 'checked' : ''}><span>${s.mode === 'buy' ? 'Payer avec les espèces du compte' : 'Garder le produit de la vente en espèces sur le compte'}</span></label>
      ${line ? `<p class="small muted" style="margin:0">Vous détenez ${fqty(line.qty)} parts, prix de revient ${eur(pru(line))}, cours ${eur(line.price)} (${dateShort(line.priceDate)}).</p>` : ''}
    </form>
    <div id="sim-out">${simResult()}</div>
  </div>`;
}
function simParams() {
  const s = ui.sim;
  const price = parseNum(s.price);
  const q = s.by === 'qty' ? parseNum(s.qty) : (parseNum(s.amount) / price);
  const isNew = s.lineId.startsWith('new:');
  const isin = isNew ? (s.lineId === 'new:custom' ? s.newIsin.trim().toUpperCase() : s.lineId.slice(4)) : '';
  return { mode: s.mode, lineId: isNew ? '' : s.lineId, isin, name: isNew && s.lineId === 'new:custom' ? s.newName : '', accountId: s.accountId, qty: q, price, fees: parseNum(s.fees) || 0, useCash: s.useCash, taxRate: data.settings.taxRate };
}
function simResult() {
  const r = simulate(data, simParams());
  if (!r.ok) return `<div class="card"><p class="muted" style="margin:0">${esc(r.error)}</p></div>`;
  const b = r.before.t, a = r.after.t;
  const p = simParams();
  const row = (k, from, to, x = '') => `<div class="cmp"><span class="k">${k}</span><span class="v"><span class="from">${from}</span>→ ${to}</span>${x ? `<span class="x">${x}</span>` : ''}</div>`;
  const deltas = r.deltas.sectors.filter(d => Math.abs(d.delta) >= 0.001).slice(0, 4);
  const cdeltas = r.deltas.countries.filter(d => Math.abs(d.delta) >= 0.001).slice(0, 4);
  return `<div class="card">
    <div class="eyebrow">${p.mode === 'buy' ? 'Achat' : 'Vente'} de ${fqty(p.qty)} part${p.qty > 1 ? 's' : ''} · ${eur(p.qty * p.price)}</div>
    <div class="compare" style="margin-top:6px">
      ${row('Patrimoine total', eur(b.total, 0), eur(a.total, 0), p.useCash || p.mode === 'sell' ? '' : 'L’achat est compté comme un nouvel apport.')}
      ${row('Part en actions', pct(b.equityPct), pct(a.equityPct), pts(a.equityPct - b.equityPct))}
      ${row('Poids de la ligne', pct(r.weightBefore), pct(r.weightAfter))}
      ${p.mode === 'buy' ? row('Prix de revient unitaire', r.line.prevQty ? eur(r.line.prevPru) : '—', eur(r.line.pru)) : row('Parts restantes', fqty(r.line.prevQty), fqty(r.line.qty))}
      ${row('Espèces', eur(b.cash, 0), eur(a.cash, 0))}
      ${p.mode === 'sell' ? `<div class="cmp"><span class="k">Plus-value réalisée</span><span class="v ${r.realized >= 0 ? 'pos' : 'neg'}">${signedEur(r.realized)}</span></div>
        <div class="cmp"><span class="k">Impôt estimé</span><span class="v">${eur(r.tax)}</span><span class="x">${esc(r.taxNote)}</span></div>` : ''}
    </div>
    ${r.warnings.map(w => `<div class="callout warn" style="margin-top:10px">${esc(w)}</div>`).join('')}
  </div>
  ${deltas.length || cdeltas.length ? `<div class="card" style="margin-top:14px"><h3>Ce qui bouge</h3>
    ${deltas.length ? `<div class="eyebrow" style="margin-top:12px">Secteurs</div><div class="compare">${deltas.map(d => row(esc(d.name), pct(d.before), pct(d.after), pts(d.delta))).join('')}</div>` : ''}
    ${cdeltas.length ? `<div class="eyebrow" style="margin-top:12px">Pays</div><div class="compare">${cdeltas.map(d => row(esc(d.name), pct(d.before), pct(d.after), pts(d.delta))).join('')}</div>` : ''}
    <p class="note">Parts calculées hors espèces, avec la composition indicative des fonds.</p></div>` : ''}`;
}

// ——— Onglet Données ———
function viewData() {
  const st = data.trStats;
  const server = { ok: '<span class="status ok"><i></i>Serveur Carnet joignable</span>', off: '<span class="status off"><i></i>Serveur Carnet absent : actualisation indisponible</span>', preview: '<span class="status off"><i></i>Aperçu en ligne : pas de serveur, actualisation indisponible</span>', unknown: '<span class="status"><i></i>Vérification du serveur…</span>' }[ui.server];
  const th = data.settings.theme;
  return `<h1 class="title">Vos données, chez vous.<em>${syncState() ? 'Chiffrées avant de partir.' : 'Rien ne quitte cet appareil.'}</em></h1>
  <div class="data-grid">
    <div class="col">
      <section class="card"><h3>Profil</h3><p class="lead">Le prénom s’affiche dans le titre de l’accueil.</p>
        <form class="form" data-form="profile"><label class="field"><span>Prénom</span><input class="input" id="pf-name" name="firstName" value="${esc(data.profile.firstName)}" autocomplete="given-name" maxlength="40"></label>
        <div class="btn-row"><button class="btn primary sm" type="submit">Enregistrer</button></div></form></section>

      <section class="card"><h3>Apparence</h3><p class="lead">Le mode automatique suit le réglage de l’appareil.</p>
        <div class="seg" role="group" aria-label="Thème">${[['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([k, l]) => `<button data-action="theme" data-v="${k}" aria-pressed="${th === k}">${l}</button>`).join('')}</div></section>

      <section class="card"><h3>Trade Republic</h3>
        <p class="lead">Exportez vos transactions depuis Trade Republic au format CSV (« Exportation de transactions »), puis importez le fichier ici. Un nouvel import remplace les lignes Trade Republic et garde vos lignes manuelles.</p>
        <div class="btn-row"><button class="btn primary" data-action="pick-csv">${ICONS.upload}Importer le CSV</button></div>
        ${st ? `<dl class="kv"><dt>Dernier import</dt><dd>${dateLong(data.imports?.[data.imports.length - 1]?.at?.slice(0, 10))}</dd>
          <dt>Opérations lues</dt><dd>${num(st.rows, 0)}</dd><dt>Période</dt><dd>${dateShort(st.from)} ${st.from.slice(0, 4)} → ${dateShort(st.to)} ${st.to.slice(0, 4)}</dd>
          ${Object.entries(st.cash || {}).map(([id, v]) => `<dt>Espèces ${esc(accById(id)?.name || id)}</dt><dd>${eur(v)}</dd>`).join('')}</dl>
          <p class="note">Le solde espèces est recalculé à partir de toutes les opérations (montant + frais + taxes). Comparez-le avec le solde affiché dans l’app Trade Republic.</p>` : ''}
      </section>

      <section class="card"><h3>Cours</h3><p class="lead">Le bouton d’actualisation récupère sur Yahoo Finance, via le serveur Carnet, le cours du jour et l’historique (5 ans) de chaque produit coté. Seuls les symboles sont envoyés, jamais vos quantités ni vos montants.</p>
        <p style="margin:0 0 12px">${server}</p>
        <div class="btn-row"><button class="btn refresh-btn" data-action="refresh" ${ui.busy ? 'disabled' : ''}><span class="ic">${ICONS.refresh}</span><span class="r-long">Actualiser les cours</span></button></div>
        ${refreshReport()}
        <label class="field" style="margin-top:14px"><span>Taux d’imposition des plus-values hors PEA (%)</span><input class="input" id="tax-rate" data-setting="taxRate" inputmode="decimal" value="${num(data.settings.taxRate, 1)}"><small>31,4 % en 2026 (prélèvement forfaitaire unique). Utilisé par le simulateur.</small></label>
      </section>
    </div>
    <div class="col">
      <section class="card"><h3>Comptes</h3><p class="lead">Ajoutez par exemple vos comptes Caisse d’Épargne (solde) ou votre assurance-vie Linxea (lignes).</p>
        <div class="list">${data.accounts.map(a => { const v = data.lines.filter(l => l.accountId === a.id).reduce((s, l) => s + lineValue(l), 0); return `<div class="list-item"><span class="tile c-${esc(a.color || 'ink')}">${esc(initials(a.name))}</span><span><span class="n">${esc(a.name)}</span><br><span class="s">${esc(KINDS.find(k => k[0] === a.kind)?.[1] || '')} · ${eur(v, 0)}</span></span><button class="btn sm" data-action="edit-account" data-id="${esc(a.id)}">Modifier</button></div>`; }).join('') || '<p class="muted small">Aucun compte.</p>'}</div>
        <div class="btn-row" style="margin-top:12px"><button class="btn" data-action="add-account">${ICONS.plus}Ajouter un compte</button><button class="btn" data-action="add-line" ${data.accounts.length ? '' : 'disabled'}>${ICONS.plus}Ajouter une ligne</button></div>
      </section>

      ${syncCard()}

      <section class="card"><h3>Sauvegarde</h3><p class="lead">Un fichier à garder de côté, ou à restaurer sur un appareil sans synchronisation.</p>
        <div class="btn-row"><button class="btn" data-action="export-plain" ${data.lines.length ? '' : 'disabled'}>${ICONS.download}Exporter en clair</button><button class="btn" data-action="export-enc" ${data.lines.length ? '' : 'disabled'}>${ICONS.lock}Exporter chiffrée</button></div>
        <div class="btn-row" style="margin-top:8px"><button class="btn primary" data-action="pick-backup">${ICONS.upload}Restaurer une sauvegarde</button></div>
        <p class="note">La sauvegarde chiffrée utilise AES-GCM 256 bits avec une clé tirée de votre phrase de passe (PBKDF2, 310 000 itérations). Sans la phrase, le fichier est illisible : rien ne permet de la retrouver.</p>
      </section>

      <section class="card"><h3>Effacer</h3><p class="lead">Supprime toutes les données de Carnet sur cet appareil. Pensez à exporter avant.</p>
        <button class="btn danger" data-action="wipe">Effacer toutes les données</button>
        <p class="note">Carnet ${VERSION}. ${storageWorks() ? 'Stockage local actif.' : 'Stockage local bloqué par le navigateur : les données ne survivront pas à la fermeture.'}</p>
      </section>
    </div>
  </div>`;
}

// ——— Fenêtres du bas ———
let sheetStack = [];
function openSheet(html, { onMount, onClose, label = 'Fenêtre' } = {}) {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', label);
  sh.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html;
  document.body.append(scrim, sh);
  const prevFocus = document.activeElement;
  const close = () => {
    sh.classList.remove('open'); scrim.classList.remove('open');
    sheetStack = sheetStack.filter(s => s.sh !== sh);
    setTimeout(() => { sh.remove(); scrim.remove(); }, 320);
    onClose && onClose();
    prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true });
  };
  scrim.addEventListener('click', close);
  sh.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  sheetStack.push({ sh, close });
  requestAnimationFrame(() => { scrim.classList.add('open'); sh.classList.add('open'); const f = sh.querySelector('input:not([type=hidden]),select,textarea'); if (f && matchMedia('(min-width: 720px)').matches) f.focus({ preventScroll: true }); else sh.querySelector('.close')?.focus({ preventScroll: true }); });
  onMount && onMount(sh, close);
  return close;
}
const sheetHead = (title, sub = '') => `<div class="sheet-head"><h2>${title}${sub ? `<em>${sub}</em>` : ''}</h2><button class="icon-btn close" data-close aria-label="Fermer">${ICONS.close}</button></div>`;

function confirmSheet({ title, text, ok = 'Confirmer', danger = false }) {
  return new Promise(res => {
    let done = false;
    openSheet(`${sheetHead(title)}<p class="muted" style="margin-top:0">${text}</p><div class="btn-row"><button class="btn ${danger ? 'danger solid' : 'primary'}" data-ok>${ok}</button><button class="btn" data-close>Annuler</button></div>`, {
      label: title,
      onMount: (sh, close) => sh.querySelector('[data-ok]').addEventListener('click', () => { done = true; res(true); close(); }),
      onClose: () => { if (!done) res(false); },
    });
  });
}
function choiceSheet({ title, text, choices }) {
  return new Promise(res => {
    let done = false;
    openSheet(`${sheetHead(title)}<p class="muted" style="margin-top:0">${text}</p><div class="btn-row">${choices.map(([k, l, cls]) => `<button class="btn ${cls}" data-choice="${k}">${l}</button>`).join('')}<button class="btn" data-close>Annuler</button></div>`, {
      label: title,
      onMount: (sh, close) => sh.addEventListener('click', e => { const c = e.target.closest('[data-choice]'); if (c) { done = true; res(c.dataset.choice); close(); } }),
      onClose: () => { if (!done) res(null); },
    });
  });
}
function passSheet({ title, confirm }) {
  return new Promise(res => {
    let done = false;
    openSheet(`${sheetHead(title, confirm ? 'Choisissez une phrase dont vous vous souviendrez.' : '')}
      <form class="form" autocomplete="off"><label class="field"><span>Phrase de passe</span><input class="input" type="password" id="pp1" autocomplete="new-password" minlength="${confirm ? 8 : 1}" required></label>
      ${confirm ? '<label class="field"><span>Encore une fois</span><input class="input" type="password" id="pp2" autocomplete="new-password" required></label>' : ''}
      <p class="small neg" id="pp-err" hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${confirm ? 'Chiffrer et exporter' : 'Déchiffrer'}</button><button class="btn" type="button" data-close>Annuler</button></div></form>`, {
      label: title,
      onMount: (sh, close) => {
        sh.querySelector('#pp1').focus();
        sh.querySelector('form').addEventListener('submit', e => {
          e.preventDefault();
          const a = sh.querySelector('#pp1').value, b = sh.querySelector('#pp2')?.value;
          const err = sh.querySelector('#pp-err');
          if (confirm && a.length < 8) { err.textContent = 'Au moins 8 caractères.'; err.hidden = false; return; }
          if (confirm && a !== b) { err.textContent = 'Les deux phrases ne sont pas identiques.'; err.hidden = false; return; }
          done = true; res(a); close();
        });
      },
      onClose: () => { if (!done) res(null); },
    });
  });
}

function openLine(id) {
  const l = lineById(id); if (!l) return;
  const acc = accById(l.accountId);
  const comp = lineComposition(l);
  const v = lineValue(l), g = lineGain(l), c = lineCost(l);
  const lib = libraryFor(l.isin);
  const stats = isCashLike(l) ? `<div class="stat"><div class="k">Type</div><div class="v">${esc(TYPE_LABEL[l.type] || l.type)}</div></div><div class="stat"><div class="k">Enveloppe</div><div class="v">${esc(l.envelope || '—')}</div></div>`
    : `<div class="stat"><div class="k">Quantité</div><div class="v">${fqty(l.qty)}</div></div>
      <div class="stat"><div class="k">Prix de revient</div><div class="v">${eur(pru(l))}</div></div>
      <div class="stat"><div class="k">Cours</div><div class="v">${eur(l.price)}<br><span class="small muted">${l.priceDate ? dateLong(l.priceDate) : 'jamais actualisé'}${l.priceSource === 'transaction' ? ' · prix de transaction' : l.priceSource === 'yahoo' ? ' · Yahoo' : ''}</span></div></div>
      <div class="stat"><div class="k">Plus-value</div><div class="v ${Math.abs(g) < 0.5 ? '' : g > 0 ? 'pos' : 'neg'}">${signedEur(g)}<br><span class="small">${c > 0 ? signedPct(g / c) : ''}</span></div></div>
      ${l.pending ? `<div class="stat"><div class="k">Versements en attente</div><div class="v">${eur(l.pending)}</div></div>` : ''}
      <div class="stat"><div class="k">Identifiant</div><div class="v small">${esc(l.isin || '—')}${l.ticker ? '<br><span class="muted">' + esc(l.ticker) + '</span>' : ''}</div></div>`;
  const holdings = comp ? `<div class="section-head" style="margin-top:22px"><h2>Principales entreprises</h2><span class="aside">${esc(comp.index)}</span></div>
    <div class="holdings">${comp.holdings.map((h, i) => `<div class="holding"><span class="r">${i + 1}</span><span class="n">${esc(h.name)}</span><span class="a">${eur(h.amount)}</span><span class="w">${pct(h.weight)} du fonds · ${esc(h.sector)} · ${esc(h.country)}</span></div>`).join('')}</div>
    <div class="section-head"><h2>Pays</h2></div><div class="bars" style="margin-top:0">${comp.countries.slice(0, 6).map(x => `<div class="barrow"><span class="n">${esc(x.name)}</span><span class="p"><b>${eur(v * x.pct, 0)}</b>${pct(x.pct)}</span><span class="track"><i style="width:${(100 * x.pct / comp.countries[0].pct).toFixed(1)}%"></i></span></div>`).join('')}</div>
    <p class="note">${COMPOSITION_NOTE}</p>`
    : (!isCashLike(l) && l.type === 'etf' ? '<p class="note">Composition non disponible pour ce fonds.</p>' : '');
  openSheet(`${sheetHead(esc(shortName(l)), esc((acc?.name || '') + ' · ' + (l.envelope || '')))}
    ${lib && lib.name !== shortName(l) ? `<p class="small muted" style="margin:-8px 0 10px">${esc(lib.name)}</p>` : ''}
    <div class="detail-big">${eur(v)}</div>
    ${l.qtyEstimated || l.estimateFromAmount ? `<div class="callout" style="margin-top:12px">${l.estimateFromAmount ? 'Montant investi connu, quantité pas encore calculée : elle le sera à la prochaine actualisation, avec la valeur liquidative du jour de souscription.' : 'Quantité estimée à partir du montant investi et de la valeur liquidative du jour de souscription. Remplacez-la par celle de votre relevé quand vous l’aurez (Modifier).'}</div>` : ''}
    <div class="stat-grid">${stats}</div>
    ${priceSection(l)}
    <div class="btn-row"><button class="btn primary sm" data-act="edit">Modifier</button>${isCashLike(l) ? '' : '<button class="btn sm" data-act="sim">Simuler un achat ou une vente</button>'}<button class="btn sm danger" data-act="del">Supprimer</button></div>
    ${holdings}`, {
    label: shortName(l),
    onMount: (sh, close) => { drawLineChart(sh, l); sh.addEventListener('click', async e => {
      const rg = e.target.closest('[data-lrange]');
      if (rg) { ui.lineRange = rg.dataset.lrange; sh.querySelectorAll('[data-lrange]').forEach(b => b.setAttribute('aria-pressed', b === rg)); drawLineChart(sh, l); return; }
      const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
      if (a === 'edit') { close(); setTimeout(() => lineForm(l.id), 200); }
      if (a === 'sim') { close(); ui.sim.lineId = l.id; ui.sim.price = l.price ? String(+l.price.toFixed(4)).replace('.', ',') : ''; ui.sim.mode = 'buy'; go('simuler'); }
      if (a === 'del') {
        if (await confirmSheet({ title: 'Supprimer cette ligne ?', text: `${esc(shortName(l))} (${eur(v)}) sera retirée de cet appareil.${l.source === 'tr' ? ' Elle reviendra au prochain import Trade Republic.' : ''}`, ok: 'Supprimer', danger: true })) {
          data.lines = data.lines.filter(x => x.id !== l.id); close(); commit('Ligne supprimée.');
        }
      }
    }); },
  });
}

// Courbe du cours d'un produit (historique récupéré à l'actualisation)
const LRANGES = [['1M', 31], ['6M', 183], ['1A', 366], ['5A', 1830]];
function priceSection(l) {
  if (isCashLike(l)) return '';
  const h = l.ticker && data.priceHistory?.[l.ticker];
  if (!h || h.length < 2) return `<p class="note" style="margin:0 2px 14px">${l.type === 'non-cote' ? 'Pas de cours public pour ce fonds non coté.' : 'L’historique du cours apparaîtra après une actualisation (bouton en haut de l’écran).'}</p>`;
  return `<section class="card chart-card" style="margin:0 0 14px;padding:16px 12px 10px">
    <div class="chart-top"><h3>Cours</h3><div class="chips" role="group" aria-label="Période">${LRANGES.map(([k]) => `<button class="chip" data-lrange="${k}" aria-pressed="${ui.lineRange === k}">${k}</button>`).join('')}</div></div>
    <div class="chart-hover" data-lhover></div><div class="chart-host" data-lhost></div>
    <div class="legend"><span><i></i>Cours</span><span><i class="dash"></i>Prix de revient</span></div>
    <div class="chart-note">Source : Yahoo Finance (${esc(l.ticker)}), en euros.</div></section>`;
}
function drawLineChart(sh, l) {
  const host = sh.querySelector('[data-lhost]'); if (!host) return;
  const h = data.priceHistory[l.ticker];
  const days = (LRANGES.find(r => r[0] === ui.lineRange) || LRANGES[2])[1];
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const p0 = l.qty ? pru(l) : 0;
  const pts_ = h.filter(x => x[0] >= from).map(([d, c]) => ({ d, value: c, invested: p0 || c }));
  if (l.priceDate && l.price && (!pts_.length || pts_[pts_.length - 1].d < l.priceDate)) pts_.push({ d: l.priceDate, value: l.price, invested: p0 || l.price });
  const hover = sh.querySelector('[data-lhover]');
  const base = pts_.length > 1 ? `${signedPct(pts_[pts_.length - 1].value / pts_[0].value - 1)} sur la période · ${eur(pts_[pts_.length - 1].value)}` : '';
  hover.textContent = base;
  requestAnimationFrame(() => lineChart(host, pts_, { decimals: true, onHover: p => { hover.textContent = p ? `${dateLong(p.d)} · ${eur(p.value)}` : base; } }));
}

function openAccount(id) {
  const a = accById(id); if (!a) return;
  const ls = data.lines.filter(l => l.accountId === id).sort((x, y) => lineValue(y) - lineValue(x));
  const v = ls.reduce((s, l) => s + lineValue(l), 0);
  openSheet(`${sheetHead(esc(a.name), esc(KINDS.find(k => k[0] === a.kind)?.[1] || ''))}
    <div class="detail-big">${eur(v)}</div>
    <div class="lines" style="margin:14px 0">${ls.map(lineRow).join('') || '<p class="muted" style="padding:16px;margin:0">Aucune ligne sur ce compte.</p>'}</div>
    <div class="btn-row"><button class="btn primary sm" data-act="add">${ICONS.plus}Ajouter une ligne</button><button class="btn sm" data-act="edit">Modifier le compte</button></div>`, {
    label: a.name,
    onMount: (sh, close) => sh.addEventListener('click', e => {
      const row = e.target.closest('[data-action="open-line"]');
      if (row) { e.stopPropagation(); close(); setTimeout(() => openLine(row.dataset.id), 200); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'add') { close(); setTimeout(() => lineForm(null, id), 200); }
      if (act === 'edit') { close(); setTimeout(() => accountForm(id), 200); }
    }),
  });
}

function accountForm(id) {
  const a = id ? accById(id) : null;
  const cash = a ? data.lines.find(l => l.accountId === a.id && (l.type === 'especes' || l.type === 'livret')) : null;
  const kind = a?.kind || 'courant';
  openSheet(`${sheetHead(a ? 'Modifier le compte' : 'Nouveau compte', a ? '' : 'Un solde, un livret, un contrat d’assurance-vie…')}
    <form class="form" autocomplete="off">
      <label class="field"><span>Nom</span><input class="input" id="ac-name" name="name" required maxlength="60" value="${esc(a?.name || '')}" placeholder="ex. Caisse d’Épargne"></label>
      <div class="row2"><label class="field"><span>Établissement</span><input class="input" id="ac-inst" name="institution" maxlength="60" value="${esc(a?.institution || '')}" placeholder="facultatif"></label>
      <label class="field"><span>Type</span><select class="input" id="ac-kind" name="kind">${KINDS.map(([k, l]) => `<option value="${k}" ${kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label class="field" id="ac-bal-wrap"><span>Solde actuel (€)</span><input class="input" id="ac-bal" name="balance" inputmode="decimal" value="${cash ? num(cash.amount) : ''}" placeholder="0,00"><small>Pour un compte courant ou un livret. Pour une assurance-vie ou un compte-titres, ajoutez ensuite des lignes.</small></label>
      <div class="field"><span>Couleur</span><div class="swatches">${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${(a?.color || 'blue') === c ? 'checked' : ''} aria-label="${c}"><span class="tile c-${c}" style="width:34px;height:34px"></span></label>`).join('')}</div></div>
      <p class="small neg" id="ac-err" hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${a ? 'Enregistrer' : 'Créer le compte'}</button>${a ? '<button class="btn danger" type="button" data-act="del">Supprimer le compte</button>' : ''}</div>
    </form>`, {
    label: 'Compte',
    onMount: (sh, close) => {
      const form = sh.querySelector('form');
      const sync = () => { const k = form.kind.value; sh.querySelector('#ac-bal-wrap').hidden = !(k === 'courant' || k === 'livret' || cash); };
      form.kind.addEventListener('change', sync); sync();
      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = form.name.value.trim();
        const err = sh.querySelector('#ac-err');
        if (!name) { err.textContent = 'Donnez un nom au compte.'; err.hidden = false; return; }
        const balRaw = form.balance.value.trim();
        const bal = balRaw ? parseNum(balRaw) : null;
        if (balRaw && !isFinite(bal)) { err.textContent = 'Le solde doit être un nombre, par exemple 1 250,40.'; err.hidden = false; return; }
        const acc = a || { id: 'acc-' + Date.now().toString(36), source: 'manual' };
        Object.assign(acc, { name, institution: form.institution.value.trim(), kind: form.kind.value, color: form.color.value });
        if (!a) data.accounts.push(acc);
        if (bal !== null) {
          const isLiv = acc.kind === 'livret';
          if (cash) { cash.amount = bal; cash.price = bal; cash.cost = bal; cash.priceDate = today(); }
          else data.lines.push({ id: 'ln-' + Date.now().toString(36), source: 'manual', accountId: acc.id, type: isLiv ? 'livret' : 'especes', envelope: isLiv ? 'Livrets' : 'Espèces', name: isLiv ? 'Livret' : 'Solde', qty: 1, amount: bal, price: bal, cost: bal, priceDate: today(), equity: 0, pending: 0, events: [], since: today() });
        }
        if (a) for (const l of data.lines) if (l.accountId === acc.id && l.source !== 'tr' && !isCashLike(l)) l.envelope = envelopeForAccount(acc);
        close(); commit(a ? 'Compte mis à jour.' : 'Compte créé.');
      });
      sh.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
        const n = data.lines.filter(l => l.accountId === a.id).length;
        if (await confirmSheet({ title: 'Supprimer ce compte ?', text: `${esc(a.name)} et ses ${n} ligne${n > 1 ? 's' : ''} seront retirés de cet appareil.`, ok: 'Supprimer', danger: true })) {
          data.accounts = data.accounts.filter(x => x.id !== a.id); data.lines = data.lines.filter(l => l.accountId !== a.id); close(); commit('Compte supprimé.');
        }
      });
    },
  });
}

function lineForm(id, accountId) {
  const l = id ? lineById(id) : null;
  if (!data.accounts.length) { accountForm(); return; }
  const accId = l?.accountId || accountId || data.accounts[0].id;
  const type = l?.type || (accById(accId)?.kind === 'av' ? 'fonds' : 'etf');
  const sectorOpts = Object.entries(SECTORS).map(([k, v]) => `<option value="${k}" ${l?.lookthrough?.sector === k ? 'selected' : ''}>${v}</option>`).join('');
  openSheet(`${sheetHead(l ? 'Modifier la ligne' : 'Nouvelle ligne', l?.source === 'tr' ? 'Ligne importée : un nouvel import remplacera quantité et prix de revient.' : '')}
    <form class="form" autocomplete="off" novalidate>
      <div class="row2"><label class="field"><span>Compte</span><select class="input" id="lf-acc" name="accountId">${data.accounts.map(a => `<option value="${esc(a.id)}" ${a.id === accId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Type</span><select class="input" id="lf-type" name="type">${TYPES.map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <label class="field"><span>Nom</span><input class="input" id="lf-name" name="name" required maxlength="80" value="${esc(l?.name || '')}" placeholder="ex. Fonds euros Linxea Spirit"></label>
      <div class="row2" data-show="market"><label class="field"><span>ISIN</span><input class="input" id="lf-isin" name="isin" maxlength="20" value="${esc(l?.isin || '')}" placeholder="ex. FR0010315770"></label>
      <label class="field"><span>Symbole Yahoo</span><input class="input" id="lf-ticker" name="ticker" maxlength="20" value="${esc(l?.ticker || '')}" placeholder="trouvé via l’ISIN"></label></div>
      <div class="row2" data-show="market"><label class="field"><span>Quantité</span><input class="input" id="lf-qty" name="qty" inputmode="decimal" value="${l && !isCashLike(l) ? num(l.qty, 6).replace(/,?0+$/, '') : ''}"></label>
      <label class="field"><span>Prix de revient unitaire (€)</span><input class="input" id="lf-pru" name="pru" inputmode="decimal" value="${l && !isCashLike(l) && l.qty ? num(pru(l), 4) : ''}"></label></div>
      <div class="row2" data-show="market"><label class="field"><span>Cours actuel (€)</span><input class="input" id="lf-price" name="price" inputmode="decimal" value="${l && !isCashLike(l) ? num(l.price, 4) : ''}"><small>Mis à jour à l’actualisation si un symbole est connu.</small></label>
      <label class="field"><span>Part en actions (%)</span><input class="input" id="lf-eq" name="equity" inputmode="decimal" value="${l ? num((l.equity ?? 1) * 100, 0) : '100'}"></label></div>
      <label class="field" data-show="cash"><span>Montant (€)</span><input class="input" id="lf-amount" name="amount" inputmode="decimal" value="${l && isCashLike(l) ? num(l.amount) : ''}"></label>
      <div class="row2" data-show="action"><label class="field"><span>Secteur</span><select class="input" id="lf-sector" name="sector"><option value="">—</option>${sectorOpts}</select></label>
      <label class="field"><span>Pays</span><input class="input" id="lf-country" name="country" maxlength="40" value="${esc(l?.lookthrough?.country || '')}" placeholder="ex. France"></label></div>
      <label class="field"><span>Détenu depuis</span><input class="input" type="date" id="lf-since" name="since" value="${esc(l?.since || (l?.events?.[0]?.[0]) || today())}"><small>Sert à placer la ligne sur la courbe d’évolution.</small></label>
      <p class="small neg" id="lf-err" hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${l ? 'Enregistrer' : 'Ajouter la ligne'}</button><button class="btn" type="button" data-close>Annuler</button></div>
    </form>`, {
    label: 'Ligne',
    onMount: (sh, close) => {
      const f = sh.querySelector('form');
      const sync = () => {
        const t = f.type.value, cash = ['especes', 'livret', 'fonds-euros'].includes(t);
        sh.querySelectorAll('[data-show="market"]').forEach(x => x.hidden = cash);
        sh.querySelectorAll('[data-show="cash"]').forEach(x => x.hidden = !cash);
        sh.querySelectorAll('[data-show="action"]').forEach(x => x.hidden = !(t === 'action' || t === 'fonds' || t === 'autre'));
      };
      f.type.addEventListener('change', () => { sync(); if (f.type.value === 'crypto' || f.type.value === 'non-cote') f.equity.value = '0'; if (f.type.value === 'action' || f.type.value === 'etf') f.equity.value = '100'; });
      f.isin.addEventListener('change', () => { const lib = libraryFor(f.isin.value.trim()); if (lib) { if (!f.name.value) f.name.value = lib.name; if (!f.ticker.value) f.ticker.value = lib.ticker; f.type.value = lib.type; sync(); } });
      sync();
      f.addEventListener('submit', e => {
        e.preventDefault();
        const err = sh.querySelector('#lf-err'); const fail = m => { err.textContent = m; err.hidden = false; };
        const t = f.type.value, cash = ['especes', 'livret', 'fonds-euros'].includes(t);
        const name = f.name.value.trim(); if (!name) return fail('Donnez un nom à la ligne.');
        const acc = accById(f.accountId.value);
        const n = l ? { ...l } : { id: 'ln-' + Date.now().toString(36), source: 'manual', events: [], pending: 0 };
        n.accountId = acc.id; n.type = t; n.name = name; n.since = f.since.value || today();
        if (l && l.name !== name) n.customName = true;
        if (cash) {
          const amt = parseNum(f.amount.value); if (!isFinite(amt)) return fail('Indiquez un montant, par exemple 2 500.');
          Object.assign(n, { amount: amt, qty: 1, price: amt, cost: amt, priceDate: today(), equity: 0, isin: '', ticker: '' });
          n.envelope = acc.kind === 'av' ? 'Assurance-vie' : acc.kind === 'per' ? 'PER' : t === 'livret' ? 'Livrets' : t === 'fonds-euros' ? envelopeForAccount(acc) : 'Espèces';
          if (l?.source === 'tr') n.events = l.events;
        } else {
          const q = parseNum(f.qty.value), p = parseNum(f.pru.value), cur = parseNum(f.price.value);
          if (!(q > 0)) return fail('Indiquez une quantité positive.');
          if (!(p >= 0)) return fail('Indiquez le prix de revient unitaire (0 si offert).');
          const price = isFinite(cur) && cur > 0 ? cur : p;
          const eq = parseNum(f.equity.value);
          n.isin = f.isin.value.trim().toUpperCase(); n.ticker = f.ticker.value.trim().toUpperCase();
          if (l && l.ticker !== n.ticker) n.customTicker = true;
          n.qty = q; n.cost = q * p + (+n.pending || 0);
          if (!l || Math.abs(price - l.price) > 1e-9) { n.price = price; n.priceDate = today(); n.priceSource = 'manuel'; }
          n.equity = isFinite(eq) ? Math.min(100, Math.max(0, eq)) / 100 : 1;
          n.envelope = l?.source === 'tr' ? l.envelope : (t === 'crypto' && acc.kind !== 'pea' && acc.kind !== 'av' ? 'Crypto' : envelopeForAccount(acc));
          if (f.sector.value || f.country.value.trim()) n.lookthrough = { sector: f.sector.value, country: f.country.value.trim() };
          else delete n.lookthrough;
          if (l?.source === 'tr' && (Math.abs(q - l.qty) > 1e-9)) n.events = [...(l.events || []), [today(), q, n.cost, price]];
        }
        if (l) data.lines = data.lines.map(x => x.id === l.id ? n : x); else data.lines.push(n);
        close(); commit(l ? 'Ligne mise à jour.' : 'Ligne ajoutée.');
      });
    },
  });
}

// ——— Fichiers ———
function pickFile(accept) {
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    inp.addEventListener('change', () => { const f = inp.files?.[0]; inp.remove(); res(f || null); });
    document.body.append(inp); inp.click();
  });
}
const readText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Lecture du fichier impossible.')); r.readAsText(f, 'utf-8'); });

async function saveFile(filename, text) {
  if (window.claude && typeof window.claude.use === 'function') {
    try {
      const dl = await window.claude.use('downloads');
      if (dl) { await dl.save({ filename, data: text }); toast('Fichier enregistré.'); return; }
    } catch (e) { if (e && e.code === 'declined') return; }
  }
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Sauvegarde exportée : ' + filename);
  } catch {
    openSheet(`${sheetHead('Copiez votre sauvegarde', 'Le téléchargement est bloqué ici.')}<textarea class="input" readonly id="bk-text">${esc(text)}</textarea><div class="btn-row" style="margin-top:12px"><button class="btn primary" data-copy>Copier</button></div>`, {
      onMount: sh => sh.querySelector('[data-copy]').addEventListener('click', () => { const t = sh.querySelector('#bk-text'); navigator.clipboard?.writeText(t.value).then(() => toast('Copié.'), () => { t.select(); }); }),
    });
  }
}

async function importCsvFlow() {
  const f = await pickFile('.csv,text/csv');
  if (!f) return;
  let imp;
  try { imp = importTradeRepublic(await readText(f)); } catch (e) { toast(e.message); return; }
  const st = imp.stats;
  const byAcc = id => imp.lines.filter(l => l.accountId === id);
  openSheet(`${sheetHead('Import Trade Republic', `${num(st.rows, 0)} opérations, du ${dateLong(st.from)} au ${dateLong(st.to)}`)}
    ${imp.accounts.map(a => `<div class="section-head" style="margin-top:8px"><h2>${esc(a.name)}</h2><span class="aside">${byAcc(a.id).length} ligne${byAcc(a.id).length > 1 ? 's' : ''}</span></div>
      <div class="holdings">${byAcc(a.id).sort((x, y) => lineCost(y) - lineCost(x)).map(l => `<div class="holding"><span class="r"></span><span class="n">${esc(shortName(l))}</span><span class="a">${isCashLike(l) ? eur(l.amount) : fqty(l.qty)}</span><span class="w">${isCashLike(l) ? 'Solde espèces recalculé' : 'Prix de revient ' + eur(l.cost) + (l.pending ? ' · dont ' + eur(l.pending) + ' en attente d’exécution' : '')}</span></div>`).join('')}</div>`).join('')}
    <div class="callout" style="margin:16px 0">Espèces recalculées : <b>${Object.entries(st.cash).map(([id, v]) => esc(imp.accounts.find(a => a.id === id)?.name || id) + ' ' + eur(v)).join(' · ')}</b>. Vérifiez ce montant dans l’app Trade Republic.</div>
    ${data.demo ? '<p class="small muted">Les données d’exemple seront effacées.</p>' : ''}
    <div class="btn-row"><button class="btn primary" data-ok>Importer</button><button class="btn" data-close>Annuler</button></div>`, {
    label: 'Import',
    onMount: (sh, close) => sh.querySelector('[data-ok]').addEventListener('click', () => {
      if (data.demo) { const keep = { profile: data.profile, settings: data.settings }; data = { ...emptyData(), ...keep }; }
      data = mergeImport(data, imp); close(); ui.tab = 'patrimoine'; history.replaceState(null, '', '#patrimoine'); window.scrollTo(0, 0);
      commit(`${imp.lines.length} lignes importées.`);
    }),
  });
}

async function restoreFlow() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let obj;
  try { obj = JSON.parse(await readText(f)); } catch { toast('Ce fichier n’est pas un JSON lisible.'); return; }
  try {
    if (obj && obj.encrypted) {
      const pass = await passSheet({ title: 'Sauvegarde chiffrée', confirm: false });
      if (!pass) return;
      obj = await decryptBackup(obj, pass);
    }
    const nd = validateBackup(obj);
    const accs = nd.accounts.length, lns = nd.lines.length;
    const empty = !data.lines.length && !data.accounts.length;
    const what = `${accs} compte${accs > 1 ? 's' : ''} et ${lns} ligne${lns > 1 ? 's' : ''}`;
    let mode = empty && !obj.partial ? 'replace' : null;
    if (!mode) mode = await choiceSheet({
      title: obj.partial ? 'Ajouter ces comptes ?' : 'Restaurer la sauvegarde',
      text: obj.partial ? `Ce fichier contient ${what} (${esc(nd.accounts.map(a => a.name).join(', '))}). Ils seront ajoutés à vos données ; un compte déjà présent avec le même identifiant sera remplacé.`
        : `La sauvegarde du ${dateLong((obj.exportedAt || '').slice(0, 10))} contient ${what}. Vous pouvez l’ajouter à vos données actuelles, ou tout remplacer.`,
      choices: obj.partial || empty ? [['merge', 'Ajouter', 'primary']] : [['merge', 'Ajouter à mes données', 'primary'], ['replace', 'Tout remplacer', '']],
    });
    if (!mode) return;
    if (mode === 'replace') data = nd;
    else {
      if (data.demo) data = { ...emptyData(), settings: data.settings };
      const accIds = new Set(nd.accounts.map(a => a.id)), lineIds = new Set(nd.lines.map(l => l.id));
      data.accounts = [...data.accounts.filter(a => !accIds.has(a.id)), ...nd.accounts];
      data.lines = [...data.lines.filter(l => !lineIds.has(l.id) && !accIds.has(l.accountId)), ...nd.lines];
      data.priceHistory = { ...(data.priceHistory || {}), ...(nd.priceHistory || {}) };
      if (!data.profile.firstName && nd.profile.firstName) data.profile.firstName = nd.profile.firstName;
      if (!data.trStats && nd.trStats) data.trStats = nd.trStats;
    }
    ui.tab = 'patrimoine'; history.replaceState(null, '', '#patrimoine'); window.scrollTo(0, 0); commit(mode === 'replace' ? 'Sauvegarde restaurée.' : `${what} ajoutés.`);
  } catch (e) { toast(e.message || 'Restauration impossible.'); }
}

async function exportFlow(encrypted) {
  const payload = backupPayload(data);
  const stamp = today();
  if (!encrypted) return saveFile(`carnet-sauvegarde-${stamp}.json`, JSON.stringify(payload, null, 1));
  const pass = await passSheet({ title: 'Sauvegarde chiffrée', confirm: true });
  if (!pass) return;
  const enc = await encryptBackup(payload, pass);
  return saveFile(`carnet-sauvegarde-chiffree-${stamp}.json`, JSON.stringify(enc));
}

// ——— Synchronisation (chiffrée dans le navigateur, voir sync.js) ———
const syncPayload = d => { const { demo, ...rest } = d; return rest; };
const nowIso = () => new Date().toISOString();
let syncTimer, editRev = 0;
function scheduleSync() {
  const st = syncState(); if (!st || data.demo || PREVIEW) return;
  editRev++;
  if (!st.dirty) { st.dirty = true; saveSyncState(st); }
  clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 1500);
}
// rev : numéro de modification envoyé. Une modification faite pendant l'envoi reste à envoyer.
function markSynced(st, version, rev) {
  const dirty = rev !== editRev;
  saveSyncState({ ...st, version, dirty, at: nowIso() });
  if (dirty) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 1500); }
}
function adoptRemote(r) { data = normalize(r.data); save(data); render(); }

function syncStatusHtml() {
  const st = syncState(); if (!st) return '';
  if (ui.syncing) return '<span class="status"><i></i>Synchronisation…</span>';
  if (ui.syncError) return `<span class="status off"><i></i>${esc(ui.syncError)}</span>`;
  if (st.dirty) return '<span class="status"><i></i>Changements en attente d’envoi</span>';
  if (!st.at) return '<span class="status"><i></i>Pas encore synchronisé</span>';
  const d = new Date(st.at), sameDay = d.toDateString() === new Date().toDateString();
  return `<span class="status ok"><i></i>À jour (${sameDay ? 'à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'le ' + dateShort(st.at.slice(0, 10))})</span>`;
}
function setSyncUI() { const el = $('#sync-status'); if (el) el.innerHTML = syncStatusHtml(); }
function syncCard() {
  if (PREVIEW) return '';
  const st = syncState();
  if (!st) return `<section class="card"><h3>Synchronisation</h3><p class="lead">Retrouvez vos données sur l’ordinateur et le téléphone. Elles sont chiffrées dans ce navigateur avant d’être envoyées : le serveur ne garde qu’un bloc illisible.</p>
    <div class="btn-row"><button class="btn primary" data-action="sync-create">Créer un coffre</button><button class="btn" data-action="sync-login">Se connecter</button></div>
    <p class="note">Un identifiant et une phrase de passe, sans e-mail. La phrase n’est jamais envoyée : si vous l’oubliez, personne ne peut ouvrir le coffre, mais les données de vos appareils restent intactes.</p></section>`;
  return `<section class="card"><h3>Synchronisation</h3><p class="lead">Cet appareil est relié au coffre <b>${esc(st.user)}</b>. Chaque modification y est envoyée chiffrée, et vos autres appareils la récupèrent en s’ouvrant.</p>
    <p style="margin:0 0 12px" id="sync-status">${syncStatusHtml()}</p>
    <div class="btn-row"><button class="btn" data-action="sync-now">Synchroniser</button><button class="btn" data-action="sync-logout">Déconnecter cet appareil</button></div>
    <div class="btn-row" style="margin-top:8px"><button class="btn danger" data-action="sync-delete">Supprimer le coffre en ligne</button></div></section>`;
}

async function syncNow(manual = false) {
  const st = syncState();
  if (!st || ui.syncing || PREVIEW) return;
  if (data.demo) { if (manual) toast('Effacez d’abord les données d’exemple.'); return; }
  clearTimeout(syncTimer);
  ui.syncing = true; ui.syncError = ''; setSyncUI();
  const rev = editRev;
  let ok = true;
  try {
    if (st.dirty) {
      try { const r = await pushVault(st, st.version, syncPayload(data)); markSynced(st, r.version, rev); }
      catch (e) { if (e.status !== 409) throw e; ok = await syncConflict(st, rev); }
    } else {
      const r = await pullVault(st);
      if (r.version !== st.version && rev === editRev) { adoptRemote(r); if (!manual) toast('Données mises à jour depuis un autre appareil.'); }
      markSynced(st, rev === editRev ? r.version : st.version, rev);
    }
    if (manual && ok) toast('Synchronisé.');
  } catch (e) {
    ui.syncError = e.status === 401 || e.status === 404 ? 'Coffre supprimé ou phrase de passe changée : déconnectez cet appareil.' : e.message;
    if (manual) toast(ui.syncError);
  } finally { ui.syncing = false; setSyncUI(); }
}

async function syncConflict(st, rev) {
  const r = await pullVault(st);
  const when = r.updatedAt ? new Date(r.updatedAt).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : '';
  const c = await choiceSheet({
    title: 'Modifié sur deux appareils',
    text: `Le coffre a été modifié depuis un autre appareil${when ? ' (le ' + esc(when) + ')' : ''}, alors que celui-ci avait aussi des changements non envoyés. Quelle version garder ?`,
    choices: [['remote', 'Celle du coffre', 'primary'], ['local', 'Celle de cet appareil', '']],
  });
  if (c === 'remote') { adoptRemote(r); markSynced(st, r.version, editRev); return true; }
  if (c === 'local') { const p = await pushVault(st, r.version, syncPayload(data)); markSynced(st, p.version, rev); return true; }
  ui.syncError = 'Conflit non résolu : touchez « Synchroniser » pour choisir.';
  return false;
}

function syncSheet(create) {
  const label = create ? 'Créer et synchroniser' : 'Se connecter';
  openSheet(`${sheetHead(create ? 'Créer un coffre' : 'Se connecter', create ? 'Les données de cet appareil y seront envoyées, chiffrées.' : 'Retrouvez les données de vos autres appareils.')}
    <form class="form">
      <label class="field"><span>Identifiant</span><input class="input" id="sy-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="40" required><small>3 à 40 caractères : lettres sans accent, chiffres, point, tiret.</small></label>
      <label class="field"><span>Phrase de passe</span><input class="input" type="password" id="sy-pass" name="password" autocomplete="${create ? 'new-password' : 'current-password'}" required></label>
      ${create ? `<label class="field"><span>Encore une fois</span><input class="input" type="password" id="sy-pass2" autocomplete="new-password" required></label>
      <p class="note">Elle chiffre vos données et ne quitte jamais cet appareil. Oubliée, rien ne permet de la retrouver : rangez-la dans un gestionnaire de mots de passe.</p>` : ''}
      <p class="small neg" id="sy-err" hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${label}</button><button class="btn" type="button" data-close>Annuler</button></div></form>`, {
    label: create ? 'Créer un coffre' : 'Se connecter',
    onMount: (sh, close) => {
      const f = sh.querySelector('form'), err = sh.querySelector('#sy-err'), btn = f.querySelector('[type=submit]');
      const fail = m => { err.textContent = m; err.hidden = false; btn.disabled = false; btn.textContent = label; };
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const user = normUser(sh.querySelector('#sy-user').value), pass = sh.querySelector('#sy-pass').value;
        if (!USER_RE.test(user)) return fail('Identifiant : 3 à 40 caractères parmi a-z, 0-9, point, tiret et tiret bas.');
        if (create && pass.length < 10) return fail('Phrase de passe : au moins 10 caractères.');
        if (create && pass !== sh.querySelector('#sy-pass2').value) return fail('Les deux phrases ne sont pas identiques.');
        if (create && data.demo) return fail('Effacez d’abord les données d’exemple.');
        err.hidden = true; btn.disabled = true; btn.textContent = 'Calcul de la clé…';
        try {
          const acc = await deriveAccount(user, pass);
          btn.textContent = 'Connexion…';
          if (create) {
            const r = await pushVault(acc, 0, syncPayload(data));
            saveSyncState({ ...acc, version: r.version, at: nowIso() });
            close(); render(); toast('Coffre créé. Connectez-vous avec le même identifiant sur vos autres appareils.');
            return;
          }
          const r = await pullVault(acc);
          const local = !data.demo && (data.accounts.length || data.lines.length);
          let version = r.version;
          if (local) {
            const n = (d, k, w) => `${d[k].length} ${w}${d[k].length > 1 ? 's' : ''}`;
            const c = await choiceSheet({
              title: 'Cet appareil a déjà des données',
              text: `Le coffre contient ${n(r.data, 'accounts', 'compte')} et ${n(r.data, 'lines', 'ligne')} ; cet appareil, ${n(data, 'accounts', 'compte')} et ${n(data, 'lines', 'ligne')}. Lesquelles garder ? L’autre version sera remplacée.`,
              choices: [['remote', 'Celles du coffre', 'primary'], ['local', 'Celles de cet appareil', '']],
            });
            if (!c) return fail('Connexion annulée : rien n’a été modifié.');
            if (c === 'local') version = (await pushVault(acc, r.version, syncPayload(data))).version;
            else adoptRemote(r);
          } else adoptRemote(r);
          saveSyncState({ ...acc, version, at: nowIso() });
          ui.syncError = ''; close(); render(); toast('Appareil synchronisé.');
        } catch (e2) {
          if (create && (e2.status === 401 || e2.status === 409)) return fail('Cet identifiant est déjà pris. Choisissez-en un autre, ou connectez-vous.');
          if (!create && e2.status === 401) return fail('Phrase de passe incorrecte.');
          fail(e2.message || 'Synchronisation impossible.');
        }
      });
    },
  });
}

// ——— Cours ———
async function api(path, timeout = 4000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(path, { cache: 'no-store', signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('Réponse inattendue');
    return await r.json();
  } finally { clearTimeout(t); }
}
async function checkServer() {
  if (PREVIEW) return;
  try { const j = await api('api/health', 3000); ui.server = j && j.app === 'carnet' ? 'ok' : 'off'; } catch { ui.server = 'off'; }
  if (ui.tab === 'donnees') render();
  autoCompositions();
}

// Nouvelles lignes : tout produit absent de la bibliothèque (ETF, fonds, action) reçoit
// automatiquement sa composition (justETF, via le serveur ; seul l'ISIN est envoyé).
// Nouvel essai après 3 jours si rien n'a été trouvé, mise à jour tous les 30 jours sinon.
const ISIN_OK = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const COMPOSABLE = l => !isCashLike(l) && ISIN_OK.test(String(l.isin || '').toUpperCase()) && !['crypto', 'non-cote', 'autre-fixe'].includes(l.type) && !inLibrary(l.isin);
let composing = false;
async function autoCompositions() {
  if (PREVIEW || composing || ui.server !== 'ok') return;
  const comps = data.compositions || {};
  const due = [...new Set(data.lines.filter(COMPOSABLE).map(l => l.isin.toUpperCase()))].filter(isin => {
    const c = comps[isin];
    return !c || Date.now() - Date.parse(c.at || 0) > (c.ok ? 30 : 3) * 86400000;
  });
  if (!due.length) return;
  composing = true;
  const found = [];
  let stored = 0;
  try {
    await pool(due, 2, async isin => {
      try {
        const j = await api('api/composition?isin=' + isin, 45000);
        data.compositions = { ...(data.compositions || {}), [isin]: { ...j, at: new Date().toISOString() } };
        stored++; if (j.ok) found.push(isin);
      } catch { /* serveur ou justETF injoignable : nouvel essai au prochain chargement */ }
    });
  } finally { composing = false; }
  if (!stored) return;
  const names = found.map(i => shortName(data.lines.find(l => String(l.isin).toUpperCase() === i)));
  commit(names.length ? `Composition ajoutée : ${names.join(', ')}.` : '');
}
function noServerSheet() {
  openSheet(`${sheetHead('Actualisation indisponible', PREVIEW ? 'Cet aperçu en ligne n’a pas de serveur.' : 'Le serveur Carnet ne répond pas.')}
    <p class="muted" style="margin-top:0">Les cours sont récupérés par le petit serveur livré avec Carnet, qui interroge Yahoo Finance. Lancez Carnet avec <code>node server.mjs</code>, avec Docker, ou déployez-le sur Vercel (voir le README).</p>
    <p class="muted">En attendant, vous pouvez saisir un cours à la main : touchez une ligne, puis « Modifier ».</p>
    <div class="btn-row"><button class="btn primary" data-close>Compris</button></div>`, { label: 'Actualisation' });
}
// Actualise tout ce qui a une cotation publique : cours du jour + historique (5 ans hebdo, 1 an au jour le jour).
const QUOTABLE = l => !isCashLike(l) && (l.ticker || l.isin);
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); }
function navAt(hist, d) { if (!hist?.length) return null; const after = hist.find(h => h[0] >= d); return after || hist[hist.length - 1]; }
function refreshLabel() {
  if (ui.busy) return { short: ui.progress || 'Actualisation…', long: ui.progress || 'Actualisation…' };
  const at = data.lastRefresh?.at;
  if (!at) return { short: 'Actualiser', long: 'Actualiser les cours' };
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  const when = sameDay ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : dateShort(at.slice(0, 10));
  return { short: when, long: 'Cours mis à jour ' + (sameDay ? 'à ' : 'le ') + when };
}
function setRefreshUI() {
  const lab = refreshLabel();
  for (const b of document.querySelectorAll('.refresh-btn')) {
    b.classList.toggle('spin', ui.busy); b.disabled = ui.busy;
    const sh = b.querySelector('.r-short'), lg = b.querySelector('.r-long');
    if (sh) sh.textContent = lab.short; if (lg) lg.textContent = lab.long;
    b.title = ui.busy ? 'Actualisation en cours' : 'Actualiser les cours et l’historique de chaque produit';
  }
}
function progress(msg) { ui.progress = msg; setRefreshUI(); }

async function refreshPrices() {
  if (ui.busy) return;
  if (PREVIEW) { noServerSheet(); return; }
  ui.busy = true; progress('Connexion…');
  try {
    try { await api('api/health', 4000); ui.server = 'ok'; } catch { ui.server = 'off'; noServerSheet(); return; }
    const targets = data.lines.filter(QUOTABLE);
    if (!targets.length) { toast('Aucun produit coté à actualiser.'); return; }
    // 0. Symbole corrigé dans la bibliothèque depuis l'import (sauf symbole saisi à la main)
    for (const l of targets) { const t = libraryFor(l.isin)?.ticker; if (t && !l.customTicker && l.ticker !== t) { l.ticker = t; delete l.tickerAuto; } }
    // 1. Symbole Yahoo manquant : recherche par ISIN
    const missing = targets.filter(l => !l.ticker && l.isin);
    const searchErr = {};
    if (missing.length) {
      let n = 0; progress(`Symboles 0/${missing.length}`);
      await pool(missing, 3, async l => {
        try { const j = await api('api/search?q=' + encodeURIComponent(l.isin), 12000); if (j.symbol) { l.ticker = j.symbol; l.tickerAuto = true; } }
        catch (e) { searchErr[l.id] = e.message; }
        progress(`Symboles ${++n}/${missing.length}`);
      });
    }
    // 2. Cours et historique, par paquets
    const syms = [...new Set(targets.map(l => l.ticker).filter(Boolean))];
    const quotes = {};
    for (let i = 0; i < syms.length; i += 5) {
      const chunk = syms.slice(i, i + 5);
      progress(`Cours ${Math.min(i + 5, syms.length)}/${syms.length}`);
      try { const j = await api('api/quote?range=full&symbols=' + encodeURIComponent(chunk.join(',')), 60000); Object.assign(quotes, j.quotes || {}); }
      catch (e) { for (const s of chunk) quotes[s] = { error: e.name === 'AbortError' ? 'délai dépassé' : e.message }; }
    }
    // 3. Mise à jour des lignes
    data.priceHistory = data.priceHistory || {};
    const results = [];
    for (const l of targets) {
      const r = { id: l.id, name: shortName(l), symbol: l.ticker || '', ok: false };
      if (!l.ticker) {
        r.error = searchErr[l.id] ? 'Recherche impossible : ' + searchErr[l.id] : l.type === 'non-cote' ? 'Fonds non coté : pas de cours public' : 'Aucun symbole Yahoo pour l’ISIN ' + l.isin;
        results.push(r); continue;
      }
      const q = quotes[l.ticker];
      if (!q || !(q.price > 0)) {
        r.error = q?.error || 'Pas de réponse';
        if (l.tickerAuto && /introuvable/i.test(r.error)) { l.ticker = ''; delete l.tickerAuto; }
        results.push(r); continue;
      }
      const before = lineValue(l);
      if (Array.isArray(q.history) && q.history.length) data.priceHistory[l.ticker] = q.history;
      if (l.estimateFromAmount) {
        const nav = navAt(q.history, l.since || today());
        const p0 = nav ? nav[1] : q.price;
        l.qty = +(l.cost / p0).toFixed(6); l.estimateFromAmount = false; l.qtyEstimated = true;
        r.note = `quantité estimée avec la valeur liquidative du ${dateShort(nav ? nav[0] : q.date)}`;
      }
      l.price = q.price; l.priceDate = q.date || today(); l.priceSource = 'yahoo';
      Object.assign(r, { ok: true, price: q.price, date: l.priceDate, delta: lineValue(l) - before, points: q.history?.length || 0 });
      results.push(r);
    }
    data.lastRefresh = { at: new Date().toISOString(), results };
    data.settings.snoozeUntil = '';
    const ok = results.filter(r => r.ok).length, ko = results.length - ok;
    ui.busy = false; ui.progress = '';
    commit(ko ? `${ok} produit${ok > 1 ? 's' : ''} actualisé${ok > 1 ? 's' : ''} · ${ko} sans cours (détail dans Données)` : `${ok} produit${ok > 1 ? 's' : ''} actualisé${ok > 1 ? 's' : ''}, historique compris.`);
  } catch (e) {
    toast('Échec de l’actualisation : ' + (e.name === 'AbortError' ? 'délai dépassé.' : e.message));
  } finally { ui.busy = false; ui.progress = ''; setRefreshUI(); if (ui.tab === 'donnees') render(); }
}

function refreshReport() {
  const lr = data.lastRefresh;
  if (!lr) return '<p class="small muted" style="margin:12px 0 0">Aucune actualisation pour l’instant.</p>';
  const ok = lr.results.filter(r => r.ok), ko = lr.results.filter(r => !r.ok).sort((a, b) => /non coté|Aucun symbole/.test(a.error) - /non coté|Aucun symbole/.test(b.error));
  return `<p class="small muted" style="margin:14px 0 6px">Dernière actualisation : ${dateLong(lr.at.slice(0, 10))} à ${new Date(lr.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · ${ok.length} à jour, ${ko.length} sans cours.</p>
    <div class="holdings">${[...ko, ...ok].map(r => `<div class="holding"><span class="r">${r.ok ? '<span class="pos">●</span>' : /non coté|Aucun symbole/.test(r.error) ? '<span class="muted">●</span>' : '<span class="neg">●</span>'}</span><span class="n">${esc(r.name)}</span><span class="a">${r.ok ? eur(r.price) : '—'}</span><span class="w">${r.ok ? `${esc(r.symbol)} · cours du ${dateShort(r.date)} · ${r.points} points d’historique${r.note ? ' · ' + esc(r.note) : ''}` : esc(r.error)}</span></div>`).join('')}</div>`;
}

// ——— Exemple ———
function demoData() {
  const d = emptyData();
  d.demo = true;
  d.profile.firstName = '';
  d.accounts = [
    { id: 'd-pea', name: 'Courtier PEA', institution: 'Exemple', kind: 'pea', color: 'orange', source: 'manual' },
    { id: 'd-cto', name: 'Courtier', institution: 'Exemple', kind: 'cto', color: 'ink', source: 'manual' },
    { id: 'd-liv', name: 'Livret A', institution: 'Exemple', kind: 'livret', color: 'green', source: 'manual' },
  ];
  const mk = (id, acc, isin, q, cost, price, extra = {}) => { const lib = libraryFor(isin); return { id, source: 'manual', accountId: acc, envelope: acc === 'd-pea' ? 'PEA' : lib?.type === 'crypto' ? 'Crypto' : 'Compte-titres', type: lib?.type || 'etf', name: lib?.name || isin, isin, ticker: lib?.ticker || '', qty: q, cost, price, priceDate: today(), priceSource: 'manuel', pending: 0, equity: lib?.equity ?? 1, events: [], since: '2025-03-01', ...extra }; };
  const ev = (start, months, qStep, p0, p1) => { const out = []; let q = 0, c = 0; const s = new Date(start); for (let i = 0; i < months; i++) { const dd = new Date(s.getFullYear(), s.getMonth() + i, 5).toISOString().slice(0, 10); const p = p0 + (p1 - p0) * i / Math.max(1, months - 1) + Math.sin(i) * p0 * 0.03; q += qStep; c += qStep * p; out.push([dd, +q.toFixed(4), +c.toFixed(2), +p.toFixed(3)]); } return out; };
  const w = ev('2025-01-05', 21, 40, 5.9, 7.1);
  d.lines = [
    mk('d1', 'd-pea', 'IE0002XZSHO1', w[w.length - 1][1], w[w.length - 1][2], 7.18, { events: w }),
    mk('d2', 'd-pea', 'LU1681046931', 12, 1560, 137.2, { events: [['2025-06-10', 12, 1560, 130]] }),
    mk('d3', 'd-cto', 'IE00BGV5VN51', 4, 760, 215.9, { events: [['2025-04-02', 4, 760, 190]] }),
    mk('d4', 'd-cto', 'BTC', 0.004, 300, 61000, { events: [['2025-02-01', 0.004, 300, 75000]] }),
    { id: 'd5', source: 'manual', accountId: 'd-liv', envelope: 'Livrets', type: 'livret', name: 'Livret A', qty: 1, amount: 4200, price: 4200, cost: 4200, priceDate: today(), equity: 0, pending: 0, events: [], since: '2025-01-01' },
  ];
  return d;
}

// ——— Navigation & événements ———
function go(tab) { ui.tab = tab; if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab); render(); window.scrollTo(0, 0); }

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab]');
  if (t) { go(t.dataset.tab); return; }
  const b = e.target.closest('[data-action]'); if (!b) return;
  if (b.closest('.sheet') && !['open-line'].includes(b.dataset.action)) return; // les fenêtres gèrent leurs boutons
  const a = b.dataset.action, v = b.dataset.v;
  switch (a) {
    case 'range': ui.range = v; render(); break;
    case 'filter': ui.filter = v; render(); break;
    case 'analyse': ui.analyse = v; render(); break;
    case 'open-split': openSplit(v); break;
    case 'go': go(v); break;
    case 'open-line': openLine(b.dataset.id); break;
    case 'open-account': openAccount(b.dataset.id); break;
    case 'add-line': lineForm(null); break;
    case 'add-account': accountForm(null); break;
    case 'edit-account': accountForm(b.dataset.id); break;
    case 'refresh': refreshPrices(); break;
    case 'snooze': data.settings.snoozeUntil = new Date(Date.now() + 86400000).toISOString(); commit(); break;
    case 'theme': data.settings.theme = v; commit(); break;
    case 'pick-csv': importCsvFlow(); break;
    case 'pick-backup': restoreFlow(); break;
    case 'export-plain': exportFlow(false); break;
    case 'export-enc': exportFlow(true); break;
    case 'demo': data = demoData(); commit('Données d’exemple chargées.'); break;
    case 'clear-demo': { const keep = { settings: data.settings }; data = { ...emptyData(), ...keep }; clearAll(); commit('Exemple effacé.'); break; }
    case 'wipe':
      if (await confirmSheet({ title: 'Tout effacer ?', text: `Comptes, lignes, historique et réglages seront supprimés de cet appareil. Cette action ne peut pas être annulée.${syncState() ? ' Cet appareil sera aussi déconnecté du coffre, qui reste intact.' : ''}`, ok: 'Tout effacer', danger: true })) { clearSyncState(); clearAll(); data = emptyData(); commit('Données effacées.'); go('patrimoine'); }
      break;
    case 'sync-create': syncSheet(true); break;
    case 'sync-login': syncSheet(false); break;
    case 'sync-now': syncNow(true); break;
    case 'sync-logout':
      if (await confirmSheet({ title: 'Déconnecter cet appareil ?', text: 'Les données restent sur cet appareil et dans le coffre ; elles ne seront simplement plus synchronisées ici.', ok: 'Déconnecter' })) { clearSyncState(); ui.syncError = ''; render(); toast('Appareil déconnecté.'); }
      break;
    case 'sync-delete': {
      const st = syncState(); if (!st) break;
      if (!await confirmSheet({ title: 'Supprimer le coffre en ligne ?', text: `Le coffre « ${esc(st.user)} » sera effacé du serveur. Les données de cet appareil sont conservées, mais vos autres appareils ne seront plus synchronisés.`, ok: 'Supprimer le coffre', danger: true })) break;
      try { await deleteVault(st); } catch (e2) { if (e2.status !== 404) { toast(e2.message); break; } }
      clearSyncState(); ui.syncError = ''; render(); toast('Coffre supprimé.');
      break;
    }
    case 'sim-mode': ui.sim.mode = v; render(); break;
    case 'sim-by': {
      const s = ui.sim, p = parseNum(s.price);
      if (v === 'qty' && s.by === 'amount' && p > 0) s.qty = String(+(parseNum(s.amount) / p).toFixed(4)).replace('.', ',');
      if (v === 'amount' && s.by === 'qty' && p > 0) s.amount = String(+(parseNum(s.qty) * p).toFixed(2)).replace('.', ',');
      s.by = v; render(); break;
    }
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.sim) {
    const k = el.dataset.sim;
    ui.sim[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'lineId' || k === 'accountId') {
      if (k === 'lineId') { const l = lineById(el.value); ui.sim.price = l && l.price ? String(+l.price.toFixed(4)).replace('.', ',') : ''; }
      render(); return;
    }
    const out = $('#sim-out'); if (out) out.innerHTML = simResult();
  }
  if (el.dataset.setting === 'taxRate') { const n = parseNum(el.value); if (isFinite(n) && n >= 0 && n <= 100) { data.settings.taxRate = n; save(data); scheduleSync(); } }
});
document.addEventListener('change', e => { if (e.target.dataset.sim === 'useCash') { ui.sim.useCash = e.target.checked; const out = $('#sim-out'); if (out) out.innerHTML = simResult(); } });
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form="profile"]'); if (!f) return;
  e.preventDefault(); data.profile.firstName = f.firstName.value.trim(); commit('Profil enregistré.');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1].close(); });
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TABS.some(t => t[0] === h) && h !== ui.tab) { ui.tab = h; render(); } });
let wasWide = isWide();
window.addEventListener('resize', () => { const w = isWide(); if (w !== wasWide) { wasWide = w; render(); } else if (ui.tab === 'patrimoine') after.patrimoine(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
window.addEventListener('storage', e => { if (e.key && e.key.startsWith('carnet:data')) { data = load(); render(); } });

// ——— Démarrage ———
(function start() {
  const h = location.hash.slice(1);
  if (TABS.some(t => t[0] === h)) ui.tab = h;
  for (const n of document.querySelectorAll('[data-icon]')) n.innerHTML = ICONS[n.dataset.icon] || '';
  render();
  checkServer();
  syncNow();
  document.addEventListener('visibilitychange', () => syncNow());
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 120000);
  if (!PREVIEW && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible */ });
  }
})();
