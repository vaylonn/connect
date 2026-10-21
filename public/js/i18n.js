// Interface language. French is the source text: t() returns the English translation from EN
// when the interface is in English, and the French text otherwise (or when none exists).
// Placeholders such as {n} are filled from the second argument. A « |context » suffix tells apart two
// meanings of the same French word (« Cours|prix »): it is dropped from the French text.
import { EN } from './i18n-en.js';

let current = 'fr';
export const lang = () => current;
export const locale = () => (current === 'en' ? 'en-GB' : 'fr-FR');

// French when the device prefers French, English otherwise.
export function systemLang() {
  const l = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'fr';
  return /^fr\b/i.test(l) ? 'fr' : 'en';
}
// pref: 'auto' (follow the device), 'fr' or 'en'.
export function setLang(pref) {
  current = pref === 'fr' || pref === 'en' ? pref : systemLang();
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}

const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s);
export function t(s, v) {
  if (typeof s !== 'string') return s;
  const fr = s.includes('|') ? s.slice(0, s.indexOf('|')) : s;
  return fill(current === 'en' ? EN[s] ?? countryEn(s) ?? fr : fr, v);
}
// Plural: French treats 0 and 1 as singular, English only 1. {n} is the count unless v.n is given.
export function tn(n, one, many, v) {
  const single = current === 'en' ? n === 1 : Math.abs(n) < 2;
  return t(single ? one : many, { n, ...v });
}

// Country names come in French (server compositions, library): English names are derived
// from the French ones with Intl.DisplayNames, built once on first use.
let COUNTRIES;
function countryEn(s) {
  if (!COUNTRIES) {
    COUNTRIES = {};
    try {
      const fr = new Intl.DisplayNames(['fr'], { type: 'region' }), en = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let i = 65; i <= 90; i++) for (let j = 65; j <= 90; j++) {
        const code = String.fromCharCode(i, j), name = fr.of(code);
        if (name && name !== code) COUNTRIES[name] = en.of(code);
      }
    } catch { /* no Intl.DisplayNames: names stay in French */ }
  }
  return COUNTRIES[s];
}
