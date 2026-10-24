// A Linxea « Télécharger vos données » workbook, built here: invented contract and holder, public funds,
// made-up amounts (personal exports never go in the repo). Same layout as the real file: one sheet,
// x: namespace prefix, inline strings (t="str"), French decimals in the performance columns.
import { deflateRawSync } from 'node:zlib';

export const HEAD = ['Placement', 'N° Contrat', 'Titulaire 1', 'Titulaire 2', 'Produit', 'Catégorie', 'Sous-catégorie', 'Nom du support', 'ISIN', 'Nbre de parts',
  'Dernière cotation', 'Date', 'Somme en Compte', 'Plus ou Moins Value', 'Prix de Revient Moyen', 'Perf.% Deb. année', 'Perf.% 1 sem.', 'Perf.% 1 mois', 'Perf.% 6 mois',
  'Perf.% 3 ans', 'Perf.% 5 ans', 'Perf.% 10 ans'];
const C = ['Assurance vie', '0000012345', 'Camille Exemple', '', 'Linxea Spirit 2'];
// Numbers are written as cells with a number (amounts) or as text (units, performance), like Linxea does
export const ROWS = [
  [...C, 'Fonds Euro', 'Fonds Euros', 'Fonds en euros Spirica Fonds Euro Nouvelle Génération', 'FONDSEURNG', '0.000000', 1200, '23/10/2026', 1200, 0, 0, '', '', '', '', '', '', ''],
  [...C, 'Fonds Actions', 'Actions Amérique', 'Amundi Core S&P 500 Swap UCITS ETF EUR Dist', 'LU0496786574', '10.000000', 70.65, '22/10/2026', 706.5, 56.5, 65, '17,369770 %', '-0,375290 %', '0,926190 %', '12,579320 %', '21,162680 %', '13,369240 %', '15,018010 %'],
  [...C, 'Fonds Obligations', 'Obligations Monde Secteur Privé', 'Carmignac Pf Credit A EUR Acc', 'LU1623762843', '2.000000', 155.19, '22/10/2026', 310.38, -9.62, 160, '-1,747390 %', '', '', '', '6,506610 %', '', ''],
  [...C, 'Fonds Diversifiés', 'Allocation flexible Monde', 'Asian Convictions I', 'FR001400MUT2', '1.500000', 136.91, '22/10/2026', 205.37, 5.37, 133.33, '16,897200 %', '', '', '', '', '', ''],
  [...C, 'Fonds Matières premières', 'ETC', 'Amundi Physical Gold ETC C', 'FR0013416716', '1.000000', 143.38, '22/10/2026', 143.38, 3.38, 140, '', '', '', '', '', '', ''],
  [...C, 'Produits Structurés', 'Capital protégé, actions europe et us', 'EMTN EXIGENCE 38 Spirit', 'FRC764210890', '0.100000', 1000, '23/10/2026', 100, 0, 1000, '', '', '', '', '', '', ''],
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const col = i => String.fromCharCode(65 + i);
export function sheetXml(rows, { shared = null } = {}) {
  const cell = (v, ref) => {
    if (typeof v === 'number') return `<x:c r="${ref}" s="2"><x:v>${v}</x:v></x:c>`;
    if (shared) { let i = shared.indexOf(v); if (i < 0) i = shared.push(v) - 1; return `<x:c r="${ref}" t="s"><x:v>${i}</x:v></x:c>`; }
    return v === '' ? `<x:c r="${ref}" t="str"><x:v /></x:c>` : `<x:c r="${ref}" t="str"><x:v>${esc(v)}</x:v></x:c>`;
  };
  return '<?xml version="1.0" encoding="utf-8"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>'
    + rows.map((r, i) => `<x:row r="${i + 1}">${r.map((v, j) => cell(v, col(j) + (i + 1))).join('')}</x:row>`).join('') + '</x:sheetData></x:worksheet>';
}

// Zip writer: deflated entries (stored for the .rels, as in Linxea's file), CRC-32 included
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, 'utf8'), stored = name.endsWith('.rels') && !name.includes('workbook');
    const data = stored ? raw : deflateRawSync(raw);
    const n = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(stored ? 0 : 8, 8);
    head.writeUInt32LE(crc32(raw), 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(stored ? 0 : 8, 10);
    cen.writeUInt32LE(crc32(raw), 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(raw.length, 24); cen.writeUInt16LE(n.length, 28); cen.writeUInt32LE(offset, 42);
    locals.push(head, n, data); centrals.push(cen, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// The workbook: absolute targets as in Linxea's file; shared: true writes Excel's usual shared strings instead
export function linxeaXlsx(rows = ROWS, { shared = false } = {}) {
  const sst = shared ? [] : null;
  const sheet = sheetXml([HEAD, ...rows], { shared: sst });
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/xl/workbook.xml" Id="R1" /></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="utf-8"?><x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheets><x:sheet name="Tous les comptes" sheetId="1" r:id="Rsheet" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" /></x:sheets></x:workbook>',
    'xl/_rels/workbook.xml.rels': '﻿<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="' + (shared ? 'worksheets/data.xml' : '/xl/worksheets/sheet1.xml') + '" Id="Rsheet" /></Relationships>',
    [shared ? 'xl/worksheets/data.xml' : 'xl/worksheets/sheet1.xml']: sheet,
  };
  if (shared) files['xl/sharedStrings.xml'] = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sst.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`;
  return zip(files);
}
