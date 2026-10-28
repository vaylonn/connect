# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Carnet is a personal net-worth tracker (PEA, brokerage, crypto, savings, life insurance). It is a PWA whose data lives only in the browser; the optional server relays price lookups and stores end-to-end encrypted sync vaults.

## Language

- **Commit messages are written in English** (owner's rule): short imperative subject, blank line, then bullets saying what changed and why.
- Code comments, README, test names and developer output are in English.
- The UI's source language is French (typographic apostrophes and guillemets: ’, « »); French strings are also the keys of the English translations (see `i18n.js`).

## Commands

No dependencies and no build step: plain Node (≥ 18.17; CI uses 22) and browser ES modules.

- Run: `node server.mjs` → http://localhost:8080 (env options in the README; vaults are stored in `./data`).
- Browser tests (CI job `browser`): `npm install --no-save playwright && npx playwright install chromium`, then `node --test tests/browser.e2e.mjs` (starts its own server and fake Yahoo on ports 8137/9917). Extend it when a user flow changes.
- Tests (as in CI): `node --test tests/*.test.mjs` (`tests/tr-export.mjs` is a realistic Trade Republic export shared by several tests; `tests/linxea-export.mjs`, `tests/ce-statement.mjs` and `tests/bricksboard-export.mjs` build a Linxea workbook, a Caisse d'Épargne PDF statement and a BricksBoard file with invented figures); a single test: `node --test --test-name-pattern="courbe" tests/calculs.test.mjs`.
- Syntax check (as in CI): `for f in server.mjs lib/*.mjs api/*.mjs tools/*.mjs tests/*.mjs public/js/*.js public/sw.js; do node --check "$f"; done`
- Live upstream check (also run daily by `.github/workflows/upstreams.yml`): `node tools/check-upstreams.mjs` exits 1 when Yahoo, Morningstar or justETF no longer answer as expected.
- Offline upstreams: `node tests/mock-yahoo.mjs &` then `YAHOO_BASE=http://127.0.0.1:9911 node server.mjs`; `MORNINGSTAR_BASE` and `JUSTETF_BASE` redirect the composition sources the same way.
- Trade Republic CSV → backup file: `npm run sauvegarde -- export.csv out.json`. Personal data never goes in the repo: `.gitignore` excludes `*.csv`, `*.xlsx`, `*.pdf`, backup files and `data/`; test files are built with invented figures.

## Deployment

- Pushing to `main` deploys production on Vercel (https://connect-liard-three.vercel.app); other branches and PRs get preview URLs behind Vercel authentication. GitHub Actions CI runs on `main` and on PRs.
- Vercel serves `public/` as static files and `api/*.mjs` as functions (`vercel.json`). Sync uses the project's Upstash for Redis through `UPSTASH_KV_REST_API_URL`/`_TOKEN` (free plan: disk-persisted, 500,000 commands a month, about 2 per sync poll); Upstash takes precedence over the older, non-persistent store still linked as `REDIS_URL`. Anyone can create a vault on purpose: the owner's friends use this deployment too.

## Architecture

**Two server runtimes, one shared `lib/`.** `server.mjs` (local development and CI) serves `public/` and `/api/*`. On Vercel, `api/health|quote|search|composition.mjs` are one-line `vercelRoute()` wrappers around the same `handleApi` (`lib/handlers.mjs`), and `api/sync.mjs` calls `handleSync` (`lib/vault.mjs`). Security headers are declared twice, in `SECURITY` (`server.mjs`) and in `vercel.json`: keep them in sync (`tests/csp.test.mjs` checks it).

**Upstream data.** `lib/yahoo.mjs` fetches prices and history converted to EUR; `lib/composition.mjs` builds a fund or stock composition from an ISIN (Morningstar first, justETF as fallback). Only symbols and ISINs leave the server, never amounts. Values returned by these sources are untrusted: validate them before reusing them in URLs.

**Sync vaults (`lib/vault.mjs`).** The server keeps one encrypted blob per vault id (sha256 of the username), authenticated by sha256 of the access token. Writes are optimistic: the client sends the `base` version and gets 409 on conflict. Polls send the version the device already has (`x-carnet-version`), and the blob only comes back when it changed. Backends: Lua scripts on Redis (Upstash REST, or `REDIS_URL` over RESP with one connection per command) or JSON files for the Node server. `lib/limits.mjs` keeps per-address counters, in Redis when available: 20 rejected tokens in 15 minutes block an address, and vault creation is capped at 5 per hour.

**Browser app (`public/js/`).** Data is one object in `localStorage` (`carnet:data:v1`), passed through `normalize()` (`store.js`) when loaded, restored or synced.
- `app.js` is the whole UI: each tab is an HTML template string set with `innerHTML`, a single document-level click handler dispatches on `data-action`, and `commit()` saves, re-renders, schedules a sync and fetches missing compositions.
- The Réglages tab (internal key `donnees`) is a list of `SECTIONS`, each on its own page at `#donnees/<key>` (pushed to history, so the phone's back button returns to the list).
- Import sources are listed in `IMPORTERS` (`app.js`): each has a name, guide steps shown before the file picker, and a `run()` flow. A new broker = one entry there plus its parser beside `importer.js` (as `importer-linxea.js`); `data.imports` entries record the `source` key, and the line's `source` is that key. `xlsx.js` reads Excel workbooks (zip unpacked by hand, `DecompressionStream('deflate-raw')`, XML by regular expressions); `pdf.js` reads the text lines of PDF pages (objects scanned, page tree, Flate streams, Tj/TJ runs joined by baseline, WinAnsi only).
- `compute.js` (totals, look-through by sector/country/company, value history, buy/sell simulator) and `importer.js` (Trade Republic CSV → accounts, lines, transactions) are pure modules, also used by `tools/`.
- `sync.js` does the end-to-end encryption: username + passphrase → PBKDF2 → AES-GCM key + access token; only ciphertext reaches the server.
- `i18n.js`: `t()`/`tn()` translate French source strings through `i18n-en.js`; the language is `data.settings.lang` (`auto` follows the device, else `fr`/`en`), and `format.js` formats numbers, amounts and dates for it. Stored data keeps French values (envelope, sector, country names, refresh errors as keys with an `arg`) and is translated on display.
- `library.js` lists known products (Yahoo ticker, indicative composition); compositions fetched from the server override it at runtime (`setFetchedLibrary`). A ticker must match the fund **and** its share class (Acc/Dist).

**Data model.** Lines with `source: 'tr'` are replaced by each Trade Republic import (`mergeImport` keeps manual lines and user overrides such as `customName`, `customTicker`, `target` and `note`, and the accounts' `note` and `openedAt`: `carryOver()`/`carryAccount()` in `importer.js`). Linxea lines (`source: 'linxea'`, account `lx-<contract number>`) are replaced contract by contract (`mergeLinxea`); the file has positions only, so each import appends a snapshot to `events`, keeps funds that left as closed lines, and fills `category`, `subcategory`, `fundPerf` (the fund's own performance, fractions; 3 years and more per year) and the account's `asOf`. The type `structure` (structured products) has no public price. Caisse d'Épargne lines (`source: 'ce'`, account `ce-<hash of the account number>`) are one cash or savings balance per account, read from the statement's summary only (`importer-ce.js`); each statement adds a point to `events` and the latest dated point is the balance shown, so an older statement only fills in the history; `duplicates()` pairs hand-entered accounts that `mergeCe` can fold in. Deposits into other accounts after the statement's date (withdrawals back count the other way) are taken from its current account's balance: `settleCash()` (`compute.js`, called by the merges, `normalize()` and `commit()`) stores them as the line's `moved`, which `lineValue()` subtracts and `history()` follows; only with a single statement current account, and never below zero. Bricks lines (`source: 'bricks'`, account `bricks` of kind `immo`, envelope `Immobilier`) come from a BricksBoard file (`importer-bricks.js`: the dashboard HTML embeds the Bricks API's answers as `window.__BD__`, amounts in cents, next to the investor's identity and IBAN, which are never read): one line of type `immo` per project held (qty = bricks, price = current brick price, cost = capital still owed, `project` = rate, status, maturity, grade, city), the wallet balance as `especes`, and the wallet's movements as transactions (`REPAYMENT` for capital repaid); `mergeBricks` replaces them all and keeps each project's past snapshots in `events`. `events` holds `[date, qty, cost, price]` snapshots used by the value history chart. Use `heldLines()`/`isHeld()` (`compute.js`) for anything about current holdings: they drop lines of deleted accounts and sub-cent leftovers after a sale, and `heldLines()` also drops the accounts' cash (type `especes`) unless `settings.cash` is true (`cashCounted()`, `shownLine()`; default false, as statements' balances are stale and money moved to a broker would count twice). `performance()` counts that cash anyway (`heldLines(data, { cash: true })`). `data.transactions` feeds the Historique tab and the performance: security trades (`BUY`, `SELL`, `SPLIT`…) and cash movements, either external flows (`FLOW_KINDS`: `DEPOSIT`, `WITHDRAWAL`, `CARD` summed per month, `CASH_OTHER`) or income (`INCOME_KINDS`: `DIVIDEND`, `INTEREST`, `BONUS`, gross with the withheld `tax` apart; read them with `netAmount()`). `performance()` (XIRR on the flows) only covers accounts with dated deposits. PEA and life insurance accounts may carry `openedAt` (first deposit; `milestone()` gives the 5- or 8-year date, else from the first known operation). A line whose ISIN Yahoo does not know gets `noSymbol` on refresh and stops counting as a stale price (`QUOTE_EXPECTED`). A line's `target` is its target share in %, measured on the lines that have one (`allocation()`, `rebalance()`). The meaning of the displayed figures (gain %, cost basis, unlisted funds) is described in the README section "Reading the figures".

## Roadmap

`docs/ROADMAP.md` lists what is left to do, most urgent first. Check it before proposing work, and delete an item in the same commit that ships it.

## Things that must change together

- A new persisted key in `data` → add it to `backupPayload()` in `store.js` (exports are a whitelist) and to the « Ajouter » restore merge in `app.js`. Sync already sends everything except `demo`.
- A change to the backup format → add a fixture in `tests/fixtures` for the new version (never regenerate the old ones) and extend `tests/restore.test.mjs`.
- A new UI string → write it in French inside `t()`/`tn()` and add its English to `i18n-en.js`; `tests/i18n.test.mjs` fails on any missing translation.
- A new module in `public/js/` → add it to `SHELL` in `public/sw.js`.
- The version string lives in `package.json`, `lib/handlers.mjs`, `public/js/app.js` (`VERSION`) and `public/sw.js` (`CACHE`).
- Templates never use `style="…"` (the CSP has no `'unsafe-inline'`, for scripts nor styles): use a class from `app.css` (spacing helpers at its end), or `data-w` for a bar's width (`sizeBars()` sets it from script). `tests/csp.test.mjs` fails otherwise.
- Every value interpolated into HTML goes through `esc()` or a number/date formatter from `format.js`: backups, vaults, CSV files and upstream APIs are untrusted, and the CSP (`script-src 'self'`) forbids inline scripts and event handlers.
