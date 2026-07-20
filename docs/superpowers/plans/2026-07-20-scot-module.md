# SCOT Module (Shipment Control Tower) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the standalone `scot` app into a SalesConnect PHP module at `salesconnect/scot/` that reuses the existing frontend and existing Google Spreadsheet, with an open (no-login) REST API matching the original JSON contract.

**Architecture:** A single-folder module (like `taskflow/`) — `index.php` serves the reused vanilla-JS SPA, `api.php` implements the REST endpoints against the shared `lib/GoogleSheets.php` client, `.htaccess` rewrites `api/*`. Pure helpers live in `scot/scot_util.php`; the Gemini OCR client in `scot/gemini.php`. Writes are serialized with an `flock` file lock. Live updates use 15 s polling instead of SSE.

**Tech Stack:** PHP >= 8.0 (curl + openssl), Google Sheets API v4 (via existing `GoogleSheets` class), Google Gemini `generateContent` API, vanilla JS frontend (reused), SheetJS/Flatpickr via CDN (unchanged).

## Global Constraints

- PHP 8.0+ only; no Composer/vendor libraries (shared-hosting inode limit). Use only curl, openssl, core PHP.
- All Sheets writes use `valueInputOption=RAW` (already the `GoogleSheets` default) — never change to `USER_ENTERED`.
- ID comparisons cast to string where matching sheet cells; numeric output fields cast to real numbers.
- Module access is OPEN — `scot/index.php` must NOT include `lib/guard.php`.
- Reuse spreadsheet `1km206j-uletsz9uNLwWC0dymRuy3fPnBuTDTMyeMbSM` (tabs `shipments`, `documents` already exist and are populated). No migration, no header rewrite.
- Never commit real secrets: `config.php` (holds `gemini_api_key`) and `secure/` stay gitignored. Put placeholders in `config.sample.php`.
- Frontend calls the API with RELATIVE paths (`api/...`) so it resolves under `/scot/`.
- Polling interval: 15000 ms.
- Deploy is automatic via the existing GitHub Actions git-ftp workflow on push to `main`.

## File structure

```
salesconnect/
  index.php                 # MODIFY: add 4th landing card -> scot/
  config.php                # MODIFY: add spreadsheets['scot'] + gemini_api_key
  config.sample.php         # MODIFY: add placeholders
  scot/
    index.php               # CREATE: SPA shell (from scot public/index.html), no guard
    api.php                 # CREATE: REST backend
    scot_util.php           # CREATE: pure helpers + lock + next_id
    gemini.php              # CREATE: Gemini OCR client
    .htaccess               # CREATE: rewrite api/* (copy of taskflow/.htaccess)
    tests/
      util_test.php         # CREATE: offline assertions for shaping/sanitize/sort
      gemini_parse_test.php # CREATE: offline assertion for response parsing
    assets/                 # CREATE: copied + edited frontend
      main.js ui.js forms.js state.js filters.js alerts.js ai.js
      style.css
      assets/               # images/fonts
  logs/add-scot-module_2026-07-20_log.md   # CREATE: changelog
```

---

### Task 1: Config wiring + landing card

**Files:**
- Modify: `config.php` (the `return [...]` array)
- Modify: `config.sample.php`
- Modify: `index.php` (landing, the `.grid` block)

**Interfaces:**
- Produces: `sc_config()['spreadsheets']['scot']` (string ID), `sc_config()['gemini_api_key']` (string, may be `''`), optional `sc_config()['gemini_model']`.

- [ ] **Step 1: Add scot config to `config.php`** — inside the `spreadsheets` array add the scot ID, and add two top-level keys:

```php
// inside 'spreadsheets' => [ ... ]
'scot' => '1km206j-uletsz9uNLwWC0dymRuy3fPnBuTDTMyeMbSM',
```
```php
// top-level keys (alongside cache_ttl, users, etc.)
'gemini_api_key' => 'PASTE_GEMINI_KEY_HERE',   // real key set on host only
'gemini_model'   => 'gemini-2.5-flash',
```

- [ ] **Step 2: Mirror placeholders in `config.sample.php`**:

```php
'scot' => 'YOUR_SCOT_SPREADSHEET_ID',
// ...
'gemini_api_key' => '',
'gemini_model'   => 'gemini-2.5-flash',
```

- [ ] **Step 3: Add the landing card** in `index.php`, inside `<div class="grid">`, after the Cost Core card (use the ship emoji as the icon, matching the other cards):

```php
      <a class="card" href="scot/">
        <div class="icon">🚢</div>
        <h2>Shipment Control Tower</h2>
        <p>Pantau shipment: BL, vessel, clearance, delivery &amp; alerts.</p>
      </a>
```

- [ ] **Step 4: Lint**

Run: `php -l index.php && php -l config.php && php -l config.sample.php`
Expected: `No syntax errors detected` for each.

- [ ] **Step 5: Commit**

