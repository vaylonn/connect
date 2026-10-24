// Carnet — interface. No data leaves the browser in clear: the Carnet server (optional) queries
// Yahoo Finance with the symbols, never with the amounts, and sync (optional) only sends it a
// vault encrypted here (see sync.js). Every text goes through t() (i18n.js): French is the source.
import { eur, signedEur, pct, signedPct, pts, qty as fqty, qtyShort, num, inputNum, dateLong, dateShort, monthLong, timeShort, dateTime, daysAgo, esc, parseNum, bigParts } from './format.js';
import { t, tn, setLang, lang } from './i18n.js';
import { load, save, clearAll, emptyData, normalize, validateBackup, encryptBackup, decryptBackup, backupPayload, storageWorks } from './store.js';
import { syncState, saveSyncState, clearSyncState, deriveAccount, pullVault, pushVault, deleteVault, normUser, USER_RE } from './sync.js';
import { importTradeRepublic, mergeImport } from './importer.js';
import { importLinxea, mergeLinxea, PERF_KEYS } from './importer-linxea.js';
import { readXlsx } from './xlsx.js';
import { totals, staleLines, lookthrough, DIRECT, heldLines, isHeld, lineComposition, history as buildHistory, lineValue, lineCost, lineGain, pru, isCashLike, QUOTE_EXPECTED, simulate, envelopeForAccount, ENVELOPE_ORDER, FLOW_KINDS, INCOME_KINDS, netAmount, performance, allocation, rebalance, milestone, accountStart, MILESTONE_YEARS } from './compute.js';
import { libraryFor, libraryChoices, SECTORS, COMPOSITION_NOTE, setFetchedLibrary, wantsComposition } from './library.js';
import { lineChart, hoverText } from './chart.js';

const VERSION = '1.6.0';
let data = load();
const ui = {
  tab: 'patrimoine', range: '1A', scope: 'all', filter: 'all', group: 'accounts', analyse: 'sectors', server: 'unknown', busy: false, progress: '', lineRange: '1A',
  hist: { kind: 'all', acc: 'all', q: '', limit: 150 },
  sim: { mode: 'buy', lineId: '', newIsin: '', newName: '', accountId: '', by: 'amount', amount: '1000', qty: '', price: '', fees: '1', useCash: true },
  reb: { amount: '500', sell: false },
};
const TABS = [
  ['patrimoine', 'Patrimoine'], ['analyse', 'Analyse'], ['historique', 'Historique'], ['simuler', 'Simuler'], ['donnees', 'Réglages'],
];
const COLORS = ['ink', 'orange', 'blue', 'pink', 'lilac', 'green'];
const KINDS = [['courant', 'Compte courant'], ['livret', 'Livret d’épargne'], ['cto', 'Compte-titres'], ['pea', 'PEA'], ['av', 'Assurance-vie'], ['per', 'PER'], ['crypto', 'Crypto'], ['autre', 'Autre']];
const TYPES = [['etf', 'ETF'], ['fonds', 'Fonds (OPCVM, unité de compte)'], ['action', 'Action'], ['crypto', 'Crypto'], ['fonds-euros', 'Fonds en euros'], ['structure', 'Produit structuré'], ['livret', 'Livret'], ['especes', 'Espèces'], ['non-cote', 'Non coté'], ['autre', 'Autre']];
const TYPE_LABEL = Object.fromEntries(TYPES);
const kindLabel = k => t(KINDS.find(x => x[0] === k)?.[1] || '');

const ICONS = {
  patrimoine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 4l9 6.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-5.5h5V20"/></svg>',
  analyse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 6"/></svg>',
  historique: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5V9H8"/><path d="M12 7.5V12l3 2"/></svg>',
  simuler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
  donnees: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  compte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="14" rx="2.5"/><path d="M3 10h18M15.5 15h2"/></svg>',
  transfert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20V4M3 8l4-4 4 4M17 4v16M13 16l4 4 4-4"/></svg>',
  nuage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5a4.5 4.5 0 1 1 .9-8.9 6 6 0 0 1 11.6 1.9 3.5 3.5 0 0 1-1.5 7z"/></svg>',
  cours: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  profil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
  telephone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8.5 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2"/></svg>',
  addHome: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5.5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="18.5" r="1.8"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M9 20.5h6M12 7.5v5.5M9.5 10.5 12 13l2.5-2.5"/></svg>',
};

// ——— Utilities ———
const $ = (s, root = document) => root.querySelector(s);
const accById = id => data.accounts.find(a => a.id === id);
const lineById = id => data.lines.find(l => l.id === id);
const initials = s => (String(s || '?').replace(/[^\p{L}\p{N}\s&]/gu, ' ').trim().split(/\s+/).filter(w => w.length > 1 || /\d/.test(w)).slice(0, 2).map(w => w[0]).join('') || String(s || '?')[0] || '?').toUpperCase();
// Library short names and the names Carnet gives cash lines (« Espèces », « Livret ») are translated; user names are not.
const shortName = l => { const s = libraryFor(l.isin)?.short; return s ? t(s) : isCashLike(l) && !l.customName ? t(l.name) : l.name; };
const isWide = () => matchMedia('(min-width: 1100px)').matches;
const today = () => new Date().toISOString().slice(0, 10);
function commit(msg) { setTimeout(ensurePersist, 0); data.updatedAt = new Date().toISOString(); if (!save(data) && !commit.warned) { commit.warned = true; toast(t('Stockage du navigateur indisponible : vos changements seront perdus en fermant la page.')); } else if (msg) toast(msg); render(); scheduleSync(); setTimeout(autoCompositions, 0); }

let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
}

// ——— Theme and language ———
function applyTheme() {
  const th = data.settings.theme;
  const root = document.documentElement;
  if (th === 'light' || th === 'dark') root.dataset.theme = th; else delete root.dataset.theme;
  const dark = th === 'dark' || (th !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', dark ? '#121010' : '#F5F1EB');
}
// Static texts of index.html (tab names, labels): the French original is kept in data-t / data-t-aria.
let shownLang = '';
function applyLang() {
  if (setLang(data.settings.lang) === shownLang) return;
  shownLang = lang();
  for (const el of document.querySelectorAll('[data-t]')) { el.dataset.t ||= el.textContent; el.textContent = t(el.dataset.t); }
  for (const el of document.querySelectorAll('[data-t-aria]')) { el.dataset.tAria ||= el.getAttribute('aria-label'); el.setAttribute('aria-label', t(el.dataset.tAria)); }
}

// ——— Main render ———
function render() {
  const v = $('#view');
  try {
    setFetchedLibrary(data.compositions);
    applyTheme();
    applyLang();
    const name = data.profile.firstName || '';
    for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false');
    for (const a of document.querySelectorAll('.avatar')) a.textContent = name ? name[0].toUpperCase() : 'C';
    const sideName = $('#side-name'); if (sideName) sideName.textContent = name || t('Votre profil');
    const fn = { patrimoine: viewHome, analyse: viewAnalyse, historique: viewHistorique, simuler: viewSimuler, donnees: viewData }[ui.tab] || viewHome;
    v.innerHTML = (data.demo ? demoBanner() : '') + fn();
    sizeBars(v);
    after[ui.tab]?.();
    setRefreshUI();
  } catch (e) { console.error(e); v.innerHTML = brokenView(e); }
}
const after = {};
// Bar lengths come as data-w (%): the CSP forbids style attributes, not styles set from script.
function sizeBars(root) { for (const el of root.querySelectorAll('[data-w]')) el.style.width = el.dataset.w + '%'; }

// Unreadable data (damaged or hand-edited backup): a way to export it, then wipe everything
function brokenView(e) {
  return `<div class="card"><h3>${t('Affichage impossible')}</h3>
    <p class="lead">${t('Une donnée enregistrée sur cet appareil est illisible ({err}). Exportez-la pour la garder, puis effacez les données de cet appareil.', { err: esc(e?.message) })}</p>
    <div class="btn-row"><button class="btn" data-action="export-plain">${ICONS.download}${t('Exporter en clair')}</button><button class="btn danger" data-action="wipe">${t('Effacer toutes les données')}</button></div></div>`;
}

function demoBanner() {
  return `<div class="demo-banner"><span>${t('Données d’exemple. Rien ici ne vous appartient.')}</span><button class="btn-pill light" data-action="clear-demo">${t('Effacer l’exemple')}</button></div>`;
}

function headline(tot) {
  const n = data.profile.firstName;
  const hi = n ? t('Bonjour {name},', { name: esc(n) }) : t('Bonjour,');
  if (tot.cost > 0 && Math.abs(tot.gainPct) >= 0.0005) {
    const up = tot.gain >= 0;
    const p = `<span class="hl ${up ? '' : 'down'}">${pct(Math.abs(tot.gainPct))}</span>`;
    return t(up ? '{hi} votre patrimoine est en hausse de {p}.' : '{hi} votre patrimoine est en baisse de {p}.', { hi, p });
  }
  return t('{hi} voici votre patrimoine.', { hi });
}

// ——— Patrimoine tab ———
function viewHome() {
  if (!data.lines.length && !data.accounts.length) return emptyState();
  const tot = totals(data);
  const parts = bigParts(tot.total);
  const hero = `<section class="hero" aria-label="${t('Patrimoine total')}">
    <div class="eyebrow">${t('Patrimoine total')}</div>
    <div class="big num"><span>${parts.int}<span class="dec">${parts.sep}${parts.dec}</span></span><span class="unit">${t('euros')}</span></div>
    <div class="pills">
      ${tot.cost > 0 ? `<span class="pill"><span class="dotc"></span>${t('{x} de plus-value', { x: signedEur(tot.gain) })}</span>` : ''}
      <span class="pill">${t('{x} en actions', { x: pct(tot.equityPct, 0) })}</span>
      ${tot.liquid > 0 ? `<span class="pill">${t('{x} d’espèces', { x: eur(tot.liquid, 0) })}</span>` : ''}
    </div>
    <div class="meta">${tot.cost > 0 ? t('Depuis l’achat, sur {x} investis.', { x: eur(tot.cost, 0) }) : t('Ajoutez des placements pour suivre leur plus-value.')}</div>
  </section>`;
  const stale = staleCard() + milestoneCard() + backupCard();
  const chart = `<section class="card chart-card" aria-label="${t('Évolution')}">
    <div class="chart-top"><label class="scope"><span class="sr">${t('Courbe de')}</span><span class="scope-label" aria-hidden="true">${esc(scopeLabel())}</span><select class="scope-select" id="chart-scope" data-scope>${scopeOptions()}</select></label>
      <div class="chips" role="group" aria-label="${t('Période')}">${['1M', '6M', '1A', 'Tout'].map(r => `<button class="chip" data-action="range" data-v="${r}" aria-pressed="${ui.range === r}">${t(r)}</button>`).join('')}</div>
    </div>
    <div class="chart-hover" id="chart-hover"></div>
    <div class="chart-host" id="chart-host"></div>
    <div class="legend"><span><i></i>${t('Valeur')}</span><span><i class="dash"></i>${t('Montant investi')}</span></div>
    ${Object.keys(data.priceHistory || {}).length ? '' : `<div class="chart-note">${t('Courbe reconstruite à partir des prix de vos transactions. Actualisez les cours pour un historique complet.')}</div>`}
  </section>`;
  // Accounts and envelopes share the same spot: a switch goes from one to the other.
  const groups = ui.group === 'envelopes' ? tot.envelopes.filter(e => e.value > 0).map(envelopeCard) : tot.accounts.map(accountCard);
  const accounts = `<div><div class="section-head mid"><h2>${t('Répartition')}</h2>
      <div class="chips" role="group" aria-label="${t('Regrouper par')}">${[['accounts', 'Comptes'], ['envelopes', 'Enveloppes']].map(([k, l]) => `<button class="chip" data-action="group" data-v="${k}" aria-pressed="${ui.group === k}">${t(l)}</button>`).join('')}</div></div>
    <div class="accounts">${groups.join('') || `<p class="muted">${t(ui.group === 'envelopes' ? 'Aucune ligne.' : 'Aucun compte.')}</p>`}</div></div>`;
  const lines = linesSection();
  if (isWide()) return `<h1 class="title">${headline(tot)}</h1>
    <div class="grid-home"><div class="col">${hero}${chart}${lines}</div><div class="col">${stale}${accounts}</div></div>`;
  return `<h1 class="title">${headline(tot)}</h1>
    <div class="grid-home">${hero}${stale}${chart}${lines}${accounts}</div>`;
}
// Chart scope: everything, one account (acc:id) or one envelope (env:name)
function scopeKeep() {
  const [k, v] = ui.scope.split(/:(.*)/);
  if (k === 'acc' && accById(v)) return l => l.accountId === v;
  if (k === 'env') return l => (l.envelope || 'Autre') === v;
  ui.scope = 'all'; return null;
}
// A select shows its widest option's width: the visible title is a label, the select lies over it.
function scopeLabel() {
  scopeKeep();
  const [k, v] = ui.scope.split(/:(.*)/);
  return k === 'acc' ? accById(v).name : k === 'env' ? t(v) : t('Évolution');
}
function scopeOptions() {
  const keep = scopeKeep();
  const envs = [...new Set(heldLines(data).map(l => l.envelope || 'Autre'))].sort((a, b) => ENVELOPE_ORDER.indexOf(a) - ENVELOPE_ORDER.indexOf(b));
  const opt = (v, label) => `<option value="${esc(v)}" ${ui.scope === v ? 'selected' : ''}>${esc(label)}</option>`;
  return opt('all', t('Évolution')) + (keep || data.accounts.length > 1 ? `<optgroup label="${t('Comptes')}">${data.accounts.map(a => opt('acc:' + a.id, a.name)).join('')}</optgroup>` : '')
    + (envs.length > 1 ? `<optgroup label="${t('Enveloppes')}">${envs.map(e => opt('env:' + e, t(e))).join('')}</optgroup>` : '');
}
after.patrimoine = () => {
  const host = $('#chart-host'); if (!host) return;
  const pts_ = buildHistory(data, new Date(), scopeKeep());
  const days = { '1M': 31, '6M': 183, '1A': 366, 'Tout': 1e6 }[ui.range];
  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const shown = pts_.filter(p => p.d >= from);
  const hover = $('#chart-hover');
  const base = shown.length > 1 ? (() => { const a = shown[0], b = shown[shown.length - 1]; const d = b.value - a.value - (b.invested - a.invested); return t('Sur la période : {x} hors versements', { x: signedEur(d, 0) }); })() : '';
  hover.textContent = base;
  lineChart(host, shown, { onHover: p => { hover.textContent = p ? hoverText(p) : base; } });
};

// Tax milestone reminder (PEA 5 years, life insurance 8 years): from two months before until a month after,
// once per date and device.
const MILESTONE_TEXT = {
  pea: 'Vos retraits seront alors exonérés d’impôt sur le revenu ; seuls les prélèvements sociaux restent dus. Un retrait ne ferme plus le plan.',
  av: 'Les gains retirés profiteront alors d’un abattement annuel de 4 600 € (9 200 € pour un couple) et d’un taux d’impôt réduit.',
};
function milestoneCard() {
  if (data.demo) return '';
  const seen = { ...(device().peaSeen || {}), ...(device().milestoneSeen || {}) };
  const due = data.accounts.map(a => ({ a, st: milestone(data, a) }))
    .find(({ a, st }) => st && st.days <= 60 && st.days >= -30 && seen[a.id] !== st.free);
  if (!due) return '';
  const { a, st } = due;
  return `<section class="callout milestone-hint" aria-label="${esc(kindLabel(a.kind))}">
    <p><b>${t(st.done ? '{name} a {n} ans depuis le {date}.' : '{name} aura {n} ans le {date}.', { name: esc(a.name), n: st.years, date: dateLong(st.free) })}</b> ${t(MILESTONE_TEXT[a.kind])}</p>
    <div class="btn-row"><button class="btn sm" data-action="milestone-seen" data-id="${esc(a.id)}" data-v="${esc(st.free)}">${t('Compris')}</button></div>
  </section>`;
}
// One line on the account's tax milestone, for the account sheet and the simulator.
function milestoneLine(a) {
  const years = MILESTONE_YEARS[a?.kind];
  if (!years) return '';
  const st = milestone(data, a);
  if (!st) return t('Indiquez la date du premier versement (Modifier le compte) pour connaître la date des {n} ans.', { n: years });
  const when = a.kind === 'pea'
    ? t(st.done ? 'Retraits exonérés d’impôt sur le revenu depuis le {date}.' : 'Retraits exonérés d’impôt sur le revenu à partir du {date}.', { date: dateLong(st.free) })
    : t(st.done ? 'Rachats avec abattement sur les gains depuis le {date}.' : 'Rachats avec abattement sur les gains à partir du {date}.', { date: dateLong(st.free) });
  return when + ' ' + t(st.guessed ? '{n} ans après la première opération connue ({x}).' : '{n} ans après le premier versement ({x}).', { n: years, x: dateLong(st.start) });
}

function staleCard() {
  const st = staleLines(data, new Date(), data.settings.staleDays || 4);
  if (!st.length) return '';
  if (data.settings.snoozeUntil && data.settings.snoozeUntil > new Date().toISOString()) return '';
  const oldest = st.map(l => l.priceDate).filter(Boolean).sort()[0];
  const days = data.settings.staleDays || 4;
  return `<section class="night" aria-label="${t('Cours à actualiser')}">
    <p class="lead">${tn(st.length, 'Un cours a plus de {d} jours.', '{n} cours ont plus de {d} jours.', { d: days })}</p>
    <p class="sub">${oldest ? t('Le plus ancien date du {x}.', { x: dateLong(oldest) }) : t('Certains cours n’ont jamais été actualisés.')} ${t('Les montants affichés en dépendent.')}</p>
    <div class="row"><button class="btn-pill light refresh-btn" data-action="refresh"><span class="ic">${ICONS.refresh}</span>${t('Actualiser')}</button><button class="btn-pill ghost" data-action="snooze">${t('Plus tard')}</button></div>
  </section>`;
}

function accountCard(a) {
  const acc = a.account;
  const on = Math.round(a.share * 20);
  return `<button class="acc" data-action="open-account" data-id="${esc(acc.id)}">
    <span class="tile c-${esc(acc.color || 'ink')}">${esc(initials(acc.name))}</span>
    <span class="name">${esc(kindLabel(acc.kind) || t('Compte'))}</span><span class="val">${eur(a.value, 0)}</span>
    <span class="sub">${esc(acc.name)}${a.gain && Math.abs(a.gain) >= 0.5 ? ` · <span class="${a.gain >= 0 ? 'pos' : 'neg'}">${signedEur(a.gain, 0)}</span>` : ''}</span><span class="share">${pct(a.share, 0)}</span>
    <span class="segs" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i class="${i < on ? 'on c-' + esc(acc.color || 'ink') : ''}"></i>`).join('')}</span>
  </button>`;
}

// Tapping an envelope filters the holdings on it.
function envelopeCard(e) {
  const n = heldLines(data).filter(l => (l.envelope || 'Autre') === e.name).length;
  const on = Math.round(e.share * 20);
  return `<button class="acc" data-action="env-lines" data-v="${esc(e.name)}">
    <span class="tile c-ink">${esc(initials(t(e.name)))}</span>
    <span class="name">${esc(t(e.name))}</span><span class="val">${eur(e.value, 0)}</span>
    <span class="sub">${tn(n, '{n} ligne', '{n} lignes')}</span><span class="share">${pct(e.share, 0)}</span>
    <span class="segs" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i class="${i < on ? 'on c-ink' : ''}"></i>`).join('')}</span>
  </button>`;
}

