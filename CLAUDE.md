# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Carnet is a personal net-worth tracker (PEA, brokerage, crypto, savings, life insurance). It is a PWA whose data lives only in the browser; the optional server relays price lookups and stores end-to-end encrypted sync vaults.

## Language

- **Commit messages are written in English** (owner's rule): short imperative subject, blank line, then bullets saying what changed and why.
- Everything else stays in French: UI strings, code comments, README, test names. UI text uses typographic apostrophes and guillemets (’, « »).

## Commands

No dependencies and no build step: plain Node (≥ 18.17; CI uses 22) and browser ES modules.

- Run: `node server.mjs` → http://localhost:8080 (env options in the README; vaults are stored in `./data`).
- Tests (as in CI): `node --test tests/*.test.mjs`; a single test: `node --test --test-name-pattern="CARNET_SYNC_USERS" tests/sync.test.mjs`.
- Syntax check (as in CI): `for f in server.mjs lib/*.mjs api/*.mjs tools/*.mjs tests/*.mjs public/js/*.js public/sw.js; do node --check "$f"; done`
- Offline upstreams: `node tests/mock-yahoo.mjs &` then `YAHOO_BASE=http://127.0.0.1:9911 node server.mjs`; `MORNINGSTAR_BASE` and `JUSTETF_BASE` redirect the composition sources the same way.
- Standalone preview page (no server, no CSP): `node tools/build-preview.mjs out.html`. Trade Republic CSV → backup file: `npm run sauvegarde -- export.csv out.json`.
- `tests/e2e*.py` are Python Playwright scripts that need the owner's real Trade Republic export and backups (personal data: `.gitignore` excludes `*.csv`, backup files and `data/`).

## Deployment

- Pushing to `main` deploys production on Vercel (https://connect-liard-three.vercel.app); other branches and PRs get preview URLs behind Vercel authentication. GitHub Actions CI runs on `main` and on PRs.
- Vercel serves `public/` as static files and `api/*.mjs` as functions (`vercel.json`). Sync uses the project's Redis through `REDIS_URL` (free tier: 30 MB, no persistence). `CARNET_SYNC_USERS` restricts sync to the listed usernames.

## Architecture

**Two server runtimes, one shared `lib/`.** `server.mjs` (local and Docker) serves `public/` and `/api/*`, with optional basic auth (`CARNET_PASSWORD`). On Vercel each `api/*.mjs` is a thin wrapper around the same `handleApi` (`lib/handlers.mjs`: health, quote, search, composition) or `handleSync` (`lib/vault.mjs`). Security headers are declared twice, in `SECURITY` (`server.mjs`) and in `vercel.json`: keep them in sync.

**Upstream data.** `lib/yahoo.mjs` fetches prices and history converted to EUR; `lib/composition.mjs` builds a fund or stock composition from an ISIN (Morningstar first, justETF as fallback). Only symbols and ISINs leave the server, never amounts. Values returned by these sources are untrusted: validate them before reusing them in URLs.

**Sync vaults (`lib/vault.mjs`).** The server keeps one encrypted blob per vault id (sha256 of the username), authenticated by sha256 of the access token. Writes are optimistic: the client sends the `base` version and gets 409 on conflict. Backends: Lua scripts on Redis (Upstash REST, or `REDIS_URL` over RESP with one connection per command) or JSON files for the Node server. `lib/limits.mjs` keeps per-address counters, in Redis when available: 20 rejected tokens in 15 minutes block an address, and vault creation is capped at 5 per hour.

**Browser app (`public/js/`).** Data is one object in `localStorage` (`carnet:data:v1`), passed through `normalize()` (`store.js`) when loaded, restored or synced.
- `app.js` is the whole UI: each tab is an HTML template string set with `innerHTML`, a single document-level click handler dispatches on `data-action`, and `commit()` saves, re-renders, schedules a sync and fetches missing compositions.
- `compute.js` (totals, look-through by sector/country/company, value history, buy/sell simulator) and `importer.js` (Trade Republic CSV → accounts, lines, transactions) are pure modules, also used by `tools/`.
- `sync.js` does the end-to-end encryption: username + passphrase → PBKDF2 → AES-GCM key + access token; only ciphertext reaches the server.
- `library.js` lists known products (Yahoo ticker, indicative composition); compositions fetched from the server override it at runtime (`setFetchedLibrary`). A ticker must match the fund **and** its share class (Acc/Dist).

**Data model.** Lines with `source: 'tr'` are replaced by each Trade Republic import (`mergeImport` keeps manual lines and user overrides such as `customName` and `customTicker`). `events` holds `[date, qty, cost, price]` snapshots used by the value history chart. Use `heldLines()`/`isHeld()` (`compute.js`) for anything about current holdings: they drop lines of deleted accounts and sub-cent leftovers after a sale. `data.transactions` feeds the Historique tab. The meaning of the displayed figures (gain %, cost basis, unlisted funds) is described in the README section « Lire les chiffres ».

## Things that must change together

- A new persisted key in `data` → add it to `backupPayload()` in `store.js` (exports are a whitelist) and to the « Ajouter » restore merge in `app.js`. Sync already sends everything except `demo`.
- A new module in `public/js/` → add it to `order` in `tools/build-preview.mjs` and to `SHELL` in `public/sw.js`.
- The version string lives in `package.json`, `lib/handlers.mjs`, `public/js/app.js` (`VERSION`) and `public/sw.js` (`CACHE`).
- Every value interpolated into HTML goes through `esc()` or a number/date formatter from `format.js`: backups, vaults, CSV files and upstream APIs are untrusted, and the CSP (`script-src 'self'`) forbids inline scripts and event handlers.