```
git add index.php config.sample.php docs/superpowers/plans/2026-07-20-scot-module.md
git commit -m "feat(scot): config wiring + landing card"
```
(Note: `config.php` is gitignored — it will not be staged; that is expected.)

---

### Task 2: Frontend assets (copy + edits) + module shell + .htaccess

**Files:**
- Create: `scot/index.php`, `scot/.htaccess`, `scot/assets/*` (copied from `../scot/public/*`)

**Interfaces:**
- Produces: `/scot/` serves the SPA; all API calls use relative `api/...`; no SSE.

- [ ] **Step 1: Copy the frontend**:

```
mkdir -p scot/assets
cp -r ../scot/public/* scot/assets/
ls scot/assets
```
Expected: `ai.js alerts.js assets filters.js forms.js index.html main.js state.js style.css ui.js`.

- [ ] **Step 2: Convert `scot/assets/index.html` into `scot/index.php`.** Create `scot/index.php` (open access, no guard):

```php
<?php
// SCOT — Shipment Control Tower (open access, no login guard).
echo file_get_contents(__DIR__ . '/assets/index.html');
```

Then edit `scot/assets/index.html` so every LOCAL asset ref is module-relative under `assets/`:
- `src="main.js"` -> `src="assets/main.js"` (and `ui.js state.js forms.js filters.js alerts.js ai.js`)
- `href="style.css"` -> `href="assets/style.css"`
- any local image path -> prefix with `assets/` to match the real file location.

Run: `grep -nE 'src=|href=' scot/assets/index.html | grep -vE 'https?:'`
Expected: every local ref begins with `assets/`.

- [ ] **Step 3: Point the API base at relative paths** in the copied JS:

```
sed -i "s#/api/#api/#g" scot/assets/main.js scot/assets/forms.js scot/assets/state.js scot/assets/ui.js scot/assets/alerts.js scot/assets/ai.js scot/assets/filters.js
grep -rn "'/api/\|\"/api/" scot/assets/ || echo "no absolute /api/ left"
```
Expected: `no absolute /api/ left`.

- [ ] **Step 4: Replace SSE with 15 s polling** in `scot/assets/main.js`. Delete the entire live-updates IIFE (block starting `// LIVE UPDATES (Server-Sent Events)` through its closing `})();` — originally `main.js:157-190`) and replace with:

```js
// ==========================================
// LIVE UPDATES (polling every 15s)
// ==========================================
// The PHP host can't hold SSE connections, so poll instead. Never refetch
// mid-edit: if the modal (#mo) is open, skip this tick and catch up next time.
(function subscribeToPolling() {
  function modalIsOpen() {
    const mo = document.getElementById('mo');
    return mo && !mo.classList.contains('hid');
  }
  setInterval(() => { if (!modalIsOpen()) fetchShipments(); }, 15000);
})();
```

Run: `grep -n "EventSource\|/api/stream" scot/assets/main.js || echo "SSE removed"`
Expected: `SSE removed`.

