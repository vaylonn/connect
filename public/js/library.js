// Library of known products: Yahoo symbol, indicative composition.
// Compositions are approximations (order of magnitude, mid-2026) meant
// to give an overview. They do not replace the issuer's factsheet.

export const SECTORS = {
  it: 'Technologies de l’information',
  fin: 'Finance',
  health: 'Santé',
  ind: 'Industrie',
  disc: 'Consommation discrétionnaire',
  staples: 'Consommation de base',
  comm: 'Services de communication',
  energy: 'Énergie',
  mat: 'Matériaux',
  util: 'Services publics',
  re: 'Immobilier',
  crypto: 'Crypto-actifs',
  pe: 'Capital-investissement',
  other: 'Autres',
};

const MSCI_WORLD = {
  index: 'MSCI World',
  equity: 1,
  sectors: { it: 27, fin: 16.5, ind: 11, disc: 10, health: 9, comm: 8.5, staples: 5.5, energy: 3.5, mat: 3, util: 2.8, re: 2.2 },
  countries: { 'États-Unis': 71.5, 'Japon': 5.2, 'Royaume-Uni': 3.4, 'Canada': 3.1, 'France': 2.6, 'Allemagne': 2.3, 'Suisse': 2.3, 'Australie': 1.6, 'Pays-Bas': 1.2, 'Autres pays': 6.8 },
  holdings: [
    ['NVIDIA', 5.3, 'it', 'États-Unis'], ['Apple', 4.6, 'it', 'États-Unis'], ['Microsoft', 4.3, 'it', 'États-Unis'],
    ['Amazon', 2.7, 'disc', 'États-Unis'], ['Alphabet', 3.5, 'comm', 'États-Unis'], ['Broadcom', 1.8, 'it', 'États-Unis'],
    ['Meta Platforms', 1.8, 'comm', 'États-Unis'], ['Tesla', 1.4, 'disc', 'États-Unis'], ['JPMorgan Chase', 1.0, 'fin', 'États-Unis'],
    ['Eli Lilly', 0.8, 'health', 'États-Unis'], ['Visa', 0.7, 'fin', 'États-Unis'], ['Netflix', 0.5, 'comm', 'États-Unis'],
  ],
};

const SP500 = {
  index: 'S&P 500',
  equity: 1,
  sectors: { it: 33, fin: 13.5, disc: 10.5, comm: 10, health: 9, ind: 8.5, staples: 5.3, energy: 3, util: 2.4, re: 2, mat: 1.8 },
  countries: { 'États-Unis': 100 },
  holdings: [
    ['NVIDIA', 7.4, 'it', 'États-Unis'], ['Apple', 6.5, 'it', 'États-Unis'], ['Microsoft', 6.1, 'it', 'États-Unis'],
    ['Amazon', 3.8, 'disc', 'États-Unis'], ['Alphabet', 4.8, 'comm', 'États-Unis'], ['Meta Platforms', 2.6, 'comm', 'États-Unis'],
    ['Broadcom', 2.5, 'it', 'États-Unis'], ['Tesla', 2.0, 'disc', 'États-Unis'], ['Berkshire Hathaway', 1.6, 'fin', 'États-Unis'],
    ['JPMorgan Chase', 1.4, 'fin', 'États-Unis'],
  ],
};

const CAC40 = {
  index: 'CAC 40',
  equity: 1,
  sectors: { ind: 30, disc: 18, fin: 13, health: 10.5, mat: 7.5, staples: 7.5, energy: 6.5, it: 3.5, comm: 2, util: 1.5 },
  countries: { 'France': 100 },
  holdings: [
    ['Schneider Electric', 8.0, 'ind', 'France'], ['LVMH', 7.5, 'disc', 'France'], ['TotalEnergies', 6.5, 'energy', 'France'],
    ['Safran', 6.5, 'ind', 'France'], ['Airbus', 6.5, 'ind', 'France'], ['Air Liquide', 6.0, 'mat', 'France'],
    ['Sanofi', 5.5, 'health', 'France'], ['L’Oréal', 5.5, 'staples', 'France'], ['BNP Paribas', 5.0, 'fin', 'France'],
    ['AXA', 4.5, 'fin', 'France'], ['EssilorLuxottica', 4.0, 'health', 'France'], ['Hermès', 4.0, 'disc', 'France'],
    ['Vinci', 3.5, 'ind', 'France'], ['Dassault Systèmes', 1.5, 'it', 'France'],
  ],
};

