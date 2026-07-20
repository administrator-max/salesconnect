# Sales Pulse Module — Design Spec

**Date:** 2026-07-20
**Status:** Approved design, pending implementation plan
**Scope:** Port the standalone `sales_pulse` app (Node/Express + Google Sheets) into a SalesConnect PHP module at `salesconnect/salespulse/`, reusing both frontends and the existing Google Spreadsheet.

---

## 1. Overview

`sales_pulse` is an executive sales dashboard: two vanilla-JS frontends over 8 REST endpoints, backed by Google Sheets. The heavy part is server-side **consolidation** (parent-subsidiary/intercompany dedup, FX-derived values, product-alias→segment detection, month re-aggregation). We re-implement the backend in PHP following the SalesConnect module pattern, reuse both frontends nearly as-is, and deploy via the existing GitHub→FTP CI.

### Decisions (locked)
- **Access: OPEN** — no login gate (same as scot/CIL/TaskFlow). Neither `index.php` nor `dashboard.php` includes `guard.php`.
- **Reuse the existing spreadsheet** `1kSLpY3KAg71fc8tB3zlNh4nigJBb3mc4yhfRfqhDfC4` (7 tabs already populated). No data migration.
- **Port BOTH frontends**: `executive.html` (read-only summary, default at `/salespulse/`) and `index.html` (full dashboard at `/salespulse/dashboard.php`).
- **Excel parsing + FX conversion stay client-side** (browser, via SheetJS). The PHP backend only persists already-converted values — the original app works this way too.
- Module name `salespulse`; landing card **📈 Sales Pulse**.

---

## 2. Module layout

```
salesconnect/salespulse/
├── index.php                    # serves executive.html (default view); NO guard
├── dashboard.php                # serves index.html (full dashboard); NO guard
├── api.php                      # REST backend — routing + endpoint handlers
├── consolidation.php            # ported business logic (the /api/data engine)
├── salespulse_util.php          # parseCell/serializeCell, colLetter, lock, autoincrement, tab schemas
├── company-rank-exclusions.json # internal-company list (copied from the app)
├── .htaccess                    # rewrite api/* → api.php?_route=...
├── tests/                       # offline PHP assertion tests for the pure logic
└── assets/                      # css, js (app/budget/chat/modals/state/ui.js), executive.html, index.html, images
```

Landing `index.php` (root) gains a 5th card → `salespulse/`.

---

## 3. Data model (reused spreadsheet)

Configured as `spreadsheets['salespulse']`. Row 1 = header. **Reads use `UNFORMATTED_VALUE`; writes use `RAW`.** Per-column types drive coercion (`int|float|string|date|json`).

- **`monthly_actuals`**: `year(int), month_idx(int), actual_margin(float), plan_margin(float), revenue(float), notes(string), updated_at(string)` — no id.
- **`plan_revisions`**: `id(int), year, month_idx, name(string), margin(float), revenue(float), notes(string), qty(json), ts(string), created_at(string)` — autoId `id`.
- **`budget_lines`**: `id, year, month_idx, segment, product, volume_mt(float), revenue_idr(float), margin_idr(float), updated_at` — autoId `id`.
- **`products`**: `canonical_name(string), macro_category(string), display_order(int)`.
- **`product_aliases`**: `alias(string), canonical_name(string)`.
- **`ps_headers`**: `ps_number(string), dashboard_year(int), dashboard_month_idx(int), project_code, project_name, subsidiary, customer_name, supplier_name, po_date(date), currency, fx_rate(float), net_margin_native(float), sales_revenue(float), purchase_cost(float), margin(float), margin_percentage(float), product, segment, notes, created_at` — keyed by `ps_number` (no autoId).
- **`ps_items`**: `id(int), ps_number, dashboard_year, dashboard_month_idx, project_name, item_no(int), material, size, length, qty_val(float), qty_unit, total_weight_kg(float), purchase_price_kg(float), created_at` — autoId `id`.

