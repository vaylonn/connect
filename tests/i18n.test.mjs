import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EN } from '../public/js/i18n-en.js';
import { t, tn, setLang } from '../public/js/i18n.js';
import { eur, signedEur, pct, parseNum, bigParts, inputNum } from '../public/js/format.js';
import { SECTORS } from '../public/js/library.js';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const LIT = /'((?:[^'\\]|\\.)*)'/g;
const literals = s => [...s.matchAll(LIT)].map(m => m[1]);
// Literals that appear in t() arguments or tables as code (keys, ternary conditions, separators), not as text.
const code = s => /^[a-z-]*$/.test(s) || /^[A-Z_]+$/.test(s) || s === 'AbortError' || !/\p{L}/u.test(s);

// Every literal passed to t() or tn(), up to the placeholder values.
function calledKeys(src) {
  const out = [];
  for (const m of src.matchAll(/\bt\(|\btn\(/g)) {
    let i = m.index + m[0].length, depth = 1, buf = '';
    while (i < src.length && depth) { const c = src[i++]; if ('({['.includes(c)) depth++; else if (')}]'.includes(c)) depth--; if (depth) buf += c; }
    out.push(...literals(buf.split(/,\s*\{/)[0]));
  }
  return out;
}

test('every text shown by the app has an English translation', () => {
  const app = read('public/js/app.js');
  const keys = ['app.js', 'chart.js', 'compute.js', 'importer.js', 'store.js', 'sync.js'].flatMap(f => calledKeys(read('public/js/' + f)));
  // Labels kept in tables and translated where they are shown
  for (const name of ['KINDS', 'TYPES', 'OP_LABEL', 'HIST_KINDS', 'THEMES', 'SPLIT_WORD', 'SECTIONS']) {
    const start = app.indexOf(`const ${name} =`);
    keys.push(...literals(app.slice(start, app.indexOf(name === 'SECTIONS' ? '\n};' : '\n', start))));
  }
  keys.push(...Object.values(SECTORS), ...[...read('public/index.html').matchAll(/data-t>([^<]+)</g)].map(m => m[1]));
  const missing = [...new Set(keys)].filter(k => !code(k) && !(k in EN));
  assert.deepEqual(missing, []);
});

test('French stays the source, English follows the plural rules', () => {
  setLang('fr');
  assert.equal(t('Patrimoine total'), 'Patrimoine total');
  assert.equal(tn(0, '{n} ligne', '{n} lignes'), '0 ligne');
  assert.equal(t('Cours|prix'), 'Cours');
  setLang('en');
  assert.equal(t('Patrimoine total'), 'Total net worth');
  assert.equal(tn(0, '{n} ligne', '{n} lignes'), '0 holdings');
  assert.equal(tn(1, '{n} ligne', '{n} lignes'), '1 holding');
  assert.equal(t('Cours|prix'), 'Price');
  assert.equal(t('Un texte sans traduction'), 'Un texte sans traduction');
  setLang('fr');
});

test('amounts and numbers follow the language', () => {
  setLang('fr');
  assert.equal(eur(1234.5), '1 234,50 €');
  assert.equal(signedEur(-12, 0), '−12 €');
  assert.equal(pct(0.314), '31,4 %');
  assert.equal(parseNum('1 250,40'), 1250.4);
  assert.equal(inputNum(7.18, 4), '7,18');
  assert.deepEqual(bigParts(12985.2), { int: '12 985', dec: '20', sep: ',' });
  setLang('en');
  assert.equal(eur(1234.5), '€1,234.50');
  assert.equal(eur(-5), '−€5.00');
  assert.equal(signedEur(12, 0), '+€12');
  assert.equal(pct(0.314), '31.4%');
  assert.equal(parseNum('1,250.40'), 1250.4);
  assert.equal(parseNum('1,250'), 1250);
  assert.equal(parseNum('7,18'), 7.18);
  assert.equal(inputNum(7.18, 4), '7.18');
  assert.deepEqual(bigParts(12985.2), { int: '12,985', dec: '20', sep: '.' });
  setLang('fr');
});
