# IQ Dash Module — Design Spec

**Date:** 2026-07-22
**Status:** Approved design, pending implementation plan
**Scope:** Port the standalone `iq_dash` app (Node/Express + Google Sheets) into a SalesConnect PHP module at `salesconnect/iqdash/`, reusing the vanilla-JS frontend and the existing Google Spreadsheet. Full faithful port (all pages + all write endpoints). Open access.

---

## 1. Overview

`iq_dash` monitors Indonesian steel **import quota** (PERTEK/SPI lifecycle) for ~40 companies across 25 HS-coded products. It is a single-page vanilla-JS frontend (5 tabs, 20 JS files) over a ~141 KB Express `server.js` backed by Google Sheets. The heavy part is server-side: `/api/data` reads ~17 tabs, then overlays a hand-maintained **HS-code-keyed quota ledger** (`quotaLedger.json`) plus pending-revision gating and realization dedup to produce the headline Obtained/Utilized/Available numbers. We re-implement the backend in PHP following the SalesConnect (Flavor-B) module pattern, reuse the frontend near-verbatim (only the API base changes), and deploy via the existing GitHub→FTP CI.

### Decisions (locked)
- **Full faithful port** — all 5 pages AND every write endpoint (edit company, cycles, record-obtained, realizations import, pertek-perubahan-release), ledger overlay, insights, concurrency guards. Goal: eventually retire standalone iq_dash.
- **Access: OPEN** — no login gate (same as scot/salespulse). No `guard.php` / `api_guard.php`.
- **Reuse the existing spreadsheet** `1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0` ("Mater Data IQ Dash") — the *same* sheet iq_dash uses today. Tabs already exist and are populated. **No migration, no `setup.php` seeding.**
- **Ledger overlays as read-only JSON files** shipped inside the module (`iqdash/data/*.json`) — faithful to iq_dash, which keeps them as files. They drive the headline numbers.
- **Client-side role system** (CorpSec/Sales/Operations/SuperAdmin) kept **as-is** — pure UI field-gating, no server enforcement (iq_dash never enforced it server-side either).
- **Coexistence:** during transition both apps read/write the same sheet. Same optimistic-lock + anti-wipe model makes this safe.
- Module slug `iqdash`; landing card **📊 Import Quota Monitor**.

---

## 2. Module layout

```
salesconnect/iqdash/
├── .htaccess              # rewrite api/* → api.php?_route=...  (verbatim copy)
├── index.php              # Flavor-B cache-busting shim → assets/index.html; NO guard
├── api.php                # REST front controller — routing + dispatch
├── iqdash_data.php        # READ path: _buildDataPayload + applyLedger + pending-revision + realization dedup
├── iqdash_write.php       # WRITE helpers: patchCompany, cycles, record-obtained, realizations, pertek-perubahan
├── iqdash_insights.php    # port of lib/insights.js (Q1..Q8 + realization)
├── iqdash_util.php        # coercion, date parse (DD/MM/YYYY↔ISO), file lock, HS/alias maps, tab list
├── data/
│   ├── quotaLedger.json         # HS-keyed authoritative obtained/util snapshot
│   ├── pendingRevisions.json    # gated (not-yet-released) product splits
│   └── ledgerCompanyDates.json  # obtained dates for ledger-only companies (e.g. IKM)
├── tests/                 # offline PHP assertion tests (ledger + insights parity)
└── assets/
    ├── index.html         # from public/index.html
    ├── css/style.css
    ├── js/01..20-*.js     # from public/js — API base patched to relative
    └── vendor/chart.umd.min.js, xlsx.full.min.js
```

Root landing `index.php` gains a card → `iqdash/` (trailing slash required).
`router.dev.php` gains `iqdash` in both rewrite regexes.

---

## 3. Data model (reused spreadsheet)

Configured as `spreadsheets['iqdash'] = '1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0'`. Row 1 = header; the header names mirror `iq_dash/schema.sql` 1:1 (each tab = a former Postgres table). **Reads via default FORMATTED values** (all cells are text/strings as iq_dash wrote them); **writes use `valueInputOption=RAW`** (mandatory — else Sheets coerces dates/IDs).

Tabs consumed (from `lib/sheetsStore.js` TABLES + helper tabs):

