# Sales Pulse Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the standalone `sales_pulse` app into a SalesConnect PHP module at `salesconnect/salespulse/`, reusing both frontends and the existing Google Spreadsheet, with an open (no-login) REST API matching the original JSON contract.

**Architecture:** A single-folder module (like `taskflow/`/`scot/`). `index.php` serves `executive.html`, `dashboard.php` serves `index.html`; `api.php` implements 8 endpoints. Pure coercion/schema/lock helpers live in `salespulse_util.php`; the consolidation engine + its helpers in `consolidation.php`. Whole-tab writes use two new additive methods on the shared `lib/GoogleSheets.php` (`clearValues`, `replaceTable`) plus an UNFORMATTED read option. Writes are serialized with an `flock` file lock.

**Tech Stack:** PHP >= 8.0 (curl + openssl), Google Sheets API v4 (via the existing `GoogleSheets` class), vanilla JS frontends reused (Chart.js + SheetJS via CDN, unchanged).

**Source of truth for the port:** the original app at `../sales_pulse/` — `server.js` (endpoints + consolidation) and `sheetsRepo.js` (schema + coercion + replaceTable). Cited by line number throughout. Port behavior EXACTLY; the tests in this plan lock it.

## Global Constraints

- PHP 8.0+ only; no Composer/vendor libraries. Only curl/openssl/core PHP.
- Reads use `valueRenderOption=UNFORMATTED_VALUE`; writes use `valueInputOption=RAW`. Never change write option to USER_ENTERED.
- Module access is OPEN — neither `index.php` nor `dashboard.php` includes `lib/guard.php`.
- Reuse spreadsheet `1kSLpY3KAg71fc8tB3zlNh4nigJBb3mc4yhfRfqhDfC4`; the 7 tabs already exist/populated. No migration.
- Monetary outputs are MIDR (IDR / 1e6) exactly where the original divides by 1e6. Rounding matches the original `.toFixed(3)`/`.toFixed(4)` calls.
- The margin=GROSS-all-legs vs revenue/volume=EXTERNAL-legs-only asymmetry is intentional — preserve it.
- Whole-tab write pattern: read-all → filter/merge in memory → `replaceTable` (clear range + write header+rows). Autoincrement `max(id)+1` computed inside the lock for `plan_revisions`,`budget_lines`,`ps_items`.
- Frontend calls API via RELATIVE `api/...`. Cross-page links become `index.php`/`dashboard.php`.
- Secrets (`config.php`, `secure/`) stay gitignored. Deploy via existing git-ftp CI on push to `main`.

## File structure

```
salesconnect/
  index.php                       # MODIFY: add 5th landing card → salespulse/
  config.php / config.sample.php  # MODIFY: add spreadsheets['salespulse']
  lib/GoogleSheets.php            # MODIFY: add getValues unformatted opt, clearValues, replaceTable
  salespulse/
    index.php                     # CREATE: serve executive.html (no guard)
    dashboard.php                 # CREATE: serve index.html (no guard)
    api.php                       # CREATE: 8 endpoints
    consolidation.php             # CREATE: /api/data engine + helpers
    salespulse_util.php           # CREATE: schema, coercion, lock, autoincrement
    company-rank-exclusions.json  # CREATE: copied from ../sales_pulse/config/
    .htaccess                     # CREATE: rewrite api/*
    tests/
      util_test.php               # CREATE: coercion + colLetter
      consolidation_test.php      # CREATE: helpers + a fixture consolidation case
    assets/                       # CREATE: copied+edited frontend
  logs/add-salespulse-module_2026-07-20_log.md
```

---

### Task 1: Config wiring + landing card

**Files:** Modify `config.php`, `config.sample.php`, `index.php`.

**Interfaces:** Produces `sc_config()['spreadsheets']['salespulse']` (string).