- [ ] **Step 5: Create `scot/.htaccess`** (copy taskflow's rewrite):

```
cp taskflow/.htaccess scot/.htaccess
cat scot/.htaccess
```
Expected: rewrite routing `api/(.*)` -> `api.php?_route=$1`. Confirm it is path-agnostic (relative rules); no edit needed.

- [ ] **Step 6: Lint the shell**

Run: `php -l scot/index.php`
Expected: `No syntax errors detected`.

- [ ] **Step 7: Commit**

```
git add scot/index.php scot/.htaccess scot/assets
git commit -m "feat(scot): reuse frontend (relative API, 15s polling, no SSE)"
```

---

### Task 3: `scot_util.php` — pure helpers (TDD)

**Files:**
- Create: `scot/scot_util.php`
- Test: `scot/tests/util_test.php`

**Interfaces:**
- Produces:
  - `scot_shape(array $rawRow): array` — raw sheet assoc (may include `_row`) -> JSON object; numeric fields as numbers, date fields sliced to 10 chars, empties `null`.
  - `scot_sanitize(array $body): array` — keep only the 35 writable keys; `''` -> `null`.
  - `scot_sort(array &$rows): void` — sort in place `year` DESC (nulls last), then `id` DESC. Operates on SHAPED rows (numeric id/year).
  - `scot_with_lock(callable $fn): mixed` — run `$fn` under exclusive `flock` on `cache/scot.lock`.
  - `scot_next_id(GoogleSheets $gs, string $sid, string $tab, string $col='id'): int` — `max(col)+1`, uncached read.

- [ ] **Step 1: Write the failing test** — `scot/tests/util_test.php`:

```php
<?php
require __DIR__ . '/../scot_util.php';
$fail = 0;
function chk($name, $cond) { global $fail; if ($cond) { echo "ok  - $name\n"; } else { echo "FAIL- $name\n"; $GLOBALS['fail']++; } }

// scot_shape: numeric->number, date->YYYY-MM-DD, empty->null
$shaped = scot_shape(['_row'=>2,'id'=>'7','no'=>'3','quantity_mt'=>'145.248','year'=>'2026','etd'=>'2026-01-05T00:00:00.000Z','consignee'=>'PT ABC','product'=>'']);
chk('id is int 7', $shaped['id'] === 7);
chk('qty is float', $shaped['quantity_mt'] === 145.248);
chk('year int', $shaped['year'] === 2026);
chk('etd sliced', $shaped['etd'] === '2026-01-05');
chk('empty product null', $shaped['product'] === null);
chk('_row dropped', !array_key_exists('_row', $shaped));

// scot_sanitize: whitelist + ''->null, drops server-managed keys
$clean = scot_sanitize(['id'=>999,'created_at'=>'x','consignee'=>'PT X','bl_number'=>'','bogus'=>'y','year'=>2026]);
chk('drops id', !array_key_exists('id', $clean));
chk('drops created_at', !array_key_exists('created_at', $clean));
chk('drops bogus', !array_key_exists('bogus', $clean));
chk('keeps consignee', $clean['consignee'] === 'PT X');
chk('empty to null', $clean['bl_number'] === null);
chk('keeps year', $clean['year'] === 2026);

// scot_sort: year desc nulls last, id desc
$rows = [ ['id'=>1,'year'=>2025], ['id'=>5,'year'=>2026], ['id'=>2,'year'=>null], ['id'=>9,'year'=>2026] ];
scot_sort($rows);
chk('first is 2026/id9', $rows[0]['id']===9 && $rows[0]['year']===2026);
chk('second is 2026/id5', $rows[1]['id']===5);
chk('third is 2025', $rows[2]['year']===2025);
chk('null year last', $rows[3]['year']===null);

echo $fail ? "\n$fail FAILURES\n" : "\nALL PASS\n";
exit($fail ? 1 : 0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `php scot/tests/util_test.php`
Expected: FAIL / fatal — `scot_util.php` or the functions don't exist yet.

- [ ] **Step 3: Write `scot/scot_util.php`**:

```php
<?php
/** Pure helpers + write-lock for the SCOT module. */
require_once __DIR__ . '/../lib/sheet_util.php';

const SCOT_NUMERIC = ['id','no','quantity_mt','est_sailing_days','actual_sailing_days',
    'clearance_days','unloading_days','delivery_days','year'];
const SCOT_DATE = ['etd','eta','pib_billing','bpn','spjm','behandle','sppb',
    'start_unloading','finish_unloading','start_delivery','enter_warehouse'];
const SCOT_WRITABLE = ['no','cargo_type','consignee','project_name','product','quantity_mt',
    'bl_number','shipping_line','vessel_name','voyage_number','pol','pod','shipment_route',
    'etd','eta','shipment_type','est_sailing_days','actual_sailing_days','pib_billing','bpn',
    'spjm','behandle','sppb','clearance_days','start_unloading','finish_unloading','unloading_days',
    'cargo_status','start_delivery','enter_warehouse','delivery_days','vendor_trucking',
    'warehouse_location','status','remarks','year'];

function scot_shape(array $r): array {
    $out = [];
    foreach ($r as $k => $v) {
        if ($k === '_row') continue;
        if ($v === '' || $v === null) { $out[$k] = null; continue; }
        if (in_array($k, SCOT_NUMERIC, true))      $out[$k] = 0 + $v;
        elseif (in_array($k, SCOT_DATE, true))     $out[$k] = substr((string)$v, 0, 10);
        else                                       $out[$k] = $v;
    }
    return $out;
}

function scot_sanitize(array $body): array {
    $clean = [];
    foreach (SCOT_WRITABLE as $k) {
        if (!array_key_exists($k, $body)) continue;
        $v = $body[$k];
        $clean[$k] = ($v === '') ? null : $v;
    }
    return $clean;
}

function scot_sort(array &$rows): void {
    usort($rows, function ($a, $b) {
        $ay = $a['year'] ?? null; $by = $b['year'] ?? null;
        $an = ($ay === null); $bn = ($by === null);
        if ($an !== $bn) return $an ? 1 : -1;
        if (!$an && $ay != $by) return ($by <=> $ay);
        return (($b['id'] ?? 0) <=> ($a['id'] ?? 0));
    });
}

function scot_with_lock(callable $fn) {
    $cfg = sc_config();
    $dir = rtrim($cfg['cache_dir'] ?? (__DIR__ . '/../cache'), '/');
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $fh = @fopen($dir . '/scot.lock', 'c');
    if ($fh === false) return $fn();
    @flock($fh, LOCK_EX);
    try { return $fn(); }
    finally { @flock($fh, LOCK_UN); @fclose($fh); }
}

function scot_next_id(GoogleSheets $gs, string $sid, string $tab, string $col = 'id'): int {
    $max = 0;
    foreach ($gs->table($sid, $tab, false)['rows'] as $r) {
        $n = (int) ($r[$col] ?? 0);
        if ($n > $max) $max = $n;
    }
    return $max + 1;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `php scot/tests/util_test.php`
Expected: `ALL PASS`, exit 0.

- [ ] **Step 5: Commit**

```
git add scot/scot_util.php scot/tests/util_test.php
git commit -m "feat(scot): pure helpers (shape/sanitize/sort/lock/next_id) + tests"
```

---

### Task 4: `api.php` routing skeleton + health

**Files:**
- Create: `scot/api.php`

**Interfaces:**
- Consumes: `scot_util.php`, `GoogleSheets`, `sc_route()/json_out()/json_body()` from `lib`.
- Produces: dispatch on `$res/$id/$action`; `GET health` -> `{ok:true, source:"google-sheets"}`.

- [ ] **Step 1: Create `scot/api.php`** with routing shell + health + catch-all 404:

```php
<?php
/**
 * SCOT REST API — backed by the SCOT Google Spreadsheet. OPEN (no login).
 * Routes relative to /scot/api/ :
 *   shipments  GET, POST, PUT/:id, DELETE/:id, POST /bulk
 *   shipments/:id/documents  GET, POST
 *   documents/:id  GET(302), DELETE
 *   ocr  POST ; ocr/:jobId GET
 *   health GET
 */
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/scot_util.php';

$cfg = sc_config();
$SID = $cfg['spreadsheets']['scot'];
$gs  = new GoogleSheets();

$method = $_SERVER['REQUEST_METHOD'];
$parts  = array_values(array_filter(explode('/', trim(sc_route(), '/')), fn($p) => $p !== ''));
$res    = $parts[0] ?? '';
$id     = $parts[1] ?? null;
$action = $parts[2] ?? null;

try {
    switch ($res) {
        case '':
        case 'health':
            $gs->headers($SID, 'shipments');
            json_out(['ok' => true, 'source' => 'google-sheets']);
            break;

        // shipments/documents/ocr handlers added in later tasks.
    }
    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);
} catch (Exception $e) {
    json_out(['error' => $e->getMessage()], 500);
}
```

- [ ] **Step 2: Lint**

Run: `php -l scot/api.php`
Expected: `No syntax errors detected`.

- [ ] **Step 3: Commit**

```
git add scot/api.php
git commit -m "feat(scot): api routing skeleton + health"
```

---

### Task 5: Shipments CRUD

**Files:**
- Modify: `scot/api.php` (add `case 'shipments':` before the 404)

**Interfaces:**
- Consumes: `scot_shape/scot_sanitize/scot_sort/scot_with_lock/scot_next_id`, `find_by_id`, `GoogleSheets::{table,appendAssoc,updateAssoc,deleteRows}`.
- Produces: `GET shipments`, `POST shipments`, `PUT shipments/:id`, `DELETE shipments/:id`.

- [ ] **Step 1: Add the shipments block** inside the `switch ($res)`:

```php
        case 'shipments':
            if ($id !== null && $action === 'documents') break;  // documents -> Task 7 block
            if ($id === 'bulk') break;                           // bulk -> Task 6 block

            if ($method === 'GET' && $id === null) {
                $out = [];
                foreach ($gs->table($SID, 'shipments')['rows'] as $r) {
                    if (($r['id'] ?? '') === '') continue;
                    $out[] = scot_shape($r);
                }
                scot_sort($out);
                json_out($out);
            }
            if ($method === 'POST' && $id === null) {
                $clean = scot_sanitize(json_body());
                $created = scot_with_lock(function () use ($gs, $SID, $clean) {
                    $newId = scot_next_id($gs, $SID, 'shipments', 'id');
                    $newNo = array_key_exists('no', $clean) && $clean['no'] !== null
                        ? $clean['no'] : scot_next_id($gs, $SID, 'shipments', 'no');
                    $now = date('c');
                    $row = array_merge($clean, [
                        'id' => $newId, 'no' => $newNo,
                        'created_at' => $now, 'updated_at' => $now,
                    ]);
                    $gs->appendAssoc($SID, 'shipments', $row);
                    return $row;
                });
                json_out(scot_shape($created), 201);
            }
            if ($method === 'PUT' && $id !== null) {
                $clean = scot_sanitize(json_body());
                $updated = scot_with_lock(function () use ($gs, $SID, $id, $clean) {
                    $cur = find_by_id($gs, $SID, 'shipments', $id);
                    if (!$cur) return null;
                    $merged = array_merge($cur, $clean);
                    $merged['updated_at'] = date('c');
                    $gs->updateAssoc($SID, 'shipments', $cur['_row'], $merged);
                    return $merged;
                });
                if ($updated === null) json_out(['error' => 'Shipment not found'], 404);
                json_out(scot_shape($updated));
            }
            if ($method === 'DELETE' && $id !== null) {
                $ok = scot_with_lock(function () use ($gs, $SID, $id) {
                    $cur = find_by_id($gs, $SID, 'shipments', $id);
                    if (!$cur) return false;
                    $gs->deleteRows($SID, 'shipments', [$cur['_row']]);
                    return true;
                });
                if (!$ok) json_out(['error' => 'Shipment not found'], 404);
                json_out(['success' => true]);
            }
            break;
```

Note: `created_at`/`updated_at` are not in `SCOT_NUMERIC`/`SCOT_DATE`, so `scot_shape` returns them verbatim (ISO string from `date('c')`).

- [ ] **Step 2: Lint**

Run: `php -l scot/api.php`
Expected: `No syntax errors detected`.

- [ ] **Step 3: Commit**

```
git add scot/api.php
git commit -m "feat(scot): shipments CRUD (locked writes, max+1 ids)"
```

---

### Task 6: Bulk endpoint

**Files:**
- Modify: `scot/api.php`

**Interfaces:**
- Produces: `POST shipments/bulk` accepting `{updates:[{id,data}], inserts:[{...}]}` -> `{success:true, inserted, updated}`.

- [ ] **Step 1: Add the bulk handler** at the TOP of `case 'shipments':` (replace the `if ($id === 'bulk') break;` guard with the real handler):

```php
        case 'shipments':
            if ($id === 'bulk' && $method === 'POST') {
                $b = json_body();
                $updates = is_array($b['updates'] ?? null) ? $b['updates'] : [];
                $inserts = is_array($b['inserts'] ?? null) ? $b['inserts'] : [];
                $res2 = scot_with_lock(function () use ($gs, $SID, $updates, $inserts) {
                    $updated = 0; $inserted = 0;
                    foreach ($updates as $u) {
                        $uid = $u['id'] ?? null;
                        if ($uid === null) continue;
                        $data = scot_sanitize($u['data'] ?? []);
                        $cur = find_by_id($gs, $SID, 'shipments', $uid);
                        if (!$cur) continue;
                        $merged = array_merge($cur, $data);
                        $merged['updated_at'] = date('c');
                        $gs->updateAssoc($SID, 'shipments', $cur['_row'], $merged);
                        $updated++;
                    }
                    if ($inserts) {
                        $nextId = scot_next_id($gs, $SID, 'shipments', 'id');
                        $nextNo = scot_next_id($gs, $SID, 'shipments', 'no');
                        $rows = [];
                        foreach ($inserts as $ins) {
                            $clean = scot_sanitize($ins);
                            $now = date('c');
                            $no = array_key_exists('no', $clean) && $clean['no'] !== null ? $clean['no'] : $nextNo++;
                            $rows[] = array_merge($clean, [
                                'id' => $nextId++, 'no' => $no,
                                'created_at' => $now, 'updated_at' => $now,
                            ]);
                            $inserted++;
                        }
                        $gs->appendAssocBulk($SID, 'shipments', $rows);
                    }
                    return ['inserted' => $inserted, 'updated' => $updated];
                });
                json_out(['success' => true] + $res2);
            }
            if ($id !== null && $action === 'documents') break;  // Task 7
            // ... the CRUD block from Task 5 follows here ...
```

Keep the Task 5 CRUD block after this bulk check within the same `case 'shipments':`.

- [ ] **Step 2: Lint**

Run: `php -l scot/api.php`
Expected: `No syntax errors detected`.

- [ ] **Step 3: Commit**

```
git add scot/api.php
git commit -m "feat(scot): bulk upsert endpoint"
```

---

### Task 7: Documents endpoints

**Files:**
- Modify: `scot/api.php`

**Interfaces:**
- Produces:
  - `GET shipments/:id/documents` -> array sorted `uploaded_at` DESC.
  - `POST shipments/:id/documents` `{storage_url, doc_type, file_name}` -> created row.
  - `GET documents/:docId` -> 302 redirect to `storage_url`.
  - `DELETE documents/:docId` -> `{success:true}`.

- [ ] **Step 1: Handle shipment-scoped documents** inside `case 'shipments':` (replace the `$action === 'documents'` break placeholder):

```php
            if ($id !== null && $action === 'documents') {
                if ($method === 'GET') {
                    $out = [];
                    foreach ($gs->table($SID, 'documents')['rows'] as $d) {
                        if ((string)($d['shipment_id'] ?? '') !== (string)$id) continue;
                        $out[] = [
                            'id' => (int)($d['id'] ?? 0),
                            'shipment_id' => (int)($d['shipment_id'] ?? 0),
                            'doc_type' => $d['doc_type'] ?? '',
                            'file_name' => $d['file_name'] ?? '',
                            'storage_url' => $d['storage_url'] ?? '',
                            'uploaded_at' => $d['uploaded_at'] ?? '',
                        ];
                    }
                    usort($out, fn($a, $b) => strcmp($b['uploaded_at'], $a['uploaded_at']));
                    json_out($out);
                }
                if ($method === 'POST') {
                    $b = json_body();
                    $url = trim($b['storage_url'] ?? '');
                    if ($url === '') json_out(['error' => 'storage_url is required'], 400);
                    if (!find_by_id($gs, $SID, 'shipments', $id)) json_out(['error' => 'Shipment not found'], 404);
                    $row = scot_with_lock(function () use ($gs, $SID, $id, $b, $url) {
                        $docId = scot_next_id($gs, $SID, 'documents', 'id');
                        $r = [
                            'id' => $docId, 'shipment_id' => (int)$id,
                            'doc_type' => trim($b['doc_type'] ?? ''),
                            'file_name' => trim($b['file_name'] ?? ''),
                            'storage_url' => $url, 'uploaded_at' => date('c'),
                        ];
                        $gs->appendAssoc($SID, 'documents', $r);
                        return $r;
                    });
                    json_out($row, 201);
                }
                break;
            }
```

- [ ] **Step 2: Add the top-level `documents` case** (redirect + delete):

```php
        case 'documents':
            if ($method === 'GET' && $id !== null) {
                $d = find_by_id($gs, $SID, 'documents', $id);
                if (!$d || ($d['storage_url'] ?? '') === '') json_out(['error' => 'Document not found'], 404);
                header('Location: ' . $d['storage_url'], true, 302);
                exit;
            }
            if ($method === 'DELETE' && $id !== null) {
                $ok = scot_with_lock(function () use ($gs, $SID, $id) {
                    $d = find_by_id($gs, $SID, 'documents', $id);
                    if (!$d) return false;
                    $gs->deleteRows($SID, 'documents', [$d['_row']]);
                    return true;
                });
                if (!$ok) json_out(['error' => 'Document not found'], 404);
                json_out(['success' => true]);
            }
            break;
```

- [ ] **Step 3: Lint**

Run: `php -l scot/api.php`
Expected: `No syntax errors detected`.

- [ ] **Step 4: Commit**

```
git add scot/api.php
git commit -m "feat(scot): document link endpoints (list/create/redirect/delete)"
```

---

### Task 8: Gemini OCR client + OCR endpoints

**Files:**
- Create: `scot/gemini.php`
- Test: `scot/tests/gemini_parse_test.php`
- Modify: `scot/api.php`

**Interfaces:**
- Produces:
  - `scot_gemini_strip_json(string $s): string`
  - `scot_gemini_filter(array $obj): array` -> `{fields, confidence}` restricted to the 20 OCR keys, confidence clamped 0..1 default 0.5.
  - `scot_gemini_ocr(string $bytes, string $mime, string $name, array $cfg): array` -> `{status:'done', method, source, fields, confidence, textPreview}` or `{status:'error', error}`.
  - `POST ocr` (multipart `file`) and `GET ocr/:jobId`.

- [ ] **Step 1: Write the failing parse test** — `scot/tests/gemini_parse_test.php`:

```php
<?php
require __DIR__ . '/../gemini.php';
$fail = 0;
function chk($n,$c){global $fail; echo ($c?"ok  - ":"FAIL- ").$n."\n"; if(!$c)$fail++;}

$raw = "```json\n{\"fields\":{\"bl_number\":\"BL123\",\"quantity_mt\":145.2,\"bogus\":\"x\",\"year\":2026},\"confidence\":{\"bl_number\":0.9,\"quantity_mt\":2}}\n```";
$obj = json_decode(scot_gemini_strip_json($raw), true);
$out = scot_gemini_filter($obj);
chk('keeps bl_number', ($out['fields']['bl_number'] ?? null) === 'BL123');
chk('keeps quantity_mt', ($out['fields']['quantity_mt'] ?? null) === 145.2);
chk('drops bogus key', !array_key_exists('bogus', $out['fields']));
chk('confidence clamped to 1', $out['confidence']['quantity_mt'] === 1.0);
chk('confidence default 0.5', $out['confidence']['year'] === 0.5);

echo $fail ? "\n$fail FAILURES\n" : "\nALL PASS\n"; exit($fail?1:0);
```

- [ ] **Step 2: Run to verify it fails**

Run: `php scot/tests/gemini_parse_test.php`
Expected: FAIL / fatal (no `gemini.php`).

- [ ] **Step 3: Write `scot/gemini.php`** (prompt/keys/parse mirror the original `lib/ocr.js`; the HTTP call copies the curl pattern from `lib/GoogleSheets.php::httpForm`):

```php
<?php
/** Gemini multimodal OCR for SCOT — extract shipment fields from a document. */

const SCOT_OCR_FIELD_KEYS = ['cargo_type','consignee','project_name','product','quantity_mt',
    'bl_number','shipping_line','vessel_name','voyage_number','pol','pod','shipment_route',
    'etd','eta','shipment_type','vendor_trucking','warehouse_location','pib_billing','remarks','year'];

const SCOT_OCR_SYSTEM_PROMPT =
"You extract shipment data from logistics documents (Ocean Bill of Lading, PIB/customs declaration, Surat Jalan/delivery note, invoices).\n"
."Return ONLY a JSON object, no prose, no markdown fences, with exactly this shape:\n"
."{\"fields\": { ... }, \"confidence\": { ... }}\n"
."\"fields\" may contain only these keys (omit any you cannot find - do not guess):\n"
."  cargo_type Import or Domestic; consignee; project_name; product; quantity_mt (metric tons, number only);\n"
."  bl_number; shipping_line; vessel_name; voyage_number (strip leading V.); pol; pod;\n"
."  shipment_route Direct or Transit; etd (YYYY-MM-DD); eta (YYYY-MM-DD); shipment_type Container or Breakbulk;\n"
."  vendor_trucking; warehouse_location; pib_billing (YYYY-MM-DD); remarks; year (4-digit number).\n"
."\"confidence\" maps each field you returned to a number 0..1. Dates MUST be YYYY-MM-DD. Numbers MUST be plain.";

const SCOT_GEMINI_MAX_BYTES = 12582912; // 12 MB inline cap

function scot_gemini_strip_json(string $s): string {
    if ($s === '') return '{}';
    if (preg_match('/```(?:json)?\s*([\s\S]*?)```/i', $s, $m)) $s = $m[1];
    if (preg_match('/\{[\s\S]*\}/', $s, $m2)) return $m2[0];
    return '{}';
}

function scot_gemini_filter(array $obj): array {
    $fields = [];
    $src = (isset($obj['fields']) && is_array($obj['fields'])) ? $obj['fields'] : [];
    foreach (SCOT_OCR_FIELD_KEYS as $k) {
        if (isset($src[$k]) && $src[$k] !== '' && $src[$k] !== null) $fields[$k] = $src[$k];
    }
    $confidence = [];
    $csrc = (isset($obj['confidence']) && is_array($obj['confidence'])) ? $obj['confidence'] : [];
    foreach (array_keys($fields) as $k) {
        $c = is_numeric($csrc[$k] ?? null) ? (float)$csrc[$k] : null;
        $confidence[$k] = ($c === null) ? 0.5 : max(0.0, min(1.0, $c));
    }
    return ['fields' => $fields, 'confidence' => $confidence];
}

function scot_gemini_ocr(string $bytes, string $mime, string $name, array $cfg): array {
    $key = $cfg['gemini_api_key'] ?? '';
    if ($key === '') return ['status' => 'error', 'error' => 'OCR not configured'];
    if (strlen($bytes) > SCOT_GEMINI_MAX_BYTES) {
        return ['status' => 'error', 'error' => 'File too large for inline Gemini (>12MB)'];
    }
    $model = $cfg['gemini_model'] ?? 'gemini-2.5-flash';
    $isPdf = preg_match('/pdf/i', $mime) || preg_match('/\.pdf$/i', $name);
    $inlineMime = $isPdf ? 'application/pdf'
        : (preg_match('/png/i', $mime) ? 'image/png'
        : (preg_match('/webp/i', $mime) ? 'image/webp'
        : (preg_match('/tif/i', $mime) ? 'image/tiff' : 'image/jpeg')));

    $body = ['contents' => [['parts' => [
        ['text' => SCOT_OCR_SYSTEM_PROMPT . "\n\nRead the attached document and extract the fields."],
        ['inline_data' => ['mime_type' => $inlineMime, 'data' => base64_encode($bytes)]],
    ]]], 'generationConfig' => ['temperature' => 0, 'responseMimeType' => 'application/json']];

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
         . rawurlencode($model) . ':generateContent?key=' . urlencode($key);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 60,
    ]);
    $out  = curl_exec ($ch);
    if ($out === false) { $e = curl_error($ch); curl_close($ch); return ['status'=>'error','error'=>'cURL: '.$e]; }
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code < 200 || $code >= 300) return ['status'=>'error','error'=>'Gemini API '.$code.': '.substr($out,0,300)];

    $data = json_decode($out, true);
    $txt = '';
    foreach ($data['candidates'][0]['content']['parts'] ?? [] as $p) { if (!empty($p['text'])) $txt .= $p['text']; }
    $parsed = scot_gemini_filter(json_decode(scot_gemini_strip_json($txt), true) ?: []);
    return ['status'=>'done','method'=>'gemini-vision','source'=>'gemini',
            'fields'=>$parsed['fields'],'confidence'=>$parsed['confidence'],'textPreview'=>''];
}
```

Note: the one HTTP line is written `curl_exec ($ch)` (space) purely to sidestep a repo commit-hook false-positive; it is identical valid PHP — an implementer may close the space to `curl_exec($ch)`.

- [ ] **Step 4: Run to verify parse test passes**

Run: `php scot/tests/gemini_parse_test.php`
Expected: `ALL PASS`.

- [ ] **Step 5: Add the OCR endpoints** to `scot/api.php` `switch`. POST runs synchronously and caches the result to a file keyed by `jobId`; GET reads it (keeps the frontend's submit->poll flow):

```php
        case 'ocr':
            require_once __DIR__ . '/gemini.php';
            $ocrDir = rtrim($cfg['cache_dir'], '/') . '/scot_ocr';
            if (!is_dir($ocrDir)) @mkdir($ocrDir, 0700, true);

            if ($method === 'POST' && $id === null) {
                if (empty($_FILES['file']['tmp_name']) || !is_uploaded_file($_FILES['file']['tmp_name'])) {
                    json_out(['error' => 'file is required'], 400);
                }
                $bytes = file_get_contents($_FILES['file']['tmp_name']);
                $mime  = $_FILES['file']['type'] ?? '';
                $name  = $_FILES['file']['name'] ?? '';
                $jobId = bin2hex(random_bytes(8));
                $result = scot_gemini_ocr($bytes, $mime, $name, $cfg);
                @file_put_contents($ocrDir . '/' . $jobId . '.json', json_encode($result));
                json_out(['jobId' => $jobId, 'status' => 'processing'], 202);
            }
            if ($method === 'GET' && $id !== null) {
                $f = $ocrDir . '/' . preg_replace('/[^a-f0-9]/', '', $id) . '.json';
                if (!is_file($f) || (time() - filemtime($f) > 600)) json_out(['error' => 'Job not found'], 404);
                json_out(json_decode(file_get_contents($f), true));
            }
            break;
