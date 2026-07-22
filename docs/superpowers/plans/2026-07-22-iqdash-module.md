# IQ Dash Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the standalone `iq_dash` app (Node/Express + Google Sheets) into a SalesConnect PHP module at `salesconnect/iqdash/`, reusing the vanilla-JS frontend and the existing spreadsheet, preserving every business-logic invariant.

**Architecture:** Flavor-B SalesConnect module (like `salespulse`): a cache-busting `index.php` shim serves `assets/index.html`; `.htaccess` rewrites `api/*` → `api.php`; `api.php` dispatches to PHP re-implementations of every `iq_dash/server.js` route, backed by shared `lib/GoogleSheets.php` against sheet `1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0`. The HS-keyed quota ledger ships as read-only JSON files and is overlaid at read time.

**Tech Stack:** PHP ≥8.0 (curl+openssl), Google Sheets API v4 via `lib/GoogleSheets.php`, vanilla JS frontend (Chart.js + SheetJS vendored). Tests: plain PHP assertion scripts run via PowerShell `php`.

## Global Constraints

- **Source spreadsheet (verbatim):** `1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0` (key `spreadsheets['iqdash']`).
- **Writes use `valueInputOption=RAW`.** Never `USER_ENTERED`. (Handled inside `GoogleSheets.php` append/update — do not change it.)
- **String-cast every code/ID comparison** (`(string)`) — company codes and 13-digit IDs read back as mixed types.
- **Available is always derived** `= max(0, Obtained − Utilized)` — never read/trust an `available_*` value as authoritative.
- **A `util_mt ≤ 0` lot must never zero out** existing utilization.
- **Two "obtained" paths stay synced:** cycles path vs stats path; new obtained goes through `record-obtained`.
- **Sheet-write safety:** write-first-then-clear on any table rewrite; refuse to write an empty `companies` tab (anti-wipe guard).
- **Ledger wins:** per-product obtained comes from `data/quotaLedger.json` (HS-keyed); effective util `= min(obtained, ledgerUtil + Σ lot.utilMT)`.
- **Access: OPEN** — no `guard.php` / `api_guard.php` in this module.
- **PHP is run locally via PowerShell** (`php path\to\test.php`), not bash.
- **Mandatory changelog:** each stage appends a `logs/iqdash-<slug>_2026-07-22_log.md` file (SalesConnect `CLAUDE.md` rule).
- **Do NOT copy** iq_dash's `.env` or `service-account.json` into the module. Credentials come from SalesConnect `secure/` + `config.php`.
- **Parity oracle totals:** Obtained **33,730** / Utilized **18,346** / Available **15,384**.
- Port source root: `C:\Users\arjuna.putranto\Downloads\project_dashboard\iq_dash` (referred to below as `IQ/`).
- Module root: `salesconnect/iqdash/` (referred to below as `MOD/`).

---

## Stage 0 — Parity oracle (do first; unblocks all verification)

### Task 0: Capture the live Node `/api/data` + `/api/insights` snapshots

**Files:**
- Create: `MOD/tests/fixtures/api_data.json`
- Create: `MOD/tests/fixtures/api_insights.json`
- Create: `MOD/tests/fixtures/README.md`

**Interfaces:**
- Produces: two JSON fixtures used as the parity oracle by every later verification task. `api_data.json` = the exact body of `GET /api/data`; `api_insights.json` = exact body of `GET /api/insights`.

- [ ] **Step 1: Run iq_dash locally against the shared sheet.** In `IQ/`, ensure `service-account.json`/env is present, then start it in Sheets mode:

```bash
cd C:/Users/arjuna.putranto/Downloads/project_dashboard/iq_dash
DATA_SOURCE=sheets SHEETS_DB_ID=1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0 node server.js
```
Expected: `listening` on the configured PORT (default 3000).

- [ ] **Step 2: Save the oracle snapshots** (new shell):

```bash
curl -s http://localhost:3000/api/data     > "C:/Users/arjuna.putranto/Downloads/project_dashboard/salesconnect/iqdash/tests/fixtures/api_data.json"
curl -s http://localhost:3000/api/insights  > "C:/Users/arjuna.putranto/Downloads/project_dashboard/salesconnect/iqdash/tests/fixtures/api_insights.json"
```

- [ ] **Step 3: Verify the oracle totals.** Confirm the headline numbers match the locked totals so we know the snapshot is a good baseline:

```bash
node -e "const d=require('./iqdash/tests/fixtures/api_data.json'); const s=d.spi.reduce((a,c)=>({o:a.o+(c._ledgerObtained||0)}),{o:0}); console.log('obtained sum', s.o)" 
```
Expected: `obtained sum 33730` (± rounding). If it differs, STOP — the sheet state changed; note the actual totals in `fixtures/README.md` and use those as the oracle instead.

- [ ] **Step 4: Note the source of truth** in `fixtures/README.md`: which sheet, when captured, the three totals, and that fixtures are the frozen oracle (do not regenerate mid-port).

- [ ] **Step 5: Commit**

