// Minimal PDF text reader: the lines of text of each page, enough for bank statements.
// Pure module (no DOM). Objects are found by scanning the file (object streams included),
// pages through the page tree, streams inflated with the platform's DecompressionStream.
// Text is read from the page content (Tj, TJ, ', ") with its position, decoded as WinAnsi
// (the statements' Helvetica fonts); runs on the same baseline are joined into a line.
// Not handled: encrypted files, fonts with their own glyph codes (CID), text inside form XObjects.
import { t } from './i18n.js';

const notPdf = () => new Error(t('Ce fichier n’est pas un PDF lisible.'));
const CP = new TextDecoder('windows-1252').decode(Uint8Array.from({ length: 256 }, (_, i) => i)); // byte → character
const text8 = u8 => new TextDecoder('windows-1252').decode(u8); // one character per byte: indexes stay byte offsets

async function inflate(u8) {
  let ds;
  try { ds = new DecompressionStream('deflate'); } catch { throw new Error(t('Ce navigateur ne sait pas lire ce fichier : mettez-le à jour.')); }
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
}

// Every « n g obj … endobj »: dictionary text and raw stream bytes (later definitions win, as in incremental updates)
function scan(u8) {
  const s = text8(u8);
  if (!s.startsWith('%PDF')) throw notPdf();
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(s)) throw new Error(t('Ce PDF est protégé : Carnet ne peut pas le lire.'));
  const objs = new Map();
  for (const m of s.matchAll(/(\d+)\s+\d+\s+obj\b/g)) {
    const start = m.index + m[0].length;
    const end = s.indexOf('endobj', start);
    const body = s.slice(start, end < 0 ? undefined : end);
    const k = body.indexOf('stream');
    if (k < 0) { objs.set(+m[1], { dict: body.trim() }); continue; }
    let from = start + k + 6;
    if (s[from] === '\r') from++;
    if (s[from] === '\n') from++;
    objs.set(+m[1], { dict: body.slice(0, k).trim(), from, to: s.indexOf('endstream', from) });
  }
  return { s, objs };
}