- **`companies`** (key `code`): `code, full_name, grp, section(SPI|PENDING), submit1, obtained, utilization_mt, available_quota, rev_type, rev_note, rev_mt, …, pertek_no, spi_no, spi_ref, remarks, updated_by, updated_at`. `updated_at` is the concurrency token.
- **`company_directory`** (key `full_name`): `full_name, abbreviation(code), sort_order`.
- **`products`** (key `name`): `name, hs_code, color_solid, color_light, color_text, sort_order` — 25 canonical products.
- **`product_aliases`** (key `alias`): `alias, canonical`.
- **`company_products`**: `company_code, product, sort_order`.
- **`company_product_stats`** (unique `company_code,product`): `utilization_mt, available_mt, realization_mt, eta_jkt, arrived` — the **stats path** for obtained.
- **`cycles`**: `id, company_code, cycle_type(Submit #1|Obtained #1|Revision #1…), mt(numeric|'TBA'), submit_type, submit_date, release_type, release_date, status, pertek_date, spi_date, from_rev_req(bool), sort_order`.
- **`cycle_products`**: `cycle_id, product, mt`.
- **`revision_changes`**: `company_code, direction(from|to), product, mt, label` — UI-only; aggregator ignores.
- **`company_shipments`** (unique `company_code,product,lot_no`): `util_mt, real_mt, eta_jkt, pib_date, cargo_arrived, note` — drives utilization.
- **`company_reapply_targets`** (unique `company_code,product`): `target_mt, submitted, submit_date`.
- **`ra_records`**: `company_code, berat, obtained, cargo_arrived, real_pct, util_pct, …, pertek, spi, catatan`.
- **`pending_meta`** (key `company_code`): `mt, status, date`.
- **`realizations`** (unique `company_code,pib_no,line_no`): `product, hs_code, volume, unit, value_usd, kurs, country_origin, pol, pod, pib_no, pib_date, invoice_no, invoice_date, pengajuan_no, pengajuan_date, source(excel|manual), source_file` — authoritative realized-import data.
- **`pertek_perubahan_release`** (Sheets-only, key `code`): `code, release_date` — un-gates a pending split.
- Helper/audit tabs: `Change_Log`, `Access_Log`, `status_history`, `utilization_lots`, `Status_Master` (read where needed; `Change_Log`/`Access_Log` appended on every write).