```bash
git add iqdash/tests/fixtures/
git commit -m "test(iqdash): capture live /api/data + /api/insights parity oracle"
```

> If the Node app cannot be run (no creds locally), fall back: export the sheet tabs and build fixtures by hand, or defer parity assertions to the manual smoke test in Task 16. Flag this to the reviewer.

---

## Stage 1 — Scaffold + read path

### Task 1: Module skeleton, config, routing, landing tile

**Files:**
- Create: `MOD/.htaccess`, `MOD/index.php`
- Copy: `IQ/lib/quotaLedger.json` → `MOD/data/quotaLedger.json`; `IQ/lib/pendingRevisions.json` → `MOD/data/pendingRevisions.json`; `IQ/lib/ledgerCompanyDates.json` → `MOD/data/ledgerCompanyDates.json`
- Modify: `salesconnect/config.php` and `salesconnect/config.sample.php` (add `spreadsheets['iqdash']`)
- Modify: `salesconnect/router.dev.php` (add `iqdash` to both regexes)
- Modify: `salesconnect/index.php` (add landing card)

**Interfaces:**
- Produces: `MOD/.htaccess` routing `api/*`→`api.php`; `spreadsheets['iqdash']` config key; ledger files at `MOD/data/*.json`.

- [ ] **Step 1: Copy the per-module `.htaccess` verbatim** from `salesconnect/salespulse/.htaccess` to `MOD/.htaccess` (the `RewriteRule ^api/(.*)$ api.php?_route=$1` block).

- [ ] **Step 2: Create `MOD/index.php`** as the Flavor-B cache-busting shim (copy `salesconnect/salespulse/index.php`, change the served file to `assets/index.html`):

```php
<?php
$html = file_get_contents(__DIR__ . '/assets/index.html');
$html = preg_replace_callback(
    '#(assets/[A-Za-z0-9_\-/]+\.(?:js|css))(?:\?v=[^"\']*)?(["\'])#',
    function ($m) {
        $f = __DIR__ . '/' . $m[1];
        $v = @filemtime($f) ?: time();
        return $m[1] . '?v=' . $v . $m[2];
    },
    $html
);
echo $html;
```

- [ ] **Step 3: Copy the three ledger JSON files** into `MOD/data/` (verbatim, no edits).

- [ ] **Step 4: Wire config.** Add to the `spreadsheets` array in BOTH `config.php` and `config.sample.php`:

```php
'iqdash' => '1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0',
```

- [ ] **Step 5: Add `iqdash` to `router.dev.php`** — both rewrite regexes (the `^/(cil|taskflow|costcore|scot|salespulse)/api/` list → add `|iqdash`).

- [ ] **Step 6: Add the landing tile** to `salesconnect/index.php` (mirror an existing card, trailing slash required):

```php
<a class="card" href="iqdash/">
  <div class="icon">📊</div>
  <h2>Import Quota Monitor</h2>
  <p>Steel import quota (PERTEK/SPI) lifecycle & realization tracking.</p>
</a>
```

- [ ] **Step 7: Verify** the shim runs (no assets yet is fine — it should not fatal):

```bash
php -r "chdir('salesconnect/iqdash'); $h=@file_get_contents('assets/index.html'); echo ($h===false?'NO-ASSETS-YET-OK':'HAS-ASSETS');"
```
Expected: `NO-ASSETS-YET-OK` (assets arrive in Task 3).

- [ ] **Step 8: Commit**

```bash
git add iqdash/.htaccess iqdash/index.php iqdash/data/ config.php config.sample.php router.dev.php index.php
git commit -m "feat(iqdash): scaffold module (htaccess, shim, ledger files, config, landing tile)"
```

### Task 2: `iqdash_util.php` — coercion, dates, tab list, alias/HS maps, file lock

**Files:**
- Create: `MOD/iqdash_util.php`
- Test: `MOD/tests/test_util.php`

**Interfaces:**
- Produces:
  - `iq_tabs(): array` — the ordered list of tab names read by the payload (companies, company_directory, products, product_aliases, company_products, company_product_stats, cycles, cycle_products, revision_changes, company_shipments, company_reapply_targets, ra_records, pending_meta, realizations, pertek_perubahan_release).
  - `iq_coerce($v)` — `''`→`null`, `'TRUE'/'FALSE'`→bool, else string (mirror `coerce()` in `IQ/lib/sheetsStore.js`).
  - `iq_num($v): float` — tolerant number parse ('TBA'/''/null→0, strips commas).
  - `iq_date_iso($v): ?string` — parse `DD/MM/YYYY` or ISO → `YYYY-MM-DD` (else null).
  - `iq_ledger(): array`, `iq_pending_revisions(): array`, `iq_ledger_company_dates(): array` — cached `json_decode` of `MOD/data/*.json`.
  - `iq_with_lock(callable $fn)` — flock-based critical section (copy `sp_with_lock` from `salespulse/salespulse_util.php`).

- [ ] **Step 1: Write the failing test** `MOD/tests/test_util.php`:

```php
<?php
require __DIR__ . '/../iqdash_util.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

ok(iq_coerce('') === null, 'empty -> null');
ok(iq_coerce('TRUE') === true, 'TRUE -> bool true');
ok(iq_coerce('FALSE') === false, 'FALSE -> bool false');
ok(iq_coerce('EMS') === 'EMS', 'string passthrough');
ok(iq_num('1,600') === 1600.0, 'comma number');
ok(iq_num('TBA') === 0.0, 'TBA -> 0');
ok(iq_date_iso('05/02/2026') === '2026-02-05', 'DD/MM/YYYY -> ISO');
ok(iq_date_iso('2026-02-05') === '2026-02-05', 'ISO passthrough');
ok(iq_date_iso('') === null, 'empty date -> null');
$led = iq_ledger();
ok(isset($led['companies']) && isset($led['products']), 'ledger loads');
echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
```

- [ ] **Step 2: Run to verify it fails**

Run: `php salesconnect/iqdash/tests/test_util.php`
Expected: fatal — `iqdash_util.php` not found / functions undefined.

- [ ] **Step 3: Implement `MOD/iqdash_util.php`.** Port `coerce()` from `IQ/lib/sheetsStore.js`; implement the date/number helpers; `json_decode(file_get_contents(...), true)` with a static cache for the three ledger files; copy `iq_with_lock` from `salespulse/salespulse_util.php` (rename `sp_`→`iq_`).

- [ ] **Step 4: Run to verify it passes**

Run: `php salesconnect/iqdash/tests/test_util.php`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add iqdash/iqdash_util.php iqdash/tests/test_util.php
git commit -m "feat(iqdash): util helpers (coerce, dates, ledger loaders, lock) + tests"
```

### Task 3: Copy frontend + patch API base

**Files:**
- Copy: `IQ/public/index.html` → `MOD/assets/index.html`; `IQ/public/css/` → `MOD/assets/css/`; `IQ/public/js/01..20-*.js` → `MOD/assets/js/`; `IQ/public/vendor/` → `MOD/assets/vendor/`
- Modify (API base): `MOD/assets/js/01-data.js`, `08-drawer.js`, `11-shipment.js`, `13-rev-mgmt.js`, `20-realization-import.js`

**Interfaces:**
- Consumes: nothing (static assets).
- Produces: the SPA under `MOD/assets/`, all fetch calls using relative base `api/…`.

- [ ] **Step 1: Copy** the four asset groups into `MOD/assets/` preserving structure.

- [ ] **Step 2: Patch the 11 fetch call sites** — change absolute `/api/` to relative `api/` in exactly these lines (verified locations): `01-data.js:61,73`; `08-drawer.js:89,452`; `11-shipment.js:444`; `13-rev-mgmt.js:671,697`; `20-realization-import.js:271,316,347,377`. Use a scoped replace of the string `'/api/` → `'api/` and `` `/api/`` → `` `api/`` in those five files only.

- [ ] **Step 3: Verify no absolute `/api/` remains** in the copied JS:

```bash
grep -rn "['\"\`]/api/" salesconnect/iqdash/assets/js || echo "CLEAN"
```
Expected: `CLEAN`.

- [ ] **Step 4: Verify the shim now injects versions** (assets present):

```bash
php -r "chdir('salesconnect/iqdash'); include 'index.php';" | grep -c "assets/js/01-data.js?v=" 
```
Expected: `1` (or more).

- [ ] **Step 5: Commit**

```bash
git add iqdash/assets/
git commit -m "feat(iqdash): vendor iq_dash frontend, patch API base to relative"
```

### Task 4: `iqdash_data.php` — table loader + payload assembly (pre-ledger)

**Files:**
- Create: `MOD/iqdash_data.php`
- Test: `MOD/tests/test_payload_shape.php`

**Interfaces:**
- Consumes: `GoogleSheets`, `iqdash_util.php`.
- Produces:
  - `iq_load_tables(GoogleSheets $gs, string $sid): array` — returns `['companies'=>[...rows], 'cycles'=>[...], 'cycleProducts'=>[...], 'stats'=>[...], 'revisions'=>[...], 'lots'=>[...], 'realizations'=>[...], 'aliases'=>[...], 'products'=>[...], 'directory'=>[...], 'companyProducts'=>[...], 'reapply'=>[...], 'ra'=>[...], 'pendingMeta'=>[...], 'pertekRelease'=>[...]]`. Each value is a list of assoc rows (header-keyed) via `GoogleSheets::table()`. This is the PHP analogue of the `t` (tables) object in `IQ/lib/insights.js` and the getters in `IQ/server.js`.
  - `iq_build_payload_raw(array $t): array` — assembles `{spi, pending, ra, products, productAliases, companyDirectory, lastUpdate}` WITHOUT ledger overlay yet. Port the assembly in `IQ/server.js:_buildDataPayload` (line 998) up to but excluding `applyLedger` (line 1223). Return shape MUST match `IQ/server.js:1351`.

- [ ] **Step 1: Write the failing test** using the oracle fixture for structural parity:

```php
<?php
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_data.php';
$oracle = json_decode(file_get_contents(__DIR__.'/fixtures/api_data.json'), true);
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }
// Feed the oracle's own tables back is not available; instead assert the
// builder produces the same TOP-LEVEL KEYS and that spi rows carry the
// expected fields. Use a tiny synthetic $t.
$t = [
  'companies'=>[['code'=>'EMS','full_name'=>'Eng Multi Steel','grp'=>'AB','section'=>'SPI','updated_at'=>'2026-01-01 00:00:00']],
  'cycles'=>[], 'cycleProducts'=>[], 'stats'=>[], 'revisions'=>[], 'lots'=>[],
  'realizations'=>[], 'aliases'=>[['alias'=>'GI','canonical'=>'GI ALLOY']],
  'products'=>[['name'=>'GI ALLOY','hs_code'=>'7225.92.90','sort_order'=>'1']],
  'directory'=>[['full_name'=>'Eng Multi Steel','abbreviation'=>'EMS','sort_order'=>'1']],
  'companyProducts'=>[], 'reapply'=>[], 'ra'=>[], 'pendingMeta'=>[], 'pertekRelease'=>[],
];
$p = iq_build_payload_raw($t);
foreach (['spi','pending','ra','products','productAliases','companyDirectory','lastUpdate'] as $k)
  ok(array_key_exists($k,$p), "payload has key $k");
