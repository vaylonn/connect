// Composition d'un fonds (ETF, OPCVM) ou fiche d'une action, à partir de l'ISIN (côté serveur).
// Seul l'ISIN est envoyé : jamais de quantités ni de montants.
//   1. Morningstar : pays et secteurs complets (y compris pour les ETF synthétiques, vus à
//      travers l'indice), part en actions, principales positions avec pays et secteur.
//   2. justETF, en secours : positions de l'indice pour les ETF synthétiques (Morningstar n'y
//      voit qu'un contrat d'échange), pays et secteurs si Morningstar n'a rien.
const MS = (process.env.MORNINGSTAR_BASE || 'https://lt.morningstar.com/api/rest.svc/klr5zyak8x').replace(/\/$/, '');
const JE = (process.env.JUSTETF_BASE || 'https://www.justetf.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const cache = new Map(); // isin -> { at, value }
const TTL = 24 * 3600 * 1000;
const TOP = 25; // positions gardées par fonds

async function get(url, { timeout = 12000, json = false } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  const host = new URL(url).hostname;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'fr-FR,fr;q=0.9', accept: json ? 'application/json' : 'text/html' }, redirect: 'manual', signal: ctl.signal });
    if (r.status === 404 || (r.status >= 300 && r.status < 400)) return null; // pas de fiche de ce type
    if (!r.ok) throw new Error(host + ' a répondu ' + r.status);
    return json ? await r.json() : await r.text();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(host + ' ne répond pas (délai dépassé)');
    throw e;
  } finally { clearTimeout(t); }
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

// ——— Libellés communs ———
const text = s => String(s || '').replace(/&#0?39;/g, '’').replace(/'/g, '’').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const num = s => parseFloat(String(s).replace(/[\s %]/g, '').replace(',', '.'));
const round = x => +x.toFixed(2);

const SECTOR_RULES = [ // « Matériaux hors énergie » : matériaux avant énergie
  [/mat[ée]ria|mati[èe]res|chimi/, 'mat'], [/non cycl|consommation de base|d[ée]fensi/, 'staples'], [/cycl|discr[ée]tionn|consommateurs|distribution|automobile|loisirs/, 'disc'],
  [/technolog|logiciel|semi-?conduct/, 'it'], [/financ|banque|assurance/, 'fin'], [/sant[ée]|pharma/, 'health'],
  [/industri/, 'ind'], [/t[ée]l[ée]com|communication|m[ée]dia/, 'comm'], [/[ée]nergie|p[ée]trole/, 'energy'],
  [/services publics|collectivit|utilit/, 'util'], [/immobili/, 're'],
];
export function sectorKey(s) {
  const l = String(s || '').toLowerCase();
  return SECTOR_RULES.find(([re]) => re.test(l))?.[1] || 'other';
}
// Secteurs Morningstar (GlobalSectorId) et GICS (2 premiers chiffres de GICSIndustryId)
const MS_SECTOR = { 101: 'mat', 102: 'disc', 103: 'fin', 104: 're', 205: 'staples', 206: 'health', 207: 'util', 308: 'comm', 309: 'energy', 310: 'ind', 311: 'it' };
const GICS_SECTOR = { 10: 'energy', 15: 'mat', 20: 'ind', 25: 'disc', 30: 'staples', 35: 'health', 40: 'fin', 45: 'it', 50: 'comm', 55: 'util', 60: 're' };

const COUNTRY_ALIASES = { 'Grande-Bretagne': 'Royaume-Uni', 'Autre': 'Autres pays', 'Etats-Unis': 'États-Unis', 'Corée': 'Corée du Sud', 'République de Corée': 'Corée du Sud' };
export const country = s => COUNTRY_ALIASES[text(s)] || text(s) || 'Autres pays';
// Codes pays ISO alpha-3 (Morningstar) → alpha-2, puis nom français
const ISO3 = Object.fromEntries('USA:US GBR:GB FRA:FR DEU:DE NLD:NL CHE:CH ITA:IT ESP:ES BEL:BE SWE:SE DNK:DK FIN:FI NOR:NO IRL:IE LUX:LU PRT:PT AUT:AT POL:PL GRC:GR CZE:CZ HUN:HU JPN:JP CAN:CA AUS:AU NZL:NZ TWN:TW KOR:KR CHN:CN HKG:HK SGP:SG IND:IN IDN:ID MYS:MY THA:TH PHL:PH VNM:VN BRA:BR MEX:MX CHL:CL COL:CO PER:PE ARG:AR ZAF:ZA SAU:SA ARE:AE QAT:QA KWT:KW ISR:IL TUR:TR EGY:EG RUS:RU BMU:BM CYM:KY JEY:JE GGY:GG IMN:IM CUW:CW PAN:PA URY:UY MAC:MO GTM:GT MLT:MT ISL:IS SVN:SI SVK:SK EST:EE LVA:LV LTU:LT ROU:RO HRV:HR KAZ:KZ NGA:NG KEN:KE MAR:MA PAK:PK BGD:BD'
  .split(' ').map(p => p.split(':')));
const REGION = (() => { try { return new Intl.DisplayNames(['fr'], { type: 'region' }); } catch { return null; } })();
const REGION_FIX = { HK: 'Hong Kong', MO: 'Macao', KY: 'Îles Caïmans' };
export function countryName(code) {
  const c2 = String(code || '').length === 3 ? ISO3[code] : code;
  if (!c2) return 'Autres pays';
  return REGION_FIX[c2] || (REGION && REGION.of(c2)) || code;
}

// Noms courts, alignés sur ceux de la bibliothèque, pour regrouper une même entreprise vue
// à travers plusieurs fonds (« Schneider Electric SE » → « Schneider Electric »).
const LEGAL = /[\s,]+(SE|SA|S\.A\.|AG|NV|N\.V\.|PLC|Plc|plc|Inc\.?|Corp\.?|Corporation|Co\.?|Ltd\.?|Limited|Holdings?|Group|ASA|A\/S|AB|SpA|S\.p\.A\.|Class [A-C]|[A-C])$/;
const SHARE_CLASS = /\s+(Ordinary Shares.*|Registered Shares.*|Shs.*|Act\. Cat\..*|Class [A-C] .*|Partnership Units.*|ADR.*)$/i;
// Comparés sans casse ni accents (« Lvmh Moet Hennessy… », « L’Oreal »)
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '’').toLowerCase();
const ALIASES = Object.fromEntries(Object.entries({
  'Amazon.com': 'Amazon', 'LVMH Moët Hennessy Louis Vuitton': 'LVMH', 'Taiwan Semiconductor Manufacturing': 'TSMC', 'VINCI': 'Vinci',
  'L’Oréal': 'L’Oréal', 'Air Liquide(L’)': 'Air Liquide', 'Hermès International': 'Hermès', 'Nestlé': 'Nestlé', 'NVIDIA': 'NVIDIA',
  'EssilorLuxottica': 'EssilorLuxottica', 'Alphabet Inc Class A': 'Alphabet', 'Alphabet Inc Class C': 'Alphabet', 'TotalEnergies': 'TotalEnergies', 'Schneider Electric': 'Schneider Electric',
}).map(([k, v]) => [fold(k), v]));
export function shortCompany(name) {
  let n = text(name);
  if (ALIASES[fold(n)]) return ALIASES[fold(n)];
  n = n.replace(SHARE_CLASS, '');
  let prev;
  do { prev = n; n = n.replace(LEGAL, '').trim(); } while (n !== prev && n);
  n = n || text(name);
  return ALIASES[fold(n)] || n;
}

