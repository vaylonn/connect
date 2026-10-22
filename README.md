# Carnet.

Personal net-worth tracker: PEA, brokerage account, crypto, savings accounts, life insurance.
**Your data stays in your browser.** The server never sees anything in plain text.

👉 **https://connect-liard-three.vercel.app**

- Net worth, analysis (sectors, countries, companies), buy or sell simulator.
- Real performance (annualised return on what you paid in), target allocation with rebalancing suggestions.
- History of buys, sells, dividends, interest and deposits; notes on any holding or account.
- Chart of the whole net worth, one account or one envelope; PEA 5-year date and reminder; an anonymous view of your allocation to share (percentages only).
- Trade Republic CSV import, manual entry for any other account.
- Up-to-date prices from Yahoo Finance.
- Sync across devices, end-to-end encrypted (optional).
- Installable on a phone, works offline, light or dark mode.
- French or English interface (follows the device language, changeable in Settings → Preferences).

---

## Getting started

1. **Import Trade Republic.** In the TR app: *Transaction export* as CSV, **since the account was opened**. Then Carnet → Settings → Import & backup → *Import data*: pick Trade Republic, *Continue*, *Choose the file* (the window recalls these steps).
   An export covering only part of the period gives wrong quantities and cash: Carnet rebuilds everything from the full history.
2. **Add your other accounts.** Settings → Accounts → *Add account* (savings account, life insurance, PER…), then *Add holding*.
3. **Refresh prices** with the button at the top of the screen.
4. **Sync your devices** (optional). Settings → Sync → *Create vault* on the first device, then *Sign in* with the same username and passphrase on the others.