**Prerequisite (manual, user does this):** share the spreadsheet as **Editor** with `salesconnect@eagle1-492706.iam.gserviceaccount.com` (same GCP project as iq_dash's SA, so trivial). Without it: 403.

### Ledger overlay (files, authoritative for headline numbers)
- `data/quotaLedger.json`: `{ products: {HS→name}, companies: {CODE: {HS: {obtained, util}}} }`. Copied verbatim from `iq_dash/lib/quotaLedger.json`.
- `data/pendingRevisions.json`, `data/ledgerCompanyDates.json`: copied verbatim.
- Target headline totals (parity oracle): **Obtained 33,730 / Utilized 18,346 / Available 15,384**.

---

## 4. REST API contract (`iqdash/api.php`)

Base is relative (`api/…`); module must be visited with trailing slash `/iqdash/`. Dispatch: `sc_route()` → `$parts`, branch on resource + method. All wrapped in try/catch → 500. Every write invalidates the read cache and appends `Change_Log`/`Access_Log`.

| Method | Route | Handler | Notes |
|---|---|---|---|
| GET | `/api/data` | `iqdash_data.php::buildPayload()` | Full `{spi, pending, ra, products, productAliases, companyDirectory, lastUpdate}`; ledger-applied; file-cached ~30–60 s. |
| GET | `/api/company/:code` | read one | |
| POST | `/api/company` | create | |
| PATCH | `/api/company/:code` | `iqdash_write.php::patchCompany()` | `_ifUpdatedAt` optimistic lock → **409** on stale; updates company + products + pending_meta + shipments (recompute util from lots, **skip util≤0**) + reapplyTargets + ra + obtainedStats; anti-wipe guard. |
| PATCH | `/api/company/:code/cycles` | full-replace cycles + cycle_products | |
| POST | `/api/company/:code/record-obtained` | atomic: mark cycle terbit + add MT to stats available + recompute | keeps cycles/stats obtained paths synced; idempotent. |
| POST | `/api/company/:code/pertek-perubahan-release` | write release date → un-gate split | accepts DD/MM/YYYY or ISO. |
| GET | `/api/ra` | RA rows | |
| GET | `/api/realizations` `?company_code=` | list, dedup (pib_no,line_no), sort pib_date desc | |
| GET | `/api/realizations/summary` | per-company PIB/line counts | |
| POST | `/api/realizations` | bulk upsert on (company,pib_no,line_no) | rows Excel-parsed client-side. |
| POST | `/api/realizations/single` | single upsert | |
| DELETE | `/api/realizations/:id` | delete one | |
| GET | `/api/insights` / `/api/insights/:q` | `iqdash_insights.php` | q1..q8 + realization; optional `?item=`/`?company=`. |
| GET | `/api/health` | `{status:'ok'}` | |

Response shapes match iq_dash exactly so the reused frontend needs no contract changes.

---

## 5. Business-logic invariants (non-negotiable — from iq_dash governance)

1. **Available is always derived** `= max(0, Obtained − Utilized)`, never stored/trusted from the sheet.
2. **`util_mt = 0` lot never zeroes** existing utilization (the 2026-06-12 regression). Both recompute paths skip `util ≤ 0` lots.
3. **Two "obtained" paths stay synced:** cycles path (`canonicalObtained`: sum `Obtained #N` deduped, skip mt≤0, skip `_fromRevReq`, skip not-yet-terbit/TBA) vs stats path (`getObtainedByProdAgg`: per-product `utilization_mt + available_mt`). New obtained goes through `record-obtained` to update both.
4. **Ledger wins:** `applyLedger` overrides per-product obtained from `quotaLedger.json` (HS-keyed); effective util `= min(obtained, ledgerUtil + Σ lot.utilMT)`.
5. **PERTEK Perubahan gate:** `pendingRevisions.json` splits are *reversed* (mt moved `to`→`from`) until a release date is recorded via `pertek-perubahan-release`, so the dashboard shows the original PERTEK until terbit.
6. **Realized = PIB single source:** RA `berat`/`realPct` overridden by Σ `realizations.volume` deduped by (pib_no,line_no).
7. **Sheet-write safety:** `valueInputOption=RAW`; **write-first-then-clear** ordering on table rewrites; **anti-wipe guard** refuses to write an empty `companies` tab; string-cast every code/ID compare.

---

## 6. Frontend reuse

Copy `public/index.html`, `public/css/`, `public/js/01..20-*.js`, `public/vendor/` into `iqdash/assets/`. Only change: the API base. iq_dash calls absolute `/api/…`; the SalesConnect module serves under `/iqdash/` with a relative base, so patch fetch calls (`loadData`, `patchToServer`, record-obtained, realizations) from `/api/…` → `api/…`. `index.php` is the Flavor-B shim that reads `assets/index.html` and rewrites `assets/*.js|css` URLs with `?v=<filemtime>` for post-deploy cache-busting. Chart.js + SheetJS remain vendored (no CDN).

---

## 7. Config / wiring
- `config.php` + `config.sample.php`: add `'iqdash' => '1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0'` to `spreadsheets`.
- `router.dev.php`: add `iqdash` to both rewrite regexes.
- Root `index.php`: add the 📊 Import Quota Monitor card → `iqdash/`.
- Reuse shared `lib/GoogleSheets.php` and shared service account (no per-module SA needed).

---

## 8. Testing / parity strategy

The ledger math yields exact totals, so parity is verifiable, not eyeballed:
1. **Capture oracle:** snapshot the live Node app's `GET /api/data` and `GET /api/insights` (run iq_dash locally against the same sheet) into `tests/fixtures/`.
2. **PHP unit tests** (`iqdash/tests/`, run via PowerShell `php`): assert PHP `applyLedger` reproduces headline totals (33,730 / 18,346 / 15,384) and that per-company/per-product obtained/util/available match the oracle; assert insights q1..q8 match. Offline where possible (feed fixture tab data into the pure functions), so tests don't need live Sheets.
3. **Manual smoke** after deploy: `/iqdash/api/health` returns JSON (proves mod_rewrite); all 5 pages render; one edit round-trips and the 409 stale-guard fires.

---

## 9. Staged delivery (build order — each stage its own `logs/` changelog)

1. **Scaffold + read path:** module dir, `.htaccess`, `index.php` shim, config/router/landing wiring, frontend copied, `iqdash_util.php`, `iqdash_data.php` (`/api/data` + ledger). Verify against oracle. Frontend read-only works.
2. **Insights:** `iqdash_insights.php` + `/api/insights[/:q]`. Verify against oracle.
3. **Realizations:** GET list/summary + POST bulk/single + DELETE.
4. **Company writes:** `patchCompany` (+concurrency/anti-wipe), create, cycles replace, record-obtained, pertek-perubahan-release.
5. **Hardening:** file lock on multi-tab writes, tests green, changelog, deploy.

---

## 10. Risks / notes
- **Effort is large** (server.js is ~141 KB of logic). Mitigated by staging + parity tests + verbatim ledger files.
- **Two writers on one sheet** during transition — safe under the same optimistic-lock + anti-wipe model; noted in changelog.
- **Sheets rate limit** (~60 reads/min/user): read path batches all tabs in one `batchGet` + file-cache, same as iq_dash.
- **Secrets:** do NOT copy iq_dash's committed `.env` (Neon password) or `service-account.json` into the module. SalesConnect supplies credentials via `secure/` + `config.php`.
- **Mandatory changelog** per SalesConnect `CLAUDE.md`: one `logs/[slug]_[YYYY-MM-DD]_log.md` per stage.