ok(is_array($p['spi']) && count($p['spi'])===1, 'one SPI company');
ok(($p['spi'][0]['code']??'')==='EMS', 'SPI company code EMS');
ok(($p['productAliases']['GI']??'')==='GI ALLOY', 'alias map built');
echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
```

- [ ] **Step 2: Run to verify it fails**

Run: `php salesconnect/iqdash/tests/test_payload_shape.php`
Expected: fatal — `iq_build_payload_raw` undefined.

- [ ] **Step 3: Implement `iq_load_tables` + `iq_build_payload_raw`.** Port `_buildDataPayload` (IQ/server.js:998–1222): sort products/directory by `sort_order`; split companies by `section` into `spi`/`pending`; attach each company's cycles (+cycle_products), stats, shipment lots, reapply targets, pending_meta, ra; build `aliasMap` and `productsList`; set `lastUpdate` = max `updated_at`. Keep it ledger-free for now.

- [ ] **Step 4: Run to verify it passes**

Run: `php salesconnect/iqdash/tests/test_payload_shape.php`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add iqdash/iqdash_data.php iqdash/tests/test_payload_shape.php
git commit -m "feat(iqdash): table loader + pre-ledger /api/data payload assembly"
```

### Task 5: Ledger overlay + pending-revision gate

**Files:**
- Modify: `MOD/iqdash_data.php` (add `iq_apply_ledger`, `iq_apply_pending_revision`, wire into `iq_build_payload`)
- Test: `MOD/tests/test_ledger.php`

**Interfaces:**
- Consumes: `iq_ledger()`, `iq_pending_revisions()`, `iq_ledger_company_dates()`.
- Produces:
  - `iq_apply_pending_revision(array &$co, array $obtByProd): void` — port `applyPendingRevision` from `IQ/lib/pendingRevisionGate.js`: if the company has a gated split and no release date, move `mt` from `to`→`from` product; set/clear `$co['_pendingRevision']`.
  - `iq_apply_ledger(array &$co, array $ledgerEntity): void` — port the `applyLedger` closure (IQ/server.js:1223–1265): compute `obtByProd` from ledger HS entries (map HS→product name via ledger `products`), set `$co['_ledgerObtained']` (sum) and `$co['_ledgerObtainedByProd']`; effective per-product util `= min(obtained, ledgerUtil + Σ lot.utilMT)`; available derived.
  - `iq_build_payload(array $t): array` — `iq_build_payload_raw` then overlay ledger per company (spi + pending), applying the pending-revision reversal first.

- [ ] **Step 1: Write the failing test** asserting the invariants on a crafted entity:

```php
<?php
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_data.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

// available always derived, util capped at obtained
$co = ['code'=>'EMS','_lots'=>[['product'=>'SHEET PILE','utilMT'=>2000]]];
$ledgerEntity = ['7301.10.00'=>['obtained'=>1600,'util'=>1600]]; // SHEET PILE
$GLOBALS['__HS'] = ['7301.10.00'=>'SHEET PILE'];
iq_apply_ledger($co, $ledgerEntity);
ok(abs($co['_ledgerObtained'] - 1600) < 0.01, 'obtained = ledger 1600');
$avail = max(0, $co['_ledgerObtained'] - array_sum(array_map(fn($p)=>$p['util'], $co['_ledgerObtainedByProd'])));
ok($avail >= 0, 'available never negative');
$util = $co['_ledgerObtainedByProd']['SHEET PILE']['util'];
ok($util <= 1600 + 0.01, 'util capped at obtained (min rule)');

// util_mt=0 lot never lowers util below ledger baseline
$co2 = ['code'=>'X','_lots'=>[['product'=>'GI ALLOY','utilMT'=>0]]];
$le2 = ['7225.92.90'=>['obtained'=>500,'util'=>300]];
$GLOBALS['__HS'] = ['7225.92.90'=>'GI ALLOY'];
iq_apply_ledger($co2, $le2);
ok($co2['_ledgerObtainedByProd']['GI ALLOY']['util'] >= 300, 'util_mt=0 does not zero util');
echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
```
> Note: if the port keys HS→product via the ledger's own `products` map rather than a `$GLOBALS['__HS']` shim, adjust the test to pass that map the same way the implementation reads it. Keep the three assertions (obtained=ledger, available≥0, util≥ledger-baseline when lot=0).

