<?php
/**
 * Cost Core REST API — backed by the Cost Core Google Spreadsheet.
 * Mirrors costcore_html/costcore-server.js, minus its passcode/shared-secret:
 * the SalesConnect session guard handles auth. Each costing = one row; the whole
 * nested costing state is kept as JSON in the `data_json` cell.
 * Routes (relative to /costcore/api/):
 *   GET    costings/{import|domestic}      list -> [{id,customer,created_at}]
 *   GET    costings/load/{id}              load one (parsed data_json)
 *   POST   costings   {type,customer,data} create -> {id}
 *   PUT    costings/{id} {customer,data}   update
 *   DELETE costings/{id}                   delete
 */
require_once __DIR__ . '/../lib/costcore_gate.php';
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/../lib/config_util.php';
require_once __DIR__ . '/../lib/costcore_readable.php';
if (!costcore_pin_ok()) { json_out(['error' => 'Unauthorized'], 401); }

$cfg = sc_config();
$SID = $cfg['spreadsheets']['costcore'];
$gs  = new GoogleSheets($cfg['costcore_service_account']);
$TAB = 'costings';

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

    // GET costings/load/:id  → parsed data_json object
    if ($method === 'GET' && $a === 'load' && $b !== null) {
        if (!$isId($b)) json_out(['error' => 'Invalid id'], 400);
        $row = find_by_id($gs, $SID, $TAB, $b);
        if (!$row) json_out(['error' => 'Not found'], 404);
        $data = json_decode((string) ($row['data_json'] ?? ''), true);
        if (!is_array($data)) json_out(['error' => 'Not found'], 404);
        json_out($data);
    }

    // GET costings/:type  → list
    if ($method === 'GET' && in_array($a, $VALID_TYPE, true) && $b === null) {
        $out = [];
        foreach ($gs->table($SID, $TAB)['rows'] as $r) {
            if (($r['id'] ?? '') === '' || ($r['type'] ?? '') !== $a) continue;
            $out[] = [
                'id'         => $r['id'],
                'customer'   => $r['customer'] ?? '',
                'created_at' => $r['created_at'] ?? '',
            ];
        }
        usort($out, fn($x, $y) => strcmp($y['created_at'] ?? '', $x['created_at'] ?? ''));
        json_out($out);
    }

    // POST costings  → create
    if ($method === 'POST' && $a === null) {
        $body = json_body();
        $type = $body['type'] ?? '';
        if (!in_array($type, $VALID_TYPE, true)) json_out(['error' => 'Invalid type'], 400);
        $customer = trim((string) ($body['customer'] ?? ''));
        if ($customer === '') json_out(['error' => 'customer required'], 400);
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $id  = $type . '_' . sprintf('%d', round(microtime(true) * 1000));
        $gs->appendAssoc($SID, $TAB, [
            'id'         => $id,
            'type'       => $type,
            'customer'   => $customer,
            'created_at' => $now,
            'updated_at' => $now,
            'data_json'  => json_encode($body['data'] ?? new stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ]);
        cc_rebuild_safe($gs, $SID);
        json_out(['id' => $id]);
    }

    // PUT costings/:id  → update
    if ($method === 'PUT' && $a !== null && $b === null) {
        if (!$isId($a)) json_out(['error' => 'Invalid id'], 400);
        $row = find_by_id($gs, $SID, $TAB, $a);
        if (!$row) json_out(['error' => 'Not found'], 404);
        $body = json_body();
        if (array_key_exists('customer', $body) && $body['customer'] !== null) {
            $row['customer'] = trim((string) $body['customer']);
        }
        $row['updated_at'] = gmdate('Y-m-d\TH:i:s\Z');
        $row['data_json']  = json_encode($body['data'] ?? new stdClass(), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $gs->updateAssoc($SID, $TAB, $row['_row'], $row);
        cc_rebuild_safe($gs, $SID);
        json_out(['success' => true]);
    }

    // DELETE costings/:id
    if ($method === 'DELETE' && $a !== null && $b === null) {
        if (!$isId($a)) json_out(['error' => 'Invalid id'], 400);
        $row = find_by_id($gs, $SID, $TAB, $a);
        if (!$row) json_out(['error' => 'Not found'], 404);
        $gs->deleteRows($SID, $TAB, [$row['_row']]);
        cc_rebuild_safe($gs, $SID);
        json_out(['success' => true]);
    }

    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);

} catch (Exception $e) {
    json_out(['error' => $e->getMessage()], 500);
}
