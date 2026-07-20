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
            try { $gs->headers($SID, 'shipments'); }
            catch (Throwable $e) { json_out(['ok' => false, 'error' => $e->getMessage()], 503); }
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
                    if (!preg_match('#^https?://#i', $url)) json_out(['error' => 'storage_url must be an http(s) URL'], 400);
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
    }
    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 500);
}