- [ ] **Step 2: Run to verify it fails**

Run: `php salesconnect/iqdash/tests/test_ledger.php`
Expected: fatal — `iq_apply_ledger` undefined.

- [ ] **Step 3: Implement** `iq_apply_pending_revision`, `iq_apply_ledger`, `iq_build_payload`. Faithfully port IQ/server.js:1223–1265 and `pendingRevisionGate.js`. Preserve: obtained=ledger; `util = min(obtained, ledgerUtil + Σ lot.utilMT)`; available derived; lot util≤0 contributes 0 (never subtracts).

- [ ] **Step 4: Run to verify it passes**

Run: `php salesconnect/iqdash/tests/test_ledger.php`
Expected: `ALL PASS`

- [ ] **Step 5: Commit**

```bash
git add iqdash/iqdash_data.php iqdash/tests/test_ledger.php
git commit -m "feat(iqdash): ledger overlay + pending-revision gate with invariant tests"
```

### Task 6: `api.php` GET routes (`/api/data`, `/api/company/:code`, `/api/ra`, `/api/health`) + read cache

**Files:**
- Create: `MOD/api.php`
- Test: `MOD/tests/test_router_get.php`

**Interfaces:**
- Consumes: `iqdash_data.php`, `GoogleSheets`, `sc_config`, `sc_route`, `json_out`.
- Produces: the front controller. `GET /api/health`→`{status:'ok'}`; `GET /api/data`→`iq_build_payload(iq_load_tables(...))` with a `cache/`-backed ~30–60 s memo (reuse `GoogleSheets` read cache + one file memo keyed `iqdash_data`); `GET /api/company/:code`→one company; `GET /api/ra`→ra rows.

- [ ] **Step 1: Write the failing test** that drives the router by faking `$_GET['_route']` and `REQUEST_METHOD` for the offline-safe `health` route:

```php
<?php
// Router smoke: health must return JSON without touching Sheets.
$_SERVER['REQUEST_METHOD']='GET'; $_GET['_route']='health';
ob_start(); include __DIR__.'/../api.php'; $out=ob_get_clean();
$j=json_decode($out,true);
echo (($j['status']??'')==='ok') ? "PASS health JSON\n" : "FAIL health ($out)\n";
```
> `json_out` calls `exit`; run this test in its own process (it is). If `api.php` requires login includes, ensure none are present (module is OPEN).

- [ ] **Step 2: Run to verify it fails**

Run: `php salesconnect/iqdash/tests/test_router_get.php`
Expected: FAIL (no `api.php`).

- [ ] **Step 3: Implement `MOD/api.php`.** Mirror the dispatch skeleton from `salesconnect/salespulse/api.php`: `require ../lib/sheet_util.php`; `$cfg=sc_config(); $SID=$cfg['spreadsheets']['iqdash']; $gs=new GoogleSheets();`. Parse `sc_route()`→`$parts`; handle the GET routes above; `health` returns before any Sheets call. Wrap in try/catch→500. Add a file memo for `/api/data`.

- [ ] **Step 4: Run to verify it passes**

Run: `php salesconnect/iqdash/tests/test_router_get.php`
Expected: `PASS health JSON`

- [ ] **Step 5: Commit**

```bash
git add iqdash/api.php iqdash/tests/test_router_get.php
git commit -m "feat(iqdash): api.php GET routes (data/company/ra/health) + read memo"
```

### Task 7: Stage-1 changelog + live read verification

**Files:**
- Create: `salesconnect/logs/iqdash-read-path_2026-07-22_log.md`

- [ ] **Step 1: Manual live check (network required).** Start SalesConnect locally (`start-local.bat`), open `http://localhost:PORT/iqdash/`. Confirm all 5 tabs render and KPI totals ≈ 33,730 / 18,346 / 15,384. (Requires the sheet shared as Editor to `salesconnect@eagle1-492706` — see spec §3.)
- [ ] **Step 2: Compare** `http://localhost:PORT/iqdash/api/data` JSON top-level keys and a spot company's `_ledgerObtained` against `tests/fixtures/api_data.json`.
- [ ] **Step 3: Write the changelog** (date, summary, files, verification result, residual risks) per `logs/README.md` template.
- [ ] **Step 4: Commit**

```bash
git add iqdash/api.php logs/iqdash-read-path_2026-07-22_log.md
git commit -m "docs(iqdash): stage-1 read-path changelog + verification"
```

---

## Stage 2 — Insights

### Task 8: `iqdash_insights.php` — port `lib/insights.js`

