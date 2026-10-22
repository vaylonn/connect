// Checks that the unofficial upstreams still answer in the shape Carnet expects: Yahoo Finance (prices,
// history, currency conversion, ISIN search), Morningstar (fund composition) and justETF (fallback).
// Run daily by .github/workflows/upstreams.yml; a failure fails the workflow, and GitHub emails the owner.
//   node tools/check-upstreams.mjs
import { quotes, searchSymbol } from '../lib/yahoo.mjs';
import { composition, parseEtf } from '../lib/composition.mjs';

const JE = (process.env.JUSTETF_BASE || 'https://www.justetf.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const WORLD = 'IE00B4L5Y983'; // iShares Core MSCI World: physical, well covered by both sources

const checks = {
  async 'Yahoo: euro price and 5-year history (WPEA.PA)'() {
    const q = (await quotes(['WPEA.PA'])).quotes['WPEA.PA'];
    if (q.error) throw new Error(q.error);
    if (!(q.price > 0)) throw new Error('no price');
    if (!(q.history?.length > 200)) throw new Error(`history too short: ${q.history?.length || 0} points`);
    return `${q.price} €, ${q.history.length} points`;
  },
  async 'Yahoo: dollar stock converted to euros (AAPL)'() {
    const q = (await quotes(['AAPL'])).quotes.AAPL;
    if (q.error) throw new Error(q.error);
    if (q.sourceCurrency !== 'USD' || !(q.price > 0)) throw new Error(`unexpected quote: ${JSON.stringify({ price: q.price, sourceCurrency: q.sourceCurrency })}`);
    return `${q.price} €`;
  },
  async 'Yahoo: symbol search by ISIN (FR0010315770)'() {
    const r = await searchSymbol('FR0010315770');
    if (!r.symbol) throw new Error('no symbol found');
    return r.symbol;
  },
  async ['Morningstar: fund composition (' + WORLD + ')']() {
    const c = await composition(WORLD);
    if (!c.ok) throw new Error(c.error);
    if (!/Morningstar/.test(c.index)) throw new Error('composition did not come from Morningstar: ' + c.index);
    const sectors = Object.keys(c.sectors).length, countries = Object.keys(c.countries).length;
    if (sectors < 8 || countries < 5 || c.holdings.length < 3) throw new Error(`thin composition: ${sectors} sectors, ${countries} countries, ${c.holdings.length} holdings`);
    return `${sectors} sectors, ${countries} countries, ${c.holdings.length} holdings`;
  },
  async ['justETF: ETF profile page (' + WORLD + ')']() {
    const r = await fetch(`${JE}/fr/etf-profile.html?isin=${WORLD}`, { headers: { 'user-agent': UA, 'accept-language': 'fr-FR,fr;q=0.9' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const e = parseEtf(await r.text());
    if (!e || !Object.keys(e.countries).length || !e.holdings?.length) throw new Error('page no longer parses (countries or holdings missing)');
    return `${Object.keys(e.countries).length} countries, ${e.holdings.length} holdings`;
  },
};

let failed = 0;
for (const [name, run] of Object.entries(checks)) {
  try { console.log(`ok    ${name}: ${await run()}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}: ${e.message || e}`); }
}
if (failed) { console.log(`\n${failed} upstream check(s) failed: price refresh or compositions may be broken in the app.`); process.exit(1); }