// CAC 40 ESG: 40 SBF 120 stocks selected on ESG criteria (no TotalEnergies).
// Holdings, countries and top 4 sectors from justETF (October 2026), remaining sectors estimated.
const CAC40_ESG = {
  index: 'CAC 40 ESG',
  equity: 1,
  sectors: { ind: 30.5, fin: 16.1, disc: 15.6, staples: 9.3, health: 10, mat: 7, it: 5.5, comm: 3, util: 2, re: 1 },
  countries: { 'France': 89.5, 'Pays-Bas': 7.7, 'Suisse': 1.6, 'Luxembourg': 1.2 },
  holdings: [
    ['Schneider Electric', 10.2, 'ind', 'France'], ['Airbus', 7.0, 'ind', 'Pays-Bas'], ['BNP Paribas', 6.4, 'fin', 'France'],
    ['LVMH', 6.4, 'disc', 'France'], ['Safran', 6.0, 'ind', 'France'], ['Sanofi', 5.7, 'health', 'France'],
    ['Air Liquide', 4.9, 'mat', 'France'], ['L’Oréal', 4.8, 'staples', 'France'], ['AXA', 4.6, 'fin', 'France'],
    ['Vinci', 3.5, 'ind', 'France'],
  ],
};

// STOXX Europe 600: top 4 countries and sectors from justETF (October 2026), the rest estimated.
const STOXX600 = {
  index: 'STOXX Europe 600',
  equity: 1,
  sectors: { fin: 24, ind: 17, health: 12, staples: 9, it: 9.5, disc: 8, mat: 5.5, energy: 4.5, util: 4.5, comm: 4.5, re: 1.5 },
  countries: { 'Royaume-Uni': 21.7, 'Suisse': 14.8, 'France': 13.9, 'Allemagne': 13, 'Pays-Bas': 7, 'Espagne': 5, 'Italie': 5, 'Suède': 5, 'Danemark': 3.5, 'Finlande': 1.5, 'Belgique': 1.5, 'Autres pays': 8.1 },
  holdings: [
    ['ASML', 4.3, 'it', 'Pays-Bas'], ['HSBC', 2.2, 'fin', 'Royaume-Uni'], ['Roche', 2.1, 'health', 'Suisse'],
    ['Novartis', 1.9, 'health', 'Suisse'], ['AstraZeneca', 1.7, 'health', 'Royaume-Uni'], ['Shell', 1.6, 'energy', 'Royaume-Uni'],
    ['Nestlé', 1.6, 'staples', 'Suisse'], ['Siemens', 1.5, 'ind', 'Allemagne'], ['SAP', 1.4, 'it', 'Allemagne'],
    ['Banco Santander', 1.4, 'fin', 'Espagne'],
  ],
};