**Files:**
- Create: `MOD/iqdash_insights.php`
- Test: `MOD/tests/test_insights.php`

**Interfaces:**
- Consumes: the tables array from `iq_load_tables` (same `$t` shape).
- Produces (one PHP function per JS function, same semantics):
  - `iq_ins_obtainedByPeriod($t,$today=null)` (q1), `iq_ins_latestProgress($t,$code)` (q2), `iq_ins_topQuotaItems($t,$limit=10)` (q3), `iq_ins_leadTime($t)` (q4), `iq_ins_remainingForItem($t,$item)` (q5), `iq_ins_companiesWithItem($t,$item)` (q6), `iq_ins_utilizationTiming($t,$code)` (q7), `iq_ins_reallocations($t,$item)` (q8), `iq_ins_realizationMetrics($t,$today=null)`.
  - `iq_ins_all($t, array $opts=[]): array` — returns keys `q1_obtainedByPeriod, q2_latestProgress, q3_topQuotaItems, q4_leadTime, q5_remainingForItem, q6_companiesWithItem, q7_utilizationTiming, q8_reallocations, realization` (exact key names from IQ/lib/insights.js:167).

- [ ] **Step 1: Write the failing test** asserting `iq_ins_all` returns the exact 9 keys and q3 shape:

```php
<?php
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_insights.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }
$t = ['companies'=>[['code'=>'EMS']], 'cycles'=>[], 'cycleProducts'=>[], 'stats'=>[],
      'revisions'=>[], 'lots'=>[], 'realizations'=>[], 'aliases'=>[], 'products'=>[]];
$a = iq_ins_all($t, ['today'=>'2026-07-22','item'=>'GI ALLOY','company'=>'EMS']);
foreach (['q1_obtainedByPeriod','q2_latestProgress','q3_topQuotaItems','q4_leadTime',
  'q5_remainingForItem','q6_companiesWithItem','q7_utilizationTiming','q8_reallocations','realization'] as $k)
  ok(array_key_exists($k,$a), "insights has $k");
echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
```

- [ ] **Step 2: Run to verify it fails**

Run: `php salesconnect/iqdash/tests/test_insights.php`
Expected: FAIL.

- [ ] **Step 3: Port each function** from `IQ/lib/insights.js` (it is ~184 lines of pure functions — translate 1:1, JS `Date` math → PHP `DateTime`, `Array.reduce`→loops). Keep `canonMap`, week/month/year bucketing, and the q4 lead-time `{pairs,avgDays,fastest,slowest}` shape.

- [ ] **Step 4: Run to verify it passes**

Run: `php salesconnect/iqdash/tests/test_insights.php`
Expected: `ALL PASS`

- [ ] **Step 5: (Parity) compare against oracle.** Add an assertion that `iq_ins_all` over the tables reconstructed from `fixtures/api_data.json` matches `fixtures/api_insights.json` for q1 totals and q3 top item. Fix drift.

- [ ] **Step 6: Commit**

```bash
git add iqdash/iqdash_insights.php iqdash/tests/test_insights.php
git commit -m "feat(iqdash): port insights.js to PHP (q1-q8 + realization) with parity test"
```

### Task 9: `api.php` insights routes

**Files:**
- Modify: `MOD/api.php` (add `GET /api/insights`, `GET /api/insights/:q`)
- Test: `MOD/tests/test_router_insights.php`

**Interfaces:**
- Consumes: `iq_ins_all`, `iqdash_insights.php`.
- Produces: `GET /api/insights?item=&company=`→`iq_ins_all`; `GET /api/insights/q3` (and `q1..q8`, `realization`)→single key. Reuse the `/api/data` tables load.

- [ ] **Step 1: Write the failing test** (route parsing only — synthesize `$t` via a small injectable seam, or assert 200/shape against a stubbed loader). Assert `insights/q3` returns just the q3 payload.
- [ ] **Step 2: Run — FAIL.** `php salesconnect/iqdash/tests/test_router_insights.php`
- [ ] **Step 3: Implement** the two routes in `api.php`, dispatching on `$parts[1]` for the single-question form.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit**

```bash
git add iqdash/api.php iqdash/tests/test_router_insights.php
git commit -m "feat(iqdash): /api/insights + /api/insights/:q routes"
```

---

## Stage 3 — Realizations

### Task 10: Realizations read (`GET /api/realizations`, `/summary`)

**Files:**
- Create: `MOD/iqdash_write.php` (starts with realization read/dedup helpers)
- Modify: `MOD/api.php`
- Test: `MOD/tests/test_realizations_read.php`

**Interfaces:**
- Produces:
  - `iq_realizations_list(array $rows, ?string $code): array` — filter by `company_code` (string-cast), dedup by `(pib_no,line_no)`, sort `pib_date` desc. Port from `IQ/server.js` `GET /api/realizations`.
  - `iq_realizations_summary(array $rows): array` — `{counts:{CODE:{pibs,lines}}, totalPibs, totalLines}`.