**Coercion rules to port** (`parseCell`/`serializeCell`): empty → `null` (except `json` → `{}`); ints/floats written as real numbers; dates sliced to `YYYY-MM-DD`; json `JSON.stringify`/`parse`. `colLetter(n)` maps 1→A, 27→AA.

**Prerequisite (manual):** share the spreadsheet as **Editor** with `salesconnect@eagle1-492706.iam.gserviceaccount.com` (else 403).

---

## 4. REST API contract (`salespulse/api.php`)

Routes relative to `/salespulse/api/`. JSON; error shape `{error: "..."}`. Monetary values in **MIDR** (juta IDR) where the original does. Exact request/response shapes must match the original `server.js` so the reused frontend renders unchanged.

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `data?year=<int>` | The consolidation engine → nested `{BUDGET, ACTUAL, ACTUAL_PRODUCTS, PLAN_REVISIONS, PS_CHAINS, QTY_DATA}`. Default year 2026. `Cache-Control: private, max-age=5`. |
| 2 | GET | `products` | `{products:[...], aliases:{alias:canonical}}`. `Cache-Control: public, max-age=300`. |
| 3 | POST | `budget/import` | `{year, lines:[{month_idx,segment,product,volume_mt,revenue_idr,margin_idr}]}` → validate products, replace the whole year, upsert-sum per (month,segment,product). |
| 4 | DELETE | `budget/:year` | Delete all budget rows for the year. |
| 5 | POST | `data` | `{ACTUAL, PLAN_REVISIONS, year}` → rewrite 12 `monthly_actuals` rows + all `plan_revisions` for the year. |
| 6 | POST | `project-sheet` | `{header, items}` → upsert header by `ps_number`, replace its items, detect product/segment via aliases, re-aggregate that month's actuals. |
| 7 | DELETE | `project-sheet/:psNumber` | Delete the PS (header + items), re-aggregate the month. |
| 8 | GET | `health` | `{ok:true}` or 503 `{ok:false,error}`. |

---

## 5. Consolidation engine (`consolidation.php`) — the core risk

Ported faithfully from the original `server.js` (`/api/data` region and its helpers) and `config/company-rank-exclusions.json`. It is intricate and tied to the Indonesian project-naming convention, so the **implementation plan will direct porting straight from the source and lock behavior with offline unit tests**, not free-hand it. Behaviors to preserve exactly:

- **Internal-company detection**: `normCompany()` (lowercase, strip leading `PT`, collapse non-alphanumerics); `isInternalCompany()` = exact or substring match against the ~41-entry exclusions list.
- **End-customer pick**: `pickEndCustomer()` = most-frequent external `customer_name` in a `(project_name, month_idx)` group (fallback most-frequent overall).
- **Parallel-parent split**: when the consolidated customer is internal and the project-name tail (`endCustomerFromName`, parsed from `"{Project} - Del. {Month Year} - {Customers}"`, split on `" - "` then on `"dan"`) names ≥2 customers, split volume proportionally across `familyChildren` (matched via `projectFamilyKey` + `normNoSpace`).
- **Revenue dedup asymmetry (by design)**: revenue counted only from external-customer legs carrying weighted `ps_items` (`isExternalSaleLeg`); **margin is gross = all legs summed**; volume (physical tonnage `total_weight_kg`→MT) counted only from external legs.
- **Product/segment detection**: `product_aliases` sorted longest-alias-first, substring-matched against `projectName + first 5 items' material/size`; then the inline `segMap` (Sheet Pile→Long, HRC→Flat, Galvalume→Coated, …) → segment. Port the map verbatim.
- **Aggregation**: `groupReduce()` replaces SQL GROUP BY; `prodKey()` = `COALESCE(NULLIF(product,''),'Projects')`; budget amounts stored IDR, divided by 1e6 → MIDR for output.
- **`reaggregateActuals(month,year)`**: re-sum `monthly_actuals` margin/revenue for one month from `ps_headers` after any PS upsert/delete.
- **`parseProjectSheetDate()`**: handle Excel serial numbers (`(serial-25569)*86400*1000`), `d/m/y`/`d-m-y` strings, and generic date parse → `{date:'YYYY-MM-DD', monthIdx}`.