// ——— Morningstar ———
async function msFind(isin, universes) {
  const j = await get(`${MS}/security/screener?page=1&pageSize=10&outputType=json&version=1&languageId=fr-FR&currencyId=EUR&universeIds=${encodeURIComponent(universes)}&securityDataPoints=SecId%7CName%7CIsin%7CSectorName%7CDomicile&term=${isin}`, { json: true, timeout: 10000 });
  return j?.rows?.find(r => r.Isin === isin) || null;
}
async function msStock(isin) {
  const r = await msFind(isin, 'E0WWE$$ALL');
  if (!r || !r.SectorName) return null;
  return { name: shortCompany(r.Name), sector: sectorKey(r.SectorName), country: countryName(r.Domicile) };
}
const breakdown = (list, pick) => (list || []).find(x => x.SalePosition === 'N' && (!pick || pick(x)))?.BreakdownValues || [];
async function msFund(isin) {
  const r = await msFind(isin, 'ETEUR$$ALL|FOFRA$$ALL|FOEUR$$ALL');
  if (!r) return null;
  const j = await get(`${MS}/security_details/${r.SecId}?viewId=ETFsnapshot&idtype=msid&responseViewFormat=json&languageId=fr-FR&currencyId=EUR`, { json: true, timeout: 20000 });
  const d = Array.isArray(j) ? j[0] : j;
  const p = d?.Portfolios?.[0];
  if (!p) return { name: r.Name };
  const countries = {}, sectors = {};
  for (const x of breakdown(p.CountryExposure, x => x.Type === 'Equity')) if (x.Value > 0.005) countries[countryName(x.Type)] = round((countries[countryName(x.Type)] || 0) + x.Value);
  for (const x of breakdown(p.GlobalStockSectorBreakdown)) if (x.Value > 0.005 && MS_SECTOR[x.Type]) sectors[MS_SECTOR[x.Type]] = round(x.Value);
  const stocks = breakdown(p.AssetAllocations).find(x => x.Type === '1')?.Value;
  const holdings = (p.PortfolioHoldings || [])
    .filter(h => h.DetailHoldingTypeId === 'E' && h.Weighting > 0)
    .sort((a, b) => b.Weighting - a.Weighting).slice(0, TOP)
    .map(h => [shortCompany(h.SecurityName || h.ExternalName), round(h.Weighting),
      GICS_SECTOR[String(h.GICSIndustryId || '').slice(0, 2)] || MS_SECTOR[h.GlobalSectorId] || 'other', countryName(h.CountryId), h.ISIN || '']);
  // Positions sans secteur dans le portefeuille : fiche de l'action
  await pool(holdings.filter(h => h[2] === 'other' && h[4]), 4, async h => { const s = await stockFacts(h[4]); if (s) h[2] = s.sector; });
  for (const h of holdings) h.length = 4;
  // part en actions : 1 au-delà de 98 % (liquidités résiduelles d'un ETF actions)
  const equity = typeof stocks === 'number' ? (stocks >= 98 ? 1 : Math.max(0, +(stocks / 100).toFixed(3))) : null;
  return { name: d.Name || r.Name, asOf: String(p.Date || '').slice(0, 10), countries, sectors, holdings, equity };
}