- [ ] **Step 1: Write the failing test** with synthetic realization rows (duplicate pib/line collapses, sort by date desc, filter by code). Assert counts + order.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** the two pure functions in `iqdash_write.php`; wire the GET routes in `api.php`.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(iqdash): realizations read (list + summary) with dedup/sort`

### Task 11: Realizations write (`POST /api/realizations`, `/single`, `DELETE /:id`)

**Files:**
- Modify: `MOD/iqdash_write.php`, `MOD/api.php`
- Test: `MOD/tests/test_realizations_write.php`

**Interfaces:**
- Produces:
  - `iq_realizations_upsert(GoogleSheets $gs, string $sid, array $rows): array` — upsert on unique `(company_code,pib_no,line_no)`: update matching sheet row via `updateAssoc`, else `appendAssocBulk`. Wrap in `iq_with_lock`. Append `Change_Log`.
  - `DELETE`: find by `id`, `deleteRows`.

- [ ] **Step 1: Write the failing test** — offline: feed an existing-rows array + incoming rows to a pure `iq_realizations_merge($existing,$incoming)` that returns `[toUpdate, toAppend]`; assert conflict rows are updates, new rows are appends. (Keep the Sheets I/O in a thin wrapper; test the merge logic.)
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** `iq_realizations_merge` + the Sheets wrapper `iq_realizations_upsert` + DELETE handler + routes.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(iqdash): realizations write (bulk/single upsert + delete)`

---

## Stage 4 — Company writes

### Task 12: `patchCompany` — the main save (concurrency + anti-wipe + util recompute)

**Files:**
- Modify: `MOD/iqdash_write.php`, `MOD/api.php`
- Test: `MOD/tests/test_patch_company.php`

**Interfaces:**
- Produces:
  - `iq_recompute_util_from_lots(array $lots): array` — per-product util summing lot `util_mt`, **skipping `util ≤ 0`** (port `recomputeUtilizationFromLots`, IQ/server.js:439 + the mirror at 1446). Returns `[product=>utilMT]`.
  - `iq_patch_company(GoogleSheets $gs, string $sid, string $code, array $body): array` — port `patchCompanySheets` (IQ/server.js:1385–1548). Optimistic lock on `_ifUpdatedAt` vs sheet `updated_at`→`['error'=>'stale','status'=>409]`; update company row + company_products + pending_meta + shipments + reapply + ra + company_product_stats; anti-wipe guard (refuse empty companies tab)→`['error'=>...,'status'=>500]`; set new `updated_at`; return `['ok'=>true,'updatedAt'=>...,'ra'=>...]`. Wrap in `iq_with_lock`.

- [ ] **Step 1: Write the failing test** for the two pure invariants (no Sheets):

```php
<?php
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_write.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }
// util_mt=0 lot excluded; positive lots summed per product
$u = iq_recompute_util_from_lots([
  ['product'=>'GI ALLOY','util_mt'=>'100'],
  ['product'=>'GI ALLOY','util_mt'=>'0'],
  ['product'=>'SHEET PILE','util_mt'=>'50'],
]);
ok(abs(($u['GI ALLOY']??-1) - 100) < 0.01, 'GI ALLOY util = 100 (0-lot skipped)');
ok(abs(($u['SHEET PILE']??-1) - 50) < 0.01, 'SHEET PILE util = 50');
// stale token detection is pure: helper compares tokens
ok(iq_is_stale('2026-01-01 00:00:00','2026-01-02 00:00:00') === true, 'older client token => stale');
ok(iq_is_stale('2026-01-02 00:00:00','2026-01-02 00:00:00') === false, 'equal token => not stale');
echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
```

- [ ] **Step 2: Run — FAIL.** `php salesconnect/iqdash/tests/test_patch_company.php`
- [ ] **Step 3: Implement** `iq_recompute_util_from_lots`, `iq_is_stale($clientTok,$sheetTok)`, and `iq_patch_company` (the full port). Preserve anti-wipe + RAW writes + string-cast compares.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(iqdash): patchCompany save (concurrency, anti-wipe, util recompute)`

### Task 13: `POST /api/company` (create) + `PATCH /api/company/:code/cycles` (replace)

**Files:**
- Modify: `MOD/iqdash_write.php`, `MOD/api.php`
- Test: `MOD/tests/test_cycles.php`

**Interfaces:**
- Produces:
  - `iq_create_company(GoogleSheets $gs, string $sid, array $body): array` — append a new company row (validate `code` non-empty + unique).
  - `iq_replace_cycles(GoogleSheets $gs, string $sid, string $code, array $cycles): array` — full-replace this company's rows in `cycles` + `cycle_products` (write-first-then-clear). Port the cycles handler (IQ/server.js ~PATCH `/cycles`, near line 1725).

- [ ] **Step 1: Write the failing test** for the pure "build replacement matrix" helper: given existing all-company cycle rows + a target code + new cycles, assert the result keeps other companies' rows and replaces only `code`'s rows, with `cycle_products` linked by generated `cycle_id`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** create + cycles replace (+ the pure matrix helper).
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(iqdash): create company + replace cycles`

### Task 14: `record-obtained` + `pertek-perubahan-release`