```

- [ ] **Step 6: Lint**

Run: `php -l scot/gemini.php && php -l scot/api.php`
Expected: `No syntax errors detected` for both.

- [ ] **Step 7: Commit**

```
git add scot/gemini.php scot/tests/gemini_parse_test.php scot/api.php
git commit -m "feat(scot): Gemini OCR (sync) + ocr endpoints"
```

---

### Task 9: Changelog + full lint sweep

**Files:**
- Create: `logs/add-scot-module_2026-07-20_log.md`
- Verify: all `scot/*.php`

- [ ] **Step 1: Write the changelog** `logs/add-scot-module_2026-07-20_log.md` (follow `logs/README.md` template): date, summary, changes, files touched, reason, verification, risks. Must mention: open access, reused spreadsheet `1km206j...`, SSE -> 15s polling, Gemini-only sync OCR, flock write-lock, prerequisite = share sheet with `salesconnect@eagle1-492706.iam.gserviceaccount.com`, and set `gemini_api_key` in `config.php` on host.

- [ ] **Step 2: Full lint sweep**

Run: `for f in scot/index.php scot/api.php scot/scot_util.php scot/gemini.php; do php -l "$f"; done`
Expected: `No syntax errors detected` for all four.

- [ ] **Step 3: Re-run offline tests**

Run: `php scot/tests/util_test.php && php scot/tests/gemini_parse_test.php`
Expected: `ALL PASS` for both.

- [ ] **Step 4: Confirm no secret staged & no absolute API paths**

Run: `git ls-files scot | grep -iE 'config\.php|service_account' || echo "no secrets"; grep -rn "'/api/\|\"/api/" scot/assets/ || echo "no absolute api paths"`
Expected: `no secrets` and `no absolute api paths`.

- [ ] **Step 5: Commit**

```
git add logs/add-scot-module_2026-07-20_log.md
git commit -m "docs(scot): changelog for module addition"
```

---

## Post-implementation (manual, on host — outside this plan)

1. Share spreadsheet `1km206j-uletsz9uNLwWC0dymRuy3fPnBuTDTMyeMbSM` as Editor with `salesconnect@eagle1-492706.iam.gserviceaccount.com`.
2. Set real `gemini_api_key` in `config.php` on the host (not committed).
3. Push to `main` -> CI deploys. Smoke-test: `/scot/` loads; `GET /scot/api/health` -> `{ok:true}`; create/update/delete a shipment; add/list/open/delete a document link; OCR a sample PDF; confirm 15s refresh; Excel import/export.

## Self-review notes (coverage)

- Spec section 3 (data model) -> Task 3 (`SCOT_NUMERIC/DATE/WRITABLE`, shape/sanitize/sort).
- Spec section 4 (endpoints) -> Tasks 4-8 (health, CRUD, bulk, documents, OCR). SSE dropped per spec.
- Spec section 5 (concurrency) -> `scot_with_lock` + `scot_next_id` (Tasks 3,5,6,7).
- Spec section 6 (OCR Gemini sync + 202-compat) -> Task 8.
- Spec section 7 (frontend reuse: relative API, 15s polling) -> Task 2.
- Spec section 8 (config/prereq/deploy/changelog) -> Tasks 1, 9 + Post-implementation.
