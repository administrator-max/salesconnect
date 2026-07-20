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
            if ($id !== null && $action === 'documents') break;  // documents -> Task 7 block

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
    }
    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);
} catch (Exception $e) {
    json_out(['error' => $e->getMessage()], 500);
}