function linesSection() {
  const held = heldLines(data);
  const envs = [...new Set(held.map(l => l.envelope || 'Autre'))].sort((a, b) => ENVELOPE_ORDER.indexOf(a) - ENVELOPE_ORDER.indexOf(b));
  if (ui.filter !== 'all' && !envs.includes(ui.filter)) ui.filter = 'all';
  const ls = held.filter(l => ui.filter === 'all' || (l.envelope || 'Autre') === ui.filter).sort((a, b) => lineValue(b) - lineValue(a));
  return `<div id="lines"><div class="section-head"><h2>${t('Lignes')}</h2><button class="linkish" data-action="add-line">${t('Ajouter')}</button></div>
    <div class="filters" role="group" aria-label="${t('Filtrer par enveloppe')}">
      <button class="filter" data-action="filter" data-v="all" aria-pressed="${ui.filter === 'all'}">${t('Toutes')}</button>
      ${envs.map(e => `<button class="filter" data-action="filter" data-v="${esc(e)}" aria-pressed="${ui.filter === e}">${esc(t(e))}</button>`).join('')}
    </div>
    <div class="lines">${ls.map(lineRow).join('') || `<p class="muted p16">${t('Aucune ligne.')}</p>`}</div></div>`;
}

function lineRow(l) {
  const acc = accById(l.accountId);
  const g = lineGain(l), c = lineCost(l);
  const stale = QUOTE_EXPECTED(l) && daysAgo(l.priceDate) > (data.settings.staleDays || 4);
  const where = esc(acc?.name || '');
  const sub = isCashLike(l) ? `${where} · ${esc(t(l.envelope || ''))}` : l.estimateFromAmount ? `${where} · ${t('{x} investis', { x: eur(l.cost) })}`
    : `${where} · ${tn(l.qty, '{n} part', '{n} parts', { n: qtyShort(l.qty) })}${l.qtyEstimated ? ' ' + t('(estim.)') : ''}${l.pending ? ' · ' + t('{x} en attente', { x: eur(l.pending, 0) }) : ''}`;
  return `<button class="line" data-action="open-line" data-id="${esc(l.id)}">
    <span class="mono t-${esc(l.type)}">${esc(initials(shortName(l)))}</span>
    <span class="n">${esc(shortName(l))}${stale ? `<span class="badge warn">${t('cours ancien')}</span>` : ''}</span><span class="v">${eur(lineValue(l))}</span>
    <span class="s">${sub}</span>
    <span class="g ${c > 0 && Math.abs(g / c) >= 0.0005 ? (g > 0 ? 'pos' : 'neg') : 'muted'}">${isCashLike(l) ? '<span class="muted">—</span>' : c > 0 ? signedPct(g / c) : ''}</span>
  </button>`;
}

function emptyState() {
  return `<div class="empty">
    <div class="orb" aria-hidden="true"><i class="ring"></i><i class="core"></i><i class="s1"></i><i class="s2"></i><i class="s3"></i></div>
    <div class="wordmark">Carnet<span class="dot">.</span></div>
    <h1 class="title empty-title">${t('Votre patrimoine, en un seul endroit.')}<em>${t('Et seulement sur cet appareil.')}</em></h1>
    <p>${t('Importez vos transactions Trade Republic ou votre assurance-vie Linxea, restaurez une sauvegarde, ou ajoutez vos comptes à la main.')}</p>
    <div class="btn-row">
      <button class="btn primary" data-action="pick-csv">${ICONS.upload}${t('Importer un CSV Trade Republic')}</button>
      <button class="btn" data-action="import-guide" data-v="linxea">${ICONS.upload}${t('Importer un export Linxea')}</button>
      <button class="btn" data-action="pick-backup">${t('Restaurer une sauvegarde')}</button>
      <button class="btn" data-action="add-account">${ICONS.plus}${t('Ajouter un compte')}</button>
    </div>
    <button class="linkish mt14" data-action="demo">${t('Essayer avec des données d’exemple')}</button>
  </div>`;
}

// ——— Analyse tab ———
function viewAnalyse() {
  const tot = totals(data);
  if (!data.lines.length) return `<h1 class="title">${t('Où va votre argent.')}<em>${t('Secteurs, pays et entreprises.')}</em></h1>${emptyHint()}`;
  const lt = lookthrough(data);
  const top10 = lt.companies.slice(0, 10).reduce((s, c) => s + c.value, 0);
  const first = lt.companies[0];
  const st = data.trStats;
  const perf = performance(data);
  // Total, gain and cash are already on the home screen: here, only what sheds light on the breakdown.
  const sums = [
    { k: t('Part en actions'), v: pct(tot.equityPct, 0), d: eur(tot.equity, 0) },
    { k: t('10 premières entreprises'), v: pct(tot.total ? top10 / tot.total : 0), d: first ? t('dont {name} {p}', { name: esc(first.name), p: pct(tot.total ? first.value / tot.total : 0) }) : '' },
    ...st && !perf ? [{ k: t('Dividendes reçus'), v: eur(st.dividends), d: t('nets de retenue') }, { k: t('Frais payés'), v: eur(st.fees), d: t('depuis le {x}', { x: dateLong(st.from) }) }] : [],
  ];
  const list = { sectors: lt.sectors, countries: lt.countries, companies: lt.companies.slice(0, 15) }[ui.analyse];
  const max = Math.max(...list.map(x => x.value), 1);
  return `<h1 class="title">${t('Où va votre argent.')}<em>${t('À travers vos fonds.')}</em></h1>
    ${sumsCard(sums)}
    ${perfSection(perf)}
    <div class="section-head"><h2>${t('Répartition')}</h2><span class="aside">${t('hors espèces · {x}', { x: eur(lt.base, 0) })}</span></div>
    <div class="card">
      <div class="seg" role="group" aria-label="${t('Répartition')}">${[['sectors', 'Secteurs'], ['countries', 'Pays'], ['companies', 'Entreprises']].map(([k, l]) => `<button data-action="analyse" data-v="${k}" aria-pressed="${ui.analyse === k}">${t(l)}</button>`).join('')}</div>
      <div class="bars">${list.map((x, i) => `<button class="barrow" data-action="open-split" data-v="${i}" aria-label="${t('{name} : détail', { name: esc(t(x.name)) })}"><span class="n">${esc(t(x.name))}</span><span class="p"><b>${eur(x.value, 0)}</b>${pct(x.pct)}</span><span class="track"><i data-w="${(100 * x.value / max).toFixed(1)}"></i></span></button>`).join('') || `<p class="muted">${t('Rien à afficher.')}</p>`}</div>
      <p class="note">${ui.analyse === 'companies' ? t('Montants détenus à travers vos ETF (principales positions de chaque fonds) et en direct.') + ' ' : ''}${t('{p} des placements sont ventilés ; le reste (non coté, fonds inconnus) apparaît en « Non ventilé » ou « Capital-investissement ».', { p: pct(lt.coverage, 0) })} ${t(COMPOSITION_NOTE)}</p>
    </div>
    ${targetSection()}
    <div class="btn-row mt22"><button class="btn" data-action="share">${ICONS.share}${t('Partager ma répartition, sans montants')}</button></div>`;
}

// Real performance of the imported accounts: what was paid in, what it is worth, and the annual rate.
const gainCls = x => x > 0.5 ? 'pos' : x < -0.5 ? 'neg' : '';
function perfSection(p) {
  const head = names => `<div class="section-head"><h2>${t('Performance')}</h2>${names ? `<span class="aside">${esc(names)}</span>` : ''}</div>`;
  if (!p) return noCashHistory() ? head('') + reimportCard() : '';
  const year = p.days >= 365;
  const r = year ? p.rate : p.periodRate;
  const income = p.income.dividends + p.income.interest + p.income.bonus;
  const st = data.trStats;
  return `${head(p.accounts.length === 1 ? accById(p.accounts[0])?.name : tn(p.accounts.length, '{n} compte avec historique', '{n} comptes avec historique'))}
    ${sumsCard([
      { k: t('Versé'), v: eur(p.net, 0), d: t('net des retraits, depuis le {x}', { x: dateLong(p.from) }) },
      { k: t('Gain réel'), v: signedEur(p.gain, 0), d: t('valeur aujourd’hui : {x}', { x: eur(p.value, 0) }), cls: gainCls(p.gain) },
      { k: t(year ? 'Rendement annualisé' : 'Rendement'), v: r == null ? '—' : signedPct(r), d: t(year ? 'par an, selon les dates de vos versements' : 'sur la période (moins d’un an)'), cls: r == null ? '' : r > 0.0005 ? 'pos' : r < -0.0005 ? 'neg' : '' },
      { k: t('Revenus'), v: eur(income), d: t('dividendes, intérêts, bonus nets') },
      ...st ? [{ k: t('Frais payés'), v: eur(st.fees), d: t('achats et ventes') }] : [],
    ])}
    <p class="note">${t('Sur les comptes importés, à partir de vos versements datés. Le gain réel inclut plus-values, dividendes, intérêts, frais et impôts ; le rendement annualisé tient compte de la date de chaque versement.')}</p>`;
}

// Target allocation: the gap of each line with a target, measured on the lines that have one.
// Cash lines all read « Espèces »: their account tells them apart.
const allocName = l => isCashLike(l) ? `${shortName(l)} · ${accById(l.accountId)?.name || ''}` : shortName(l);
function targetSection() {
  const a = allocation(data);
  const head = `<div class="section-head"><h2>${t('Allocation cible')}</h2>${a ? `<button class="linkish" data-action="targets">${t('Modifier')}</button>` : ''}</div>`;
  if (!a) return `${head}<div class="card"><p class="lead m-b12">${t('Fixez la part visée de chaque ligne : Carnet montre l’écart, et le simulateur propose comment rééquilibrer.')}</p>
    <div class="btn-row"><button class="btn" data-action="targets">${t('Définir ma cible')}</button></div></div>`;
  return `${head}<div class="card">
    <div class="compare tight">${a.rows.map(r => `<div class="cmp"><span class="k">${esc(allocName(r.line))}</span><span class="v"><span class="from">${pct(r.pct)}</span>→ ${pct(r.target)}</span><span class="x ${Math.abs(r.gap) < 0.01 ? '' : r.gap > 0 ? 'pos' : 'neg'}">${pts(r.gap)}</span></div>`).join('')}</div>
    <p class="note">${t('Part actuelle → cible, et l’écart en points. Mesuré sur les lignes qui ont une cible ({x}).', { x: eur(a.base, 0) })}</p>
    <div class="btn-row"><button class="btn sm" data-action="go-rebalance">${t('Rééquilibrer')}</button></div></div>`;
}

function targetSheet() {
  const ls = heldLines(data).filter(l => lineValue(l) > 0);
  const order = new Map(data.accounts.map((a, i) => [a.id, i]));
  ls.sort((x, y) => (order.get(x.accountId) - order.get(y.accountId)) || lineValue(y) - lineValue(x));
  const had = ls.some(l => +l.target > 0);
  const groups = [...new Set(ls.map(l => l.accountId))].map(id => `<div class="section-head mt12"><h2>${esc(accById(id)?.name || '')}</h2></div>
    ${ls.filter(l => l.accountId === id).map(l => `<label class="target-row"><span class="n">${esc(shortName(l))}<span class="s">${eur(lineValue(l), 0)}</span></span>
      <span class="target-in"><input class="input" inputmode="decimal" data-tid="${esc(l.id)}" value="${+l.target > 0 ? inputNum(l.target, 1) : ''}" placeholder="0" aria-label="${t('Cible de {name} (%)', { name: esc(shortName(l)) })}"><span>%</span></span></label>`).join('')}`).join('');
  openSheet(`${sheetHead(t('Allocation cible'), t('La part visée de chaque ligne, sur 100 %. Laissez vide les lignes hors cible.'))}
    <form class="form" autocomplete="off" novalidate>
      <div class="target-list">${groups}</div>
      <p class="target-sum" id="tg-sum" aria-live="polite"></p>
      <div class="btn-row"><button class="btn primary" type="submit">${t('Enregistrer')}</button><button class="btn" type="button" data-fill>${t('Partir de la répartition actuelle')}</button>${had ? `<button class="btn danger" type="button" data-clear>${t('Effacer la cible')}</button>` : ''}</div>
    </form>`, {
    label: t('Allocation cible'),
    onMount: (sh, close) => {
      const inputs = [...sh.querySelectorAll('[data-tid]')];
      const total = () => inputs.reduce((s, i) => s + (parseNum(i.value) || 0), 0);
      const n1 = x => num(x, Math.abs(x - Math.round(x)) < 0.05 ? 0 : 1);
      const show = () => {
        const x = total(), el = sh.querySelector('#tg-sum');
        el.className = 'target-sum ' + (Math.abs(x - 100) <= 0.05 ? 'pos' : x ? 'neg' : '');
        el.textContent = !x ? t('Aucune cible.') : Math.abs(x - 100) <= 0.05 ? t('Total : 100 %.') : x < 100 ? t('Total : {x} %, il manque {y} points.', { x: n1(x), y: n1(100 - x) }) : t('Total : {x} %, {y} points de trop.', { x: n1(x), y: n1(x - 100) });
      };
      sh.addEventListener('input', show); show();
      // Current shares, among the lines that already have a target (all lines otherwise), rounded to 0.1 %.
      sh.querySelector('[data-fill]').addEventListener('click', () => {
        const pick = inputs.filter(i => parseNum(i.value) > 0);
        const use = pick.length ? pick : inputs;
        const vals = use.map(i => lineValue(lineById(i.dataset.tid)));
        const sum = vals.reduce((a, b) => a + b, 0) || 1;
        const r = vals.map(v => Math.round(1000 * v / sum) / 10);
        const k = r.indexOf(Math.max(...r)); r[k] = Math.round((r[k] + 100 - r.reduce((a, b) => a + b, 0)) * 10) / 10;
        use.forEach((i, j) => { i.value = r[j] ? inputNum(r[j], 1) : ''; });
        show();
      });
      sh.querySelector('[data-clear]')?.addEventListener('click', () => { for (const l of data.lines) delete l.target; close(); commit(t('Cible effacée.')); });
      sh.querySelector('form').addEventListener('submit', e => {
        e.preventDefault();
        const x = total();
        if (inputs.some(i => i.value.trim() && !(parseNum(i.value) >= 0))) { toast(t('Indiquez des pourcentages, par exemple 70 ou 12,5.')); return; }
        if (x && Math.abs(x - 100) > 0.05) { toast(t('Les cibles doivent faire 100 % au total.')); return; }
        for (const i of inputs) { const l = lineById(i.dataset.tid); const v = parseNum(i.value); if (v > 0) l.target = Math.round(v * 10) / 10; else delete l.target; }
        close(); commit(t(x ? 'Cible enregistrée.' : 'Cible effacée.'));
      });
    },
  });
}
// Detail of one breakdown entry: what makes up the amount, largest first
const SPLIT_WORD = { sectors: '{p} du secteur', countries: '{p} du pays', companies: '{p} de la position' };
function openSplit(i) {
  const dim = ui.analyse;
  const lt = lookthrough(data);
  const x = lt[dim]?.[+i]; if (!x) return;
  const row = (p, r, sub) => `<div class="holding"><span class="r">${r}</span><span class="n">${esc(t(p.name))}</span><span class="a">${eur(p.value)}</span>
    <span class="w">${t(SPLIT_WORD[dim], { p: pct(p.pct) })}${sub ? ' · ' + sub : ''}</span><span class="track"><i data-w="${(100 * Math.min(1, p.pct)).toFixed(1)}"></i></span></div>`;
  const direct = t('en direct');
  const via = p => {
    if (!p.via.length) return '';
    if (p.via.length === 1) return p.via[0].name === DIRECT ? direct : t('via {x}', { x: esc(p.via[0].name) });
    return t('via {x}', { x: p.via.map(v => `${v.name === DIRECT ? direct : esc(v.name)} ${eur(v.value, 0)}`).join(', ') });
  };
  let body;
  if (dim === 'companies') {
    body = `<div class="section-head mt22"><h2>${t('Détenue à travers')}</h2><span class="aside">${tn(x.parts.length, '{n} ligne', '{n} lignes')}</span></div>
      <div class="holdings">${x.parts.map((p, r) => row(p, r + 1, p.kind === 'direct' ? direct : t('{p} du fonds', { p: pct(p.weight) }))).join('')}</div>`;
  } else {
    const named = x.parts.filter(p => p.kind !== 'rest'), rest = x.parts.filter(p => p.kind === 'rest');
    const restSum = rest.reduce((s, p) => s + p.value, 0);
    body = `${named.length ? `<div class="section-head mt22"><h2>${t(named.some(p => p.kind === 'company') ? 'Entreprises' : 'Lignes')}</h2><span class="aside">${t('classées par montant')}</span></div>
      <div class="holdings">${named.map((p, r) => row(p, r + 1, p.kind === 'line' ? t('ligne entière') : via(p))).join('')}</div>` : ''}
      ${rest.length ? `<div class="section-head mt22"><h2>${t('Reste des fonds')}</h2><span class="aside">${eur(restSum, 0)} · ${pct(x.value ? restSum / x.value : 0)}</span></div>
      <p class="note m-x2b6">${t(dim === 'countries' ? 'Autres entreprises de ces fonds dans ce pays, au-delà de leurs principales positions.' : 'Autres entreprises de ces fonds dans ce secteur, au-delà de leurs principales positions.')}</p>
      <div class="holdings">${rest.map(p => row(p, '·', t('autres positions du fonds'))).join('')}</div>` : ''}`;
  }
  const label = t({ sectors: 'Secteur', countries: 'Pays', companies: 'Entreprise' }[dim]);
  openSheet(`${sheetHead(esc(t(x.name)), t('{label} · {p} des placements hors espèces', { label, p: pct(x.pct) }))}
    <div class="detail-big">${eur(x.value)}</div>
    ${body}
    <p class="note">${t(COMPOSITION_NOTE)}</p>`, { label: t(x.name) });
}

// A few key figures in one card.
function sumsCard(sums) {
  return `<div class="card sums">${sums.map(x => `<div><span class="k">${x.k}</span><span class="v ${x.cls || ''}">${x.v}</span><span class="d">${x.d}</span></div>`).join('')}</div>`;
}

function emptyHint() {
  return `<div class="card"><p class="muted m-b12">${t('Aucune donnée pour l’instant.')}</p><div class="btn-row"><button class="btn primary" data-action="go" data-v="donnees">${t('Importer ou ajouter des lignes')}</button></div></div>`;
}

