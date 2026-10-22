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
- Tests (as in CI): `node --test tests/*.test.mjs`; a single test: `node --test --test-name-pattern="courbe" tests/calculs.test.mjs`.
- Syntax check (as in CI): `for f in server.mjs lib/*.mjs api/*.mjs tools/*.mjs tests/*.mjs public/js/*.js public/sw.js; do node --check "$f"; done`
- Offline upstreams: `node tests/mock-yahoo.mjs &` then `YAHOO_BASE=http://127.0.0.1:9911 node server.mjs`; `MORNINGSTAR_BASE` and `JUSTETF_BASE` redirect the composition sources the same way.
- Trade Republic CSV → backup file: `npm run sauvegarde -- export.csv out.json`. Personal data never goes in the repo: `.gitignore` excludes `*.csv`, backup files and `data/`.

## Deployment

- Pushing to `main` deploys production on Vercel (https://connect-liard-three.vercel.app); other branches and PRs get preview URLs behind Vercel authentication. GitHub Actions CI runs on `main` and on PRs.
- Vercel serves `public/` as static files and `api/*.mjs` as functions (`vercel.json`). Sync uses the project's Upstash for Redis through `UPSTASH_KV_REST_API_URL`/`_TOKEN` (free plan: disk-persisted, 500,000 commands a month, about 2 per sync poll); Upstash takes precedence over the older, non-persistent store still linked as `REDIS_URL`. Anyone can create a vault on purpose: the owner's friends use this deployment too.

## Architecture

**Two server runtimes, one shared `lib/`.** `server.mjs` (local development and CI) serves `public/` and `/api/*`. On Vercel, `api/health|quote|search|composition.mjs` are one-line `vercelRoute()` wrappers around the same `handleApi` (`lib/handlers.mjs`), and `api/sync.mjs` calls `handleSync` (`lib/vault.mjs`). Security headers are declared twice, in `SECURITY` (`server.mjs`) and in `vercel.json`: keep them in sync.

**Upstream data.** `lib/yahoo.mjs` fetches prices and history converted to EUR; `lib/composition.mjs` builds a fund or stock composition from an ISIN (Morningstar first, justETF as fallback). Only symbols and ISINs leave the server, never amounts. Values returned by these sources are untrusted: validate them before reusing them in URLs.

**Sync vaults (`lib/vault.mjs`).** The server keeps one encrypted blob per vault id (sha256 of the username), authenticated by sha256 of the access token. Writes are optimistic: the client sends the `base` version and gets 409 on conflict. Polls send the version the device already has (`x-carnet-version`), and the blob only comes back when it changed. Backends: Lua scripts on Redis (Upstash REST, or `REDIS_URL` over RESP with one connection per command) or JSON files for the Node server. `lib/limits.mjs` keeps per-address counters, in Redis when available: 20 rejected tokens in 15 minutes block an address, and vault creation is capped at 5 per hour.

**Browser app (`public/js/`).** Data is one object in `localStorage` (`carnet:data:v1`), passed through `normalize()` (`store.js`) when loaded, restored or synced.
- `app.js` is the whole UI: each tab is an HTML template string set with `innerHTML`, a single document-level click handler dispatches on `data-action`, and `commit()` saves, re-renders, schedules a sync and fetches missing compositions.
- The Réglages tab (internal key `donnees`) is a list of `SECTIONS`, each on its own page at `#donnees/<key>` (pushed to history, so the phone's back button returns to the list).
- `compute.js` (totals, look-through by sector/country/company, value history, buy/sell simulator) and `importer.js` (Trade Republic CSV → accounts, lines, transactions) are pure modules, also used by `tools/`.
- `sync.js` does the end-to-end encryption: username + passphrase → PBKDF2 → AES-GCM key + access token; only ciphertext reaches the server.
- `i18n.js`: `t()`/`tn()` translate French source strings through `i18n-en.js`; the language is `data.settings.lang` (`auto` follows the device, else `fr`/`en`), and `format.js` formats numbers, amounts and dates for it. Stored data keeps French values (envelope, sector, country names, refresh errors as keys with an `arg`) and is translated on display.
- `library.js` lists known products (Yahoo ticker, indicative composition); compositions fetched from the server override it at runtime (`setFetchedLibrary`). A ticker must match the fund **and** its share class (Acc/Dist).

**Data model.** Lines with `source: 'tr'` are replaced by each Trade Republic import (`mergeImport` keeps manual lines and user overrides such as `customName` and `customTicker`). `events` holds `[date, qty, cost, price]` snapshots used by the value history chart. Use `heldLines()`/`isHeld()` (`compute.js`) for anything about current holdings: they drop lines of deleted accounts and sub-cent leftovers after a sale. `data.transactions` feeds the Historique tab. The meaning of the displayed figures (gain %, cost basis, unlisted funds) is described in the README section "Reading the figures".

## Roadmap

`docs/ROADMAP.md` lists what is left to do, most urgent first. Check it before proposing work, and delete an item in the same commit that ships it.

## Things that must change together

- A new persisted key in `data` → add it to `backupPayload()` in `store.js` (exports are a whitelist) and to the « Ajouter » restore merge in `app.js`. Sync already sends everything except `demo`.
- A new UI string → write it in French inside `t()`/`tn()` and add its English to `i18n-en.js`; `tests/i18n.test.mjs` fails on any missing translation.
- A new module in `public/js/` → add it to `SHELL` in `public/sw.js`.
- The version string lives in `package.json`, `lib/handlers.mjs`, `public/js/app.js` (`VERSION`) and `public/sw.js` (`CACHE`).
- Every value interpolated into HTML goes through `esc()` or a number/date formatter from `format.js`: backups, vaults, CSV files and upstream APIs are untrusted, and the CSP (`script-src 'self'`) forbids inline scripts and event handlers.