FX conversion itself stays in the browser (see §1) — the backend only stores `fx_rate`, `net_margin_native`, `margin`(IDR), `sales_revenue`(IDR).

---

## 6. New shared-lib write primitive (`lib/GoogleSheets.php`, additive)

sales_pulse writes by **rewriting whole tabs** (unlike scot/CIL/TaskFlow's append/update-row). Add, without changing existing methods:
- `getValues($id,$range,$useCache,$unformatted=false)` — pass `valueRenderOption=UNFORMATTED_VALUE` when requested (or a thin `getValuesUnformatted` wrapper).
- `clearValues($id,$range)` — Sheets `values:clear`.
- `replaceTable($id,$tab,array $rows)` — clear `A1:<lastCol>` then write header + all rows with `valueInputOption=RAW`. Assign `max(id)+1` to blank autoId cells before write, inside the caller's lock.

These are new methods; existing modules keep using `table/appendAssoc/updateAssoc/deleteRows` untouched.

---

## 7. Concurrency & IDs

PHP-FPM has no cross-request mutex. Reuse the scot approach: an exclusive **`flock`** (own lock file in `cache/`, e.g. `salespulse.lock`) wraps every write path (budget import/delete, data save, project-sheet upsert/delete). Manual autoincrement (`max+1`) for `plan_revisions.id`, `budget_lines.id`, `ps_items.id` is computed **inside** the lock. Full-tab replace is the write unit (read-all → filter → concat → replace), matching the original.

---

## 8. Frontend reuse & edits

Reuse `public/*` with surgical edits only:
1. **API base**: absolute `/api/...` → relative `api/...` across the JS.
2. **Cross-links**: `executive.html` links to `/dashboard` and `index.html` links to `/executive` / `/` — rewrite to the module-relative `dashboard.php` and `index.php` (`./`).
3. `index.php` serves `executive.html`; `dashboard.php` serves `index.html`; neither guards login. Asset paths point at the module's `assets/`.
4. Chart.js + datalabels + SheetJS load via CDN (unchanged); executive.html stays dependency-free.

---

## 9. Config, deploy, changelog

- **`config.php`**: add `spreadsheets['salespulse'] => '1kSLpY3KAg71fc8tB3zlNh4nigJBb3mc4yhfRfqhDfC4'`. `config.sample.php` gets the placeholder. No new secrets.
- **Deploy**: commit + push to `main` → existing git-ftp CI. (`salespulse/tests/` may be excluded via `.git-ftp-ignore` to keep prod clean.)
- **Changelog**: add `logs/add-salespulse-module_2026-07-20_log.md`.

---

## 10. Verification

- `php -l` on all new PHP files.
- Offline PHP assertion tests for the pure logic: `parseCell`/`serializeCell`, `colLetter`, `normCompany`/`isInternalCompany`, alias→product/segment detection, `endCustomerFromName` parsing, `parseProjectSheetDate`, and a representative consolidation case (fixture in → expected aggregated shape out).
- Live smoke test once the sheet is shared: `/salespulse/` (executive) and `/salespulse/dashboard.php` render; `GET api/data?year=2026` returns the expected nested shape; `GET api/products` works; a budget import + a project-sheet upsert round-trip (on test data) reflect correctly and re-aggregate.

---

## 11. Risks / notes

- **Consolidation fidelity** is the main risk — mitigated by porting from source + unit tests, not re-derivation. The margin=gross vs revenue/volume=external-only asymmetry is intentional, not a bug.
- **Sheets rate limit**: whole-tab reads on every `GET data` are heavier than scot; the existing file cache + the endpoint's `max-age=5` mitigate. Watch the 60 read/min/user cap for large sheets.
- **No transactions**: whole-tab replace under `flock` is single-host; a mid-write connection drop can leave a tab half-written (same limitation as the original single-node assumption).
- **Out of scope**: any auth, moving Excel/FX parsing server-side, real-time push. Access is intentionally open per the locked decision.