To install the app: Settings → Install the app shows the steps for your device (it is also offered on a phone's first visit). Installed, it opens full screen and iOS no longer erases its data after 7 days without a visit.

## Reading the figures

- **Total net worth**: everything included, cash and manually added accounts too.
  Trade Republic's "Total" **does not include cash**: compare account by account.
- **"Up x %"**: unrealised gain on your current investments **since purchase**, i.e. (value − cost basis) ÷ cost basis.
  Cash, savings accounts and euro funds are left out of the percentage, as are past sales and dividends. It is not the daily change shown by TR.
- **Cost basis**: weighted average cost, purchase fees included.
- **Unlisted** (Private Markets): units × last known price + contributions awaiting execution.
- **Real performance** (Analysis): on imported accounts, from the dated deposits and withdrawals of the export (card payments count as withdrawals).
  *Paid in* = deposits − withdrawals; *real gain* = today's value − paid in, so it includes capital gains, dividends, interest, fees and taxes.
  *Annualised return* is the money-weighted rate (internal rate of return, XIRR): the yearly rate a savings account would have needed to give the same result with the same deposits on the same dates. Under a year, the return over the period is shown instead.
  Manually added accounts have no dated deposits and are left out.
- **Target allocation**: a target share per holding (Analysis → *Set my target*), out of 100 %, measured on the holdings that have one.
  Simulate → *Rebalance* suggests where new money should go (to the holdings furthest below target first) or, with sales, how to get exactly back on target.
- **PEA 5 years**: withdrawals are free of income tax (social charges remain) 5 years after the first deposit, and no longer close the plan.
  Carnet takes the date entered on the account (*Edit account* → *First deposit*), else the account's first known operation, shows it on the account and in the simulator, and reminds you on the home screen from two months before.
- Small differences with TR are normal: TR shows real-time prices, Yahoo slightly delayed ones.

## Your data

- **Stored in the browser** (`localStorage`). Clearing the site's data deletes it; private browsing does not keep it.
- **Sync**: the passphrase never leaves the device. It is used to encrypt the data (256-bit AES-GCM, key derived with PBKDF2, 310,000 iterations). The server only keeps an unreadable blob, and blocks for fifteen minutes any address that makes 20 rejected attempts in a row.
  **Forgotten passphrase = lost vault**, but the data already on your devices stays intact.
- **Backup**: Settings → Import & backup → *Export* (plain or encrypted), then *Restore* on another device. Without sync, Carnet reminds you after 30 days without a backup from this device.
- **Only information sent in plain text**: the securities' symbols (e.g. `WPEA.PA`), to fetch prices. Never quantities or amounts.

---

## Hosting Carnet

### Vercel (online version)

1. Import the repository on [vercel.com](https://vercel.com). Nothing to configure: `vercel.json` sets everything (preset "Other", `public` folder, `api/` functions).
2. For sync: *Storage → Create Database → Upstash for Redis* (free plan), connected to the project for **Production and Preview**, then redeploy.
   Prefer Upstash: it keeps data on disk. The free « Redis » database has no persistence and can lose vaults on a restart or once its 30 MB are full;
   devices keep their data and offer to recreate a lost vault, but it is better avoided.
   Carnet accepts `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Upstash, used first when both exist) as well as `REDIS_URL`, even with a prefix. Without a database the app works; only sync is disabled.
   Moving to Upstash: connect it, redeploy, then on each device Settings → Sync → « Recréer le coffre avec les données de cet appareil » (the first device recreates it, the others reconnect on their own).
   Anyone can create their own vault there (at most 5 per hour per address): your friends and family can use your online version.

Preview URLs are protected by Vercel login (*Settings → Deployment Protection*).

### Locally

Requirements: [Node.js](https://nodejs.org) 18.17 or newer, nothing else.

```bash
node server.mjs
```

Open http://localhost:8080. Sync vaults are stored in `./data`.

Options: `PORT=9000`, `HOST=0.0.0.0` (access from the local network).
In PowerShell: `$env:PORT=9000; node server.mjs`.

---

## Development

**Automatic deployment.** Every push to `main` updates production on Vercel. Any other branch or PR gets a preview URL, without touching production.

**CI.** GitHub Actions, on `main` and on PRs: JS syntax, tests of the calculations and of the sync API, server startup.

**Local tests**

```bash
node --test tests/*.test.mjs
```

End-to-end tests in Chromium (they start their own server and fake Yahoo):

```bash
npm install --no-save playwright && npx playwright install chromium
node --test tests/browser.e2e.mjs
```

**Upstream watch**: a daily GitHub Action (`.github/workflows/upstreams.yml`) runs `node tools/check-upstreams.mjs` against Yahoo Finance, Morningstar and justETF; when one of them changes, the run fails and GitHub sends an email.

**Roadmap**: [`docs/ROADMAP.md`](docs/ROADMAP.md) lists what is left to do, most urgent first.

**Structure**

```
server.mjs      dependency-free Node server (files + /api)
api/            Vercel functions: health, quote, search, composition, sync
lib/            Yahoo Finance client, compositions (Morningstar, justETF), /api routes,
                sync vaults (Redis or files), per-address limits
public/         the app (HTML, CSS, JS, fonts, icons, PWA)
  js/           UI, CSV import, calculations, storage, sync, chart, ETF library
tools/          Trade Republic CSV → backup, from the command line
tests/          calculations, Trade Republic import, performance and target allocation, CSP, restore of old
                backups, sync API, translations; end-to-end browser tests; fake Yahoo; a realistic
                Trade Republic export (tr-export.mjs); fixtures (frozen backup files)
```

**ETF library** (`public/js/library.js`): Yahoo symbol, sectors, countries and top companies of known funds, as orders of magnitude (mid-2026).

**History**: the tab lists the operations kept from the Trade Republic import: buys, sells, splits and free share grants (with the realised gain of each sale), and cash movements: deposits, withdrawals, dividends and interest (gross, with the withheld tax), saveback, and card payments summed per month. A new import replaces the Trade Republic history; imports made before version 1.4 kept only securities transactions.

**Automatic compositions**: every ETF, fund (including life-insurance unit-linked funds) and stock gets its composition, fetched by the server (`/api/composition`, only the ISIN is sent). Main source: Morningstar (countries and all 11 sectors, seen through the index even for the PEA's synthetic ETFs, equity share, top holdings). Fallback: justETF (index holdings of synthetic ETFs). Refreshed every 30 days; the library is the fallback when the server finds nothing.
To add a fund, add an entry with its ISIN. Check that the symbol matches the fund **and the right share class** (Acc or Dist): a neighbouring symbol can give a very different price.

**Yahoo Finance**: unofficial API. It may change or rate-limit calls (error 429: try again later). Unlisted funds, euro funds and units Yahoo does not list are updated by hand (tap the holding → *Edit*).

MIT licence.
