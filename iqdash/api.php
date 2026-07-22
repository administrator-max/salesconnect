<?php
/**
 * IQ Dash REST API — backed by the IQ Dash Google Spreadsheet. OPEN module
 * (no login).
 * Routes relative to /iqdash/api/ :
 *   health                    GET
 *   data                      GET
 *   company/:code             GET
 *   ra                        GET
 *   realizations              GET (?company_code=), POST (bulk)
 *   realizations/summary      GET
 *   realizations/single       POST
 *   realizations/:id          DELETE
 */
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/iqdash_util.php';
require_once __DIR__ . '/iqdash_data.php';
require_once __DIR__ . '/iqdash_insights.php';
require_once __DIR__ . '/iqdash_write.php';

$method = $_SERVER['REQUEST_METHOD'];
$parts  = array_values(array_filter(explode('/', trim(sc_route(), '/')), fn($p) => $p !== ''));
$res    = $parts[0] ?? '';

// ── GET /api/health — must work with NO Sheets credentials/network. Handled
// before anything else touches config/GoogleSheets so it stays offline-safe. ──
if ($res === 'health' && $method === 'GET') {
    json_out(['status' => 'ok']);
}

/* ── JSON-object normalization ──────────────────────────────────────────
 * A handful of fields are MAPS that must serialize as `{}` (not `[]`) even
 * when empty, to match the JS oracle/frontend: top-level `productAliases`,
 * and per-company `utilizationByProd`/`availableByProd`/`realizationByProd`/
 * `etaByProd`/`arrivedByProd`/`salesRevRequest`, plus each cycle's `products`
 * map. Everything else (spi/pending/ra/cycles lists) stays a JSON array.
 */
function iq_empty_to_obj($v) {
    return (is_array($v) && count($v) === 0) ? new stdClass() : $v;
}

function iq_normalize_company(array $co): array {
    foreach (['utilizationByProd', 'availableByProd', 'realizationByProd', 'etaByProd', 'arrivedByProd', 'salesRevRequest'] as $k) {
        if (array_key_exists($k, $co)) $co[$k] = iq_empty_to_obj($co[$k]);
    }
    if (isset($co['cycles']) && is_array($co['cycles'])) {
        foreach ($co['cycles'] as $i => $c) {
            if (is_array($c) && array_key_exists('products', $c)) {
                $co['cycles'][$i]['products'] = iq_empty_to_obj($c['products']);
            }
        }
    }
    return $co;
}

function iq_normalize_payload(array $payload): array {
    if (array_key_exists('productAliases', $payload)) {
        $payload['productAliases'] = iq_empty_to_obj($payload['productAliases']);
    }
    foreach (['spi', 'pending'] as $k) {
        if (isset($payload[$k]) && is_array($payload[$k])) {
            foreach ($payload[$k] as $i => $co) {
                if (is_array($co)) $payload[$k][$i] = iq_normalize_company($co);
            }
        }
    }
    return $payload;
}

/* ── /api/insights helpers ────────────────────────────────────────────
 * GET /api/insights (all 9 questions) and GET /api/insights/:q (one of
 * them), mirroring IQ/server.js's `_insightFns` dispatch table + `all()`
 * route. Insights read the RAW tables (iq_load_tables()'s output), never
 * the ledger-applied /api/data payload — see iqdash_insights.php's
 * docblock. */

/**
 * Pure route-key mapper: `:q` path segment (q1..q8 | realization) -> the
 * matching key in iq_ins_all()'s result. Unknown segment -> null (caller
 * turns that into a 404), same as server.js's `_insightFns[req.params.q]`
 * lookup returning undefined.
 */
function iq_insight_route_key(string $q): ?string {
    static $map = [
        'q1'         => 'q1_obtainedByPeriod',
        'q2'         => 'q2_latestProgress',
        'q3'         => 'q3_topQuotaItems',
        'q4'         => 'q4_leadTime',
        'q5'         => 'q5_remainingForItem',
        'q6'         => 'q6_companiesWithItem',
        'q7'         => 'q7_utilizationTiming',
        'q8'         => 'q8_reallocations',
        'realization'=> 'realization',
    ];
    return $map[$q] ?? null;
}

/**
 * Build the raw `$t` shape iq_ins_*() needs (9 keys) out of
 * iq_load_tables()'s superset — insights never see the extra keys
 * (directory/companyProducts/reapply/ra/pendingMeta/pertekRelease).
 */
function iq_insight_tables(GoogleSheets $gs, string $sid): array {
    $full = iq_load_tables($gs, $sid);
    return [
        'companies'    => $full['companies'],
        'cycles'       => $full['cycles'],
        'cycleProducts'=> $full['cycleProducts'],
        'stats'        => $full['stats'],
        'revisions'    => $full['revisions'],
        'lots'         => $full['lots'],
        'realizations' => $full['realizations'],
        'aliases'      => $full['aliases'],
        'products'     => $full['products'],
    ];
}

