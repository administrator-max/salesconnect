<?php
/**
 * IQ Dash REST API — backed by the IQ Dash Google Spreadsheet. OPEN module
 * (no login), GET routes only for now (write routes are later tasks).
 * Routes relative to /iqdash/api/ :
 *   health           GET
 *   data             GET
 *   company/:code    GET
 *   ra               GET
 */
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/iqdash_util.php';
require_once __DIR__ . '/iqdash_data.php';

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
    }

    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 500);
}
