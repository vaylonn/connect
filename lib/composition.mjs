// Composition d'un ETF ou fiche d'une action, lues sur justETF à partir de l'ISIN (côté serveur).
// Seul l'ISIN est envoyé : jamais de quantités ni de montants.
// ETF : 10 principales positions, pays et secteurs (les 4 premiers, le reste en « Autre »).
// Chaque position est complétée par la fiche de l'action (pays du siège, secteur).
const BASE = (process.env.JUSTETF_BASE || 'https://www.justetf.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const cache = new Map(); // isin -> { at, value }
const TTL = 24 * 3600 * 1000;

async function page(path, timeout = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(BASE + path, { headers: { 'user-agent': UA, 'accept-language': 'fr-FR,fr;q=0.9', accept: 'text/html' }, redirect: 'manual', signal: ctl.signal });
    if (r.status === 404 || (r.status >= 300 && r.status < 400)) return null; // pas de fiche de ce type
    if (!r.ok) throw new Error('justETF a répondu ' + r.status);
    return await r.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('justETF ne répond pas (délai dépassé)');
    throw e;
  } finally { clearTimeout(t); }
}

const text = s => String(s || '').replace(/&#0?39;/g, '’').replace(/'/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const num = s => parseFloat(String(s).replace(/[\s %]/g, '').replace(',', '.'));
const titleOf = h => text(h.match(/<title>([^<|]*)/)?.[1]).replace(/ action$/, '');

const SECTOR_RULES = [ // « Matériaux hors énergie » : matériaux avant énergie
  [/mat[ée]ria|mati[èe]res|chimi/, 'mat'], [/non cycl|consommation de base/, 'staples'], [/cycl|discr[ée]tionn|consommateurs|distribution|automobile|loisirs/, 'disc'],
  [/technolog|logiciel|semi-?conduct/, 'it'], [/financ|banque|assurance/, 'fin'], [/sant[ée]|pharma/, 'health'],
  [/industri/, 'ind'], [/t[ée]l[ée]com|communication|m[ée]dia/, 'comm'], [/[ée]nergie|p[ée]trole/, 'energy'],
  [/services publics|collectivit|utilit/, 'util'], [/immobili/, 're'],
];
export function sectorKey(s) {
  const l = String(s || '').toLowerCase();
  return SECTOR_RULES.find(([re]) => re.test(l))?.[1] || 'other';
}
const COUNTRY_ALIASES = { 'Grande-Bretagne': 'Royaume-Uni', 'Autre': 'Autres pays', 'Etats-Unis': 'États-Unis', 'Corée': 'Corée du Sud', 'République de Corée': 'Corée du Sud' };
export const country = s => COUNTRY_ALIASES[text(s)] || text(s) || 'Autres pays';
// Pays déduit du préfixe de l'ISIN quand la fiche de l'action manque (siège le plus souvent)
const ISIN_COUNTRY = { FR: 'France', US: 'États-Unis', DE: 'Allemagne', NL: 'Pays-Bas', GB: 'Royaume-Uni', CH: 'Suisse', IT: 'Italie', ES: 'Espagne', BE: 'Belgique', SE: 'Suède', DK: 'Danemark', FI: 'Finlande', NO: 'Norvège', IE: 'Irlande', LU: 'Luxembourg', PT: 'Portugal', AT: 'Autriche', JP: 'Japon', CA: 'Canada', AU: 'Australie', TW: 'Taïwan', KR: 'Corée du Sud', CN: 'Chine', HK: 'Chine', IN: 'Inde', BR: 'Brésil' };

// Noms courts, alignés sur ceux de la bibliothèque, pour regrouper une même entreprise vue
// à travers plusieurs fonds (« Schneider Electric SE » → « Schneider Electric »).
const LEGAL = /[\s,]+(SE|SA|S\.A\.|AG|NV|N\.V\.|PLC|Plc|plc|Inc\.?|Corp\.?|Corporation|Co\.|Ltd\.?|Limited|Holdings?|Group|ASA|A\/S|AB|SpA|S\.p\.A\.|Class [A-C]|[A-C])$/;
const ALIASES = { 'Amazon.com': 'Amazon', 'LVMH Moët Hennessy Louis Vuitton': 'LVMH', 'Taiwan Semiconductor Manufacturing': 'TSMC', 'VINCI': 'Vinci' };
export function shortCompany(name) {
  let n = text(name), prev;
  do { prev = n; n = n.replace(LEGAL, '').trim(); } while (n !== prev && n);
  n = n || text(name);
  return ALIASES[n] || n;
}

function table(h, kind) {
  return [...h.matchAll(new RegExp(`data-testid="etf-holdings_${kind}_row">([\\s\\S]*?)</tr>`, 'g'))].map(([, r]) => ({
    name: text(r.match(/title="([^"]+)"/)?.[1] || r.match(/value_name">([^<]+)</)?.[1]),
    pct: num(r.match(/percentage">([^<]+)</)?.[1]),
    isin: r.match(/stock-profiles\/([A-Z0-9]{12})/)?.[1] || '',
  })).filter(x => x.name && isFinite(x.pct));
}

export function parseStock(h) {
  const facts = {};
  for (const [, k, v] of h.matchAll(/vallabel">\s*([^<]*?)\s*<[\s\S]*?class="val bold">([^<]*)</g)) facts[text(k)] = text(v);
  const c = facts.Country || facts.Pays;
  if (!c && !facts.Secteur) return null;
  return { name: titleOf(h), country: country(c), sector: sectorKey(facts.Secteur), sectorName: facts.Secteur || '' };
}

export function parseEtf(h) {
  const holdings = table(h, 'top-holdings');
  const countries = table(h, 'countries'), sectors = table(h, 'sectors');
  if (!holdings.length && !countries.length && !sectors.length) return null;
  const add = (o, k, v) => { o[k] = +((o[k] || 0) + v).toFixed(2); };
  const out = { type: 'etf', name: titleOf(h), sectors: {}, countries: {}, holdings };
  for (const s of sectors) add(out.sectors, sectorKey(s.name), s.pct);
  for (const c of countries) add(out.countries, country(c.name), c.pct);
  return out;
}

async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

async function fetchComposition(isin) {
  const etfPage = await page('/fr/etf-profile.html?isin=' + isin);
  const etf = etfPage && parseEtf(etfPage);
  if (etf) {
    const holdings = [];
    await pool(etf.holdings, 4, async (x, k) => {
      let s = null;
      if (x.isin) { try { const p = await page('/fr/stock-profiles/' + x.isin, 8000); s = p && parseStock(p); } catch { /* fiche action facultative */ } }
      holdings[k] = [shortCompany(x.name), x.pct, s?.sector || 'other', s?.country || ISIN_COUNTRY[x.isin.slice(0, 2)] || 'Autres pays'];
    });
    return { ok: true, isin, type: 'etf', name: etf.name, index: 'd’après justETF', sectors: etf.sectors, countries: etf.countries, holdings: holdings.filter(Boolean) };
  }
  const stockPage = await page('/fr/stock-profiles/' + isin);
  const s = stockPage && parseStock(stockPage);
  if (s) return { ok: true, isin, type: 'action', name: shortCompany(s.name), sector: s.sector, country: s.country };
  return { ok: false, isin, error: 'Produit introuvable sur justETF' };
}

export async function composition(isin) {
  isin = String(isin || '').trim().toUpperCase();
  if (!ISIN_RE.test(isin)) throw new Error('ISIN invalide');
  const c = cache.get(isin);
  if (c && Date.now() - c.at < TTL) return c.value;
  const value = await fetchComposition(isin);
  cache.set(isin, { at: Date.now(), value });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return value;
}
