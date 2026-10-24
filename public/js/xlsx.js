// Minimal reader for Excel workbooks (.xlsx): the first worksheet as rows of cell texts.
// Pure module (no DOM): the zip is unpacked by hand and inflated with the platform's
// DecompressionStream, the XML read with regular expressions. Enough for brokers' exports;
// formulas, styles and dates stored as numbers are not interpreted.
import { t } from './i18n.js';

const notXlsx = () => new Error(t('Ce fichier n’est pas un classeur Excel (.xlsx).'));

// Zip central directory → { name: { method, data } } (data still compressed)
function unzip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let end = u8.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw notXlsx();
  const files = new Map();
  let p = dv.getUint32(end + 16, true);
  for (let i = dv.getUint16(end + 10, true); i > 0; i--) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw notXlsx();
    const nameLen = dv.getUint16(p + 28, true), skip = nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen)).replace(/^\/+/, '');
    const local = dv.getUint32(p + 42, true);
    if (local + 30 > u8.length || dv.getUint32(local, true) !== 0x04034b50) throw notXlsx();
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    files.set(name, { method: dv.getUint16(p + 10, true), data: u8.subarray(start, start + dv.getUint32(p + 20, true)) });
    p += 46 + skip;
  }
  return files;
}

async function inflate({ method, data }) {
  if (method === 0) return data;
  if (method !== 8) throw notXlsx();
  let ds;
  try { ds = new DecompressionStream('deflate-raw'); } catch { throw new Error(t('Ce navigateur ne sait pas lire les fichiers Excel : mettez-le à jour.')); }
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer());
}

const unescape = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
});
// Tags may carry a namespace prefix (<x:row>) or not (<row>).
const tag = (name, flags = 'g') => new RegExp(`<(?:\\w+:)?${name}(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${name}>)`, flags);
const attr = (attrs, name) => (attrs || '').match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
// Text of a shared or inline string: the <t> runs, without the phonetic hints (<rPh>)
const runs = xml => [...(xml || '').replace(tag('rPh'), '').matchAll(tag('t'))].map(m => unescape(m[2] || '')).join('');
const column = ref => { let n = 0; for (const c of (ref || '').replace(/\d+$/, '')) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };

export async function readXlsx(buffer) {
  const files = unzip(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const text = async name => { const f = files.get(name); return f ? new TextDecoder().decode(await inflate(f)) : ''; };
  // First sheet of the workbook, through its relationship (absolute or relative target)
  const wb = await text('xl/workbook.xml');
  if (!wb) throw notXlsx();
  const rid = attr(wb.match(tag('sheet', ''))?.[1], 'r:id');
  const rel = [...(await text('xl/_rels/workbook.xml.rels')).matchAll(tag('Relationship'))].map(m => m[1]).find(a => attr(a, 'Id') === rid);
  const target = attr(rel, 'Target') || 'worksheets/sheet1.xml';
  const path = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  const sheet = await text(path) || await text('xl/worksheets/sheet1.xml');
  if (!sheet) throw notXlsx();
  const shared = [...(await text('xl/sharedStrings.xml')).matchAll(tag('si'))].map(m => runs(m[2]));
  const rows = [];
  for (const [, , body] of sheet.matchAll(tag('row'))) {
    const row = [];
    let next = 0;
    for (const [, attrs, inner] of (body || '').matchAll(tag('c'))) {
      const ref = attr(attrs, 'r'), type = attr(attrs, 't');
      const i = ref ? column(ref) : next;
      next = i + 1;
      const v = unescape((inner || '').match(tag('v', ''))?.[2] || '');
      row[i] = type === 's' ? shared[+v] ?? '' : type === 'inlineStr' ? runs(inner) : v;
    }
    rows.push(Array.from(row, x => x ?? ''));
  }
  return rows;
}
