// Transforme un export CSV Trade Republic en sauvegarde Carnet (à restaurer dans Données).
//   node tools/csv-vers-sauvegarde.mjs "Exportation de transactions.csv" sauvegarde.json [Prénom]
import { readFileSync, writeFileSync } from 'node:fs';
import { importTradeRepublic, mergeImport } from '../public/js/importer.js';
import { emptyData, backupPayload } from '../public/js/store.js';
import { totals, heldLines } from '../public/js/compute.js';

const [src, dest = 'carnet-sauvegarde.json', firstName = ''] = process.argv.slice(2);
if (!src) { console.error('Usage : node tools/csv-vers-sauvegarde.mjs export.csv [sortie.json] [Prénom]'); process.exit(1); }
const imp = importTradeRepublic(readFileSync(src, 'utf8'));
let data = mergeImport(emptyData(), imp);
data.profile.firstName = firstName;
writeFileSync(dest, JSON.stringify(backupPayload(data), null, 1));
const t = totals(data);
console.log(`${imp.stats.rows} opérations (${imp.stats.from} → ${imp.stats.to})`);
for (const l of heldLines(data)) console.log(`  ${l.accountId.padEnd(7)} ${l.name.slice(0, 44).padEnd(45)} ${String(l.qty).padStart(12)}  revient ${l.cost.toFixed(2).padStart(9)} €`);
console.log('Espèces recalculées :', imp.stats.cash);
console.log(`Total (aux derniers prix connus) : ${t.total.toFixed(2)} €  →  ${dest}`);