// ——— Anonymous view ———
// Percentages only, never an amount: to show one's allocation without showing one's wealth.
const SHARE_PARTS = [['envelopes', 'Enveloppes'], ['lines', 'Lignes'], ['sectors', 'Secteurs'], ['countries', 'Pays']];
function shareSections(parts) {
  const tot = totals(data), lt = lookthrough(data);
  const top = (list, n) => { const rest = list.slice(n).reduce((s, x) => s + x.pct, 0); return rest >= 0.0005 ? [...list.slice(0, n), { name: t('Autres'), pct: rest }] : list.slice(0, n); };
  const lines = heldLines(data).filter(l => lineValue(l) > 0).sort((a, b) => lineValue(b) - lineValue(a)).map(l => ({ name: allocName(l), pct: tot.total ? lineValue(l) / tot.total : 0 }));
  const out = {
    envelopes: { title: t('Enveloppes'), rows: top(tot.envelopes.filter(e => e.value > 0).map(e => ({ name: t(e.name), pct: e.share })), 6) },
    lines: { title: t('Lignes'), rows: top(lines, 8) },
    sectors: { title: t('Secteurs'), sub: t('hors espèces'), rows: top(lt.sectors.map(x => ({ name: t(x.name), pct: x.pct })), 6) },
    countries: { title: t('Pays'), sub: t('hors espèces'), rows: top(lt.countries.map(x => ({ name: t(x.name), pct: x.pct })), 6) },
  };
  return SHARE_PARTS.filter(([k]) => parts[k] && out[k].rows.length).map(([k]) => out[k]);
}
const sharePct = x => pct(x, x < 0.0995 ? 1 : 0);
function shareText(sections) {
  return [t('Ma répartition, sans montants · Carnet, {date}', { date: dateLong(today()) }),
    ...sections.map(sec => `${sec.title}${sec.sub ? ` (${sec.sub})` : ''}\n${sec.rows.map(r => `• ${r.name} : ${sharePct(r.pct)}`).join('\n')}`)].join('\n\n');
}
// The same, drawn as an image (light colours whatever the theme).
async function shareImage(sections) {
  const W = 1080, P = 72, ROW = 74, HEAD = 86;
  const serif = "'Lora', Georgia, serif", sans = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  try { await document.fonts.load(`500 56px Lora`); } catch { /* system serif */ }
  const H = 230 + sections.reduce((s, sec) => s + HEAD + sec.rows.length * ROW + 30, 0) + 70;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const C = { bg: '#F5F1EB', ink: '#1A1613', muted: '#857A70', track: '#E2D8CB', bars: ['#1A1613', '#EE6418', '#3E63F2', '#2F8F6A'] };
  const bar = (x, w) => { c.beginPath(); if (c.roundRect) c.roundRect(x, 0, w, 10, 5); else c.rect(x, 0, w, 10); c.fill(); };
  const fit = (text, max) => { if (c.measureText(text).width <= max) return text; let s = text; while (s.length > 1 && c.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
  c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
  c.fillStyle = C.ink; c.font = `500 56px ${serif}`; c.textBaseline = 'alphabetic';
  c.fillText(t('Ma répartition'), P, 120);
  c.fillStyle = C.muted; c.font = `400 28px ${sans}`;
  c.fillText(t('En pourcentages, sans aucun montant · {date}', { date: dateLong(today()) }), P, 168);
  let y = 230;
  sections.forEach((sec, i) => {
    c.fillStyle = C.ink; c.font = `500 38px ${serif}`; c.fillText(sec.title, P, y + 44);
    if (sec.sub) { const w = c.measureText(sec.title).width; c.fillStyle = C.muted; c.font = `400 24px ${sans}`; c.fillText(sec.sub, P + w + 16, y + 44); }
    y += HEAD;
    const max = Math.max(...sec.rows.map(r => r.pct), 0.0001);
    for (const r of sec.rows) {
      c.font = `700 30px ${sans}`; const p = sharePct(r.pct); const pw = c.measureText(p).width;
      c.fillStyle = C.ink; c.fillText(p, W - P - pw, y + 30);
      c.font = `400 30px ${sans}`; c.fillText(fit(r.name, W - 2 * P - pw - 24), P, y + 30);
      const bw = W - 2 * P;
      c.save(); c.translate(0, y + 46);
      c.fillStyle = C.track; bar(P, bw);
      c.fillStyle = C.bars[i % C.bars.length]; bar(P, Math.max(10, bw * r.pct / max)); c.restore();
      y += ROW;
    }
    y += 30;
  });
  c.fillStyle = C.muted; c.font = `400 24px ${sans}`; c.fillText('Carnet.', P, H - 44);
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
function shareSheet() {
  const parts = { envelopes: true, lines: true, sectors: true, countries: true };
  let blob = null, url = '';
  const file = () => new File([blob], 'carnet-repartition.png', { type: 'image/png' });
  let canFiles = false;
  try { canFiles = !!navigator.canShare?.({ files: [new File([''], 'x.png', { type: 'image/png' })] }); } catch { /* no file sharing */ }
  openSheet(`${sheetHead(t('Partager ma répartition'), t('En pourcentages, sans aucun montant.'))}
    <div class="chips share-parts" role="group" aria-label="${t('Contenu')}">${SHARE_PARTS.map(([k, l]) => `<button class="chip" data-part="${k}" aria-pressed="true">${t(l)}</button>`).join('')}</div>
    <img class="share-img" alt="${t('Aperçu de l’image partagée')}">
    <div class="btn-row"><button class="btn primary" data-share>${ICONS.share}${t(canFiles ? 'Partager l’image' : 'Télécharger l’image')}</button><button class="btn" data-copy>${t('Copier le texte')}</button></div>
    <p class="note">${t('Les noms de vos lignes apparaissent ; décochez « Lignes » pour ne montrer que les grandes masses.')}</p>`, {
    label: t('Partager ma répartition'),
    onClose: () => { if (url) URL.revokeObjectURL(url); },
    onMount: (sh) => {
      const img = sh.querySelector('.share-img');
      const build = async () => {
        const secs = shareSections(parts);
        sh.querySelector('[data-share]').disabled = !secs.length; sh.querySelector('[data-copy]').disabled = !secs.length;
        img.hidden = !secs.length; if (!secs.length) return;
        blob = await shareImage(secs);
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(blob); img.src = url;
      };
      build();
      sh.addEventListener('click', async e => {
        const part = e.target.closest('[data-part]');
        if (part) { parts[part.dataset.part] = !parts[part.dataset.part]; part.setAttribute('aria-pressed', parts[part.dataset.part]); build(); return; }
        if (e.target.closest('[data-copy]')) {
          try { await navigator.clipboard.writeText(shareText(shareSections(parts))); toast(t('Copié.')); } catch { toast(t('Copie impossible ici.')); }
        }
        if (e.target.closest('[data-share]') && blob) {
          if (canFiles) { try { await navigator.share({ files: [file()], title: t('Ma répartition') }); } catch { /* cancelled */ } return; }
          const a = document.createElement('a'); a.href = url; a.download = 'carnet-repartition.png'; document.body.append(a); a.click(); a.remove();
        }
      });
    },
  });
}

// ——— Historique tab ———
// Operations kept at import: security transactions (buys, sells, splits…) and cash movements
// (deposits, withdrawals, dividends, interest; card payments summed per month).
const OP_LABEL = { BUY: 'Achat', SELL: 'Vente', SPLIT: 'Division', BONUS_ISSUE: 'Attribution gratuite', FREE_RECEIPT: 'Réception de titres', PRIVATE_MARKET_BUY: 'Souscription', DIVIDEND: 'Dividende', INTEREST: 'Intérêts', BONUS: 'Bonus', DEPOSIT: 'Versement', WITHDRAWAL: 'Retrait', CARD: 'Paiements par carte', CASH_OTHER: 'Autre mouvement', TAX: 'Impôt', FEE: 'Frais' };
const HIST_KINDS = [['all', 'Toutes'], ['BUY', 'Achats'], ['SELL', 'Ventes'], ['income', 'Revenus'], ['flows', 'Versements'], ['other', 'Autres']];
const isBuy = tr => tr.kind === 'BUY' || tr.kind === 'PRIVATE_MARKET_BUY';
const isTrade = tr => isBuy(tr) || tr.kind === 'SELL';
const histGroup = tr => isBuy(tr) ? 'BUY' : tr.kind === 'SELL' ? 'SELL' : INCOME_KINDS.has(tr.kind) ? 'income' : FLOW_KINDS.has(tr.kind) ? 'flows' : 'other';
const isCashMove = tr => INCOME_KINDS.has(tr.kind) || FLOW_KINDS.has(tr.kind) || tr.kind === 'TAX' || tr.kind === 'FEE';
const opName = tr => { const s = libraryFor(tr.isin)?.short; return s ? t(s) : tr.name || tr.isin || t(OP_LABEL[tr.kind] || tr.kind); };
// Imports before 1.4 kept only security transactions: deposits and dividends need a new import.
const noCashHistory = () => !!data.trStats && (data.transactions || []).some(tr => tr.source === 'tr') && !(data.transactions || []).some(isCashMove);

function histFiltered() {
  const h = ui.hist;
  const q = h.q.trim().toLowerCase();
  return (data.transactions || [])
    .filter(tr => h.kind === 'all' || histGroup(tr) === h.kind)
    .filter(tr => h.acc === 'all' || tr.accountId === h.acc)
    .filter(tr => !q || opName(tr).toLowerCase().includes(q) || String(tr.name || '').toLowerCase().includes(q) || String(tr.isin || '').toLowerCase().includes(q))
    .map((tr, i) => [tr, i]).sort((a, b) => (a[0].date < b[0].date ? 1 : a[0].date > b[0].date ? -1 : b[1] - a[1])).map(x => x[0]);
}

function viewHistorique() {
  const title = `<h1 class="title">${t('Vos opérations.')}<em>${t('Achats, ventes, revenus et versements.')}</em></h1>`;
  const all = data.transactions || [];
  if (!all.length) {
    if (!data.trStats) return title + (data.lines.length ? `<div class="card"><p class="muted m0">${t('Aucune opération enregistrée : elles viennent de l’import Trade Republic. L’export Linxea et les lignes ajoutées à la main ne donnent que des positions.')}</p></div>` : emptyHint());
    return title + `<div class="card"><p class="muted m-b12">${t('L’historique se remplit à l’import. Réimportez votre export Trade Republic : les imports précédents ne gardaient que les positions, pas le détail des opérations.')}</p>
      <div class="btn-row"><button class="btn primary" data-action="pick-csv">${ICONS.upload}${t('Importer le CSV')}</button></div></div>`;
  }
  const h = ui.hist;
  const accs = [...new Set(all.map(tr => tr.accountId))].map(accById).filter(Boolean);
  if (h.acc !== 'all' && !accs.some(a => a.id === h.acc)) h.acc = 'all';
  const manual = data.lines.some(l => l.source !== 'tr' && !isCashLike(l) && isHeld(l));
  const positionsOnly = data.lines.some(l => l.source === 'linxea' && isHeld(l));
  return `${title}
    ${noCashHistory() ? reimportCard() : ''}
    <div class="hist-tools">
      <label class="hist-search"><span class="sr">${t('Rechercher')}</span><input class="input" type="search" id="hist-q" data-hist="q" value="${esc(h.q)}" placeholder="${t('Produit ou ISIN')}" autocomplete="off"></label>
      ${accs.length > 1 ? `<label class="hist-acc"><span class="sr">${t('Compte')}</span><select class="input" id="hist-acc" data-hist="acc"><option value="all">${t('Tous les comptes')}</option>${accs.map(a => `<option value="${esc(a.id)}" ${h.acc === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : ''}
    </div>
    <div class="filters" role="group" aria-label="${t('Type d’opération')}">${HIST_KINDS.map(([k, l]) => `<button class="filter" data-action="hist-kind" data-v="${k}" aria-pressed="${h.kind === k}">${t(l)}</button>`).join('')}</div>
    <div id="hist-body">${histBody()}</div>
    ${manual && !data.demo ? `<p class="note">${t(positionsOnly ? 'Les lignes ajoutées à la main et les contrats Linxea (l’export ne donne que les positions) n’ont pas d’historique d’opérations.' : 'Les lignes ajoutées à la main n’ont pas d’historique d’opérations.')}</p>` : ''}`;
}
function reimportCard() {
  return `<div class="callout m-b14">${t('Réimportez votre export Trade Republic pour voir aussi vos versements, dividendes et intérêts, et calculer votre performance réelle.')}
    <div class="btn-row mt10"><button class="btn sm" data-action="pick-csv">${ICONS.upload}${t('Importer le CSV')}</button></div></div>`;
}

// Key figures of the shown operations, chosen for the filter.
function histSums(ts, kind) {
  const sum = f => ts.reduce((s, tr) => s + (f(tr) || 0), 0);
  const of = (...kinds) => tr => kinds.includes(tr.kind) ? netAmount(tr) : 0;
  const count = (...kinds) => ts.filter(tr => kinds.includes(tr.kind)).length;
  if (kind === 'income') {
    const tax = sum(tr => INCOME_KINDS.has(tr.kind) ? tr.tax : 0);
    return [
      { k: t('Dividendes'), v: eur(sum(of('DIVIDEND'))), d: tn(count('DIVIDEND'), '{n} versement', '{n} versements') },
      { k: t('Intérêts'), v: eur(sum(of('INTEREST'))), d: tn(count('INTEREST'), '{n} versement', '{n} versements') },
      { k: t('Bonus'), v: eur(sum(of('BONUS'))), d: t('saveback, primes') },
      { k: t('Impôts retenus'), v: eur(Math.abs(tax)), d: t('à la source, déjà déduits') },
    ];
  }
  if (kind === 'flows') {
    const dep = sum(tr => FLOW_KINDS.has(tr.kind) && tr.amount > 0 ? tr.amount : 0), out = sum(tr => FLOW_KINDS.has(tr.kind) && tr.amount < 0 ? -tr.amount : 0);
    return [
      { k: t('Versé'), v: eur(dep, 0), d: tn(count('DEPOSIT'), '{n} versement', '{n} versements') },
      { k: t('Retiré'), v: eur(out, 0), d: t('retraits et paiements par carte') },
      { k: t('Net versé'), v: signedEur(dep - out, 0), d: t('ce qui est resté investi') },
    ];
  }
  const bought = sum(tr => isBuy(tr) ? Math.abs(tr.amount) : 0), sold = sum(tr => tr.kind === 'SELL' ? Math.abs(tr.amount) : 0);
  const realized = sum(tr => tr.realized), fees = sum(tr => isTrade(tr) ? Math.abs(tr.fee || 0) : 0);
  const nBuy = ts.filter(isBuy).length, nSell = ts.filter(tr => tr.kind === 'SELL').length;
  const income = ts.filter(tr => INCOME_KINDS.has(tr.kind));
  return [
    { k: t('Investi'), v: eur(bought, 0), d: tn(nBuy, '{n} achat', '{n} achats') },
    { k: t('Vendu'), v: eur(sold, 0), d: tn(nSell, '{n} vente', '{n} ventes') },
    { k: t('Plus-values'), v: signedEur(realized, 0), d: t(nSell ? 'réalisées, frais déduits' : 'aucune vente'), cls: realized > 0.5 ? 'pos' : realized < -0.5 ? 'neg' : '' },
    { k: t('Frais'), v: eur(fees), d: t('achats et ventes') },
    ...income.length ? [{ k: t('Revenus'), v: eur(income.reduce((s, tr) => s + netAmount(tr), 0)), d: t('dividendes, intérêts, bonus') }] : [],
  ];
}

function histBody() {
  const ts = histFiltered();
  const kind = ui.hist.kind;
  if (!ts.length) return `<div class="card"><p class="muted m0">${t('Aucune opération ne correspond.')}</p></div>`;
  const first = ts[ts.length - 1].date, last = ts[0].date;
  const shown = ts.slice(0, ui.hist.limit);
  const months = [];
  for (const tr of shown) { const m = tr.date.slice(0, 7); if (!months.length || months[months.length - 1].m !== m) months.push({ m, ops: [] }); months[months.length - 1].ops.push(tr); }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // The account shows on each operation only when there are several, none is selected and the screen is wide enough.
  const showAcc = ui.hist.acc === 'all' && new Set(ts.map(tr => tr.accountId)).size > 1;
  const span = first === last ? t('le {x}', { x: dateLong(first) }) : t('du {a} au {b}', { a: dateLong(first), b: dateLong(last) });
  // Month total: money invested or received through buys and sells, or the income / net deposits under those filters
  const monthNet = ops => ops.reduce((s, tr) => s + (kind === 'income' || kind === 'flows' ? netAmount(tr) : isTrade(tr) ? tr.amount : 0), 0);
  return `${sumsCard(histSums(ts, kind))}
    <p class="hist-count">${tn(ts.length, '{n} opération, {span}', '{n} opérations, {span}', { span })}</p>
    <div class="lines hist-list">${months.map(({ m, ops }) => {
      const net = monthNet(ops);
      return `<div class="hist-month"><span>${cap(monthLong(m))}</span><span>${Math.abs(net) >= 0.5 ? signedEur(net, 0) : ''}</span></div>
        ${ops.map(tr => histRow(tr, showAcc)).join('')}`;
    }).join('')}</div>
    ${ts.length > shown.length ? `<div class="btn-row mt14 center"><button class="btn" data-action="hist-more">${t('Afficher {n} de plus', { n: Math.min(150, ts.length - shown.length) })}</button></div>` : ''}`;
}

function histRow(tr, showAcc) {
  const name = opName(tr);
  const acc = accById(tr.accountId);
  const line = tr.isin ? data.lines.find(l => l.accountId === tr.accountId && l.isin === tr.isin && isHeld(l)) : null;
  const label = t(OP_LABEL[tr.kind] || tr.kind) + (/SAVING|PLAN/i.test(tr.category || '') ? ' ' + t('programmé') : '');
  const n = +(+tr.shares || 0).toFixed(6);
  const cash = isCashMove(tr);
  const detail = tr.kind === 'CARD' ? tn(tr.count || 1, '{n} paiement', '{n} paiements') : cash ? '' : n ? (tr.price ? `${qtyShort(n)} × ${eur(tr.price)}` : tn(n, '{n} part', '{n} parts', { n: qtyShort(n) })) : '';
  const where = showAcc && (acc?.name || t(tr.envelope || ''));
  // A cash movement without a product is named by its kind: the label would only repeat it.
  const sub = [dateShort(tr.date), cash && !tr.isin && !tr.name ? '' : label, detail].filter(Boolean).map(esc).join(' · ') + (where ? `<span class="where"> · ${esc(where)}</span>` : '');
  const money = isTrade(tr) || cash;
  const amount = cash ? netAmount(tr) : tr.amount;
  const value = money ? signedEur(amount) : n ? '+' + tn(n, '{n} part', '{n} parts', { n: qtyShort(n) }) : '—';
  const g = tr.kind === 'SELL' && typeof tr.realized === 'number'
    ? `<span class="${tr.realized > 0.005 ? 'pos' : tr.realized < -0.005 ? 'neg' : 'muted'}" title="${t('Plus-value réalisée')}">${signedEur(tr.realized)}</span>`
    : INCOME_KINDS.has(tr.kind) && tr.tax ? `<span class="muted">${t('retenue {x}', { x: eur(Math.abs(tr.tax)) })}</span>`
    : tr.fee && !cash ? `<span class="muted">${t('frais {x}', { x: eur(Math.abs(tr.fee)) })}</span>` : '';
  const inner = `<span class="mono t-${esc(tr.type || 'etf')}">${esc(initials(name))}</span>
    <span class="n">${esc(name)}</span><span class="v ${tr.kind === 'SELL' || (cash && amount > 0) ? 'in' : ''}">${value}</span>
    <span class="s">${sub}</span><span class="g">${g}</span>`;
  return line ? `<button class="line" data-action="open-line" data-id="${esc(line.id)}">${inner}</button>` : `<div class="line static">${inner}</div>`;
}

// ——— Simuler tab ———
function simOptions() {
  const groups = data.accounts.map(a => {
    const ls = data.lines.filter(l => l.accountId === a.id && !isCashLike(l) && isHeld(l));
    if (!ls.length) return '';
    return `<optgroup label="${esc(a.name)}">${ls.map(l => `<option value="${esc(l.id)}" ${ui.sim.lineId === l.id ? 'selected' : ''}>${esc(shortName(l))} · ${eur(lineValue(l), 0)}</option>`).join('')}</optgroup>`;
  }).join('');
  const lib = libraryChoices().map(c => `<option value="new:${c.isin}" ${ui.sim.lineId === 'new:' + c.isin ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return groups + `<optgroup label="${t('Nouvelle ligne')}">${lib}<option value="new:custom" ${ui.sim.lineId === 'new:custom' ? 'selected' : ''}>${t('Autre produit…')}</option></optgroup>`;
}
function viewSimuler() {
  const title = `<h1 class="title">${t('Et si vous…')}<em>${t('achetiez ou vendiez, avant de le faire.')}</em></h1>`;
  if (!data.accounts.length) return title + emptyHint();
  const s = ui.sim;
  if (!s.lineId) { const first = heldLines(data).filter(l => !isCashLike(l)).sort((a, b) => lineValue(b) - lineValue(a))[0]; s.lineId = first ? first.id : 'new:IE0002XZSHO1'; }
  const isNew = s.lineId.startsWith('new:');
  if (isNew) s.mode = 'buy';
  const line = isNew ? null : lineById(s.lineId);
  if (!s.price) s.price = line && line.price ? inputNum(line.price, 4) : '';
  if (!s.accountId || !accById(s.accountId)) s.accountId = data.accounts[0].id;
  return `${title}
  <div class="sim-grid">
    <form class="card form" id="sim-form" autocomplete="off">
      <div class="sim-modes"><div class="seg" role="group" aria-label="${t('Opération')}">
        <button type="button" data-action="sim-mode" data-v="buy" aria-pressed="${s.mode === 'buy'}">${t('Achat')}</button>
        <button type="button" data-action="sim-mode" data-v="sell" aria-pressed="${s.mode === 'sell'}" ${isNew ? 'disabled' : ''}>${t('Vente')}</button>
      </div>
      <div class="seg" role="group" aria-label="${t('Saisir')}"><button type="button" data-action="sim-by" data-v="amount" aria-pressed="${s.by === 'amount'}">${t('Montant')}</button><button type="button" data-action="sim-by" data-v="qty" aria-pressed="${s.by === 'qty'}">${t('Quantité')}</button></div></div>
      <label class="field"><span>${t('Produit')}</span><select class="input" id="sim-line" data-sim="lineId">${simOptions()}</select></label>
      ${isNew ? `
        ${s.lineId === 'new:custom' ? `<div class="row2"><label class="field"><span>${t('Nom')}</span><input class="input" id="sim-newname" data-sim="newName" value="${esc(s.newName)}" placeholder="${t('ex. Fonds Linxea')}"></label>
        <label class="field"><span>ISIN</span><input class="input" id="sim-newisin" data-sim="newIsin" value="${esc(s.newIsin)}" placeholder="${t('facultatif')}"></label></div>` : ''}
        <label class="field"><span>${t('Sur le compte')}</span><select class="input" id="sim-acc" data-sim="accountId">${data.accounts.map(a => `<option value="${esc(a.id)}" ${s.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : ''}
      <div class="row3">
        ${s.by === 'amount' ? `<label class="field"><span>${t('Montant (€)')}</span><input class="input" id="sim-amount" inputmode="decimal" data-sim="amount" value="${esc(s.amount)}"></label>`
          : `<label class="field"><span>${t('Quantité')}</span><input class="input" id="sim-qty" inputmode="decimal" data-sim="qty" value="${esc(s.qty)}"></label>`}
        <label class="field"><span>${t('Prix (€)')}</span><input class="input" id="sim-price" inputmode="decimal" data-sim="price" value="${esc(s.price)}" placeholder="${t('cours')}"></label>
        <label class="field"><span>${t('Frais (€)')}</span><input class="input" id="sim-fees" inputmode="decimal" data-sim="fees" value="${esc(s.fees)}"></label>
      </div>
      <label class="check"><input type="checkbox" id="sim-cash" data-sim="useCash" ${s.useCash ? 'checked' : ''}><span>${t(s.mode === 'buy' ? 'Payer avec les espèces du compte' : 'Garder le produit de la vente en espèces sur le compte')}</span></label>
      ${line ? `<p class="small muted m0">${t('Vous détenez {n} parts, prix de revient {pru}, cours {price} ({date}).', { n: qtyShort(line.qty), pru: eur(pru(line)), price: eur(line.price), date: dateShort(line.priceDate) })}</p>` : ''}
    </form>
    <div id="sim-out">${simResult()}</div>
  </div>
  ${allocation(data) ? `<section class="card reb mt14" id="reb"><h3>${t('Rééquilibrer vers votre cible')}</h3>
    <p class="lead">${t('Ce qu’il faudrait acheter, ou vendre, pour revenir à votre allocation cible. Touchez une ligne pour la simuler.')}</p>
    <div class="reb-tools"><label class="field"><span>${t('À investir (€)')}</span><input class="input" id="reb-amount" inputmode="decimal" data-reb="amount" value="${esc(ui.reb.amount)}"></label>
      <div class="seg" role="group" aria-label="${t('Ventes')}"><button type="button" data-action="reb-sell" data-v="0" aria-pressed="${!ui.reb.sell}">${t('Sans vendre')}</button><button type="button" data-action="reb-sell" data-v="1" aria-pressed="${ui.reb.sell}">${t('Avec ventes')}</button></div></div>
    <div id="reb-out">${rebalanceRows()}</div></section>` : ''}`;
}
function rebalanceRows() {
  const r = rebalance(data, parseNum(ui.reb.amount) || 0, ui.reb.sell);
  if (!r) return '';
  if (!r.rows.length) return `<p class="muted small m-t8">${t(r.add || ui.reb.sell ? 'Vous êtes déjà à la cible, à 1 € près.' : 'Indiquez un montant à investir, ou autorisez les ventes.')}</p>`;
  const what = x => { const cash = isCashLike(x.line); return x.move > 0 ? t(cash ? 'Ajouter {x} aux espèces' : 'Acheter {x}', { x: eur(x.move, 0) }) : t(cash ? 'Utiliser {x} d’espèces' : 'Vendre {x}', { x: eur(-x.move, 0) }); };
  const row = x => { const inner = `<span class="k">${esc(allocName(x.line))}</span><span class="v ${x.move > 0 ? 'pos' : 'neg'}">${what(x)}</span><span class="x">${t('{a} → {b}, cible {c}', { a: pct(x.pct), b: pct(x.after), c: pct(x.target) })}</span>`;
    return isCashLike(x.line) ? `<div class="cmp">${inner}</div>` : `<button type="button" class="cmp reb-row" data-action="reb-pick" data-id="${esc(x.line.id)}" data-v="${x.move}">${inner}</button>`; };
  return `<div class="compare">${r.rows.map(row).join('')}</div>
    <p class="note">${t(ui.reb.sell ? 'Chaque ligne revient exactement à sa cible ; les ventes hors PEA et assurance-vie peuvent être imposées.' : 'Sans vente, l’argent va d’abord aux lignes les plus en dessous de leur cible.')}</p>`;
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
  if (!r.ok) return `<div class="card"><p class="muted m0">${esc(r.error)}</p></div>`;
  const b = r.before.t, a = r.after.t;
  const p = simParams();
  const row = (k, from, to, x = '') => `<div class="cmp"><span class="k">${k}</span><span class="v"><span class="from">${from}</span>→ ${to}</span>${x ? `<span class="x">${x}</span>` : ''}</div>`;
  const deltas = r.deltas.sectors.filter(d => Math.abs(d.delta) >= 0.001).slice(0, 4);
  const cdeltas = r.deltas.countries.filter(d => Math.abs(d.delta) >= 0.001).slice(0, 4);
  const parts = tn(p.qty, '{n} part', '{n} parts', { n: (ui.sim.by === 'amount' ? '≈ ' : '') + qtyShort(p.qty) });
  return `<div class="card">
    <div class="eyebrow">${t(p.mode === 'buy' ? 'Achat de {parts} · {x}' : 'Vente de {parts} · {x}', { parts, x: eur(p.qty * p.price) })}</div>
    <div class="compare mt6">
      ${row(t('Patrimoine total'), eur(b.total, 0), eur(a.total, 0), p.useCash || p.mode === 'sell' ? '' : t('L’achat est compté comme un nouvel apport.'))}
      ${row(t('Part en actions'), pct(b.equityPct), pct(a.equityPct), pts(a.equityPct - b.equityPct))}
      ${row(t('Poids de la ligne'), pct(r.weightBefore), pct(r.weightAfter))}
      ${p.mode === 'buy' ? row(t('Prix de revient unitaire'), r.line.prevQty ? eur(r.line.prevPru) : '—', eur(r.line.pru)) : row(t('Parts restantes'), qtyShort(r.line.prevQty), qtyShort(r.line.qty))}
      ${row(t('Espèces'), eur(b.cash, 0), eur(a.cash, 0))}
      ${p.mode === 'sell' ? `<div class="cmp"><span class="k">${t('Plus-value réalisée')}</span><span class="v ${r.realized >= 0 ? 'pos' : 'neg'}">${signedEur(r.realized)}</span></div>
        <div class="cmp"><span class="k">${t('Impôt estimé')}</span><span class="v">${eur(r.tax)}</span><span class="x">${esc(r.taxNote)} ${esc(milestoneLine(accById(lineById(p.lineId)?.accountId)))}</span></div>` : ''}
    </div>
    ${r.warnings.map(w => `<div class="callout warn mt10">${esc(w)}</div>`).join('')}
  </div>
  ${deltas.length || cdeltas.length ? `<div class="card mt14"><h3>${t('Ce qui bouge')}</h3>
    ${deltas.length ? `<div class="eyebrow mt12">${t('Secteurs')}</div><div class="compare tight">${deltas.map(d => row(esc(t(d.name)), pct(d.before), pct(d.after), pts(d.delta))).join('')}</div>` : ''}
    ${cdeltas.length ? `<div class="eyebrow mt12">${t('Pays')}</div><div class="compare tight">${cdeltas.map(d => row(esc(t(d.name)), pct(d.before), pct(d.after), pts(d.delta))).join('')}</div>` : ''}
    <p class="note">${t('Parts calculées hors espèces, avec la composition indicative des fonds.')}</p></div>` : ''}`;
}

// ——— Réglages tab ———
// A list of sections, each on its own page (#donnees/comptes…): the phone's back button returns to the list.
const THEMES = { auto: 'Automatique', light: 'Clair', dark: 'Sombre' };
// Language names stay in their own language, so anyone can find theirs.
const LANGS = { auto: 'Automatique', fr: 'Français', en: 'English' };
const langLabel = k => (k === 'fr' || k === 'en' ? LANGS[k] : t('Automatique'));
const SECTIONS = {
  comptes: { title: 'Comptes', sub: 'Ajoutez, modifiez ou supprimez vos comptes.', icon: 'compte', body: sectionAccounts,
    summary: () => { const n = data.accounts.length; return n ? tn(n, '{n} compte · {x}', '{n} comptes · {x}', { x: eur(totals(data).total, 0) }) : t('Aucun compte'); } },
  import: { title: 'Import et sauvegarde', sub: 'Vos courtiers, et vos fichiers de sauvegarde.', icon: 'transfert', body: sectionImport,
    summary: () => data.imports?.length ? t('Dernier import le {x}', { x: dateLong(data.imports[data.imports.length - 1].at?.slice(0, 10)) }) : t('Courtiers, fichier de sauvegarde') },
  sync: { title: 'Synchronisation', sub: 'Le même carnet sur tous vos appareils.', icon: 'nuage', body: syncCard,
    summary: () => !syncState() ? t('Désactivée') : ui.syncLost ? t('Coffre à recréer') : t('Coffre {x}', { x: syncState().user }) },
  cours: { title: 'Cours', sub: 'Yahoo Finance, sans jamais vos montants.', icon: 'cours', body: sectionPrices,
    summary: () => ui.server === 'off' ? t('Serveur absent : actualisation indisponible') : data.lastRefresh ? refreshLabel().long : t('Jamais actualisés') },
  appareil: { title: 'Installer l’app', sub: 'Carnet sur l’écran d’accueil, et vos données gardées.', icon: 'telephone', body: sectionDevice,
    summary: () => t(installed() ? 'Installée sur cet appareil' : 'Pas encore installée') + (ui.persisted === false ? ' · ' + t('données non protégées') : '') },
  preferences: { title: 'Préférences', sub: 'Prénom, langue, thème et impôt.', icon: 'profil', body: sectionPreferences,
    summary: () => [data.profile.firstName || t('Sans prénom'), langLabel(data.settings.lang), t('thème {x}', { x: t(THEMES[data.settings.theme] || 'Automatique').toLowerCase() }), t('impôt {x}', { x: pct(data.settings.taxRate / 100, 1) })].join(' · ') },
};

function viewData() {
  const s = SECTIONS[ui.section];
  if (s) return `<div class="settings-page"><button class="linkish back" data-action="section-close">‹ ${t('Réglages')}</button>
    <h1 class="title">${t(s.title)}.<em>${t(s.sub)}</em></h1><div class="settings">${s.body()}</div></div>`;
  const rows = Object.entries(SECTIONS).map(([k, x]) => `<button class="line" data-action="section" data-v="${k}">
    <span class="mono">${ICONS[x.icon]}</span><span class="n">${t(x.title)}</span><span class="v chev" aria-hidden="true">›</span><span class="s">${esc(x.summary())}</span><span class="g"></span></button>`).join('');
  return `<div class="settings-page"><h1 class="title">${t('Vos données, chez vous.')}<em>${t(syncState() ? 'Chiffrées avant de partir.' : 'Rien ne quitte cet appareil.')}</em></h1>
    <div class="settings"><div class="lines">${rows}</div>
      <div><button class="btn danger" data-action="wipe">${t('Effacer toutes les données')}</button>
      <p class="note">Carnet ${VERSION}. ${t(storageWorks() ? 'Stockage local actif.' : 'Stockage local bloqué par le navigateur : les données ne survivront pas à la fermeture.')}</p></div></div></div>`;
}

function sectionAccounts() {
  return `<section class="card"><p class="lead">${t('Un solde (compte courant, livret) ou des lignes (assurance-vie, PER, autre courtier).')}</p>
    <div class="list">${data.accounts.map(a => { const v = data.lines.filter(l => l.accountId === a.id).reduce((s, l) => s + lineValue(l), 0); return `<div class="list-item"><span class="tile c-${esc(a.color || 'ink')}">${esc(initials(a.name))}</span><span><span class="n">${esc(a.name)}</span><br><span class="s">${esc(kindLabel(a.kind))} · ${eur(v, 0)}</span></span><button class="btn sm" data-action="edit-account" data-id="${esc(a.id)}">${t('Modifier')}</button></div>`; }).join('') || `<p class="muted small">${t('Aucun compte.')}</p>`}</div>
    <div class="btn-row mt12"><button class="btn" data-action="add-account">${ICONS.plus}${t('Ajouter un compte')}</button><button class="btn" data-action="add-line" ${data.accounts.length ? '' : 'disabled'}>${ICONS.plus}${t('Ajouter une ligne')}</button></div></section>`;
}

function sectionImport() {
  const st = data.trStats;
  // last import of each source (older entries have no source: Trade Republic)
  const last = {};
  for (const i of data.imports || []) last[i.source || 'tr'] = i;
  const done = Object.keys(IMPORTERS).filter(k => last[k]);
  return `<section class="card"><h3>${t('Importer des données')}</h3>
      <p class="lead">${t('Choisissez d’où viennent vos données : Carnet vous explique comment récupérer le fichier.')}</p>
      <div class="import-pick"><label class="field"><span class="sr">${t('Source')}</span><select class="input" id="imp-source">${Object.entries(IMPORTERS).map(([k, x]) => `<option value="${k}">${esc(x.name)}</option>`).join('')}</select></label>
        <button class="btn primary" data-action="import-source">${t('Continuer')}</button></div>
      ${done.length ? `<dl class="kv">${done.map(k => `<dt>${esc(IMPORTERS[k].name)}</dt><dd>${t('importé le {x}', { x: dateLong(last[k].at?.slice(0, 10)) })}</dd>
        ${k === 'tr' && st ? `<dt>${t('Période')}</dt><dd>${dateLong(st.from)} → ${dateLong(st.to)}</dd>
          ${Object.entries(st.cash || {}).map(([id, v]) => `<dt>${t('Espèces {x}', { x: esc(accById(id)?.name || id) })}</dt><dd>${eur(v)}</dd>`).join('')}` : ''}
        ${k !== 'tr' && last[k].to ? `<dt>${t('Valeurs au')}</dt><dd>${dateLong(last[k].to)}</dd>` : ''}`).join('')}</dl>
        ${st ? `<p class="note">${t('Espèces recalculées à partir de toutes les opérations : comparez-les avec le solde affiché par votre courtier.')}</p>` : ''}` : ''}
    </section>
    <section class="card"><h3>${t('Sauvegarde')}</h3><p class="lead">${t('Un fichier à garder de côté, ou à restaurer sur un appareil sans synchronisation.')}</p>
      <div class="btn-row"><button class="btn" data-action="export-plain" ${data.lines.length ? '' : 'disabled'}>${ICONS.download}${t('Exporter en clair')}</button><button class="btn" data-action="export-enc" ${data.lines.length ? '' : 'disabled'}>${ICONS.lock}${t('Exporter chiffrée')}</button></div>
      <div class="btn-row mt8"><button class="btn primary" data-action="pick-backup">${ICONS.upload}${t('Restaurer une sauvegarde')}</button></div>
      <p class="small muted m-t12">${device().lastExport ? t('Dernière sauvegarde depuis cet appareil : {x}.', { x: dateLong(device().lastExport.slice(0, 10)) }) : t('Aucune sauvegarde depuis cet appareil.')}</p>
      <p class="note">${t('La sauvegarde chiffrée utilise AES-GCM 256 bits avec une clé tirée de votre phrase de passe (PBKDF2, 310 000 itérations). Sans la phrase, le fichier est illisible : rien ne permet de la retrouver.')}</p>
    </section>`;
}

function sectionPrices() {
  const server = { ok: ['ok', 'Serveur Carnet joignable'], off: ['off', 'Serveur Carnet absent : actualisation indisponible'], unknown: ['', 'Vérification du serveur…'] }[ui.server];
  return `<section class="card"><p class="lead">${t('L’actualisation récupère sur Yahoo Finance, via le serveur Carnet, le cours du jour et l’historique (5 ans) de chaque produit coté. Seuls les symboles sont envoyés, jamais vos quantités ni vos montants.')}</p>
    <p class="m-b12"><span class="status ${server[0]}"><i></i>${t(server[1])}</span></p>
    <div class="btn-row"><button class="btn refresh-btn" data-action="refresh" ${ui.busy ? 'disabled' : ''}><span class="ic">${ICONS.refresh}</span><span class="r-long">${t('Actualiser les cours')}</span></button></div>
    ${refreshReport()}</section>`;
}

// ——— Install and storage ———
// Installed (home screen or dock), the app runs full screen and iOS no longer wipes its storage
// after 7 days without a visit. persist() asks the browser not to evict the data under storage pressure.
const DEVICE_KEY = 'carnet:device:v1'; // per-device notes, never synced nor exported
const device = () => { try { return JSON.parse(localStorage.getItem(DEVICE_KEY)) || {}; } catch { return {}; } };
const setDevice = patch => { try { localStorage.setItem(DEVICE_KEY, JSON.stringify({ ...device(), ...patch })); } catch { /* storage blocked */ } };
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'mac-safari';
  return 'desktop';
}
let installPrompt = null; // Chrome, Edge, Android: the browser's own install dialog
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; render(); });

let persistAsked = false;
async function ensurePersist() {
  if (persistAsked || !navigator.storage?.persisted) return;
  // Firefox may ask the user: wait until there is something worth keeping.
  if (!data.lines.length && !data.accounts.length) return;
  persistAsked = true;
  try { ui.persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch { ui.persisted = null; }
  if (ui.tab === 'donnees') render();
}

function sectionDevice() {
  const done = installed();
  const kept = ui.persisted === true || done && platform() === 'ios';
  return `<section class="card">
    <p class="m-b8"><span class="status ${done ? 'ok' : 'off'}"><i></i>${t(done ? 'Carnet est installée sur cet appareil.' : 'Carnet s’ouvre dans le navigateur.')}</span></p>
    ${ui.persisted == null && !done ? '' : `<p class="m-b14"><span class="status ${kept ? 'ok' : 'off'}"><i></i>${t(kept ? 'Le navigateur garde vos données.' : 'Le navigateur peut effacer vos données s’il manque de place, ou après 7 jours sans visite sur iPhone.')}</span></p>`}
    ${done ? '' : `<div class="btn-row"><button class="btn primary" data-action="install">${ICONS.telephone}${t('Installer Carnet')}</button></div>`}
    <p class="note">${t('Installée, Carnet s’ouvre comme une app, en plein écran, et votre iPhone n’efface plus ses données. Pensez quand même aux sauvegardes.')}</p></section>`;
}

// A short tutorial for this device only: the browser's own dialog when it offers one, else the steps.
// Numbered steps with an icon each (install tutorial, import guides).
const step = (icon, title, sub = '') => `<li class="step"><span class="step-ic">${ICONS[icon]}</span><span><b>${title}</b>${sub ? `<br><span class="muted small">${sub}</span>` : ''}</span></li>`;
function installSheet() {
  const p = platform();
  const STEPS = {
    ios: [step('share', t('Touchez le bouton Partager'), t('En bas de Safari, ou dans le menu ⋯ selon votre version.')), step('addHome', t('Choisissez « Sur l’écran d’accueil »'), t('Faites défiler la liste si vous ne le voyez pas.')), step('check', t('Touchez « Ajouter »'), t('Carnet apparaît sur l’écran d’accueil : ouvrez-la depuis là.'))],
    android: [step('dots', t('Ouvrez le menu ⋮'), t('En haut à droite du navigateur.')), step('addHome', t('Touchez « Installer l’application »'), t('Ou « Ajouter à l’écran d’accueil », selon le navigateur.')), step('check', t('Confirmez'), t('Carnet apparaît parmi vos applications.'))],
    desktop: [step('monitor', t('Cliquez sur l’icône d’installation'), t('À droite de la barre d’adresse de Chrome ou Edge.')), step('check', t('Confirmez « Installer »'), t('Carnet s’ouvre dans sa propre fenêtre.'))],
    'mac-safari': [step('share', t('Menu Fichier, puis « Ajouter au Dock »'), t('Ou le bouton Partager de Safari.')), step('check', t('Confirmez « Ajouter »'), t('Carnet s’ouvre depuis le Dock.'))],
    firefox: [step('monitor', t('Firefox ne sait pas installer de site'), t('Ouvrez Carnet dans Chrome, Edge ou Safari pour l’installer.'))],
  };
  const body = installPrompt
    ? `<ol class="steps">${step('addHome', t('Un bouton suffit'), t('Votre navigateur ajoute Carnet à vos applications.'))}</ol>
      <div class="btn-row"><button class="btn primary" data-native>${t('Installer')}</button><button class="btn" data-close>${t('Plus tard')}</button></div>`
    : `<ol class="steps">${STEPS[p].join('')}</ol><div class="btn-row"><button class="btn primary" data-close>${t('Compris')}</button></div>`;
  openSheet(`${sheetHead(t('Installer Carnet'), t('Comme une app, en deux secondes.'))}${body}`, {
    label: t('Installer Carnet'),
    onMount: (sh, close) => sh.querySelector('[data-native]')?.addEventListener('click', async () => {
      const ev = installPrompt; installPrompt = null; close();
      ev.prompt(); const r = await ev.userChoice.catch(() => null);
      if (r?.outcome === 'accepted') toast(t('Carnet est installée.'));
    }),
  });
}
// First visit on a phone, once per device.
function offerInstall() {
  const p = platform();
  if (installed() || device().installOffered || !(p === 'ios' || p === 'android') || sheetStack.length) return;
  setDevice({ installOffered: true });
  installSheet();
}

function sectionPreferences() {
  return `<section class="card"><h3>${t('Prénom')}</h3><p class="lead">${t('Il s’affiche dans le titre de l’accueil.')}</p>
      <form class="form" data-form="profile"><label class="field"><span class="sr">${t('Prénom')}</span><input class="input" id="pf-name" name="firstName" value="${esc(data.profile.firstName)}" autocomplete="given-name" maxlength="40"></label>
      <div class="btn-row"><button class="btn primary sm" type="submit">${t('Enregistrer')}</button></div></form></section>
    <section class="card"><h3>${t('Langue')}</h3><p class="lead">${t('Le mode automatique suit la langue de l’appareil.')}</p>
      <div class="seg" role="group" aria-label="${t('Langue')}">${Object.keys(LANGS).map(k => `<button data-action="lang" data-v="${k}" aria-pressed="${(data.settings.lang || 'auto') === k}" ${k === 'auto' ? '' : `lang="${k}"`}>${langLabel(k)}</button>`).join('')}</div></section>
    <section class="card"><h3>${t('Thème')}</h3><p class="lead">${t('Le mode automatique suit le réglage de l’appareil.')}</p>
      <div class="seg" role="group" aria-label="${t('Thème')}">${Object.entries(THEMES).map(([k, l]) => `<button data-action="theme" data-v="${k}" aria-pressed="${data.settings.theme === k}">${t(l)}</button>`).join('')}</div></section>
    <section class="card"><h3>${t('Impôt sur les plus-values')}</h3><p class="lead">${t('Utilisé par le simulateur pour les ventes hors PEA et assurance-vie.')}</p>
      <label class="field"><span>${t('Taux (%)')}</span><input class="input" id="tax-rate" data-setting="taxRate" inputmode="decimal" value="${inputNum(data.settings.taxRate, 1)}"><small>${t('31,4 % en 2026 (prélèvement forfaitaire unique).')}</small></label></section>`;
}

// ——— Bottom sheets ———
let sheetStack = [];
function openSheet(html, { onMount, onClose, label = t('Fenêtre') } = {}) {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', label);
  sh.innerHTML = '<div class="grab" aria-hidden="true"></div>' + html;
  sizeBars(sh);
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
const sheetHead = (title, sub = '') => `<div class="sheet-head"><h2>${title}${sub ? `<em>${sub}</em>` : ''}</h2><button class="icon-btn close" data-close aria-label="${t('Fermer')}">${ICONS.close}</button></div>`;

function confirmSheet({ title, text, ok = t('Confirmer'), danger = false }) {
  return new Promise(res => {
    let done = false;
    openSheet(`${sheetHead(title)}<p class="muted mt0">${text}</p><div class="btn-row"><button class="btn ${danger ? 'danger solid' : 'primary'}" data-ok>${ok}</button><button class="btn" data-close>${t('Annuler')}</button></div>`, {
      label: title,
      onMount: (sh, close) => sh.querySelector('[data-ok]').addEventListener('click', () => { done = true; res(true); close(); }),
      onClose: () => { if (!done) res(false); },
    });
  });
}
function choiceSheet({ title, text, choices }) {
  return new Promise(res => {
    let done = false;
    openSheet(`${sheetHead(title)}<p class="muted mt0">${text}</p><div class="btn-row">${choices.map(([k, l, cls]) => `<button class="btn ${cls}" data-choice="${k}">${l}</button>`).join('')}<button class="btn" data-close>${t('Annuler')}</button></div>`, {
      label: title,
      onMount: (sh, close) => sh.addEventListener('click', e => { const c = e.target.closest('[data-choice]'); if (c) { done = true; res(c.dataset.choice); close(); } }),
      onClose: () => { if (!done) res(null); },
    });
  });
}
function passSheet({ title, confirm }) {
  return new Promise(res => {
    let done = false;
    openSheet(`${sheetHead(title, confirm ? t('Choisissez une phrase dont vous vous souviendrez.') : '')}
      <form class="form" autocomplete="off"><label class="field"><span>${t('Phrase de passe')}</span><input class="input" type="password" id="pp1" autocomplete="new-password" minlength="${confirm ? 8 : 1}" required></label>
      ${confirm ? `<label class="field"><span>${t('Encore une fois')}</span><input class="input" type="password" id="pp2" autocomplete="new-password" required></label>` : ''}
      <p class="small neg" id="pp-err" hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${t(confirm ? 'Chiffrer et exporter' : 'Déchiffrer')}</button><button class="btn" type="button" data-close>${t('Annuler')}</button></div></form>`, {
      label: title,
      onMount: (sh, close) => {
        sh.querySelector('#pp1').focus();
        sh.querySelector('form').addEventListener('submit', e => {
          e.preventDefault();
          const a = sh.querySelector('#pp1').value, b = sh.querySelector('#pp2')?.value;
          const err = sh.querySelector('#pp-err');
          if (confirm && a.length < 8) { err.textContent = t('Au moins 8 caractères.'); err.hidden = false; return; }
          if (confirm && a !== b) { err.textContent = t('Les deux phrases ne sont pas identiques.'); err.hidden = false; return; }
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
  const stats = isCashLike(l) ? `<div class="stat"><div class="k">${t('Type')}</div><div class="v">${esc(t(TYPE_LABEL[l.type] || l.type))}</div></div><div class="stat"><div class="k">${t('Enveloppe')}</div><div class="v">${esc(t(l.envelope || '—'))}</div></div>`
    : `<div class="stat"><div class="k">${t('Quantité')}</div><div class="v">${fqty(l.qty)}${l.pending ? `<br><span class="small muted">${t('+ {x} en attente', { x: eur(l.pending) })}</span>` : ''}</div></div>
      <div class="stat"><div class="k">${t('Prix de revient')}</div><div class="v">${eur(pru(l))}</div></div>
      <div class="stat"><div class="k">${t('Cours|prix')}</div><div class="v">${eur(l.price)}<br><span class="small muted">${l.priceDate ? dateLong(l.priceDate) : t('jamais actualisé')}${l.priceSource === 'transaction' ? ' · ' + t('prix de transaction') : l.priceSource === 'yahoo' ? ' · Yahoo' : l.priceSource === 'linxea' ? ' · Linxea' : ''}</span></div></div>
      <div class="stat"><div class="k">${t('Plus-value')}</div><div class="v ${Math.abs(g) < 0.5 ? '' : g > 0 ? 'pos' : 'neg'}">${signedEur(g)}<br><span class="small">${c > 0 ? signedPct(g / c) : ''}</span></div></div>`;
  // Full fund name, ISIN and symbol on one line under the title, rather than one more card.
  const ids = [lib && lib.name !== shortName(l) ? lib.name : '', l.subcategory || l.category, l.isin, l.ticker].filter(Boolean);
  const holdings = comp ? `<div class="section-head mt22"><h2>${t('Principales entreprises')}</h2><span class="aside">${esc(comp.index)}</span></div>
    <div class="holdings">${comp.holdings.map((h, i) => `<div class="holding"><span class="r">${i + 1}</span><span class="n">${esc(h.name)}</span><span class="a">${eur(h.amount)}</span><span class="w">${t('{p} du fonds', { p: pct(h.weight) })} · ${esc(t(h.sector))} · ${esc(t(h.country))}</span></div>`).join('')}</div>
    <div class="section-head"><h2>${t('Pays')}</h2></div><div class="bars mt0">${comp.countries.slice(0, 6).map(x => `<div class="barrow"><span class="n">${esc(t(x.name))}</span><span class="p"><b>${eur(v * x.pct, 0)}</b>${pct(x.pct)}</span><span class="track"><i data-w="${(100 * x.pct / comp.countries[0].pct).toFixed(1)}"></i></span></div>`).join('')}</div>
    <p class="note">${t(COMPOSITION_NOTE)}</p>`
    : (!isCashLike(l) && l.type === 'etf' ? `<p class="note">${t('Composition non disponible pour ce fonds.')}</p>` : '');
  openSheet(`${sheetHead(esc(shortName(l)), esc((acc?.name || '') + ' · ' + t(l.envelope || '')))}
    ${ids.length ? `<p class="small muted ids-line">${ids.map(esc).join(' · ')}</p>` : ''}
    <div class="detail-big">${eur(v)}</div>
    ${l.qtyEstimated || l.estimateFromAmount ? `<div class="callout mt12">${t(l.estimateFromAmount ? 'Montant investi connu, quantité pas encore calculée : elle le sera à la prochaine actualisation, avec la valeur liquidative du jour de souscription.' : 'Quantité estimée à partir du montant investi et de la valeur liquidative du jour de souscription. Remplacez-la par celle de votre relevé quand vous l’aurez (Modifier).')}</div>` : ''}
    <div class="stat-grid">${stats}</div>
    ${l.note ? `<p class="note-text">${esc(l.note)}</p>` : ''}
    ${priceSection(l)}
    ${fundPerfSection(l)}
    <div class="btn-row"><button class="btn primary sm" data-act="edit">${t('Modifier')}</button>${isCashLike(l) ? '' : `<button class="btn sm" data-act="sim">${t('Simuler')}</button>`}<button class="btn sm danger" data-act="del">${t('Supprimer')}</button></div>
    ${holdings}`, {
    label: shortName(l),
    onMount: (sh, close) => { drawLineChart(sh, l); sh.addEventListener('click', async e => {
      const rg = e.target.closest('[data-lrange]');
      if (rg) { ui.lineRange = rg.dataset.lrange; sh.querySelectorAll('[data-lrange]').forEach(b => b.setAttribute('aria-pressed', b === rg)); drawLineChart(sh, l); return; }
      const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
      if (a === 'edit') { close(); setTimeout(() => lineForm(l.id), 200); }
      if (a === 'sim') { close(); ui.sim.lineId = l.id; ui.sim.price = l.price ? inputNum(l.price, 4) : ''; ui.sim.mode = 'buy'; go('simuler'); }
      if (a === 'del') {
        if (await confirmSheet({ title: t('Supprimer cette ligne ?'), text: t('{name} ({x}) sera retirée de cet appareil.', { name: esc(shortName(l)), x: eur(v) }) + (imported(l) ? ' ' + t('Elle reviendra au prochain import {x}.', { x: IMPORTERS[l.source].name }) : ''), ok: t('Supprimer'), danger: true })) {
          data.lines = data.lines.filter(x => x.id !== l.id); close(); commit(t('Ligne supprimée.'));
        }
      }
    }); },
  });
}

// The fund's own past performance, as published by the broker (Linxea): 3 years and more are yearly rates.
const PERF_LABEL = { ytd: 'Depuis janvier', w1: '1 semaine', m1: '1 mois', m6: '6 mois', y3: '3 ans', y5: '5 ans', y10: '10 ans' };
function fundPerfSection(l) {
  const f = l.fundPerf;
  const keys = PERF_KEYS.filter(k => typeof f?.[k] === 'number');
  if (!keys.length) return '';
  const cls = x => (x > 0.0005 ? 'pos' : x < -0.0005 ? 'neg' : '');
  return `<div class="section-head mt8"><h2>${t('Performance du support')}</h2><span class="aside">${t('{x}, au {date}', { x: esc(IMPORTERS[l.source]?.name || ''), date: dateShort(f.asOf) })}</span></div>
    ${sumsCard(keys.map(k => ({ k: t(PERF_LABEL[k]), v: signedPct(f[k]), d: ['y3', 'y5', 'y10'].includes(k) ? t('par an') : '', cls: cls(f[k]) })))}
    <p class="note m-x2b14">${t('Performance passée du fonds lui-même, hors frais du contrat ; elle ne dit rien de l’avenir.')}</p>`;
}

// Price chart of one product (history fetched on refresh)
const LRANGES = [['1M', 31], ['6M', 183], ['1A', 366], ['5A', 1830]];
function priceSection(l) {
  if (isCashLike(l)) return '';
  const h = l.ticker && data.priceHistory?.[l.ticker];
  if (!h || h.length < 2) return `<p class="note m-x2b14">${t(l.type === 'non-cote' ? 'Pas de cours public pour ce fonds non coté.' : l.type === 'structure' || l.noSymbol ? 'Pas de cours sur Yahoo pour ce support : sa valeur est celle de votre dernier import ou relevé.' : 'L’historique du cours apparaîtra après une actualisation (bouton en haut de l’écran).')}</p>`;
  return `<section class="card chart-card price-card">
    <div class="chart-top"><h3>${t('Cours|prix')}</h3><div class="chips" role="group" aria-label="${t('Période')}">${LRANGES.map(([k]) => `<button class="chip" data-lrange="${k}" aria-pressed="${ui.lineRange === k}">${t(k)}</button>`).join('')}</div></div>
    <div class="chart-hover" data-lhover></div><div class="chart-host" data-lhost></div>
    <div class="legend"><span><i></i>${t('Cours|prix')}</span><span><i class="dash"></i>${t('Prix de revient')}</span></div>
    <div class="chart-note">${t('Source : Yahoo Finance ({x}), en euros.', { x: esc(l.ticker) })}</div></section>`;
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
  const base = pts_.length > 1 ? `${t('{x} sur la période', { x: signedPct(pts_[pts_.length - 1].value / pts_[0].value - 1) })} · ${eur(pts_[pts_.length - 1].value)}` : '';
  hover.textContent = base;
  requestAnimationFrame(() => lineChart(host, pts_, { onHover: p => { hover.textContent = p ? `${dateLong(p.d)} · ${eur(p.value)}` : base; } }));
}

function openAccount(id) {
  const a = accById(id); if (!a) return;
  const ls = data.lines.filter(l => l.accountId === id && isHeld(l)).sort((x, y) => lineValue(y) - lineValue(x));
  const v = ls.reduce((s, l) => s + lineValue(l), 0);
  const p = performance(data, new Date(), id);
  const rate = p && (p.days >= 365 ? (p.rate == null ? '' : t('{x} par an', { x: signedPct(p.rate) })) : p.periodRate == null ? '' : t('{x} sur la période', { x: signedPct(p.periodRate) }));
  openSheet(`${sheetHead(esc(a.name), esc(kindLabel(a.kind)))}
    <div class="detail-big">${eur(v)}</div>
    ${p ? `<p class="small muted m-t4">${[t('Versé {x}', { x: eur(p.net, 0) }), t('gain réel {x}', { x: signedEur(p.gain, 0) }), rate].filter(Boolean).join(' · ')}</p>` : ''}
    ${a.asOf ? `<p class="small muted m-t4">${t('Valeurs {x} du {date} : réimportez pour les mettre à jour.', { x: esc(IMPORTERS[a.source]?.name || ''), date: dateLong(a.asOf) })}</p>` : ''}
    ${MILESTONE_YEARS[a.kind] ? `<p class="small muted m-t4">${esc(milestoneLine(a))}</p>` : ''}
    ${a.note ? `<p class="note-text">${esc(a.note)}</p>` : ''}
    <div class="lines my14">${ls.map(lineRow).join('') || `<p class="muted p16 m0">${t('Aucune ligne sur ce compte.')}</p>`}</div>
    <div class="btn-row"><button class="btn primary sm" data-act="add">${ICONS.plus}${t('Ajouter une ligne')}</button><button class="btn sm" data-act="edit">${t('Modifier le compte')}</button><button class="btn sm" data-act="chart">${t('Voir sa courbe')}</button></div>`, {
    label: a.name,
    onMount: (sh, close) => sh.addEventListener('click', e => {
      const row = e.target.closest('[data-action="open-line"]');
      if (row) { e.stopPropagation(); close(); setTimeout(() => openLine(row.dataset.id), 200); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'add') { close(); setTimeout(() => lineForm(null, id), 200); }
      if (act === 'edit') { close(); setTimeout(() => accountForm(id), 200); }
      if (act === 'chart') { close(); ui.scope = 'acc:' + id; go('patrimoine'); $('#chart-host')?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }),
  });
}

function accountForm(id) {
  const a = id ? accById(id) : null;
  const cash = a ? data.lines.find(l => l.accountId === a.id && (l.type === 'especes' || l.type === 'livret')) : null;
  const kind = a?.kind || 'courant';
  openSheet(`${sheetHead(t(a ? 'Modifier le compte' : 'Nouveau compte'), a ? '' : t('Un solde, un livret, un contrat d’assurance-vie…'))}
    <form class="form" autocomplete="off">
      <label class="field"><span>${t('Nom')}</span><input class="input" id="ac-name" name="name" required maxlength="60" value="${esc(a?.name || '')}" placeholder="${t('ex. Caisse d’Épargne')}"></label>
      <div class="row2"><label class="field"><span>${t('Établissement')}</span><input class="input" id="ac-inst" name="institution" maxlength="60" value="${esc(a?.institution || '')}" placeholder="${t('facultatif')}"></label>
      <label class="field"><span>${t('Type')}</span><select class="input" id="ac-kind" name="kind">${KINDS.map(([k, l]) => `<option value="${k}" ${kind === k ? 'selected' : ''}>${t(l)}</option>`).join('')}</select></label></div>
      <label class="field" id="ac-bal-wrap"><span>${t('Solde actuel (€)')}</span><input class="input" id="ac-bal" name="balance" inputmode="decimal" value="${cash ? inputNum(cash.amount) : ''}" placeholder="${t('0,00')}"><small>${t('Pour un compte courant ou un livret. Pour une assurance-vie ou un compte-titres, ajoutez ensuite des lignes.')}</small></label>
      <label class="field" id="ac-open-wrap"><span>${t('Premier versement')}</span><input class="input" type="date" id="ac-open" name="openedAt" value="${esc(a?.openedAt || '')}"><small><span data-kind="pea">${t('Les retraits sont exonérés d’impôt sur le revenu 5 ans après cette date.')}</span><span data-kind="av">${t('Après 8 ans, les rachats profitent d’un abattement sur les gains.')}</span> ${a && !a.openedAt && accountStart(data, a) ? t('Vide : déduite de l’historique ({x}).', { x: dateLong(accountStart(data, a)) }) : ''}</small></label>
      <label class="field"><span>${t('Note')}</span><textarea class="input plain" id="ac-note" name="note" maxlength="500" rows="2" placeholder="${t('ex. date d’ouverture du PEA, numéro de contrat')}">${esc(a?.note || '')}</textarea></label>
      <div class="field"><span>${t('Couleur')}</span><div class="swatches">${COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${(a?.color || 'blue') === c ? 'checked' : ''} aria-label="${c}"><span class="tile c-${c} swatch-tile"></span></label>`).join('')}</div></div>
      <p class="small neg" id="ac-err" hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${t(a ? 'Enregistrer' : 'Créer le compte')}</button>${a ? `<button class="btn danger" type="button" data-act="del">${t('Supprimer le compte')}</button>` : ''}</div>
    </form>`, {
    label: t('Compte'),
    onMount: (sh, close) => {
      const form = sh.querySelector('form');
      const sync = () => { const k = form.kind.value; sh.querySelector('#ac-bal-wrap').hidden = !(k === 'courant' || k === 'livret' || cash); sh.querySelector('#ac-open-wrap').hidden = !MILESTONE_YEARS[k]; sh.querySelectorAll('[data-kind]').forEach(x => { x.hidden = x.dataset.kind !== k; }); };
      form.kind.addEventListener('change', sync); sync();
      form.addEventListener('submit', e => {
        e.preventDefault();
        const name = form.name.value.trim();
        const err = sh.querySelector('#ac-err');
        if (!name) { err.textContent = t('Donnez un nom au compte.'); err.hidden = false; return; }
        const balRaw = form.balance.value.trim();
        const bal = balRaw ? parseNum(balRaw) : null;
        if (balRaw && !isFinite(bal)) { err.textContent = t('Le solde doit être un nombre, par exemple 1 250,40.'); err.hidden = false; return; }
        const acc = a || { id: 'acc-' + Date.now().toString(36), source: 'manual' };
        Object.assign(acc, { name, institution: form.institution.value.trim(), kind: form.kind.value, color: form.color.value });
        const note = form.note.value.trim(); if (note) acc.note = note; else delete acc.note;
        if (MILESTONE_YEARS[acc.kind] && form.openedAt.value) acc.openedAt = form.openedAt.value; else delete acc.openedAt;
        if (!a) data.accounts.push(acc);
        if (bal !== null) {
          const isLiv = acc.kind === 'livret';
          if (cash) { cash.amount = bal; cash.price = bal; cash.cost = bal; cash.priceDate = today(); }
          else data.lines.push({ id: 'ln-' + Date.now().toString(36), source: 'manual', accountId: acc.id, type: isLiv ? 'livret' : 'especes', envelope: isLiv ? 'Livrets' : 'Espèces', name: isLiv ? 'Livret' : 'Solde', qty: 1, amount: bal, price: bal, cost: bal, priceDate: today(), equity: 0, pending: 0, events: [], since: today() });
        }
        if (a) for (const l of data.lines) if (l.accountId === acc.id && l.source !== 'tr' && !isCashLike(l)) l.envelope = envelopeForAccount(acc);
        close(); commit(t(a ? 'Compte mis à jour.' : 'Compte créé.'));
      });
      sh.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
        const n = data.lines.filter(l => l.accountId === a.id && isHeld(l)).length;
        if (await confirmSheet({ title: t('Supprimer ce compte ?'), text: tn(n, '{name} et sa ligne seront retirés de cet appareil.', '{name} et ses {n} lignes seront retirés de cet appareil.', { name: esc(a.name) }), ok: t('Supprimer'), danger: true })) {
          data.accounts = data.accounts.filter(x => x.id !== a.id); data.lines = data.lines.filter(l => l.accountId !== a.id);
          data.transactions = (data.transactions || []).filter(tr => tr.accountId !== a.id); close(); commit(t('Compte supprimé.'));
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
  const sectorOpts = Object.entries(SECTORS).map(([k, v]) => `<option value="${k}" ${l?.lookthrough?.sector === k ? 'selected' : ''}>${t(v)}</option>`).join('');
  openSheet(`${sheetHead(t(l ? 'Modifier la ligne' : 'Nouvelle ligne'), imported(l) ? t('Ligne importée : un nouvel import remplacera quantité et prix de revient.') : '')}
    <form class="form" autocomplete="off" novalidate>
      <div class="row2"><label class="field"><span>${t('Compte')}</span><select class="input" id="lf-acc" name="accountId">${data.accounts.map(a => `<option value="${esc(a.id)}" ${a.id === accId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('Type')}</span><select class="input" id="lf-type" name="type">${TYPES.map(([k, v]) => `<option value="${k}" ${type === k ? 'selected' : ''}>${t(v)}</option>`).join('')}</select></label></div>
      <label class="field"><span>${t('Nom')}</span><input class="input" id="lf-name" name="name" required maxlength="80" value="${esc(l?.name || '')}" placeholder="${t('ex. Fonds euros Linxea Spirit')}"></label>
      <div class="row2" data-show="market"><label class="field"><span>ISIN</span><input class="input" id="lf-isin" name="isin" maxlength="20" value="${esc(l?.isin || '')}" placeholder="${t('ex. FR0010315770')}"></label>
      <label class="field"><span>${t('Symbole Yahoo')}</span><input class="input" id="lf-ticker" name="ticker" maxlength="20" value="${esc(l?.ticker || '')}" placeholder="${t('trouvé via l’ISIN')}"></label></div>
      <div class="row2" data-show="market"><label class="field"><span>${t('Quantité')}</span><input class="input" id="lf-qty" name="qty" inputmode="decimal" value="${l && !isCashLike(l) ? inputNum(l.qty, 6) : ''}"></label>
      <label class="field"><span>${t('Prix de revient unitaire (€)')}</span><input class="input" id="lf-pru" name="pru" inputmode="decimal" value="${l && !isCashLike(l) && l.qty ? inputNum(pru(l), 4) : ''}"></label></div>
      <div class="row2" data-show="market"><label class="field"><span>${t('Cours actuel (€)')}</span><input class="input" id="lf-price" name="price" inputmode="decimal" value="${l && !isCashLike(l) ? inputNum(l.price, 4) : ''}"><small>${t('Mis à jour à l’actualisation si un symbole est connu.')}</small></label>
      <label class="field"><span>${t('Part en actions (%)')}</span><input class="input" id="lf-eq" name="equity" inputmode="decimal" value="${l ? inputNum((l.equity ?? 1) * 100, 0) : '100'}"></label></div>
      <label class="field" data-show="cash"><span>${t('Montant (€)')}</span><input class="input" id="lf-amount" name="amount" inputmode="decimal" value="${l && isCashLike(l) ? inputNum(l.amount) : ''}"></label>
      <div class="row2" data-show="action"><label class="field"><span>${t('Secteur')}</span><select class="input" id="lf-sector" name="sector"><option value="">—</option>${sectorOpts}</select></label>
      <label class="field"><span>${t('Pays')}</span><input class="input" id="lf-country" name="country" maxlength="40" value="${esc(l?.lookthrough?.country || '')}" placeholder="${t('ex. France')}"></label></div>
      <label class="field"><span>${t('Détenu depuis')}</span><input class="input" type="date" id="lf-since" name="since" value="${esc(l?.since || (l?.events?.[0]?.[0]) || today())}"><small>${t('Sert à placer la ligne sur la courbe d’évolution.')}</small></label>
      <label class="field"><span>${t('Note')}</span><textarea class="input plain" id="lf-note" name="note" maxlength="500" rows="2" placeholder="${t('ex. numéro de contrat, conseiller, objectif')}">${esc(l?.note || '')}</textarea></label>
      <p class="small neg" id="lf-err" hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${t(l ? 'Enregistrer' : 'Ajouter la ligne')}</button><button class="btn" type="button" data-close>${t('Annuler')}</button></div>
    </form>`, {
    label: t('Ligne'),
    onMount: (sh, close) => {
      const f = sh.querySelector('form');
      const sync = () => {
        const ty = f.type.value, cash = ['especes', 'livret', 'fonds-euros'].includes(ty);
        sh.querySelectorAll('[data-show="market"]').forEach(x => x.hidden = cash);
        sh.querySelectorAll('[data-show="cash"]').forEach(x => x.hidden = !cash);
        sh.querySelectorAll('[data-show="action"]').forEach(x => x.hidden = !(ty === 'action' || ty === 'fonds' || ty === 'autre'));
      };
      f.type.addEventListener('change', () => { sync(); if (f.type.value === 'crypto' || f.type.value === 'non-cote') f.equity.value = '0'; if (f.type.value === 'action' || f.type.value === 'etf') f.equity.value = '100'; });
      f.isin.addEventListener('change', () => { const lib = libraryFor(f.isin.value.trim()); if (lib) { if (!f.name.value) f.name.value = lib.name; if (!f.ticker.value) f.ticker.value = lib.ticker; f.type.value = lib.type; sync(); } });
      sync();
      f.addEventListener('submit', e => {
        e.preventDefault();
        const err = sh.querySelector('#lf-err'); const fail = m => { err.textContent = m; err.hidden = false; };
        const ty = f.type.value, cash = ['especes', 'livret', 'fonds-euros'].includes(ty);
        const name = f.name.value.trim(); if (!name) return fail(t('Donnez un nom à la ligne.'));
        const acc = accById(f.accountId.value);
        const n = l ? { ...l } : { id: 'ln-' + Date.now().toString(36), source: 'manual', events: [], pending: 0 };
        n.accountId = acc.id; n.type = ty; n.name = name; n.since = f.since.value || today();
        const note = f.note.value.trim(); if (note) n.note = note; else delete n.note;
        if (l && l.name !== name) n.customName = true;
        if (cash) {
          const amt = parseNum(f.amount.value); if (!isFinite(amt)) return fail(t('Indiquez un montant, par exemple 2 500.'));
          Object.assign(n, { amount: amt, qty: 1, price: amt, cost: amt, priceDate: today(), equity: 0, isin: '', ticker: '' });
          n.envelope = acc.kind === 'av' ? 'Assurance-vie' : acc.kind === 'per' ? 'PER' : ty === 'livret' ? 'Livrets' : ty === 'fonds-euros' ? envelopeForAccount(acc) : 'Espèces';
          if (imported(l)) n.events = l.events;
        } else {
          const q = parseNum(f.qty.value), p = parseNum(f.pru.value), cur = parseNum(f.price.value);
          if (!(q > 0)) return fail(t('Indiquez une quantité positive.'));
          if (!(p >= 0)) return fail(t('Indiquez le prix de revient unitaire (0 si offert).'));
          const price = isFinite(cur) && cur > 0 ? cur : p;
          const eq = parseNum(f.equity.value);
          n.isin = f.isin.value.trim().toUpperCase(); n.ticker = f.ticker.value.trim().toUpperCase();
          if (l && l.ticker !== n.ticker) n.customTicker = true;
          n.qty = q; n.cost = q * p + (+n.pending || 0);
          if (!l || Math.abs(price - l.price) > 1e-9) { n.price = price; n.priceDate = today(); n.priceSource = 'manuel'; }
          n.equity = isFinite(eq) ? Math.min(100, Math.max(0, eq)) / 100 : 1;
          n.envelope = imported(l) ? l.envelope : (ty === 'crypto' && acc.kind !== 'pea' && acc.kind !== 'av' ? 'Crypto' : envelopeForAccount(acc));
          if (f.sector.value || f.country.value.trim()) n.lookthrough = { sector: f.sector.value, country: f.country.value.trim() };
          else delete n.lookthrough;
          if (imported(l) && (Math.abs(q - l.qty) > 1e-9)) n.events = [...(l.events || []), [today(), q, n.cost, price]];
        }
        if (l) data.lines = data.lines.map(x => x.id === l.id ? n : x); else data.lines.push(n);
        close(); commit(t(l ? 'Ligne mise à jour.' : 'Ligne ajoutée.'));
      });
    },
  });
}

// ——— Files ———
function pickFile(accept) {
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    inp.addEventListener('change', () => { const f = inp.files?.[0]; inp.remove(); res(f || null); });
    document.body.append(inp); inp.click();
  });
}
const readText = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error(t('Lecture du fichier impossible.'))); r.readAsText(f, 'utf-8'); });

async function saveFile(filename, text) {
  if (window.claude && typeof window.claude.use === 'function') {
    try {
      const dl = await window.claude.use('downloads');
      if (dl) { await dl.save({ filename, data: text }); toast(t('Fichier enregistré.')); return true; }
    } catch (e) { if (e && e.code === 'declined') return false; }
  }
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(t('Sauvegarde exportée : {x}', { x: filename }));
    return true;
  } catch {
    openSheet(`${sheetHead(t('Copiez votre sauvegarde'), t('Le téléchargement est bloqué ici.'))}<textarea class="input" readonly id="bk-text">${esc(text)}</textarea><div class="btn-row mt12"><button class="btn primary" data-copy>${t('Copier')}</button></div>`, {
      onMount: sh => sh.querySelector('[data-copy]').addEventListener('click', () => { const ta = sh.querySelector('#bk-text'); navigator.clipboard?.writeText(ta.value).then(() => toast(t('Copié.')), () => { ta.select(); }); }),
    });
  }
}

// Supported import sources: each brings its guide (steps shown before picking the file) and its flow.
// A new broker = one entry here and its parser next to importer.js.
const IMPORTERS = {
  tr: {
    name: 'Trade Republic',
    steps: () => [
      step('download', t('Dans l’app Trade Republic, exportez vos transactions'), t('« Exportation de transactions », au format CSV.')),
      step('historique', t('Choisissez toute la période, depuis l’ouverture du compte'), t('Une période partielle donne des quantités et des espèces fausses.')),
      step('upload', t('Importez le fichier ici'), t('Un nouvel import remplace les lignes Trade Republic et garde vos lignes manuelles et vos renommages.')),
    ],
    run: () => importCsvFlow(),
  },
  linxea: {
    name: 'Linxea',
    steps: () => [
      step('compte', t('Sur l’espace client Linxea, ouvrez votre contrat'), t('{link}, Épargne, puis le contrat à importer.', { link: '<a href="https://espaceclient.linxea.com" target="_blank" rel="noopener">espaceclient.linxea.com</a>' })),
      step('download', t('Sous « Composition du contrat », touchez « Télécharger vos données »'), t('Un fichier Excel (.xlsx) arrive dans vos téléchargements : la valeur de chaque support, ses parts, son prix de revient et ses performances.')),
      step('upload', t('Importez le fichier ici'), t('Chaque import met à jour ce contrat et ajoute un point à sa courbe : refaites-le de temps en temps.')),
    ],
    run: () => importLinxeaFlow(),
  },
};
const imported = l => !!(l && IMPORTERS[l.source]);
function importGuide(key) {
  const src = IMPORTERS[key]; if (!src) return;
  openSheet(`${sheetHead(t('Import {x}', { x: esc(src.name) }), t('Trois étapes, et vos comptes sont à jour.'))}
    <ol class="steps">${src.steps().join('')}</ol>
    <div class="btn-row"><button class="btn primary" data-go>${ICONS.upload}${t('Choisir le fichier')}</button><button class="btn" data-close>${t('Annuler')}</button></div>`, {
    label: t('Import {x}', { x: src.name }),
    // The file picker must open from the click itself (browsers block it otherwise): run first, then close.
    onMount: (sh, close) => sh.querySelector('[data-go]').addEventListener('click', () => { src.run(); close(); }),
  });
}

async function importCsvFlow() {
  const f = await pickFile('.csv,text/csv');
  if (!f) return;
  let imp;
  try { imp = importTradeRepublic(await readText(f)); } catch (e) { toast(e.message); return; }
  const st = imp.stats;
  const held = imp.lines.filter(l => isHeld(l)); // without fully sold positions, kept for the chart
  const byAcc = id => held.filter(l => l.accountId === id);
  openSheet(`${sheetHead(t('Import Trade Republic'), tn(st.rows, '{n} opération, du {a} au {b}', '{n} opérations, du {a} au {b}', { n: num(st.rows, 0), a: dateLong(st.from), b: dateLong(st.to) }))}
    ${imp.accounts.map(a => `<div class="section-head mt8"><h2>${esc(a.name)}</h2><span class="aside">${tn(byAcc(a.id).length, '{n} ligne', '{n} lignes')}</span></div>
      <div class="holdings">${byAcc(a.id).sort((x, y) => lineCost(y) - lineCost(x)).map(l => `<div class="holding"><span class="r"></span><span class="n">${esc(shortName(l))}</span><span class="a">${isCashLike(l) ? eur(l.amount) : fqty(l.qty)}</span><span class="w">${isCashLike(l) ? t('Solde espèces recalculé') : t('Prix de revient {x}', { x: eur(l.cost) }) + (l.pending ? ' · ' + t('dont {x} en attente d’exécution', { x: eur(l.pending) }) : '')}</span></div>`).join('')}</div>`).join('')}
    <div class="callout my16">${t('Espèces recalculées : {x}. Vérifiez ce montant dans l’app Trade Republic.', { x: `<b>${Object.entries(st.cash).map(([id, v]) => esc(imp.accounts.find(a => a.id === id)?.name || id) + ' ' + eur(v)).join(' · ')}</b>` })}</div>
    ${data.demo ? `<p class="small muted">${t('Les données d’exemple seront effacées.')}</p>` : ''}
    <div class="btn-row"><button class="btn primary" data-ok>${t('Importer')}</button><button class="btn" data-close>${t('Annuler')}</button></div>`, {
    label: t('Import'),
    onMount: (sh, close) => sh.querySelector('[data-ok]').addEventListener('click', () => {
      if (data.demo) { const keep = { profile: data.profile, settings: data.settings }; data = { ...emptyData(), ...keep }; }
      data = mergeImport(data, imp); close(); land('patrimoine');
      commit(tn(held.length, '{n} ligne importée.', '{n} lignes importées.'));
    }),
  });
}

async function importLinxeaFlow() {
  const f = await pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!f) return;
  let imp;
  try { imp = importLinxea(await readXlsx(await f.arrayBuffer())); } catch (e) { toast(e.message || t('Lecture du fichier impossible.')); return; }
  const byAcc = id => imp.lines.filter(l => l.accountId === id).sort((a, b) => lineValue(b) - lineValue(a));
  const sub = l => [l.subcategory || l.category, isCashLike(l) ? '' : tn(l.qty, '{n} part', '{n} parts', { n: qtyShort(l.qty) }), isCashLike(l) ? '' : t('plus-value {x}', { x: signedEur(lineGain(l)) })].filter(Boolean).join(' · ');
  openSheet(`${sheetHead(t('Import Linxea'), tn(imp.lines.length, '{n} support au {date}', '{n} supports au {date}', { date: dateLong(imp.stats.to) }))}
    ${imp.accounts.map(a => `<div class="section-head mt8"><h2>${esc(a.name)}</h2><span class="aside">${esc(kindLabel(a.kind))} · ${eur(byAcc(a.id).reduce((s, l) => s + lineValue(l), 0))}</span></div>
      <div class="holdings">${byAcc(a.id).map(l => `<div class="holding"><span class="r"></span><span class="n">${esc(l.name)}</span><span class="a">${eur(lineValue(l))}</span><span class="w">${esc(sub(l))}</span></div>`).join('')}</div>`).join('')}
    <div class="callout my16">${t('Valeurs de Linxea au {date}. Un nouvel import met à jour ce contrat ; vos autres comptes, vos renommages, notes et cibles restent.', { date: dateLong(imp.stats.to) })}</div>
    ${data.demo ? `<p class="small muted">${t('Les données d’exemple seront effacées.')}</p>` : ''}
    <div class="btn-row"><button class="btn primary" data-ok>${t('Importer')}</button><button class="btn" data-close>${t('Annuler')}</button></div>`, {
    label: t('Import'),
    onMount: (sh, close) => sh.querySelector('[data-ok]').addEventListener('click', () => {
      if (data.demo) { const keep = { profile: data.profile, settings: data.settings }; data = { ...emptyData(), ...keep }; }
      data = mergeLinxea(data, imp); close(); land('patrimoine');
      commit(tn(imp.lines.length, '{n} support importé.', '{n} supports importés.'));
    }),
  });
}

async function restoreFlow() {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let obj;
  try { obj = JSON.parse(await readText(f)); } catch { toast(t('Ce fichier n’est pas un JSON lisible.')); return; }
  try {
    if (obj && obj.encrypted) {
      const pass = await passSheet({ title: t('Sauvegarde chiffrée'), confirm: false });
      if (!pass) return;
      obj = await decryptBackup(obj, pass);
    }
    const nd = validateBackup(obj);
    const accs = nd.accounts.length, lns = nd.lines.length;
    const empty = !data.lines.length && !data.accounts.length;
    const what = `${tn(accs, '{n} compte', '{n} comptes')} ${t('et')} ${tn(lns, '{n} ligne', '{n} lignes')}`;
    let mode = empty && !obj.partial ? 'replace' : null;
    if (!mode) mode = await choiceSheet({
      title: t(obj.partial ? 'Ajouter ces comptes ?' : 'Restaurer la sauvegarde'),
      text: obj.partial ? t('Ce fichier contient {what} ({names}). Ils seront ajoutés à vos données ; un compte déjà présent avec le même identifiant sera remplacé.', { what, names: esc(nd.accounts.map(a => a.name).join(', ')) })
        : t('La sauvegarde du {date} contient {what}. Vous pouvez l’ajouter à vos données actuelles, ou tout remplacer.', { date: dateLong((obj.exportedAt || '').slice(0, 10)), what }),
      choices: obj.partial || empty ? [['merge', t('Ajouter'), 'primary']] : [['merge', t('Ajouter à mes données'), 'primary'], ['replace', t('Tout remplacer'), '']],
    });
    if (!mode) return;
    if (mode === 'replace') data = nd;
    else {
      if (data.demo) data = { ...emptyData(), settings: data.settings };
      const accIds = new Set(nd.accounts.map(a => a.id)), lineIds = new Set(nd.lines.map(l => l.id));
      data.accounts = [...data.accounts.filter(a => !accIds.has(a.id)), ...nd.accounts];
      data.lines = [...data.lines.filter(l => !lineIds.has(l.id) && !accIds.has(l.accountId)), ...nd.lines];
      // transactions of the restored accounts; a backup without history keeps the device's
      if (Array.isArray(nd.transactions)) data.transactions = [...(data.transactions || []).filter(tr => !accIds.has(tr.accountId)), ...nd.transactions];
      data.priceHistory = { ...(data.priceHistory || {}), ...(nd.priceHistory || {}) };
      if (!data.profile.firstName && nd.profile.firstName) data.profile.firstName = nd.profile.firstName;
      if (!data.trStats && nd.trStats) data.trStats = nd.trStats;
    }
    land('patrimoine'); commit(mode === 'replace' ? t('Sauvegarde restaurée.') : t('{what} ajoutés.', { what }));
  } catch (e) { toast(e.message || t('Restauration impossible.')); }
}

async function exportFlow(encrypted) {
  const payload = backupPayload(data);
  const stamp = today();
  let saved;
  if (!encrypted) saved = await saveFile(`carnet-sauvegarde-${stamp}.json`, JSON.stringify(payload, null, 1));
  else {
    const pass = await passSheet({ title: t('Sauvegarde chiffrée'), confirm: true });
    if (!pass) return;
    saved = await saveFile(`carnet-sauvegarde-chiffree-${stamp}.json`, JSON.stringify(await encryptBackup(payload, pass)));
  }
  if (saved) { setDevice({ lastExport: nowIso(), backupSnooze: '' }); render(); }
}

// Backup reminder: without sync, a backup file is the only copy if the browser erases its data.
// Dates are per device (carnet:device:v1): restoring an old file must not look like a fresh backup.
const BACKUP_DAYS = 30;
function backupAge() {
  const d = device();
  if (!d.lastExport && !d.firstData) { setDevice({ firstData: nowIso() }); return 0; }
  return Math.floor((Date.now() - Date.parse(d.lastExport || d.firstData)) / 86400000);
}
function backupCard() {
  if (data.demo || !data.lines.length || syncState()) return '';
  const days = backupAge(), d = device();
  if (days < BACKUP_DAYS || (d.backupSnooze && d.backupSnooze > nowIso())) return '';
  return `<section class="callout backup-hint" aria-label="${t('Sauvegarde')}">
    <p><b>${t(d.lastExport ? 'Dernière sauvegarde il y a {n} jours.' : 'Aucune sauvegarde depuis {n} jours.', { n: days })}</b> ${t('Si le navigateur efface ses données, ce fichier permet de tout retrouver.')}</p>
    <div class="btn-row"><button class="btn primary sm" data-action="export-plain">${ICONS.download}${t('Exporter')}</button><button class="btn sm" data-action="backup-snooze">${t('Plus tard')}</button></div>
  </section>`;
}

// ——— Sync (encrypted in the browser, see sync.js) ———
const syncPayload = d => { const { demo, ...rest } = d; return rest; };
const nowIso = () => new Date().toISOString();
let syncTimer, editRev = 0;
function scheduleSync() {
  const st = syncState(); if (!st || data.demo) return;
  editRev++;
  if (!st.dirty) { st.dirty = true; saveSyncState(st); }
  clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 1500);
}
// rev: number of the change being sent. A change made during the send stays to be sent.
function markSynced(st, version, rev) {
  const dirty = rev !== editRev;
  saveSyncState({ ...st, version, dirty, at: nowIso() });
  if (dirty) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), 1500); }
}
function adoptRemote(r) { data = normalize(r.data); save(data); render(); }

function syncStatusHtml() {
  const st = syncState(); if (!st) return '';
  if (ui.syncing) return `<span class="status"><i></i>${t('Synchronisation…')}</span>`;
  if (ui.syncError) return `<span class="status off"><i></i>${esc(ui.syncError)}</span>${ui.syncLost ? `<br><button class="btn sm mt10" data-action="sync-recreate">${t('Recréer le coffre avec les données de cet appareil')}</button>` : ''}`;
  if (st.dirty) return `<span class="status"><i></i>${t('Changements en attente d’envoi')}</span>`;
  if (!st.at) return `<span class="status"><i></i>${t('Pas encore synchronisé')}</span>`;
  const d = new Date(st.at), sameDay = d.toDateString() === new Date().toDateString();
  return `<span class="status ok"><i></i>${t(sameDay ? 'À jour (à {x})' : 'À jour (le {x})', { x: sameDay ? timeShort(d) : dateShort(st.at.slice(0, 10)) })}</span>`;
}
function setSyncUI() { const el = $('#sync-status'); if (el) el.innerHTML = syncStatusHtml(); }
function syncCard() {
  const st = syncState();
  if (!st) return `<section class="card"><p class="lead">${t('Retrouvez vos données sur l’ordinateur et le téléphone. Elles sont chiffrées dans ce navigateur avant d’être envoyées : le serveur ne garde qu’un bloc illisible.')}</p>
    <div class="btn-row"><button class="btn primary" data-action="sync-create">${t('Créer un coffre')}</button><button class="btn" data-action="sync-login">${t('Se connecter')}</button></div>
    <p class="note">${t('Un identifiant et une phrase de passe, sans e-mail. La phrase n’est jamais envoyée : si vous l’oubliez, personne ne peut ouvrir le coffre, mais les données de vos appareils restent intactes.')}</p></section>`;
  return `<section class="card"><p class="lead">${t('Cet appareil est relié au coffre {x}. Chaque modification y est envoyée chiffrée, et vos autres appareils la récupèrent en s’ouvrant.', { x: `<b>${esc(st.user)}</b>` })}</p>
    <p class="m-b12" id="sync-status">${syncStatusHtml()}</p>
    <div class="btn-row"><button class="btn" data-action="sync-now">${t('Synchroniser')}</button><button class="btn" data-action="sync-logout">${t('Déconnecter cet appareil')}</button></div>
    <div class="btn-row mt8"><button class="btn danger" data-action="sync-delete">${t('Supprimer le coffre en ligne')}</button></div>
    <p class="note">${t('Le serveur gratuit peut, rarement, perdre un coffre. Vos appareils gardent toujours leurs données : Carnet le signale alors et le recrée en un geste.')}</p></section>`;
}

async function syncNow(manual = false) {
  const st = syncState();
  if (!st || ui.syncing) return;
  if (data.demo) { if (manual) toast(t('Effacez d’abord les données d’exemple.')); return; }
  clearTimeout(syncTimer);
  ui.syncing = true; ui.syncError = ''; ui.syncLost = false; setSyncUI();
  const rev = editRev;
  let ok = true;
  try {
    if (st.dirty) {
      try { const r = await pushVault(st, st.version, syncPayload(data)); markSynced(st, r.version, rev); }
      catch (e) { if (e.status !== 409) throw e; ok = await syncConflict(st, rev); }
    } else {
      const r = await pullVault(st, st.version);
      if (r.version !== st.version && rev === editRev) { adoptRemote(r); if (!manual) toast(t('Données mises à jour depuis un autre appareil.')); }
      markSynced(st, rev === editRev ? r.version : st.version, rev);
    }
    if (manual && ok) toast(t('Synchronisé.'));
  } catch (e) {
    ui.syncLost = e.status === 404;
    ui.syncError = ui.syncLost ? t('Le coffre n’existe plus sur le serveur : supprimé depuis un autre appareil, ou perdu par le serveur. Les données de cet appareil sont intactes.')
      : e.status === 401 ? t('Coffre supprimé ou phrase de passe changée : déconnectez cet appareil.') : e.message;
    if (manual) toast(ui.syncError);
  } finally { ui.syncing = false; setSyncUI(); }
}

async function syncConflict(st, rev) {
  const r = await pullVault(st);
  const when = r.updatedAt ? dateTime(new Date(r.updatedAt)) : '';
  const c = await choiceSheet({
    title: t('Modifié sur deux appareils'),
    text: t(when ? 'Le coffre a été modifié depuis un autre appareil (le {when}), alors que celui-ci avait aussi des changements non envoyés. Quelle version garder ?' : 'Le coffre a été modifié depuis un autre appareil, alors que celui-ci avait aussi des changements non envoyés. Quelle version garder ?', { when: esc(when) }),
    choices: [['remote', t('Celle du coffre'), 'primary'], ['local', t('Celle de cet appareil'), '']],
  });
  if (c === 'remote') { adoptRemote(r); markSynced(st, r.version, editRev); return true; }
  if (c === 'local') { const p = await pushVault(st, r.version, syncPayload(data)); markSynced(st, p.version, rev); return true; }
  ui.syncError = t('Conflit non résolu : touchez « Synchroniser » pour choisir.');
  return false;
}

// Vault gone from the server: this device already has the keys, so it recreates it with its data.
// The other connected devices find it again on their next poll.
async function recreateVault() {
  const st = syncState(); if (!st || ui.syncing || data.demo) return;
  ui.syncing = true; setSyncUI();
  const rev = editRev;
  let taken = false;
  try {
    const r = await pushVault(st, 0, syncPayload(data));
    markSynced(st, r.version, rev); ui.syncError = ''; ui.syncLost = false; toast(t('Coffre recréé.'));
  } catch (e) { if (e.status === 409) taken = true; else toast(e.message); }
  finally { ui.syncing = false; setSyncUI(); }
  if (taken) syncNow(true); // already recreated from another device: regular sync
}

function syncSheet(create) {
  const label = t(create ? 'Créer et synchroniser' : 'Se connecter');
  openSheet(`${sheetHead(t(create ? 'Créer un coffre' : 'Se connecter'), t(create ? 'Les données de cet appareil y seront envoyées, chiffrées.' : 'Retrouvez les données de vos autres appareils.'))}
    <form class="form">
      <label class="field"><span>${t('Identifiant')}</span><input class="input" id="sy-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="40" required><small>${t('3 à 40 caractères : lettres sans accent, chiffres, point, tiret.')}</small></label>
      <label class="field"><span>${t('Phrase de passe')}</span><input class="input" type="password" id="sy-pass" name="password" autocomplete="${create ? 'new-password' : 'current-password'}" required></label>
      ${create ? `<label class="field"><span>${t('Encore une fois')}</span><input class="input" type="password" id="sy-pass2" autocomplete="new-password" required></label>
      <p class="note">${t('Elle chiffre vos données et ne quitte jamais cet appareil. Oubliée, rien ne permet de la retrouver : rangez-la dans un gestionnaire de mots de passe.')}</p>` : ''}
      <p class="small neg" id="sy-err" hidden></p>
      <div class="btn-row"><button class="btn primary" type="submit">${label}</button><button class="btn" type="button" data-close>${t('Annuler')}</button></div></form>`, {
    label: t(create ? 'Créer un coffre' : 'Se connecter'),
    onMount: (sh, close) => {
      const f = sh.querySelector('form'), err = sh.querySelector('#sy-err'), btn = f.querySelector('[type=submit]');
      const fail = m => { err.textContent = m; err.hidden = false; btn.disabled = false; btn.textContent = label; };
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const user = normUser(sh.querySelector('#sy-user').value), pass = sh.querySelector('#sy-pass').value;
        if (!USER_RE.test(user)) return fail(t('Identifiant : 3 à 40 caractères parmi a-z, 0-9, point, tiret et tiret bas.'));
        if (create && pass.length < 10) return fail(t('Phrase de passe : au moins 10 caractères.'));
        if (create && pass !== sh.querySelector('#sy-pass2').value) return fail(t('Les deux phrases ne sont pas identiques.'));
        if (create && data.demo) return fail(t('Effacez d’abord les données d’exemple.'));
        err.hidden = true; btn.disabled = true; btn.textContent = t('Calcul de la clé…');
        try {
          const acc = await deriveAccount(user, pass);
          btn.textContent = t('Connexion…');
          if (create) {
            const r = await pushVault(acc, 0, syncPayload(data));
            saveSyncState({ ...acc, version: r.version, at: nowIso() });
            close(); render(); toast(t('Coffre créé. Connectez-vous avec le même identifiant sur vos autres appareils.'));
            return;
          }
          const r = await pullVault(acc);
          const local = !data.demo && (data.accounts.length || data.lines.length);
          let version = r.version;
          if (local) {
            const n = d => `${tn(d.accounts.length, '{n} compte', '{n} comptes')} ${t('et')} ${tn(d.lines.length, '{n} ligne', '{n} lignes')}`;
            const c = await choiceSheet({
              title: t('Cet appareil a déjà des données'),
              text: t('Le coffre contient {remote} ; cet appareil, {local}. Lesquelles garder ? L’autre version sera remplacée.', { remote: n(r.data), local: n(data) }),
              choices: [['remote', t('Celles du coffre'), 'primary'], ['local', t('Celles de cet appareil'), '']],
            });
            if (!c) return fail(t('Connexion annulée : rien n’a été modifié.'));
            if (c === 'local') version = (await pushVault(acc, r.version, syncPayload(data))).version;
            else adoptRemote(r);
          } else adoptRemote(r);
          saveSyncState({ ...acc, version, at: nowIso() });
          ui.syncError = ''; close(); render(); toast(t('Appareil synchronisé.'));
        } catch (e2) {
          if (create && (e2.status === 401 || e2.status === 409)) return fail(t('Cet identifiant est déjà pris. Choisissez-en un autre, ou connectez-vous.'));
          if (!create && e2.status === 401) return fail(t('Phrase de passe incorrecte.'));
          fail(e2.message || t('Synchronisation impossible.'));
        }
      });
    },
  });
}

// ——— Prices ———
async function api(path, timeout = 4000) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(path, { cache: 'no-store', signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error(t('Réponse inattendue'));
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function checkServer() {
  try { const j = await api('api/health', 3000); ui.server = j && j.app === 'carnet' ? 'ok' : 'off'; } catch { ui.server = 'off'; }
  if (ui.tab === 'donnees') render();
  autoCompositions();
}

// New lines: every fund (ETF, UCITS) and every stock outside the library automatically gets
// its composition (Morningstar, justETF, through the server; only the ISIN is sent).
// New attempt after 3 days if nothing was found, update every 30 days otherwise,
// and right away for compositions from a previous version (COMP_VERSION).
const ISIN_OK = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const COMP_VERSION = 2;
const COMPOSABLE = l => !isCashLike(l) && ISIN_OK.test(String(l.isin || '').toUpperCase()) && !['crypto', 'non-cote', 'structure', 'autre-fixe'].includes(l.type) && wantsComposition(l.isin);
let composing = false;
async function autoCompositions() {
  if (composing || ui.server !== 'ok') return;
  const comps = data.compositions || {};
  const due = [...new Set(heldLines(data).filter(COMPOSABLE).map(l => l.isin.toUpperCase()))].filter(isin => {
    const c = comps[isin];
    return !c || (c.v || 1) < COMP_VERSION || Date.now() - Date.parse(c.at || 0) > (c.ok ? 30 : 3) * 86400000;
  });
  if (!due.length) return;
  composing = true;
  const found = [];
  let stored = 0;
  try {
    await pool(due, 2, async isin => {
      try {
        const j = await api('api/composition?isin=' + isin, 65000);
        data.compositions = { ...(data.compositions || {}), [isin]: { ...j, at: new Date().toISOString(), v: COMP_VERSION } };
        stored++; if (j.ok) found.push(isin);
      } catch { /* server or justETF unreachable: new attempt on next load */ }
    });
  } finally { composing = false; }
  if (!stored) return;
  const names = found.map(i => shortName(data.lines.find(l => String(l.isin).toUpperCase() === i)));
  commit(!names.length ? '' : names.length <= 3 ? t('Composition à jour : {x}.', { x: names.join(', ') }) : t('Compositions à jour pour {n} produits.', { n: names.length }));
}
function noServerSheet() {
  openSheet(`${sheetHead(t('Actualisation indisponible'), t('Le serveur Carnet ne répond pas.'))}
    <p class="muted mt0">${t('Les cours sont récupérés par le petit serveur livré avec Carnet, qui interroge Yahoo Finance. Lancez Carnet avec {cmd} ou déployez-le sur Vercel (voir le README).', { cmd: '<code>node server.mjs</code>' })}</p>
    <p class="muted">${t('En attendant, vous pouvez saisir un cours à la main : touchez une ligne, puis « Modifier ».')}</p>
    <div class="btn-row"><button class="btn primary" data-close>${t('Compris')}</button></div>`, { label: t('Actualisation') });
}
// Refreshes everything with a public quote: today's price + history (5 years weekly, 1 year daily).
const QUOTABLE = l => !isCashLike(l) && l.type !== 'structure' && (l.ticker || l.isin);
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); })); }
function navAt(hist, d) { if (!hist?.length) return null; const after = hist.find(h => h[0] >= d); return after || hist[hist.length - 1]; }
function refreshLabel() {
  if (ui.busy) return { short: ui.progress || t('Actualisation…'), long: ui.progress || t('Actualisation…') };
  const at = data.lastRefresh?.at;
  if (!at) return { short: t('Actualiser'), long: t('Actualiser les cours') };
  const d = new Date(at);
  const sameDay = d.toDateString() === new Date().toDateString();
  const when = sameDay ? timeShort(d) : dateShort(at.slice(0, 10));
  return { short: when, long: t(sameDay ? 'Cours mis à jour à {x}' : 'Cours mis à jour le {x}', { x: when }) };
}
function setRefreshUI() {
  const lab = refreshLabel();
  for (const b of document.querySelectorAll('.refresh-btn')) {
    b.classList.toggle('spin', ui.busy); b.disabled = ui.busy;
    const sh = b.querySelector('.r-short'), lg = b.querySelector('.r-long');
    if (sh) sh.textContent = lab.short; if (lg) lg.textContent = lab.long;
    b.title = t(ui.busy ? 'Actualisation en cours' : 'Actualiser les cours et l’historique de chaque produit');
  }
}
function progress(msg) { ui.progress = msg; setRefreshUI(); }

// The refresh report is stored: its messages stay French keys (with their value in .arg)
// and are translated when shown, so changing the language also changes the report.
async function refreshPrices() {
  if (ui.busy) return;
  ui.busy = true; progress(t('Connexion…'));
  try {
    try { await api('api/health', 4000); ui.server = 'ok'; } catch { ui.server = 'off'; noServerSheet(); return; }
    const targets = heldLines(data).filter(QUOTABLE);
    if (!targets.length) { toast(t('Aucun produit coté à actualiser.')); return; }
    // 0. Symbol corrected in the library since the import (unless the symbol was entered by hand)
    for (const l of targets) { const tk = libraryFor(l.isin)?.ticker; if (tk && !l.customTicker && l.ticker !== tk) { l.ticker = tk; delete l.tickerAuto; } }
    // 1. Missing Yahoo symbol: search by ISIN
    const missing = targets.filter(l => !l.ticker && l.isin);
    const searchErr = {};
    if (missing.length) {
      let n = 0; progress(t('Symboles {a}/{b}', { a: 0, b: missing.length }));
      await pool(missing, 3, async l => {
        // No symbol: noted, so the line stops counting as a price to refresh (its value comes from imports)
        try { const j = await api('api/search?q=' + encodeURIComponent(l.isin), 12000); if (j.symbol) { l.ticker = j.symbol; l.tickerAuto = true; delete l.noSymbol; } else l.noSymbol = today(); }
        catch (e) { searchErr[l.id] = e.message; }
        progress(t('Symboles {a}/{b}', { a: ++n, b: missing.length }));
      });
    }
    // 2. Prices and history, in batches
    const syms = [...new Set(targets.map(l => l.ticker).filter(Boolean))];
    const quotes = {};
    for (let i = 0; i < syms.length; i += 5) {
      const chunk = syms.slice(i, i + 5);
      progress(t('Cours {a}/{b}', { a: Math.min(i + 5, syms.length), b: syms.length }));
      try { const j = await api('api/quote?range=full&symbols=' + encodeURIComponent(chunk.join(',')), 60000); Object.assign(quotes, j.quotes || {}); }
      catch (e) { for (const s of chunk) quotes[s] = { error: e.name === 'AbortError' ? 'délai dépassé' : e.message }; }
    }
    // 3. Update the lines
    data.priceHistory = data.priceHistory || {};
    const results = [];
    for (const l of targets) {
      const r = { id: l.id, name: shortName(l), symbol: l.ticker || '', ok: false };
      if (!l.ticker) {
        if (searchErr[l.id]) Object.assign(r, { error: 'Recherche impossible : {x}', arg: searchErr[l.id] });
        else if (l.type === 'non-cote') r.error = 'Fonds non coté : pas de cours public';
        else Object.assign(r, { error: 'Aucun symbole Yahoo pour l’ISIN {x}', arg: l.isin });
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
        Object.assign(r, { note: 'quantité estimée avec la valeur liquidative du {x}', noteDate: nav ? nav[0] : q.date });
      }
      l.price = q.price; l.priceDate = q.date || today(); l.priceSource = 'yahoo';
      Object.assign(r, { ok: true, price: q.price, date: l.priceDate, delta: lineValue(l) - before, points: q.history?.length || 0 });
      results.push(r);
    }
    data.lastRefresh = { at: new Date().toISOString(), results };
    data.settings.snoozeUntil = '';
    const ok = results.filter(r => r.ok).length, ko = results.length - ok;
    ui.busy = false; ui.progress = '';
    commit(ko ? tn(ok, '{n} produit actualisé · {ko} sans cours (détail dans Réglages, Cours)', '{n} produits actualisés · {ko} sans cours (détail dans Réglages, Cours)', { ko })
      : tn(ok, '{n} produit actualisé, historique compris.', '{n} produits actualisés, historique compris.'));
  } catch (e) {
    toast(t('Échec de l’actualisation : {x}', { x: e.name === 'AbortError' ? t('délai dépassé.') : e.message }));
  } finally { ui.busy = false; ui.progress = ''; setRefreshUI(); if (ui.tab === 'donnees') render(); }
}

function refreshReport() {
  const lr = data.lastRefresh;
  if (!lr) return `<p class="small muted m-t12">${t('Aucune actualisation pour l’instant.')}</p>`;
  const quiet = r => /non coté|Aucun symbole/.test(r.error);
  const ok = lr.results.filter(r => r.ok), ko = lr.results.filter(r => !r.ok).sort((a, b) => quiet(a) - quiet(b));
  const note = r => r.noteDate ? t(r.note, { x: dateShort(r.noteDate) }) : t(r.note);
  return `<p class="small muted m-t14b6">${t('Dernière actualisation : {date} à {time} · {ok} à jour, {ko} sans cours.', { date: dateLong(lr.at.slice(0, 10)), time: timeShort(new Date(lr.at)), ok: ok.length, ko: ko.length })}</p>
    <div class="holdings">${[...ko, ...ok].map(r => `<div class="holding"><span class="r">${r.ok ? '<span class="pos">●</span>' : quiet(r) ? '<span class="muted">●</span>' : '<span class="neg">●</span>'}</span><span class="n">${esc(r.name)}</span><span class="a">${r.ok ? eur(r.price) : '—'}</span><span class="w">${r.ok ? `${esc(r.symbol)} · ${t('cours du {x}', { x: dateShort(r.date) })} · ${tn(+r.points || 0, '{n} point d’historique', '{n} points d’historique')}${r.note ? ' · ' + esc(note(r)) : ''}` : esc(t(r.error, { x: r.arg }))}</span></div>`).join('')}</div>`;
}

// ——— Example data ———
function demoData() {
  const d = emptyData();
  d.demo = true;
  d.profile.firstName = '';
  d.settings.lang = data.settings.lang;
  d.accounts = [
    { id: 'd-pea', name: t('Courtier PEA'), institution: t('Exemple'), kind: 'pea', color: 'orange', source: 'manual' },
    { id: 'd-cto', name: t('Courtier'), institution: t('Exemple'), kind: 'cto', color: 'ink', source: 'manual' },
    { id: 'd-liv', name: 'Livret A', institution: t('Exemple'), kind: 'livret', color: 'green', source: 'manual' },
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
  // Example history: buys derived from each line's events, plus one sold round trip
  d.transactions = [];
  for (const l of d.lines) {
    if (isCashLike(l)) continue;
    let pq = 0, pc = 0;
    for (const [date, q, c, p] of l.events) {
      const dq = q - pq;
      if (dq > 1e-9) d.transactions.push({ id: 'd-op-' + d.transactions.length, source: 'demo', date, accountId: l.accountId, envelope: l.envelope, isin: l.isin, name: l.name, type: l.type, kind: 'BUY', shares: +dq.toFixed(6), price: p, amount: -(c - pc + 1), fee: -1, tax: 0 });
      pq = q; pc = c;
    }
  }
  d.transactions.push(
    { id: 'd-op-h1', source: 'demo', date: '2025-03-12', accountId: 'd-pea', envelope: 'PEA', isin: 'FR0000052292', name: 'Hermès', type: 'action', kind: 'BUY', shares: 1, price: 2050, amount: -2051, fee: -1, tax: 0 },
    { id: 'd-op-h2', source: 'demo', date: '2025-11-20', accountId: 'd-pea', envelope: 'PEA', isin: 'FR0000052292', name: 'Hermès', type: 'action', kind: 'SELL', shares: 1, price: 2290, amount: 2290, fee: -1, tax: 0, realized: 238 },
  );
  // Example deposits: each buy paid by a deposit the same day; the sale proceeds withdrawn
  for (const tr of [...d.transactions]) {
    if (tr.kind === 'BUY') d.transactions.push({ id: 'd-dep-' + tr.id, source: 'demo', date: tr.date, accountId: tr.accountId, envelope: tr.envelope, type: 'especes', kind: 'DEPOSIT', amount: -tr.amount, fee: 0, tax: 0 });
  }
  d.transactions.push({ id: 'd-wd-h2', source: 'demo', date: '2025-11-21', accountId: 'd-pea', envelope: 'PEA', type: 'especes', kind: 'WITHDRAWAL', amount: -2289, fee: 0, tax: 0 });
  Object.assign(d.lines[0], { target: 60 }); Object.assign(d.lines[1], { target: 20 }); Object.assign(d.lines[2], { target: 15 }); Object.assign(d.lines[3], { target: 5 });
  return d;
}

// ——— Navigation & events ———
// land() switches tab without rendering, for actions that end with commit().
function land(tab) { ui.tab = tab; ui.section = ''; if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab); window.scrollTo(0, 0); }
function go(tab) { land(tab); render(); }
// Tab and Réglages section from the address (#donnees/comptes); null if it is not a tab
function fromHash() {
  const [tab, section = ''] = location.hash.slice(1).split('/');
  if (!TABS.some(x => x[0] === tab)) return null;
  return { tab, section: tab === 'donnees' && Object.hasOwn(SECTIONS, section) ? section : '' };
}
function route() { const r = fromHash(); if (!r) return; Object.assign(ui, r); render(); window.scrollTo(0, 0); }
function openSection(key) { history.pushState({ section: key }, '', '#donnees/' + key); route(); }
function closeSection() { if (history.state?.section) history.back(); else go('donnees'); }

document.addEventListener('click', async e => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { go(tabBtn.dataset.tab); return; }
  const b = e.target.closest('[data-action]'); if (!b) return;
  if (b.closest('.sheet') && !['open-line'].includes(b.dataset.action)) return; // sheets handle their own buttons
  const a = b.dataset.action, v = b.dataset.v;
  switch (a) {
    case 'range': ui.range = v; render(); break;
    case 'filter': ui.filter = v; render(); break;
    case 'group': ui.group = v; render(); break;
    case 'env-lines': ui.filter = v; render(); $('#lines')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'analyse': ui.analyse = v; render(); break;
    case 'hist-kind': ui.hist.kind = v; ui.hist.limit = 150; render(); break;
    case 'hist-more': { ui.hist.limit += 150; const y = window.scrollY; $('#hist-body').innerHTML = histBody(); window.scrollTo(0, y); break; }
    case 'open-split': openSplit(v); break;
    case 'go': go(v); break;
    case 'section': openSection(v); break;
    case 'section-close': closeSection(); break;
    case 'open-line': openLine(b.dataset.id); break;
    case 'open-account': openAccount(b.dataset.id); break;
    case 'add-line': lineForm(null); break;
    case 'add-account': accountForm(null); break;
    case 'edit-account': accountForm(b.dataset.id); break;
    case 'refresh': refreshPrices(); break;
    case 'install': installSheet(); break;
    case 'backup-snooze': setDevice({ backupSnooze: new Date(Date.now() + 7 * 86400000).toISOString() }); render(); break;
    case 'snooze': data.settings.snoozeUntil = new Date(Date.now() + 86400000).toISOString(); commit(); break;
    case 'theme': data.settings.theme = v; commit(); break;
    case 'lang': data.settings.lang = v; commit(); break;
    case 'pick-csv': importCsvFlow(); break;
    case 'import-source': importGuide($('#imp-source')?.value); break;
    case 'pick-backup': restoreFlow(); break;
    case 'export-plain': exportFlow(false); break;
    case 'export-enc': exportFlow(true); break;
    case 'demo': data = demoData(); commit(t('Données d’exemple chargées.')); break;
    case 'clear-demo': { const keep = { settings: data.settings }; data = { ...emptyData(), ...keep }; clearAll(); commit(t('Exemple effacé.')); break; }
    case 'wipe':
      if (await confirmSheet({ title: t('Tout effacer ?'), text: t('Comptes, lignes, historique et réglages seront supprimés de cet appareil. Cette action ne peut pas être annulée.') + (syncState() ? ' ' + t('Cet appareil sera aussi déconnecté du coffre, qui reste intact.') : ''), ok: t('Tout effacer'), danger: true })) { clearSyncState(); clearAll(); setDevice({ firstData: '', lastExport: '', backupSnooze: '' }); data = emptyData(); land('patrimoine'); commit(t('Données effacées.')); }
      break;
    case 'sync-create': syncSheet(true); break;
    case 'sync-login': syncSheet(false); break;
    case 'sync-now': syncNow(true); break;
    case 'sync-recreate': recreateVault(); break;
    case 'sync-logout':
      if (await confirmSheet({ title: t('Déconnecter cet appareil ?'), text: t('Les données restent sur cet appareil et dans le coffre ; elles ne seront simplement plus synchronisées ici.'), ok: t('Déconnecter') })) { clearSyncState(); ui.syncError = ''; render(); toast(t('Appareil déconnecté.')); }
      break;
    case 'sync-delete': {
      const st = syncState(); if (!st) break;
      if (!await confirmSheet({ title: t('Supprimer le coffre en ligne ?'), text: t('Le coffre « {x} » sera effacé du serveur. Les données de cet appareil sont conservées, mais vos autres appareils ne seront plus synchronisés.', { x: esc(st.user) }), ok: t('Supprimer le coffre'), danger: true })) break;
      try { await deleteVault(st); } catch (e2) { if (e2.status !== 404) { toast(e2.message); break; } }
      clearSyncState(); ui.syncError = ''; render(); toast(t('Coffre supprimé.'));
      break;
    }
    case 'sim-mode': ui.sim.mode = v; render(); break;
    case 'targets': targetSheet(); break;
    case 'share': shareSheet(); break;
    case 'milestone-seen': setDevice({ milestoneSeen: { ...(device().milestoneSeen || {}), [b.dataset.id]: v } }); render(); break;
    case 'import-guide': importGuide(v); break;
    case 'go-rebalance': go('simuler'); $('#reb')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
    case 'reb-sell': ui.reb.sell = v === '1'; render(); break;
    case 'reb-pick': {
      const l = lineById(b.dataset.id); if (!l) break;
      const m = +v;
      Object.assign(ui.sim, { lineId: l.id, mode: m > 0 ? 'buy' : 'sell', by: 'amount', amount: inputNum(Math.abs(m), 0), price: l.price ? inputNum(l.price, 4) : '' });
      render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    }
    case 'sim-by': {
      const s = ui.sim, p = parseNum(s.price);
      if (v === 'qty' && s.by === 'amount' && p > 0) s.qty = inputNum(parseNum(s.amount) / p, 4);
      if (v === 'amount' && s.by === 'qty' && p > 0) s.amount = inputNum(parseNum(s.qty) * p, 2);
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
      if (k === 'lineId') { const l = lineById(el.value); ui.sim.price = l && l.price ? inputNum(l.price, 4) : ''; }
      render(); return;
    }
    const out = $('#sim-out'); if (out) out.innerHTML = simResult();
  }
  if (el.dataset.scope !== undefined) { ui.scope = el.value; const l = el.parentNode.querySelector('.scope-label'); if (l) l.textContent = scopeLabel(); after.patrimoine(); }
  if (el.dataset.reb) { ui.reb[el.dataset.reb] = el.value; const o = $('#reb-out'); if (o) o.innerHTML = rebalanceRows(); }
  if (el.dataset.hist) { ui.hist[el.dataset.hist] = el.value; ui.hist.limit = 150; const b = $('#hist-body'); if (b) b.innerHTML = histBody(); }
  if (el.dataset.setting === 'taxRate') { const n = parseNum(el.value); if (isFinite(n) && n >= 0 && n <= 100) { data.settings.taxRate = n; save(data); scheduleSync(); } }
});
document.addEventListener('change', e => { if (e.target.dataset.sim === 'useCash') { ui.sim.useCash = e.target.checked; const out = $('#sim-out'); if (out) out.innerHTML = simResult(); } });
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-form="profile"]'); if (!f) return;
  e.preventDefault(); data.profile.firstName = f.firstName.value.trim(); commit(t('Profil enregistré.'));
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1].close(); });
window.addEventListener('hashchange', route);
let wasWide = isWide();
window.addEventListener('resize', () => { const w = isWide(); if (w !== wasWide) { wasWide = w; render(); } else if (ui.tab === 'patrimoine') after.patrimoine(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
window.addEventListener('languagechange', () => { shownLang = ''; render(); });
window.addEventListener('storage', e => { if (e.key && e.key.startsWith('carnet:data')) { data = load(); render(); } });

// ——— Start ———
(function start() {
  Object.assign(ui, fromHash());
  for (const n of document.querySelectorAll('[data-icon]')) n.innerHTML = ICONS[n.dataset.icon] || '';
  render();
  checkServer();
  syncNow();
  ensurePersist();
  setTimeout(offerInstall, 1500);
  document.addEventListener('visibilitychange', () => syncNow());
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 120000);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
  }
})();
