# Roadmap

What is left to do, most urgent first. When an item ships, delete it from this file in the same commit
(the commit message and git history keep the record). Sizes: S ≈ an hour, M ≈ half a day, L = more.

## Useful — features

- **Other brokers' imports (L).** Boursorama, Fortuneo, Bricks (BricksBoard export), etc.: one importer per
  format, on the model of `importer.js`, written against a real export file (never committed).

## Comfort

- **PEA 5-year reminder (S).** Show the date from which withdrawals are tax-exempt.
- **Chart per account or per wrapper (M).** The chart only shows total net worth today.
- **Share an anonymised view (S).** Percentages only, no amounts, to show one's allocation.
- **Drop `'unsafe-inline'` from the CSP styles (M).** Move the few `style="…"` attributes from the templates to
  the CSS, then tighten `SECURITY` in `server.mjs` and `vercel.json` together.