- [ ] **Step 1:** In `config.php`, inside `spreadsheets`, add:
```php
'salespulse' => '1kSLpY3KAg71fc8tB3zlNh4nigJBb3mc4yhfRfqhDfC4',
```
- [ ] **Step 2:** Mirror in `config.sample.php`:
```php
'salespulse' => 'YOUR_SALESPULSE_SPREADSHEET_ID',
```
- [ ] **Step 3:** In `index.php`, add a 5th card after the scot card (match existing card markup):
```php
      <a class="card" href="salespulse/">
        <div class="icon">📈</div>
        <h2>Sales Pulse</h2>
        <p>Dashboard sales eksekutif: budget vs actual, margin, konsolidasi PS.</p>
      </a>
```
- [ ] **Step 4:** Lint: `php -l index.php && php -l config.php && php -l config.sample.php` → all "No syntax errors detected".
- [ ] **Step 5:** Commit (config.php is gitignored, won't stage — expected):
```
git add index.php config.sample.php docs/superpowers/plans/2026-07-20-salespulse-module.md
git commit -m "feat(salespulse): config wiring + landing card"
```

---

### Task 2: Shared-lib write primitives (additive)

**Files:** Modify `lib/GoogleSheets.php`.

**Interfaces:** Produces
- `getValues($id,$range,$useCache=true,$unformatted=false)` — adds `?valueRenderOption=UNFORMATTED_VALUE` when `$unformatted`.
- `clearValues($id,$range): void` — POST `.../values/<range>:clear`; clears read cache.
- `replaceTable($id,$tab,array $matrix): void` — `clearValues($id, "$tab!A1:<lastColLetter>")` then `updateRange($id,"$tab!A1",$matrix)`. `$matrix` = header row + data rows (already serialized). Uses existing `colLetter`.

**Do NOT change** existing method behavior; only add the optional param + two methods.

- [ ] **Step 1:** Edit `getValues` to accept `$unformatted=false`; when true, append `?valueRenderOption=UNFORMATTED_VALUE` to the values URL and include it in the cache key. Existing callers (no 4th arg) are unaffected (formatted read, same cache key as before).

```php
public function getValues($id, $range, $useCache = true, $unformatted = false) {
    $key = 'gv|' . $id . '|' . $range . ($unformatted ? '|u' : '');
    if ($useCache) { $c = $this->cacheGet($key); if ($c !== null) return $c; }
    $url = $this->baseUrl($id) . '/values/' . rawurlencode($range);
    if ($unformatted) $url .= '?valueRenderOption=UNFORMATTED_VALUE';
    $res  = $this->api('GET', $url);
    $vals = $res['values'] ?? [];
    if ($useCache) $this->cachePut($key, $vals);
    return $vals;
}
```

- [ ] **Step 2:** Add `clearValues` and `replaceTable`:

```php
public function clearValues($id, $range) {
    $url = $this->baseUrl($id) . '/values/' . rawurlencode($range) . ':clear';
    $r = $this->api('POST', $url, new stdClass());
    $this->cacheClear();
    return $r;
}

/** Overwrite an entire tab: clear A1:<lastCol> then write $matrix (header + rows). */
public function replaceTable($id, $tab, array $matrix, $lastColCount = null) {
    $cols = $lastColCount ?: (count($matrix[0] ?? []) ?: 1);
    $this->clearValues($id, $tab . '!A1:' . $this->colLetterPublic($cols));
    $this->updateRange($id, $tab . '!A1', $matrix);
}
```
Add a public wrapper for the existing private `colLetter` (or make `colLetter` public):
```php
public function colLetterPublic($n) { return $this->colLetter($n); }
```

- [ ] **Step 3:** Lint: `php -l lib/GoogleSheets.php` → "No syntax errors detected".
- [ ] **Step 4:** Confirm existing modules unaffected — the 3-arg `getValues`/`table` calls in cil/taskflow/scot still resolve (default `$unformatted=false`). Grep: `grep -rn "->getValues(" cil taskflow scot lib` and eyeball none pass a 4th arg.
- [ ] **Step 5:** Commit: `git add lib/GoogleSheets.php` → `git commit -m "feat(lib): add clearValues + replaceTable + unformatted read (for salespulse)"`

---

### Task 3: `salespulse_util.php` — schema, coercion, lock, autoincrement (TDD)

**Files:** Create `salespulse/salespulse_util.php`, `salespulse/tests/util_test.php`.

**Interfaces:** Produces
- `SP_TABLES` (const): tab → array of `[colName, type]`, exact order from `sheetsRepo.js:24-86`.
- `SP_AUTOID` (const): `['plan_revisions'=>'id','budget_lines'=>'id','ps_items'=>'id']`.
- `sp_num($v): float` — JS `num` (parseFloat, NaN→0).
- `sp_prod_key($v): string` — JS `prodKey` (trim; ''→'Projects').
- `sp_parse_cell($value,$type)` — JS `parseCell` (`sheetsRepo.js:142-163`): ''/null → (`json`?[]:null); int/float lenient parse (NaN→null); json decode (fail→[]); date/string → string.
- `sp_serialize_cell($value,$type)` — JS `serializeCell` (`sheetsRepo.js:165-180`): ''/null → ''; json → JSON string; int/float → number (NaN→''); date → first 10 chars; string → as-is.
- `sp_get_table(GoogleSheets $gs,$sid,$name): array` — read tab UNFORMATTED, map by header (fallback schema order), coerce; skip blank rows. Port `getTable` (`sheetsRepo.js:195-230`).
- `sp_replace_table(GoogleSheets $gs,$sid,$name,array $rows): array` — assign `max+1` autoIds, serialize to matrix (header + rows), call `$gs->replaceTable`. Port `replaceTable` (`sheetsRepo.js:237-273`). Returns the rows with ids assigned.
- `sp_with_lock(callable $fn)` — flock on `cache/salespulse.lock` (identical shape to scot's `scot_with_lock`).

- [ ] **Step 1: Write the failing test** `salespulse/tests/util_test.php`:

```php
<?php
require __DIR__ . '/../salespulse_util.php';
$fail=0; function chk($n,$c){global $fail; echo ($c?"ok  - ":"FAIL- ").$n."\n"; if(!$c)$fail++;}

// parse_cell
chk('int parse', sp_parse_cell('12', 'int') === 12);
chk('int lenient', sp_parse_cell('12abc', 'int') === 12);
chk('int nonnum null', sp_parse_cell('abc', 'int') === null);
chk('empty int null', sp_parse_cell('', 'int') === null);
chk('float parse', sp_parse_cell(3.5, 'float') === 3.5);
chk('empty json is []', sp_parse_cell('', 'json') === []);
chk('json decode', sp_parse_cell('{"a":1}', 'json') === ['a'=>1]);
chk('string', sp_parse_cell(5, 'string') === '5');

// serialize_cell
chk('ser empty', sp_serialize_cell(null,'string') === '');
chk('ser int num', sp_serialize_cell('12','int') === 12);
chk('ser date slice', sp_serialize_cell('2026-07-08T00:00:00Z','date') === '2026-07-08');
chk('ser json', sp_serialize_cell(['a'=>1],'json') === '{"a":1}');

// num / prod_key
chk('num nan->0', sp_num('abc') === 0.0);
chk('num float', sp_num('12.5') === 12.5);
chk('prodkey blank', sp_prod_key('  ') === 'Projects');
chk('prodkey keep', sp_prod_key('HRC') === 'HRC');

echo $fail?"\n$fail FAILURES\n":"\nALL PASS\n"; exit($fail?1:0);
```

- [ ] **Step 2:** Run `php salespulse/tests/util_test.php` → FAIL (file missing).

- [ ] **Step 3: Write `salespulse/salespulse_util.php`.** Transcribe the schema from `sheetsRepo.js:24-86` into `SP_TABLES` (same column order/types). Implement the functions faithfully. Key details:
  - `sp_parse_cell`: int → `preg_match('/^\s*[-+]?\d+/',(string)$value,$m)? (int)$m[0] : null`; float → if leading numeric `preg_match('/^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/',...)` return `(float)$m[0]` else null; json → `json_decode($value,true)` (if already array, return as-is; on failure `[]`); date/string/default → `(string)$value`. Note: UNFORMATTED reads return real numbers for numeric cells, so the string-parse branches mostly guard string inputs.
  - `sp_serialize_cell`: int/float → `is_numeric($value)? ($value+0) : ''`; date → `substr((string)$value,0,10)`; json → array→`json_encode`, string→as-is; else string.
  - `sp_get_table`: `$vals = $gs->getValues($sid,$name,true,true)` (unformatted). Header row = `array_map('trim',$vals[0])`. Build `typeByCol`. `fieldByIdx[i] = isset(typeByCol[header[i]])? header[i] : null`. `useSchemaOrder = every null`. For each data row (skip if all cells empty): if schema-order, map by position; else map present headers + fill missing schema cols with (`json`?[]:null). Return list.
  - `sp_replace_table`: if tab has autoId, compute `max` of existing int ids, assign `++max` to rows with non-int id. Build `$matrix = [header]`, then each row → `array_map` serialize per column. Call `$gs->replaceTable($sid,$name,$matrix,count(cols))`. Return rows-with-ids.
  - `sp_with_lock`: copy scot's `scot_with_lock` but lock file `cache/salespulse.lock`.

- [ ] **Step 4:** Run `php salespulse/tests/util_test.php` → `ALL PASS`.
- [ ] **Step 5:** `php -l salespulse/salespulse_util.php`. Commit: `git add salespulse/salespulse_util.php salespulse/tests/util_test.php` → `git commit -m "feat(salespulse): schema + coercion + lock + autoincrement (tests)"`

---

### Task 4: `consolidation.php` — pure helpers (TDD)

**Files:** Create `salespulse/consolidation.php` (helpers portion), `salespulse/company-rank-exclusions.json`, `salespulse/tests/consolidation_test.php`.

**Interfaces:** Produces (ported from `server.js`, cited):
- `sp_norm_company($s)` (`:123-124`), `sp_internal_companies()` loader from the JSON (`:126-136`), `sp_is_internal_company($name)` (`:138-141`).
- `sp_pick_end_customer(array $headers)` (`:145-153`).
- `sp_norm_no_space($s)` (`:156`), `sp_end_customer_from_name($p)` (`:159-164`), `sp_project_family_key($p)` (`:168-170`).
- `sp_parse_project_sheet_date($value): array{date,monthIdx}` (`:172-206`).
- `sp_group_reduce(array $rows, callable $keyFn, callable $seed, callable $reducer): array` (`:210-218`).

- [ ] **Step 1:** Copy the config data:
```
mkdir -p salespulse
cp ../sales_pulse/config/company-rank-exclusions.json salespulse/company-rank-exclusions.json
```

- [ ] **Step 2: Write the failing test** `salespulse/tests/consolidation_test.php`:

```php
<?php
require __DIR__ . '/../consolidation.php';
$fail=0; function chk($n,$c){global $fail; echo ($c?"ok  - ":"FAIL- ").$n."\n"; if(!$c)$fail++;}

chk('norm strips PT', sp_norm_company('PT. Eka Mulia') === 'eka mulia');
chk('normNoSpace', sp_norm_no_space('Eka Mulia') === 'ekamulia');
chk('endCustomerFromName', sp_end_customer_from_name('Proj X - Del. Jul 2026 - Andalan Maju') === 'Andalan Maju');
chk('endCustomer none if no alpha', sp_end_customer_from_name('Proj - 123') === '');
chk('familyKey strips del', sp_project_family_key('Foo Bar - Del. Jul 2026 - X') === 'foo bar');

// parseProjectSheetDate: excel serial 46000 ~ 2025-12-...  d/m/y, iso
$d1 = sp_parse_project_sheet_date('08/07/2026');
chk('dmy date', $d1['date'] === '2026-07-08' && $d1['monthIdx'] === 6);
$d2 = sp_parse_project_sheet_date('2026-03-15');
chk('iso monthIdx', $d2['monthIdx'] === 2);
$d3 = sp_parse_project_sheet_date('');
chk('empty null', $d3['date'] === null && $d3['monthIdx'] === null);

// group_reduce
$g = sp_group_reduce([['k'=>'a','v'=>1],['k'=>'a','v'=>2],['k'=>'b','v'=>5]],
  fn($r)=>$r['k'], fn()=>['s'=>0], function(&$a,$r){$a['s']+=$r['v'];});
$byKey = []; foreach($g as $e){$byKey[$e['key']]=$e['acc']['s'];}
chk('group a=3', $byKey['a']===3); chk('group b=5', $byKey['b']===5);

// internal-company (depends on the copied JSON having group SPVs)
chk('is_internal returns bool', is_bool(sp_is_internal_company('PT Random External Co')));

echo $fail?"\n$fail FAILURES\n":"\nALL PASS\n"; exit($fail?1:0);
```

- [ ] **Step 3: Write the helpers** in `salespulse/consolidation.php`. READ `server.js:112-218` and port each function EXACTLY. Notes:
  - `sp_norm_company`: `preg_replace('/\bpt\.?\b/','', strtolower($s))` then `preg_replace('/[^a-z0-9]+/',' ',...)` then `trim`.
  - `sp_internal_companies`: `json_decode(file_get_contents(__DIR__.'/company-rank-exclusions.json'),true)`, map `companies[].companyName` through `sp_norm_company`, filter truthy. Cache in a static.
  - `sp_is_internal_company`: `$n=sp_norm_company($name); return $n!=='' && any(inm => $n===$inm || strpos($n,$inm)!==false)`.
  - `sp_pick_end_customer`: tally external first (`!sp_is_internal_company`), fallback all; return most-frequent `customer_name`, else first header's customer_name, else ''.
  - `sp_end_customer_from_name`: `explode(' - ',...)`; need ≥2 parts; tail = last; return `preg_match('/[a-z]/i',$tail)? trim($tail):''`.
  - `sp_project_family_key`: `preg_split('/\s-\s*del\b/i',$s)[0]`, trim, lowercase, collapse spaces.
  - `sp_parse_project_sheet_date`: replicate serial branch (`(serial-25569)*86400` seconds → `gmdate('Y-m-d')`, monthIdx = `(int)gmdate('n')-1`), the `d[/-]m[/-]y` regex branch, then generic `strtotime` fallback → gmdate; else `{date:null,monthIdx:null}`. Use UTC (`gmdate`) to match JS `getUTCMonth`/`toISOString`.
  - `sp_group_reduce`: Map by key; each group `['key'=>k,'acc'=>seed()]`; run reducer by reference; return `array_values`.

- [ ] **Step 4:** Run `php salespulse/tests/consolidation_test.php` → `ALL PASS`.
- [ ] **Step 5:** `php -l salespulse/consolidation.php`. Commit: `git add salespulse/consolidation.php salespulse/company-rank-exclusions.json salespulse/tests/consolidation_test.php` → `git commit -m "feat(salespulse): consolidation helpers + config (tests)"`

---

### Task 5: `consolidation.php` — the `/api/data` builder

**Files:** Modify `salespulse/consolidation.php` (add `sp_build_data`), extend `salespulse/tests/consolidation_test.php` with a fixture case.

**Interfaces:** Produces `sp_build_data(int $year, array $actualsAll, array $plansAll, array $budgetAll, array $headersAll, array $itemsAll): array` returning `['BUDGET'=>...,'ACTUAL'=>...,'ACTUAL_PRODUCTS'=>...,'PLAN_REVISIONS'=>...,'PS_CHAINS'=>...,'QTY_DATA'=>...]` — the exact shape of `server.js` `GET /api/data` response body (`:236-518`).

- [ ] **Step 1: Write a fixture test** appended to `consolidation_test.php` that feeds small hand-built arrays and asserts the aggregation. Cover: budget month/product rollup to MIDR; ACTUAL margin = SUM(margin)/1e6 (all legs) while revenue counts only external-item legs; a 2-leg intercompany project (one internal SPV leg + one external leg with items) consolidates to ONE PS_CHAINS entry whose `customer` is the external one and whose volume/QTY counts the external leg only. Example skeleton (fill concrete numbers so expected values are exact):

```php
$headers = [
  ['ps_number'=>'A','dashboard_year'=>2026,'dashboard_month_idx'=>6,'project_name'=>'P1','customer_name'=>'PT Andalan Maju','subsidiary'=>'','margin'=>2000000,'sales_revenue'=>10000000,'product'=>'HRC','segment'=>'Flat','po_date'=>'2026-07-01','notes'=>'','currency'=>'IDR','fx_rate'=>1,'net_margin_native'=>2000000,'margin_percentage'=>20],
  ['ps_number'=>'B','dashboard_year'=>2026,'dashboard_month_idx'=>6,'project_name'=>'P1','customer_name'=>'PT <an internal SPV from the json>','subsidiary'=>'','margin'=>500000,'sales_revenue'=>9000000,'product'=>'HRC','segment'=>'Flat','po_date'=>'2026-07-02','notes'=>'','currency'=>'IDR','fx_rate'=>1,'net_margin_native'=>500000,'margin_percentage'=>5],
];
$items = [ ['ps_number'=>'A','total_weight_kg'=>1000,'qty_val'=>10,'qty_unit'=>'pcs','material'=>'Coil','size'=>''] ];
$out = sp_build_data(2026, [], [], [], $headers, $items);
chk('ACTUAL margin jul = 2.5 (gross both legs)', abs($out['ACTUAL']['margin'][6] - 2.5) < 1e-9);
chk('ACTUAL revenue jul = 10 (external item leg only)', abs($out['ACTUAL']['revenue'][6] - 10.0) < 1e-9);
chk('one chain in jul', count($out['PS_CHAINS']['jul']) === 1);
chk('chain customer external', $out['PS_CHAINS']['jul'][0]['customer'] === 'PT Andalan Maju');
chk('chain volume MT via external leg', /* QTY_DATA jul totalWeight reflects 1000 KG */ count($out['QTY_DATA']['jul']) === 1);
```
(Pick a real internal-SPV name from `company-rank-exclusions.json` for leg B so `sp_is_internal_company` returns true.)

- [ ] **Step 2:** Run it → FAIL (`sp_build_data` missing).

- [ ] **Step 3: Port `sp_build_data`** into `consolidation.php` by translating `server.js:236-518` faithfully. Structure to reproduce, in order:
  1. Filter by year: `budgetRows`(budget.year==year), `headerRows`(dashboard_year==year), `psNumbersInYear`, `itemRows`, `actualRows`(sorted month_idx), `planRows`(sorted month_idx then id). (`:236-242`)
  2. `itemsByPs` map. (`:245-246`)
  3. `isExternalSaleLeg($h)` closure = `!sp_is_internal_company(customer_name) && any item total_weight_kg>0`. (`:254-256`)
  4. **BUDGET** (`:258-286`): month rollup → `margin[m]/1e6`,`revenue[m]/1e6`; product rollup → `products[p].volume[m]` (raw MT), `.revenue[m]/1e6`, `.margin[m]/1e6`.
  5. **ACTUAL** (`:288-312`): per month from headerRows: `count`, `margin+=num(margin)` (all legs), `revenue+=num(sales_revenue)` only if `isExternalSaleLeg`; month with count>0 → `margin[m]=sum/1e6`,`revenue[m]=sum/1e6`; then `plan[m]`,`notes[m]` from actualRows.
  6. **ACTUAL_PRODUCTS** (`:314-348`): group headerRows (valid month) by `month__prodKey(product)` → margin/1e6, revenue(external legs)/1e6; then physical volume per (month,prodKey) counting only non-internal legs with kg>0, `+= kg/1000`.
  7. **PLAN_REVISIONS** (`:350-363`): 12 arrays; per planRow push `{id,name,margin(num or ''),revenue(num or ''),notes,qty,ts}`.
  8. **PS_CHAINS + QTY_DATA** (`:365-507`): build `projectGroups` by `(project_name||ps_number)__month`; `familyChildren` map; then per group: `pickEndCustomer`, parallel-parent split (`customerSplit`) when internal + `endCustomerFromName` names ≥2 joined by `dan`; `totalMarginIDR`(all legs), `totalRevenueIDR`(external item legs), `totalPct` (`toFixed(4)`); `canonicalProduct` (most-frequent header.product, fallback 'Projects'); `segmentVal` (first header with segment); push PS_CHAINS entry (revenue/margin `/1e6` `toFixed(3)`, `subsidiaries[]` with fxRate/marginNative/marginIDR/marginMIDR/pct); QTY_DATA entry only if `totalKg>0` (numbers formatted `id-ID` locale — see gotcha).
  9. Return the 6 keys. (`:511-518`)

  **Gotchas:**
  - `MONTH_KEYS` = `['jan',...,'dec']`; `COLORS` array (`:112-113`) — copy verbatim; `colorIdx` increments only when a QTY_DATA row is pushed.
  - `toLocaleString('id-ID')` (`:488-501`): Indonesian grouping uses `.` as thousands separator (e.g. `1.000`). Implement `sp_id_number($n)` = `number_format($n, 0, ',', '.')` for integers, and for `qty_val` preserve as the original (it uses default locale number, typically integer-ish) — match `number_format` with `.` thousands / `,` decimal. Keep it simple: `number_format((float)$v, 0, ',', '.')` for the KG/qty display strings, matching the JS integer locale output.
  - `.toFixed(n)` → `round($x, n)` then the value is a float; the frontend treats these as numbers. Use `round(...,3)`/`round(...,4)`.
  - Sorting `orderedHeaders` (`:371-376`): po_date asc with null→last (use `'￿'`-equivalent: treat null/'' as a value that sorts last), then ps_number asc.
  - JSON output must not reorder object keys in a way the frontend depends on (it reads by key, so order is fine).

- [ ] **Step 4:** Run the consolidation test → `ALL PASS`. Adjust the fixture's expected numbers to the exact ported behavior if a rounding detail differs, but do NOT change the logic to match a wrong expectation — verify against `server.js` semantics.
- [ ] **Step 5:** `php -l salespulse/consolidation.php`. Commit: `git add salespulse/consolidation.php salespulse/tests/consolidation_test.php` → `git commit -m "feat(salespulse): /api/data consolidation builder (fixture test)"`

---

### Task 6: `api.php` — routing + all 8 endpoints

**Files:** Create `salespulse/api.php`.

**Interfaces:** Consumes `salespulse_util.php`, `consolidation.php`, `GoogleSheets`, lib helpers. Produces the 8 endpoints (§4 of the spec).

- [ ] **Step 1: Create `salespulse/api.php`.** Structure like scot/api.php: require utils, `$cfg`,`$SID=spreadsheets['salespulse']`,`$gs`, parse `sc_route()` into `$parts`, `switch`, `catch (Throwable $e)`. Port each handler from `server.js`, cited:
  - `GET data` (`:223-523`): parse `year` (default 2026); load the 5 tabs via `sp_get_table`; `json_out(sp_build_data(...))`. Set header `Cache-Control: private, max-age=5, must-revalidate` before output.
  - `GET products` (`:528-547`): load `products`+`product_aliases`; shape `{products:[...sorted...], aliases:{alias:canonical}}`; `Cache-Control: public, max-age=300`.
  - `POST budget/import` (`:554-600`): validate `{year:int, lines:array}` (400 on bad / empty); inside `sp_with_lock`: validate products against master (throw → 500 with message), `kept = budget where year!=Y`, upsert-sum lines per `month__segment__product`, `sp_replace_table('budget_lines',[...kept,...new])`; return `{success:true,year,rowsInserted}`.
  - `DELETE budget/:year` (`:605-622`): inside lock: kept=year!=Y; replace; `{success:true,year,rowsDeleted}`.
  - `POST data` (`:627-678`): body `{ACTUAL,PLAN_REVISIONS,year}` (400 if missing ACTUAL/PLAN_REVISIONS); inside lock: rebuild 12 monthly_actuals for year (keep others) + rebuild plan_revisions for year (keep others); `{success:true}`.
  - `POST project-sheet` (`:706-813`): body `{header,items}` (400 if no header.psNumber); inside lock: `sp_parse_project_sheet_date(header.poDate)`→monthIdx/psYear; alias detect product (longest-first substring over projectName + first 5 items material/size) + `segMap` segment (copy map `:739-748` verbatim); upsert ps_headers by ps_number (preserve notes/created_at when existing); replace this PS's ps_items; `sp_reaggregate_actuals`; return `{success:true,message,monthIdx,year,mMIDR,rMIDR}`.
  - `DELETE project-sheet/:psNumber` (`:818-847`): urldecode; inside lock: find header (404 if none), remove header + its items, reaggregate that month; `{success:true,message,monthIdx,year,remaining}`.
  - `GET health` (`:850-857`): try a cheap `$gs->headers($SID,'products')` (or a values read) → `{ok:true}`; on failure `{ok:false,error}` 503.
  - Add `sp_reaggregate_actuals(array &$actualsAll, array $headersAll, int $monthIdx, int $psYear): array` — port `server.js:682-701` (put it in `consolidation.php` or `api.php`; if in consolidation.php, add a small offline test). Returns `['mMIDR'=>..,'rMIDR'=>..,'remaining'=>..]` and mutates `$actualsAll`.

  Route parsing: `data`,`products`,`health` are single-segment; `budget/import`, `budget/:year`, `project-sheet`, `project-sheet/:psNumber` — dispatch on `$parts[0]` and method + presence of `$parts[1]`.

- [ ] **Step 2:** `php -l salespulse/api.php` → clean. (Live endpoints can't be tested without network + shared sheet; lint is the gate here.)
- [ ] **Step 3:** Commit: `git add salespulse/api.php salespulse/consolidation.php` → `git commit -m "feat(salespulse): REST api — 8 endpoints"`

---

### Task 7: Frontend (copy + edits) + shells + .htaccess

**Files:** Create `salespulse/index.php`, `salespulse/dashboard.php`, `salespulse/.htaccess`, `salespulse/assets/*`.

- [ ] **Step 1:** Copy frontend:
```
mkdir -p salespulse/assets
cp -r ../sales_pulse/public/* salespulse/assets/
ls salespulse/assets
```
Expect: `assets css executive.html index.html js`.

- [ ] **Step 2:** Relative API base across the JS + inline scripts:
```
sed -i "s#/api/#api/#g" salespulse/assets/js/*.js salespulse/assets/executive.html salespulse/assets/index.html
grep -rn "'/api/\|\"/api/\|\`/api/" salespulse/assets/ || echo "no absolute /api/ left"
```
Then READ `executive.html` and `index.html` to fix cross-page links: `/executive`/`/` → `index.php`, `/dashboard` → `dashboard.php` (search for `href="/dashboard"`, `location='/dashboard'`, etc.). Also ensure local asset refs (`js/…`, `css/…`, `assets/…`) resolve under the module — the copied HTML uses relative `js/…`/`css/…` already, which work because the shells echo the HTML from `assets/…`; if any ref is root-absolute (`/js/…`), make it relative.

- [ ] **Step 3:** Create the shells (no guard):
```php
// salespulse/index.php
<?php echo file_get_contents(__DIR__ . '/assets/executive.html');
```
```php
// salespulse/dashboard.php
<?php echo file_get_contents(__DIR__ . '/assets/index.html');
```
Because the shells serve HTML whose relative asset paths (`js/app.js`, `css/style.css`) are resolved by the browser against `/salespulse/`, the copied files must sit at `salespulse/assets/…` AND be reachable at `/salespulse/js/…`? NO — relative paths resolve against the PAGE url `/salespulse/` → `/salespulse/js/app.js`, but files are at `/salespulse/assets/js/app.js`. FIX: either (a) prefix asset refs in the HTML with `assets/`, or (b) place the shells to output a `<base href="assets/">`. Choose (a): `sed -i 's#\(src="\)\(js/\)#\1assets/\2#g; s#\(href="\)\(css/\)#\1assets/\2#g' salespulse/assets/executive.html salespulse/assets/index.html` and similarly for `assets/` image refs → `assets/assets/`. Verify by grep that every local `src`/`href` begins with `assets/` (or is a full URL).

- [ ] **Step 4:** `.htaccess`: `cp taskflow/.htaccess salespulse/.htaccess` (path-relative rewrite; confirm).

- [ ] **Step 5:** Verify: `grep -rn "'/api/\|\"/api/" salespulse/assets/` → none. `php -l salespulse/index.php && php -l salespulse/dashboard.php` → clean.

- [ ] **Step 6:** Commit: `git add salespulse/index.php salespulse/dashboard.php salespulse/.htaccess salespulse/assets` → `git commit -m "feat(salespulse): reuse both frontends (relative API, module shells)"`

---

### Task 8: Changelog + full sweep

**Files:** Create `logs/add-salespulse-module_2026-07-20_log.md`.

- [ ] **Step 1:** Write the changelog (follow `logs/README.md`): open access, reused spreadsheet `1kSLpY…`, both frontends, consolidation ported from source + tests, new lib primitives `clearValues`/`replaceTable`, flock lock, Excel/FX stays client-side, prerequisite = share the spreadsheet as Editor with `salesconnect@eagle1-492706.iam.gserviceaccount.com`.
- [ ] **Step 2:** Full lint: `for f in salespulse/index.php salespulse/dashboard.php salespulse/api.php salespulse/consolidation.php salespulse/salespulse_util.php lib/GoogleSheets.php; do php -l "$f"; done` → all clean.
- [ ] **Step 3:** Re-run tests: `php salespulse/tests/util_test.php && php salespulse/tests/consolidation_test.php` → both `ALL PASS`.
- [ ] **Step 4:** Secret/paths check: `git ls-files salespulse | grep -iE 'config\.php|service_account'` → none; `grep -rn "'/api/\|\"/api/" salespulse/assets/` → none.
- [ ] **Step 5:** Commit: `git add logs/add-salespulse-module_2026-07-20_log.md` → `git commit -m "docs(salespulse): changelog"`

---

## Post-implementation (manual, on host)

1. Share spreadsheet `1kSLpY3KAg71fc8tB3zlNh4nigJBb3mc4yhfRfqhDfC4` as Editor with `salesconnect@eagle1-492706.iam.gserviceaccount.com`.
2. Add `'salespulse' => '1kSLpY…'` to `config.php` **on the host** (config.php is not deployed).
3. Deploy: push `main` → CI git-ftp (or local `git ftp push`). Smoke-test: `/salespulse/` (executive) + `/salespulse/dashboard.php` render; `GET api/data?year=2026` returns the nested shape; `GET api/products` works; a budget import + a project-sheet upsert on test data round-trip and re-aggregate.

## Self-review notes (coverage)

- Spec §3 schema/coercion → Task 3. §4 endpoints → Task 6 (+ builder Task 5). §5 consolidation → Tasks 4-5. §6 lib primitive → Task 2. §7 concurrency → `sp_with_lock` (Tasks 3,6). §8 frontend → Task 7. §9 config/deploy/changelog → Tasks 1, 8 + Post-implementation.
- Fidelity risk (§11) mitigated: helpers ported with unit tests; builder ported from cited source with a fixture test.