**Files:**
- Modify: `MOD/iqdash_write.php`, `MOD/api.php`
- Test: `MOD/tests/test_record_obtained.php`

**Interfaces:**
- Produces:
  - `iq_record_obtained(GoogleSheets $gs, string $sid, string $code, array $body): array` — port IQ/server.js:2015–2088: mark the cycle terbit (set `release_date`), add `mt` to `company_product_stats.available_mt` for `product`, recompute company totals so KPI = breakdown; idempotent (re-posting same terbit is a no-op). Returns `{ok,code,product,obtained,utilization,available}`.
  - `iq_pertek_perubahan_release(GoogleSheets $gs, string $sid, string $code, string $releaseDate): array` — port IQ/server.js:2101–2126: upsert `(code, release_date)` into `pertek_perubahan_release` (accept DD/MM/YYYY or ISO → store ISO); this un-gates the split in `iq_apply_pending_revision`. Returns `{ok,code,releaseDate}`.

- [ ] **Step 1: Write the failing test** for idempotency + date parsing at the pure level: `iq_record_obtained_plan($stats,$product,$mt,$alreadyTerbit)` returns the intended stats delta and a `skipped` flag when already terbit; assert re-apply is skipped. Assert `iq_date_iso('05/02/2026')==='2026-02-05'` gate feeds the release upsert.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement** both handlers (+ the pure planning helper) and routes.
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(iqdash): record-obtained + pertek-perubahan-release (both obtained paths synced)`

---

## Stage 5 — Hardening & ship

### Task 15: Cache invalidation on writes + full test sweep

**Files:**
- Modify: `MOD/api.php` (clear the `/api/data` memo + `GoogleSheets::cacheClear()` after every write)
- Test: run every `MOD/tests/*.php`

**Interfaces:**
- Consumes: all prior.
- Produces: writes invalidate the read memo so the writer sees changes immediately.

- [ ] **Step 1:** After each successful write branch in `api.php`, call the memo-clear + `$gs->cacheClear()`.
- [ ] **Step 2: Run the whole offline suite:**

```bash
for f in salesconnect/iqdash/tests/test_*.php; do echo "== $f"; php "$f"; done
```
Expected: every file prints `ALL PASS` (or `PASS`).

- [ ] **Step 3: Commit** `feat(iqdash): invalidate read cache on all writes; green test sweep`

### Task 16: Live smoke, changelog, deploy

**Files:**
- Create: `salesconnect/logs/iqdash-full-port_2026-07-22_log.md`

- [ ] **Step 1: Live smoke (network).** With the sheet shared to `salesconnect@eagle1-492706`: `/iqdash/api/health`→JSON (proves mod_rewrite); load all 5 pages; do one company edit round-trip; confirm the stale-guard returns 409 when `_ifUpdatedAt` is old; add one realization and delete it; run `record-obtained` once and confirm KPI = per-product breakdown.
- [ ] **Step 2: Write the full-port changelog** (`logs/iqdash-full-port_2026-07-22_log.md`) — summary, all files, endpoints, invariants preserved, parity result vs oracle, two-writers-on-one-sheet note, residual risks.
- [ ] **Step 3: Commit + deploy** per repo convention:

```bash
git add -A
git commit -m "feat(iqdash): full iq_dash port complete (all endpoints, ledger, insights)"
git push origin main    # GitHub Actions CI → git-ftp to Niagahoster
```
Expected: CI green; `https://salesconnect.tapwokspace.com/iqdash/` live.

---

## Self-Review

**Spec coverage:** every spec §4 endpoint has a task (data/company GET/POST/PATCH T4–6,12–14; cycles T13; record-obtained + pertek T14; ra T6; realizations T10–11; insights T8–9; health T6). Spec §5 invariants each have a dedicated assertion (available-derived + util-cap T5; util≤0 T5/T12; two obtained paths T14; ledger wins T5; pending gate T5; realized=PIB T10; anti-wipe/RAW/string-cast T12). §6 frontend reuse T3. §7 config/wiring T1. §8 parity oracle T0 + assertions in T5/T8. §9 staging = the five stages. No gaps.

**Placeholder scan:** no TBD/TODO; each logic task carries real test code and names the exact source function+line to port. The mechanical 1:1 translations (insights.js, patchCompanySheets) reference the on-disk source rather than reproducing 141 KB inline — deliberate for a port; interfaces + invariants + tests are fully specified.

**Type consistency:** tables array shape (`companies,cycles,cycleProducts,stats,revisions,lots,realizations,aliases,products` + directory/companyProducts/reapply/ra/pendingMeta/pertekRelease) is defined in T4 and reused verbatim by T5, T8, T9. Payload keys (`spi,pending,ra,products,productAliases,companyDirectory,lastUpdate`) fixed in T4. Insights keys (`q1_…q8_…,realization`) fixed in T8 and consumed in T9. Function names (`iq_build_payload`, `iq_apply_ledger`, `iq_recompute_util_from_lots`, `iq_patch_company`, `iq_ins_all`) are consistent across tasks.
