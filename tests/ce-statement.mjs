// A Caisse d'Épargne « Relevé de comptes » PDF, built here with invented holder, accounts and amounts
// (personal statements never go in the repo). Same drawing as the real files: one positioned run per
// piece of text (« q BT /F1 8 Tf 1 0 0 1 x y Tm (text)Tj ET Q »), WinAnsi Helvetica, Flate-compressed
// content, dates and amounts cut into several runs; plus a TJ array, a hex string, a Td move, an indirect
// /Length and a page made of two content streams, to cover the reader.
import { deflateSync } from 'node:zlib';

const pdfStr = s => '(' + [...s].map(c => {
  const b = c === '°' ? 0xb0 : c === 'é' ? 0xe9 : c.charCodeAt(0);
  return c === '(' || c === ')' || c === '\\' ? '\\' + c : b > 126 ? '\\' + b.toString(8) : c;
}).join('') + ')';
const run = (x, y, text, { font = 'F1', size = 8 } = {}) => `q\nBT\n/${font} ${size} Tf\n0 0 0 rg\n1 0 0 1 ${x} ${y} Tm\n${pdfStr(text)}Tj\nET\nQ\n`;

// One summary row, cut as the bank does: label, « N° », number groups, « Solde au », date pieces, sign, amount
function row(y, label, number, date, amount, i) {
  const [d, m, yy] = date.split('/');
  const sign = amount < 0 ? '-' : '+';
  const abs = Math.abs(amount).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const parts = number.split(' ');
  let s = i === 1
    ? `q\nBT\n/F1 8 Tf\n1 0 0 1 43.2 ${y} Tm\n[${pdfStr(label.slice(0, 5))} -40 ${pdfStr(label.slice(5))}]TJ\nET\nQ\n` // a kerned TJ array
    : run(43.2, y, label);
  s += run(240.9, y, 'N° ') + parts.map((p, k) => run(252.1 + k * 24.4, y, p)).join('');
  s += run(379.2, y, 'Solde au ') + run(413, y, d) + run(421.85, y, '/') + run(424.05, y, m) + run(432.9, y, '/') + run(435.1, y, yy.slice(0, 2)) + run(443.95, y, yy.slice(2));
  s += i === 2 ? `q\nBT\n/F1 8 Tf\n1 0 0 1 510.1 ${y} Tm\n<${sign.charCodeAt(0).toString(16)}>Tj\nET\nQ\n` : run(510.1, y, sign); // a hex string
  return s + run(516.95, y, abs);
}

export const ACCOUNTS = [
  ['COMPTE DE DEPOT', '17515 00001 01234567890', 1234.56],
  ['LIV.A EN CPTE', '17515 00001 09876543210', 10000],
  ['L.D.D. EN CPTE', '17515 00001 05555555555', 2500.5],
  ['PRET IMMOBILIER', '17515 00001 07777777777', -85000],
];

export function ceStatement({ date = '03/10/2026', accounts = ACCOUNTS } = {}) {
  let p1 = run(17.1, 836.1, 'GI+NS0310C 20261003 S20D269 03031586 17515 EN000000000000000', { size: 5 })
    + run(379.2, 650, 'MME CAMILLE EXEMPLE') + run(379.2, 640, '1 RUE DES EXEMPLES')
    + run(42.6, 556.8, `Votre relevé de comptes N° 12 au ${date}`, { font: 'F5', size: 16 })
    + run(42.6, 522.9, 'SYNTHESE ', { font: 'F5', size: 10 }) + run(99.25, 522.9, 'DE VOS COMPTES', { font: 'F5', size: 10 })
    + run(42.6, 504, 'MME CAMILLE EXEMPLE');
  accounts.forEach(([label, number, amount], i) => { p1 += row((491.4 - i * 18.6).toFixed(1), label, number, date, amount, i); });
  p1 += run(43.2, 483, 'BIC : CEPA FRPP 751 - IBAN : FR76 1751 5000 0101 2345 6789 012', { size: 7 })
    + run(42.6, 400, 'DETAIL DE VOS OPERATIONS', { font: 'F5', size: 10 })
    + run(43.2, 380, 'SOLDE CREDITEUR AU 03/09/2026') + run(516.95, 380, '+ 900,00')
    + 'BT\n/F1 8 Tf\n43.2 360 Td\n(04/09/2026 04/09/2026 CB BOULANGERIE FACT 020926)Tj\n0 -12 Td\n(04/09/2026 04/09/2026 VIR SEPA EMPLOYEUR)Tj\nET\n';
  const p2a = run(43.2, 800, 'COMPTE DE DEPOT N° 17515 00001 01234567890 (suite)');
  const p2b = run(43.2, 780, `SOLDE CREDITEUR AU ${date}`) + run(516.95, 780, '+ 1 234,56');
  const z1 = deflateSync(Buffer.from(p1, 'latin1')), z2 = deflateSync(Buffer.from(p2a, 'latin1'));
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2 841.8] /Resources << /Font << /F1 5 0 R /F5 5 0 R >> >> /Contents 4 0 R >>',
    [`<< /Length ${z1.length} /Filter /FlateDecode >>`, z1],
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.2 841.8] /Resources << /Font << /F1 5 0 R >> >> /Contents [7 0 R 8 0 R] >>',
    ['<< /Length 9 0 R /Filter [/FlateDecode] >>', z2],
    [`<< /Length ${Buffer.byteLength(p2b, 'latin1')} >>`, Buffer.from(p2b, 'latin1')],
    String(z2.length),
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let size = chunks[0].length;
  objs.forEach((o, i) => {
    offsets.push(size);
    const parts = Array.isArray(o) ? [Buffer.from(`${i + 1} 0 obj\n${o[0]}\nstream\n`, 'latin1'), o[1], Buffer.from('\nendstream\nendobj\n', 'latin1')] : [Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1')];
    for (const p of parts) { chunks.push(p); size += p.length; }
  });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}
