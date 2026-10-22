# Roadmap

What is left to do, most urgent first. When an item ships, delete it from this file in the same commit
(the commit message and git history keep the record). Sizes: S ≈ an hour, M ≈ half a day, L = more.

## Important — reliability

- **Alert when Yahoo or Morningstar break (M).** Both sources are unofficial and change without notice. A daily
  scheduled GitHub Action querying a known symbol and ISIN would warn before users see « 0 à jour ».
- **Trade Republic import test with a realistic fake CSV (S).** TR's format changes now and then; only a small
  calculation test covers the importer today.
- **Restore regression test (S).** Check that a backup from an older version still restores, so friends' old
  files stay readable.

## Useful — features

- **Dividends and deposits in Historique (M).** The tab only shows buys and sells, though the import already
  knows the dividends.
- **Real performance (M–L).** The displayed % is the gain since purchase. A money-weighted annualised return
  that accounts for deposit dates would compare better.
- **Target allocation (M).** E.g. « 70 % actions monde, 20 % émergents », with the gap shown and the simulator
  proposing how to rebalance.
- **Other brokers' imports (L).** Boursorama, Fortuneo, etc.: one importer per CSV format, on the model of
  `importer.js`.
- **Notes on a holding or an account (S).** E.g. a contract number or the PEA opening date.

## Comfort

- **PEA 5-year reminder (S).** Show the date from which withdrawals are tax-exempt.
- **Chart per account or per wrapper (M).** The chart only shows total net worth today.
- **Share an anonymised view (S).** Percentages only, no amounts, to show one's allocation.
- **Drop `'unsafe-inline'` from the CSP styles (M).** Move the few `style="…"` attributes from the templates to
  the CSS, then tighten `SECURITY` in `server.mjs` and `vercel.json` together.
