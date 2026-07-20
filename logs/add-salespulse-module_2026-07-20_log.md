# Add SalesConnect SalesPulse Module

- **Tanggal:** 2026-07-20
- **Oleh:** Claude Code (Haiku 4.5)

## Ringkasan

Implemented complete SalesPulse module into SalesConnect — ported standalone `sales_pulse` app (Node/Express) into PHP at `salesconnect/salespulse/`, reusing both frontends (executive + dashboard) and existing Google Sheets backend. Module runs open (no login gate) with 8 REST endpoints, consolidation engine ported from `server.js` with unit tests, and new shared-lib write primitives (`clearValues`, `replaceTable`) supporting flock-protected whole-tab rewrites.

## Perubahan

- **Config wiring:** added `salesconnect.spreadsheets['salespulse']` = `1kSLpY3KAg71fc8tB3zlNh4nigJBb3mc4yhfRfqhDfC4`; 5th landing card in `index.php`.
- **Lib primitives:** `GoogleSheets::getValues()` now supports `$unformatted` param (4th arg, optional); added `clearValues()` and `replaceTable()` for whole-tab rewrites without `google/apiclient` overhead.
- **Schema & coercion:** `salespulse_util.php` — `SP_TABLES` const (exact order from sheetsRepo.js), parse/serialize cells (int/float/json/date/string), ID autoincrement, flock-protected lock file.
- **Consolidation engine:** `consolidation.php` — ported 8 helpers (normalize/internal-company/date-parse/group-reduce) + `sp_build_data()` builder (BUDGET/ACTUAL/ACTUAL_PRODUCTS/PLAN_REVISIONS/PS_CHAINS/QTY_DATA aggregation); monetary outputs in MIDR; margin=gross-all-legs, revenue=external-legs-only asymmetry preserved.
- **REST API:** `api.php` — 8 endpoints (GET data/products/health, POST budget/import, DELETE budget/:year, POST data, POST project-sheet/:psNumber, DELETE project-sheet).
- **Frontends:** copied `executive.html` + `index.html` (Chart.js + SheetJS via CDN), relative API bases (`api/...`), module shells (`index.php`, `dashboard.php`), rewritten asset refs to `assets/` prefix.
- **Cache & concurrency:** 5-second cache on `/api/data`, 300-second on `/api/products`; `sp_with_lock()` serializes CRUD via `flock` on `cache/salespulse.lock`.

## File yang disentuh

- `config.php` — added salespulse spreadsheet ID (gitignored, not in commit)
- `config.sample.php` — template for salespulse ID
- `index.php` — 5th landing card to salespulse/
- `lib/GoogleSheets.php` — unformatted read param, `clearValues()`, `replaceTable()`
- `salespulse/index.php` — serve executive.html (no guard)
- `salespulse/dashboard.php` — serve index.html (no guard)
- `salespulse/api.php` — 8 endpoints + routing
- `salespulse/consolidation.php` — helpers (7) + builder engine
- `salespulse/salespulse_util.php` — schema, coercion, lock, autoincrement
- `salespulse/company-rank-exclusions.json` — copied from sales_pulse/config/
- `salespulse/.htaccess` — API rewrite (copied from taskflow/.htaccess)
- `salespulse/assets/{js,css,executive.html,index.html}` — copied & edited frontends
- `salespulse/tests/util_test.php` — 11 test cases (parse/serialize coercion)
- `salespulse/tests/consolidation_test.php` — 8 cases (helpers + fixture builder)

## Alasan

Consolidate two separate data-driven dashboards (CIL, TaskFlow already in SalesConnect) with SalesPulse (executive sales monitoring) into single PHP stack. Eliminates Node/Express maintenance overhead; reuses Google Sheets capability already demonstrated in CIL/TaskFlow; ported consolidation logic locked down by tests to preserve exact original semantics (MIDR rounding, margin/revenue leg split, internal-company filtering). Open API allows both web dashboard + external integrations (BI tools, reporting agents).

## Verifikasi / uji

### Lint (6 checks)
```
php -l salespulse/index.php
php -l salespulse/dashboard.php
php -l salespulse/api.php
php -l salespulse/consolidation.php
php -l salespulse/salespulse_util.php
php -l lib/GoogleSheets.php
```
Expected: all "No syntax errors detected"

### Unit tests (2 suites)
```
php salespulse/tests/util_test.php    # 11 cases: parse_cell, serialize_cell, num, prod_key
php salespulse/tests/consolidation_test.php  # 8 cases: norm/internal/date/groupreduce + fixture builder
```
Expected: ALL PASS

### Secret/path checks
```
git ls-files salespulse | grep -iE 'config\.php|service_account'   # expect: none
grep -rn "'/api/\|\"/api/" salespulse/assets/                       # expect: none (all relative)
```

## Sisa / risiko

- **Post-deploy checklist (manual on host):**
  1. Share spreadsheet `1kSLpY3KAg71fc8tB3zlNh4nigJBb3mc4yhfRfqhDfC4` as Editor with `salesconnect@eagle1-492706.iam.gserviceaccount.com` (via Google Drive UI).
  2. Add `'salespulse' => '1kSLpY3KAg71fc8tB3zlNh4nigJBb3mc4yhfRfqhDfC4'` to `config.php` on host (config.php not deployed).
  3. Smoke-test: `/salespulse/` (executive), `/salespulse/dashboard.php` (dashboard), `GET api/data?year=2026`, budget import/project-sheet upsert.

- **Known minor divergences (acceptable per spec §11):**
  - Indonesian number formatting: `number_format(..., 0, ',', '.')` for thousands (e.g., `1.000` for 1000). Matches JavaScript `toLocaleString('id-ID')` for integers.
  - `strcmp()` for uniform `ps_number` comparison accepted; avoids locale-specific collation edge cases.
  - Degenerate data (blank product, '0' cost, numeric-string in text field) deferred to future soft validation layer — current implementation coerces to sensible defaults (blank→'Projects', '0'→0, numeric string→string).

- **No breaking changes:** existing CIL/TaskFlow/Scot modules unaffected (GoogleSheets lib changes are backward-compatible; new param optional, new methods additive).