export const LIBRARY = {
  'IE0002XZSHO1': { name: 'iShares MSCI World Swap PEA', short: 'MSCI World (PEA)', ticker: 'WPEA.PA', type: 'etf', ...MSCI_WORLD },
  'LU1681046931': { name: 'Amundi CAC 40 ESG UCITS ETF Acc', short: 'CAC 40 ESG', ticker: 'C40.PA', type: 'etf', ...CAC40_ESG },
  'FR0013380607': { name: 'Amundi CAC 40 UCITS ETF (Multi Units)', short: 'CAC 40', ticker: 'CACC.PA', type: 'etf', ...CAC40 },
  'FR0011871128': { name: 'Amundi PEA S&P 500 UCITS ETF', short: 'S&P 500 (PEA)', ticker: 'PSP5.PA', type: 'etf', ...SP500 },
  'IE00B5BMR087': { name: 'iShares Core S&P 500', short: 'S&P 500', ticker: 'SXR8.DE', type: 'etf', ...SP500 },
  'LU0908500753': { name: 'Amundi Core Stoxx Europe 600 UCITS ETF Acc', short: 'STOXX Europe 600', ticker: 'MEUD.PA', type: 'etf', ...STOXX600 },
  'DE0002635307': { name: 'iShares STOXX Europe 600 UCITS ETF (DE)', short: 'STOXX Europe 600', ticker: 'EXSA.DE', type: 'etf', ...STOXX600 },
  'FR0013412012': {
    name: 'Amundi PEA MSCI Emerging Asia ESG Leaders', short: 'Asie émergente (PEA)', ticker: 'PAASI.PA', type: 'etf',
    index: 'MSCI EM Asia ESG Leaders', equity: 1,
    sectors: { it: 30, fin: 22, disc: 13, comm: 11, ind: 6, mat: 4, health: 4, staples: 4, energy: 2, util: 2, re: 2 },
    countries: { 'Chine': 32, 'Taïwan': 24, 'Inde': 23, 'Corée du Sud': 13, 'Indonésie': 2.5, 'Malaisie': 2, 'Thaïlande': 2, 'Philippines': 1.5 },
    holdings: [
      ['TSMC', 14, 'it', 'Taïwan'], ['Tencent', 7, 'comm', 'Chine'], ['Samsung Electronics', 4, 'it', 'Corée du Sud'],
      ['Alibaba', 4, 'disc', 'Chine'], ['SK Hynix', 3, 'it', 'Corée du Sud'], ['HDFC Bank', 2.5, 'fin', 'Inde'],
      ['Xiaomi', 1.8, 'it', 'Chine'], ['Infosys', 1.5, 'it', 'Inde'], ['Meituan', 1.5, 'disc', 'Chine'],
      ['China Construction Bank', 1.5, 'fin', 'Chine'],
    ],
  },
  'IE00BGV5VN51': {
    name: 'Xtrackers Artificial Intelligence & Big Data', short: 'IA & Big Data', ticker: 'XAIX.DE', type: 'etf',
    index: 'Nasdaq Global AI & Big Data', equity: 1,
    sectors: { it: 68, comm: 18, disc: 6, ind: 4, fin: 2, other: 2 },
    countries: { 'États-Unis': 85, 'Corée du Sud': 4, 'Taïwan': 3, 'Japon': 3, 'Chine': 2, 'Allemagne': 1.5, 'Autres pays': 1.5 },
    holdings: [
      ['NVIDIA', 5.5, 'it', 'États-Unis'], ['Apple', 5, 'it', 'États-Unis'], ['Microsoft', 4.8, 'it', 'États-Unis'],
      ['Alphabet', 4.5, 'comm', 'États-Unis'], ['Meta Platforms', 4.5, 'comm', 'États-Unis'], ['Broadcom', 4.5, 'it', 'États-Unis'],
      ['Samsung Electronics', 3.5, 'it', 'Corée du Sud'], ['Oracle', 3, 'it', 'États-Unis'], ['Palantir', 3, 'it', 'États-Unis'],
      ['Salesforce', 2.5, 'it', 'États-Unis'], ['AMD', 2.5, 'it', 'États-Unis'], ['IBM', 2.2, 'it', 'États-Unis'],
    ],
  },
  'IE00BL25JP72': {
    name: 'Xtrackers MSCI World Momentum', short: 'World Momentum', ticker: 'XDEM.DE', type: 'etf',
    index: 'MSCI World Momentum', equity: 1,
    sectors: { it: 25, fin: 20, comm: 12, ind: 12, disc: 9, health: 7, staples: 6, util: 3, energy: 2, mat: 2, re: 2 },
    countries: { 'États-Unis': 70, 'Japon': 6, 'Canada': 5, 'Royaume-Uni': 4, 'Allemagne': 3, 'Suisse': 2, 'Autres pays': 10 },
    holdings: [
      ['Broadcom', 5.5, 'it', 'États-Unis'], ['NVIDIA', 5, 'it', 'États-Unis'], ['Meta Platforms', 4.5, 'comm', 'États-Unis'],
      ['JPMorgan Chase', 4, 'fin', 'États-Unis'], ['Netflix', 3, 'comm', 'États-Unis'], ['Palantir', 3, 'it', 'États-Unis'],
      ['Walmart', 2.5, 'staples', 'États-Unis'], ['Oracle', 2, 'it', 'États-Unis'], ['Philip Morris', 2, 'staples', 'États-Unis'],
      ['GE Aerospace', 2, 'ind', 'États-Unis'],
    ],
  },
  'IE000YYE6WK5': {
    name: 'VanEck Defense UCITS ETF', short: 'Défense', ticker: 'DFEN.DE', type: 'etf', index: 'MarketVector Global Defense', equity: 1,
    sectors: { ind: 82, it: 14, other: 4 },
    countries: { 'États-Unis': 55, 'France': 9, 'Allemagne': 8, 'Royaume-Uni': 8, 'Corée du Sud': 5, 'Italie': 4, 'Autres pays': 11 },
    holdings: [
      ['Palantir', 9, 'it', 'États-Unis'], ['Rheinmetall', 7, 'ind', 'Allemagne'], ['RTX', 7, 'ind', 'États-Unis'],
      ['Safran', 6, 'ind', 'France'], ['Lockheed Martin', 6, 'ind', 'États-Unis'], ['BAE Systems', 5, 'ind', 'Royaume-Uni'],
    ],
  },
  'LU1681045370': {
    name: 'Amundi MSCI Emerging Markets', short: 'Marchés émergents', ticker: 'AEEM.PA', type: 'etf', index: 'MSCI Emerging Markets', equity: 1,
    sectors: { it: 27, fin: 22, disc: 12, comm: 10, ind: 7, mat: 6, staples: 4.5, energy: 4, health: 3.5, util: 2.5, re: 1.5 },
    countries: { 'Chine': 27, 'Taïwan': 20, 'Inde': 18, 'Corée du Sud': 11, 'Brésil': 4.5, 'Arabie saoudite': 3.5, 'Afrique du Sud': 3.2, 'Autres pays': 12.8 },
    holdings: [['TSMC', 11, 'it', 'Taïwan'], ['Tencent', 5, 'comm', 'Chine'], ['Samsung Electronics', 3.5, 'it', 'Corée du Sud'], ['Alibaba', 3, 'disc', 'Chine']],
  },
  // Individual stocks
  'FR0014003TT8': { name: 'Dassault Systèmes', short: 'Dassault Systèmes', ticker: 'DSY.PA', type: 'action', equity: 1, sector: 'it', country: 'France' },
  'FR0000120073': { name: 'Air Liquide', short: 'Air Liquide', ticker: 'AI.PA', type: 'action', equity: 1, sector: 'mat', country: 'France' },
  'FR0000052292': { name: 'Hermès', short: 'Hermès', ticker: 'RMS.PA', type: 'action', equity: 1, sector: 'disc', country: 'France' },
  'US0378331005': { name: 'Apple', short: 'Apple', ticker: 'AAPL', type: 'action', equity: 1, sector: 'it', country: 'États-Unis' },
  'US02079K3059': { name: 'Alphabet (A)', short: 'Alphabet', ticker: 'GOOGL', type: 'action', equity: 1, sector: 'comm', country: 'États-Unis' },
  // Crypto (Trade Republic symbols)
  'BTC': { name: 'Bitcoin', short: 'Bitcoin', ticker: 'BTC-EUR', type: 'crypto', equity: 0, sector: 'crypto', country: '—' },
  'ETH': { name: 'Ethereum', short: 'Ethereum', ticker: 'ETH-EUR', type: 'crypto', equity: 0, sector: 'crypto', country: '—' },
};

