<?php
/**
 * Cost Core REST API — backed by the Cost Core Google Spreadsheet.
 * Storage is COLUMN-BASED (no JSON blob): each costing = a header row in `costings`
 * plus its line items in `costings_items` and (domestic) margin tiers in
 * `costings_margins`. lib/costcore_store.php decomposes the nested `data` object on
 * write and recomposes it on read (with a data_json fallback for un-migrated rows),
 * so the API contract the frontend uses is unchanged.
 * Routes (relative to /costcore/api/):
 *   GET    costings/{import|domestic}      list -> [{id,customer,created_at}]
 *   GET    costings/load/{id}              load one (nested data object)
 *   POST   costings   {type,customer,data} create -> {id}
 *   PUT    costings/{id} {customer,data}   update
 *   DELETE costings/{id}                   delete
 */
require_once __DIR__ . '/../lib/costcore_gate.php';
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/../lib/config_util.php';
require_once __DIR__ . '/../lib/costcore_store.php';
if (!costcore_pin_ok()) { json_out(['error' => 'Unauthorized'], 401); }

$cfg = sc_config();
$SID = $cfg['spreadsheets']['costcore'];
$gs  = new GoogleSheets($cfg['costcore_service_account']);

$method = $_SERVER['REQUEST_METHOD'];
$parts  = array_values(array_filter(explode('/', trim(sc_route(), '/')), fn($p) => $p !== ''));

$VALID_TYPE = ['import', 'domestic'];
$isId = fn($s) => (bool) preg_match('/^(import|domestic)_\d+$/', (string) $s);

try {
    if (($parts[0] ?? '') === 'config') {
        cfg_handle($gs, $SID, cfg_for('costcore'), $parts, $method);
    }
    if (($parts[0] ?? '') !== 'costings') {
        json_out(['error' => 'Not found'], 404);
    }
    $a = $parts[1] ?? null;   // type | 'load' | id
    $b = $parts[2] ?? null;   // id (when a === 'load')

    // GET costings/load/:id  → nested data object
    if ($method === 'GET' && $a === 'load' && $b !== null) {
        if (!$isId($b)) json_out(['error' => 'Invalid id'], 400);
        $data = cc_load($gs, $SID, $b);
        if ($data === null) json_out(['error' => 'Not found'], 404);
        json_out($data);
    }

    // GET costings/:type  → list
    if ($method === 'GET' && in_array($a, $VALID_TYPE, true) && $b === null) {
        json_out(cc_list($gs, $SID, $a));
    }

    // POST costings  → create
    if ($method === 'POST' && $a === null) {
        $body = json_body();
        $type = $body['type'] ?? '';
        if (!in_array($type, $VALID_TYPE, true)) json_out(['error' => 'Invalid type'], 400);
        $customer = trim((string) ($body['customer'] ?? ''));
        if ($customer === '') json_out(['error' => 'customer required'], 400);
        $now  = gmdate('Y-m-d\TH:i:s\Z');
        $id   = $type . '_' . sprintf('%d', round(microtime(true) * 1000));
        $data = is_array($body['data'] ?? null) ? $body['data'] : [];
        cc_save($gs, $SID, $id, $type, $customer, $data, $now, $now);
        json_out(['id' => $id]);
    }

    // PUT costings/:id  → update
    if ($method === 'PUT' && $a !== null && $b === null) {
        if (!$isId($a)) json_out(['error' => 'Invalid id'], 400);
        $existing = find_by_id($gs, $SID, CS_TAB, $a);
        if (!$existing) json_out(['error' => 'Not found'], 404);
        $type    = $existing['type'] ?? 'import';
        $created = $existing['created_at'] ?? gmdate('Y-m-d\TH:i:s\Z');
        $body    = json_body();
        $customer = (array_key_exists('customer', $body) && $body['customer'] !== null)
            ? trim((string) $body['customer']) : (string) ($existing['customer'] ?? '');
        $data = is_array($body['data'] ?? null) ? $body['data'] : [];
        cc_save($gs, $SID, $a, $type, $customer, $data, $created, gmdate('Y-m-d\TH:i:s\Z'));
        json_out(['success' => true]);
    }

    // DELETE costings/:id
    if ($method === 'DELETE' && $a !== null && $b === null) {
        if (!$isId($a)) json_out(['error' => 'Invalid id'], 400);
        if (!find_by_id($gs, $SID, CS_TAB, $a)) json_out(['error' => 'Not found'], 404);
        cc_delete($gs, $SID, $a);
        json_out(['success' => true]);
    }

    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);

} catch (Exception $e) {
    json_out(['error' => $e->getMessage()], 500);
}