/**
 * Cast known map-shaped sub-fields of one iq_ins_all() result key to `{}`
 * when empty (mirrors iq_normalize_payload()'s `productAliases`/`*ByProd`
 * treatment for the /api/data payload). Only q1's `byMonth` is a genuine
 * string-keyed map among the insight results today — everything else
 * (topQuotaItems, byCompany, companies, events, reallocations, byProduct,
 * vsObtained, timeline...) is a sequential list, which already serializes
 * as `[]` correctly even when empty.
 */
function iq_ins_normalize_value(string $key, $value) {
    if ($key === 'q1_obtainedByPeriod' && is_array($value) && array_key_exists('byMonth', $value)) {
        $value['byMonth'] = iq_empty_to_obj($value['byMonth']);
    }
    return $value;
}

/* ── /api/data payload — file memo (~30s) on top of GoogleSheets' own read
 * cache, so hitting /data, /company/:code and /ra back-to-back doesn't
 * re-walk every tab each time. Write-route invalidation is wired in a later
 * task; this memo just expires on its own TTL for now. */
function iq_payload_memo_file(): string {
    $cfg = sc_config();
    $dir = rtrim($cfg['cache_dir'] ?? (__DIR__ . '/../cache'), '/');
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    return $dir . '/iqdash_data.json';
}

function iq_get_payload(GoogleSheets $gs, string $sid): array {
    $f = iq_payload_memo_file();
    if (is_file($f) && (time() - filemtime($f) < 30)) {
        $cached = json_decode((string) file_get_contents($f), true);
        if (is_array($cached)) return $cached;
    }
    $t = iq_load_tables($gs, $sid);
    $payload = iq_build_payload($t);
    @file_put_contents($f, json_encode($payload));
    return $payload;
}

