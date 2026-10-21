// Construit une page unique (HTML + CSS + JS + polices intégrés) pour l'aperçu en ligne.
//   node tools/build-preview.mjs sortie.html
import { readFileSync, writeFileSync } from 'node:fs';
const P = p => new URL('../public/' + p, import.meta.url);
const out = process.argv[2] || 'carnet-apercu.html';
const IMPORT = /^import\s*\{([^}]+)\}\s*from\s*'\.\/(\w+)\.js';\s*$/gm;
const source = m => readFileSync(P(`js/${m}.js`), 'utf8');
// Modules dans l'ordre de leurs dépendances, en partant de app.js
const order = [], seen = new Set();
const visit = m => { if (seen.has(m)) return; seen.add(m); for (const [, , dep] of source(m).matchAll(IMPORT)) visit(dep); order.push(m); };
visit('app');
let js = 'const __M = {};\n';
for (const m of order) {
  let src = source(m);
  src = src.replace(IMPORT, (_, names, mod) => `const {${names.replace(/(\w+)\s+as\s+(\w+)/g, '$1: $2')}} = __M.${mod};`);
  const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/gm)].map(x => x[1]);
  src = src.replace(/^export\s+/gm, '');
  if (/^\s*import\s/m.test(src)) throw new Error('import non transformé dans ' + m);
  js += `__M.${m} = (() => {\n${src}\nreturn { ${names.join(', ')} };\n})();\n`;
}
let css = readFileSync(P('app.css'), 'utf8');
for (const f of ['Lora-Variable.woff', 'Lora-Italic-Variable.woff']) {
  css = css.replace(`url('fonts/${f}')`, `url(data:font/woff;base64,${readFileSync(P('fonts/' + f)).toString('base64')})`);
}
const html = readFileSync(P('index.html'), 'utf8');
const body = html.split('<!--CARNET:BODY-->')[1].split('<!--/CARNET:BODY-->')[0];
const page = `<title>Carnet</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#F5F1EB">
<style>
${css}
</style>
${body}
<script>window.CARNET_PREVIEW = true;</script>
<script type="module">
${js}
</script>
`;
writeFileSync(out, page);
console.log(out, (page.length / 1024).toFixed(0) + ' Ko');