export async function readPdf(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const { s, objs } = scan(u8);
  const num = v => { const r = /^(\d+)\s+\d+\s+R/.exec(v); return r ? +(objs.get(+r[1])?.dict.match(/^\s*(\d+)/)?.[1]) : +v; };
  const data = async o => {
    const len = num((o.dict.match(/\/Length\s+(\d+(?:\s+\d+\s+R)?)/) || [])[1]);
    const raw = u8.subarray(o.from, Number.isFinite(len) && len > 0 ? o.from + len : o.to);
    if (!/\/Filter/.test(o.dict)) return raw;
    if (!/\/Filter\s*\[?\s*\/FlateDecode\s*\]?/.test(o.dict)) return null; // other filters: not text we need
    try { return await inflate(raw); } catch { return null; }
  };
  // Objects kept inside object streams (PDF 1.5 and later)
  for (const o of [...objs.values()]) {
    if (!o.from || !/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const d = await data(o); if (!d) continue;
    const txt = text8(d), first = +(o.dict.match(/\/First\s+(\d+)/) || [])[1];
    const head = txt.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < head.length; i += 2) {
      if (objs.has(head[i])) continue;
      objs.set(head[i], { dict: txt.slice(first + head[i + 1], i + 3 < head.length ? first + head[i + 3] : undefined).trim() });
    }
  }
  const ref = (dict, key) => +((dict || '').match(new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`)) || [])[1];
  const refs = (dict, key) => {
    const m = (dict || '').match(new RegExp(`/${key}\\s*(\\[[^\\]]*\\]|\\d+\\s+\\d+\\s+R)`));
    return m ? [...m[1].matchAll(/(\d+)\s+\d+\s+R/g)].map(x => +x[1]) : [];
  };
  // Pages in reading order, through the page tree
  const root = objs.get(ref(s.slice(s.lastIndexOf('/Root') - 1), 'Root'))?.dict;
  const pages = [];
  const walk = (n, depth = 0) => {
    const d = objs.get(n)?.dict;
    if (!d || depth > 20) return;
    if (/\/Type\s*\/Pages\b/.test(d)) for (const k of refs(d, 'Kids')) walk(k, depth + 1);
    else if (/\/Type\s*\/Page\b/.test(d)) pages.push(d);
  };
  walk(ref(root, 'Pages'));
  // no usable page tree: the page objects in file order
  if (!pages.length) for (const o of objs.values()) if (/\/Type\s*\/Page\b/.test(o.dict)) pages.push(o.dict);
  if (!pages.length) throw notPdf();
  const out = [];
  for (const page of pages) {
    const parts = [];
    for (const c of refs(page, 'Contents')) { const o = objs.get(c); const d = o?.from ? await data(o) : null; if (d) parts.push(text8(d)); }
    out.push(lines(runs(parts.join('\n'))));
  }
  return out;
}

// ——— Content stream ———
// Tokens: numbers, names, strings (literal or hex), arrays, operators. Inline images are skipped.
function* tokenize(s) {
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c <= ' ') { i++; continue; }
    if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
    if (c === '(') {
      let depth = 1, out = '';
      i++;
      while (i < n && depth) {
        const ch = s[i++];
        if (ch === '\\') {
          const e = s[i++];
          if (/[0-7]/.test(e)) { let o = e; while (o.length < 3 && /[0-7]/.test(s[i])) o += s[i++]; out += CP[parseInt(o, 8) & 255]; }
          else if (e === '\r') { if (s[i] === '\n') i++; }
          else if (e !== '\n') out += { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[e] ?? e;
        } else if (ch === '(') { depth++; out += ch; }
        else if (ch === ')') { if (--depth) out += ch; }
        else out += ch;
      }
      yield { str: out }; continue;
    }
    if (c === '<' && s[i + 1] !== '<') {
      const j = s.indexOf('>', i);
      const hex = s.slice(i + 1, j < 0 ? n : j).replace(/[^0-9a-f]/gi, '');
      let out = '';
      for (let k = 0; k < hex.length; k += 2) out += CP[parseInt(hex.slice(k, k + 2).padEnd(2, '0'), 16)];
      i = j < 0 ? n : j + 1;
      yield { str: out }; continue;
    }
    if (c === '[' || c === ']') { i++; yield { op: c }; continue; }
    if (c === '<' || c === '>') { i += 2; yield { op: c + c }; continue; }
    if (c === '/') { let j = i + 1; while (j < n && !/[\s/[\]()<>{}%]/.test(s[j])) j++; yield { name: s.slice(i + 1, j) }; i = j; continue; }
    let j = i;
    while (j < n && !/[\s/[\]()<>{}%]/.test(s[j])) j++;
    if (j === i) { i++; continue; }
    const w = s.slice(i, j);
    i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) { yield { num: +w }; continue; }
    if (w === 'ID') { const e = s.indexOf('EI', i); i = e < 0 ? n : e + 2; continue; } // inline image data
    yield { op: w };
  }
}

const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const ID = [1, 0, 0, 1, 0, 0];

// Text runs with their position on the page: { x, y, size, text }
function runs(src) {
  const out = [];
  const stack = [];
  let ctm = ID, tm = ID, tlm = ID, size = 10, leading = 0;
  let ops = [], arr = null;
  const show = str => {
    const m = mul(tm, ctm);
    const sz = size * Math.hypot(m[0], m[1]);
    if (str) out.push({ x: m[4], y: m[5], size: sz, text: str });
    // move on by an estimated width (half an em per character), in case the next string has no position of its own
    tm = mul([1, 0, 0, 1, str.length * size * 0.5, 0], tm);
  };
  const td = (x, y) => { tlm = mul([1, 0, 0, 1, x, y], tlm); tm = tlm; };
  for (const tok of tokenize(src)) {
    if (tok.op === '[') { arr = []; continue; }
    if (tok.op === ']') { ops.push(arr || []); arr = null; continue; }
    if (arr) { if (tok.str !== undefined || tok.num !== undefined) arr.push(tok.str ?? tok.num); continue; }
    if (tok.op === undefined) { ops.push(tok.str ?? tok.num ?? tok.name); continue; }
    const a = ops; ops = [];
    switch (tok.op) {
      case 'q': stack.push(ctm); break;
      case 'Q': ctm = stack.pop() || ID; break;
      case 'cm': if (a.length >= 6) ctm = mul(a.slice(-6).map(Number), ctm); break;
      case 'BT': tm = tlm = ID; break;
      case 'Tf': size = Math.abs(+a[a.length - 1]) || size; break;
      case 'TL': leading = +a[0] || 0; break;
      case 'Tm': if (a.length >= 6) tm = tlm = a.slice(-6).map(Number); break;
      case 'Td': td(+a[0] || 0, +a[1] || 0); break;
      case 'TD': leading = -(+a[1] || 0); td(+a[0] || 0, +a[1] || 0); break;
      case 'T*': td(0, -leading); break;
      case 'Tj': show(String(a[a.length - 1] ?? '')); break;
      case "'": td(0, -leading); show(String(a[a.length - 1] ?? '')); break;
      case '"': td(0, -leading); show(String(a[a.length - 1] ?? '')); break;
      case 'TJ': show((Array.isArray(a[a.length - 1]) ? a[a.length - 1] : []).map(x => (typeof x === 'string' ? x : x < -200 ? ' ' : '')).join('')); break;
    }
  }
  return out;
}

// Runs on the same baseline make a line, read left to right; a gap wider than a third of an em is a space.
function lines(rs) {
  const rows = new Map();
  for (const r of rs) {
    const k = Math.round(r.y);
    const row = rows.get(k) || rows.get(k - 1) || rows.get(k + 1);
    if (row) row.push(r); else rows.set(k, [r]);
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, row]) => {
    row.sort((a, b) => a.x - b.x);
    let line = '', end = -Infinity;
    for (const r of row) {
      if (line && r.x - end > r.size / 3 && !line.endsWith(' ') && !r.text.startsWith(' ')) line += ' ';
      line += r.text;
      end = r.x + r.text.length * r.size * 0.5;
    }
    return line.replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
}