try {
    $cfg = sc_config();
    $SID = $cfg['spreadsheets']['iqdash'];
    $gs  = new GoogleSheets();

    switch ($res) {
        // ====================================================================
        // GET /api/data
        // ====================================================================
        case 'data':
            if ($method === 'GET') {
                $payload = iq_get_payload($gs, $SID);
                header('Cache-Control: private, max-age=30, stale-while-revalidate=60');
                json_out(iq_normalize_payload($payload));
            }
            break;

        // ====================================================================
        // GET /api/company/:code — same enriched (ledger-applied) object the
        // /api/data payload carries for this company, from spi ∪ pending.
        // PATCH /api/company/:code — save editable company fields
        // (server.js:1385-1571, Sheets branch: patchCompanySheets() + the
        // route's success/error mapping). See iqdash_write.php's Task 12
        // header comment for iq_patch_company()'s documented divergences.
        // ====================================================================
        case 'company':
            if ($method === 'GET') {
                $code = isset($parts[1]) ? urldecode($parts[1]) : null;
                if ($code === null || $code === '') {
                    json_out(['error' => 'Missing company code'], 400);
                }
                $payload = iq_normalize_payload(iq_get_payload($gs, $SID));
                $found = null;
                foreach (array_merge($payload['spi'] ?? [], $payload['pending'] ?? []) as $co) {
                    if (is_array($co) && (string) ($co['code'] ?? '') === (string) $code) {
                        $found = $co;
                        break;
                    }
                }
                if ($found === null) json_out(['error' => 'Not found'], 404);
                json_out($found);
            }

            if ($method === 'PATCH') {
                $code = isset($parts[1]) ? urldecode($parts[1]) : null;
                if ($code === null || $code === '') {
                    json_out(['error' => 'Missing company code'], 400);
                }
                $body = json_body();
                $result = iq_patch_company($gs, $SID, $code, $body);
                if (isset($result['error'])) {
                    json_out(['error' => $result['error']], $result['status'] ?? 500);
                }
                // Invalidate the /api/data file memo (Task 12's writes already
                // clear GoogleSheets' own short-TTL read cache on every write;
                // this is the SEPARATE 30s payload memo iq_get_payload() keeps
                // on top of that — mirrors server.js's `dcache.invalidate(...)`
                // after a successful PATCH so GET /api/data & /api/ra don't
                // serve a stale payload for up to 30s post-save).
                @unlink(iq_payload_memo_file());
                json_out(['ok' => true, 'code' => $code, 'updatedAt' => $result['updatedAt']]);
            }
            break;

        // ====================================================================
        // GET /api/ra — the ra array from the payload.
        // ====================================================================
        case 'ra':
            if ($method === 'GET') {
                $payload = iq_get_payload($gs, $SID);
                json_out($payload['ra'] ?? []);
            }
            break;

        // ====================================================================
        // GET /api/realizations[?company_code=CODE] — deduped PIB realization
        // lines, sorted pib_date DESC (server.js:2381-2419, Sheets branch).
        // GET /api/realizations/summary — per-company PIB/line counts
        // (server.js:2334-2379, Sheets branch).
        // POST /api/realizations — bulk insert (server.js:2470-2524, Sheets
        // branch). POST /api/realizations/single — single-row insert
        // (server.js:2527-2568, Sheets branch). DELETE /api/realizations/:id
        // — remove a row (server.js:2571-2599, Sheets branch). See
        // iqdash_write.php's Task 11 header comment for why these are plain
        // inserts, not upserts, despite the module plan's "upsert" naming.
        // ====================================================================
        case 'realizations':
            if ($method === 'GET') {
                $rows = $gs->table($SID, 'realizations')['rows'];

                if (isset($parts[1]) && $parts[1] === 'summary') {
                    $summary = iq_realizations_summary($rows);
                    $summary['counts'] = iq_empty_to_obj($summary['counts']);
                    json_out($summary);
                }

                $code = (isset($_GET['company_code']) && $_GET['company_code'] !== '') ? (string) $_GET['company_code'] : null;
                json_out(['realizations' => iq_realizations_list($rows, $code)]);
            }

            // POST /api/realizations — bulk insert.
            // Body: { companyCode, source, sourceFile, importedBy, rows: [...] }
            if ($method === 'POST' && !isset($parts[1])) {
                $b = json_body();
                $companyCode = isset($b['companyCode']) && $b['companyCode'] !== null ? (string) $b['companyCode'] : '';
                $rows = $b['rows'] ?? null;
                if ($companyCode === '' || !is_array($rows) || !count($rows)) {
                    json_out(['error' => 'companyCode and non-empty rows array are required'], 400);
                }
                if (!iq_company_exists($gs, $SID, $companyCode)) {
                    json_out(['error' => 'Unknown company code: ' . $companyCode], 404);
                }
                $defaults = [
                    'source'     => (isset($b['source']) && $b['source'] !== '') ? (string) $b['source'] : 'excel',
                    'sourceFile' => isset($b['sourceFile']) ? (string) $b['sourceFile'] : '',
                    'importedBy' => isset($b['importedBy']) ? (string) $b['importedBy'] : '',
                ];
                $ids = iq_realizations_insert($gs, $SID, $companyCode, $rows, $defaults);
                json_out(['ok' => true, 'inserted' => count($ids), 'ids' => $ids]);
            }

            // POST /api/realizations/single — single manual entry.
            // Body: { companyCode, importedBy, ...row } (row = every other field).
            if ($method === 'POST' && isset($parts[1]) && $parts[1] === 'single') {
                $b = json_body();
                $companyCode = isset($b['companyCode']) && $b['companyCode'] !== null ? (string) $b['companyCode'] : '';
                if ($companyCode === '') json_out(['error' => 'companyCode is required'], 400);
                if (!iq_company_exists($gs, $SID, $companyCode)) {
                    json_out(['error' => 'Unknown company code: ' . $companyCode], 404);
                }
                $importedBy = isset($b['importedBy']) ? (string) $b['importedBy'] : '';
                $row = $b;
                unset($row['companyCode'], $row['importedBy']);
                $defaults = ['source' => 'manual', 'sourceFile' => '', 'importedBy' => $importedBy];
                $ids = iq_realizations_insert($gs, $SID, $companyCode, [$row], $defaults);
                json_out(['ok' => true, 'id' => $ids[0] ?? null]);
            }

            // DELETE /api/realizations/:id — remove a row.
            if ($method === 'DELETE' && isset($parts[1])) {
                $idNum = (int) $parts[1];
                if (!$idNum) json_out(['error' => 'invalid id'], 400);
                $deleted = iq_realizations_delete($gs, $SID, $idNum);
                if (!$deleted) json_out(['error' => 'not found'], 404);
                json_out(['ok' => true]);
            }
            break;

        // ====================================================================
        // GET /api/insights            — all 9 questions (item/company via
        //                                 ?item=&company=)
        // GET /api/insights/:q         — one question (q1..q8 | realization)
        // ====================================================================
        case 'insights':
            if ($method === 'GET') {
                $q   = (isset($parts[1]) && $parts[1] !== '') ? $parts[1] : null;
                $key = $q !== null ? iq_insight_route_key($q) : null;
                if ($q !== null && $key === null) {
                    json_out(['error' => "unknown insight '$q'"], 404);
                }

                $t = iq_insight_tables($gs, $SID);
                $opts = [
                    'today'   => null, // resolves to "now", mirrors JS `new Date()`
                    'item'    => $_GET['item'] ?? null,
                    'company' => $_GET['company'] ?? null,
                ];
                $all = iq_ins_all($t, $opts);
                foreach ($all as $k => $v) { $all[$k] = iq_ins_normalize_value($k, $v); }

                if ($key !== null) json_out($all[$key]);
                json_out($all);
            }
            break;
    }

    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 500);
}