export const COMPOSITION_NOTE = 'Pays et secteurs complets d’après Morningstar (ou justETF), principales positions seulement ; à défaut, composition indicative (ordre de grandeur mi-2026). Vérifiez la fiche de l’émetteur pour les chiffres exacts.';

// Compositions fetched automatically (Morningstar, justETF, through the server), stored in
// the data (data.compositions) and passed here. For a library fund, they
// replace the indicative composition and keep the library's name, symbol and type.
let merged = {};
export function setFetchedLibrary(map) {
  merged = {};
  for (const [k, f] of Object.entries(map && typeof map === 'object' ? map : {})) {
    if (!f || !f.ok) continue;
    const st = LIBRARY[k];
    if (!st) { merged[k] = f; continue; }
    if (!st.holdings || f.type !== 'etf' || !Object.keys(f.countries || {}).length || !Object.keys(f.sectors || {}).length) continue;
    merged[k] = { ...st, index: st.index ? st.index + ' · ' + f.index : f.index, asOf: f.asOf, sectors: f.sectors, countries: f.countries, holdings: f.holdings?.length >= 3 ? f.holdings : st.holdings, equity: f.equity ?? st.equity };
  }
}
// Products whose composition can be fetched: not in the library, or library funds
export function wantsComposition(isin) {
  const st = isin && LIBRARY[String(isin).toUpperCase()];
  return !st || !!st.holdings;
}

export function libraryFor(isin) {
  if (!isin) return null;
  const k = String(isin).toUpperCase();
  return merged[k] || LIBRARY[k] || null;
}

// Products offered in the simulator for a new line
export function libraryChoices() {
  const seen = new Set();
  return Object.entries(LIBRARY)
    .filter(([, p]) => p.type === 'etf' || p.type === 'action')
    .filter(([, p]) => { const k = p.name; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(([isin, p]) => ({ isin, name: p.name, type: p.type, ticker: p.ticker }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
