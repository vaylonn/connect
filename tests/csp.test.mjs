// The Content-Security-Policy forbids inline scripts and inline styles: the templates must not need them,
// and the two copies of the headers (server.mjs for Node, vercel.json for Vercel) must stay the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const nodeCsp = read('server.mjs').match(/'content-security-policy': "([^"]+)"/)[1];
const vercelCsp = JSON.parse(read('vercel.json')).headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;

test('one CSP for both runtimes, without unsafe-inline', () => {
  assert.equal(nodeCsp, vercelCsp);
  assert.doesNotMatch(nodeCsp, /unsafe-inline|unsafe-eval/);
  assert.match(nodeCsp, /script-src 'self';/);
  assert.match(nodeCsp, /style-src 'self';/);
});

test('no style attribute, inline script or event handler in the templates', () => {
  const files = ['public/index.html', ...readdirSync(new URL('../public/js', import.meta.url)).map(f => 'public/js/' + f)];
  for (const f of files) {
    const src = read(f);
    assert.doesNotMatch(src, /\sstyle="/, f + ': use a class (bar widths: data-w)');
    assert.doesNotMatch(src, /\son[a-z]+="/, f + ': event handlers go through addEventListener');
    if (f.endsWith('.html')) assert.doesNotMatch(src, /<script(?![^>]*\ssrc=)[^>]*>/, f + ': scripts are files');
  }
});