// ——— justETF ———
const titleOf = h => text(h.match(/<title>([^<|]*)/)?.[1]).replace(/ action$/, '');
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
  return { name: shortCompany(titleOf(h)), country: country(c), sector: sectorKey(facts.Secteur) };
}
export function parseEtf(h) {
  const holdings = table(h, 'top-holdings');
  const countries = table(h, 'countries'), sectors = table(h, 'sectors');
  if (!holdings.length && !countries.length && !sectors.length) return null;
  const add = (o, k, v) => { o[k] = round((o[k] || 0) + v); };
  const out = { name: titleOf(h), sectors: {}, countries: {}, holdings };
  for (const s of sectors) add(out.sectors, sectorKey(s.name), s.pct);
  for (const c of countries) add(out.countries, country(c.name), c.pct);
  return out;
}
const ISIN_COUNTRY = c => countryName(c);
// Secteur et pays d'une action : Morningstar, puis la fiche justETF, puis le préfixe de l'ISIN
async function stockFacts(isin) {
  try { const s = await msStock(isin); if (s) return s; } catch { /* source suivante */ }
  try { const p = await get(`${JE}/fr/stock-profiles/${isin}`, { timeout: 8000 }); const s = p && parseStock(p); if (s) return s; } catch { /* source suivante */ }
  return null;
}

const some = o => o && Object.keys(o).length > 0;
async function fetchComposition(isin) {
  let ms = null, msError = '';
  try { ms = await msFund(isin); } catch (e) { msError = e.message; }
  const msFull = ms && some(ms.countries) && some(ms.sectors);
  if (msFull && ms.holdings.length >= 3) {
    return { ok: true, isin, type: 'etf', name: ms.name, index: 'd’après Morningstar', asOf: ms.asOf, equity: ms.equity, sectors: ms.sectors, countries: ms.countries, holdings: ms.holdings };
  }
  // ETF synthétique, ou fonds que Morningstar connaît mal : justETF complète
  let je = null;
  try { const h = await get(`${JE}/fr/etf-profile.html?isin=${isin}`); je = h && parseEtf(h); } catch { /* facultatif */ }
  if (msFull || je) {
    const holdings = [];
    const src = ms?.holdings?.length >= 3 ? null : je?.holdings || [];
    if (src) {
      await pool(src, 4, async (x, k) => {
        const s = x.isin ? await stockFacts(x.isin) : null;
        holdings[k] = [shortCompany(x.name), x.pct, s?.sector || 'other', s?.country || (x.isin ? ISIN_COUNTRY(x.isin.slice(0, 2)) : 'Autres pays')];
      });
    }
    return {
      ok: true, isin, type: 'etf', name: ms?.name || je.name,
      index: msFull ? (src?.length ? 'd’après Morningstar et justETF' : 'd’après Morningstar') : 'd’après justETF',
      asOf: ms?.asOf || '', equity: ms?.equity ?? null,
      sectors: msFull ? ms.sectors : je.sectors, countries: msFull ? ms.countries : je.countries,
      holdings: src ? holdings.filter(Boolean) : ms.holdings,
    };
  }
  const s = await stockFacts(isin);
  if (s) return { ok: true, isin, type: 'action', name: s.name, sector: s.sector, country: s.country };
  return { ok: false, isin, error: msError ? 'Morningstar : ' + msError : 'Produit introuvable sur Morningstar et justETF' };
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
