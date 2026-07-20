<?php
/**
 * CIL REST API — backed by the CIL Google Spreadsheet.
 * Mirrors the original Express routes' JSON contracts.
 * Routes (relative to /cil/api/):
 *   companies      GET, POST, DELETE/:id
 *   salespeople    GET, POST, DELETE/:id
 *   records        GET, POST, PUT/:id, PATCH/:id/followup, DELETE/:id
 *   complaints     GET, POST, PUT/:id, PATCH/:id/status,
 *                  POST/:id/responses, DELETE/:id
 */
require_once __DIR__ . '/../lib/sheet_util.php';

$cfg = sc_config();
$SID = $cfg['spreadsheets']['cil'];
$gs  = new GoogleSheets();

$method = $_SERVER['REQUEST_METHOD'];
$parts  = array_values(array_filter(explode('/', trim(sc_route(), '/')), fn($p) => $p !== ''));
$res    = $parts[0] ?? '';
$id     = $parts[1] ?? null;
$action = $parts[2] ?? null;

try {
    switch ($res) {

        // ── COMPANIES / SALESPEOPLE (identical shape) ────────────────────
        case 'companies':
        case 'salespeople':
            $label = $res === 'companies' ? 'perusahaan' : 'sales';
            if ($method === 'GET') {
                $out = [];
                foreach ($gs->table($SID, $res)['rows'] as $r) {
                    if (($r['id'] ?? '') === '') continue;
                    $out[] = ['id' => $r['id'], 'name' => $r['name']];
                }
                usort($out, fn($a, $b) => strcasecmp($a['name'], $b['name']));
                json_out($out);
            }
            if ($method === 'POST') {
                $b = json_body();
                $name = trim($b['name'] ?? '');
                if ($name === '') json_out(['error' => 'Nama ' . $label . ' wajib diisi'], 400);
                if ($ex = find_by_name($gs, $SID, $res, $name)) {
                    json_out(['id' => $ex['id'], 'name' => $ex['name']]);
                }
                $newId = sc_uid();
                $gs->appendAssoc($SID, $res, ['id' => $newId, 'name' => $name]);
                json_out(['id' => $newId, 'name' => $name], 201);
            }
            if ($method === 'DELETE' && $id !== null) {
                if ($row = find_by_id($gs, $SID, $res, $id)) {
                    $gs->deleteRows($SID, $res, [$row['_row']]);
                }
                json_out(['success' => true]);
            }
            break;

        // ── RECORDS ──────────────────────────────────────────────────────
        case 'records':
            if ($method === 'GET' && $id === null) {
                json_out(cil_records_all($gs, $SID));
            }
            if ($method === 'POST' && $id === null) {
                json_out(cil_upsert_record($gs, $SID, json_body()), 201);
            }
            if ($method === 'PUT' && $id !== null) {
                $body = json_body(); $body['id'] = $id;
                json_out(cil_upsert_record($gs, $SID, $body), 200);
            }
            if ($method === 'PATCH' && $id !== null && $action === 'followup') {
                $b = json_body();
                $r = find_by_id($gs, $SID, 'records', $id);
                if (!$r) json_out(['error' => 'Record tidak ditemukan'], 404);
                $r['urgent_follow_up']   = !empty($b['urgentFollowUp']) ? 'TRUE' : 'FALSE';
                $r['follow_up_note']     = $b['followUpNote'] ?? '';
                $r['follow_up_deadline'] = $b['followUpDeadline'] ?? '';
                $gs->updateAssoc($SID, 'records', $r['_row'], $r);
                json_out(['success' => true]);
            }
            if ($method === 'DELETE' && $id !== null) {
                if ($r = find_by_id($gs, $SID, 'records', $id)) {
                    $childRows = [];
                    foreach ($gs->table($SID, 'discussions')['rows'] as $d) {
                        if ((string) ($d['record_id'] ?? '') === (string) $id) $childRows[] = $d['_row'];
                    }
                    if ($childRows) $gs->deleteRows($SID, 'discussions', $childRows);
                    $gs->deleteRows($SID, 'records', [$r['_row']]);
                }
                json_out(['success' => true]);
            }
            break;

        // ── COMPLAINTS ───────────────────────────────────────────────────
        case 'complaints':
            if ($method === 'GET' && $id === null) {
                json_out(cil_complaints_all($gs, $SID));
            }
            if ($method === 'POST' && $id === null) {
                json_out(cil_create_complaint($gs, $SID, json_body()), 201);
            }
            if ($method === 'PUT' && $id !== null) {
                json_out(cil_update_complaint($gs, $SID, $id, json_body()), 200);
            }
            if ($method === 'PATCH' && $id !== null && $action === 'status') {
                $status  = json_body()['status'] ?? '';
                $allowed = ['open', 'in_progress', 'resolved'];
                if (!in_array($status, $allowed, true)) json_out(['error' => 'Status tidak valid'], 400);
                $c = find_by_id($gs, $SID, 'complaints', $id);
                if (!$c) json_out(['error' => 'Complaint tidak ditemukan'], 404);
                $c['status'] = $status;
                $gs->updateAssoc($SID, 'complaints', $c['_row'], $c);
                json_out(['success' => true]);
            }
            if ($method === 'POST' && $id !== null && $action === 'responses') {
                $b = json_body();
                if (empty($b['note']) || empty($b['by'])) json_out(['error' => 'Note dan by wajib diisi'], 400);
                $gs->appendAssoc($SID, 'complaint_responses', [
                    'id'           => sc_uid(),
                    'complaint_id' => $id,
                    'by'           => $b['by'],
                    'date'         => $b['date'] ?? date('Y-m-d'),
                    'time'         => $b['time'] ?? '',
                    'note'         => $b['note'],
                    'created_at'   => sc_now(),
                ]);
                // auto-advance open -> in_progress
                $c = find_by_id($gs, $SID, 'complaints', $id);
                if ($c && ($c['status'] ?? '') === 'open') {
                    $c['status'] = 'in_progress';
                    $gs->updateAssoc($SID, 'complaints', $c['_row'], $c);
                }
                json_out(cil_complaint_full($gs, $SID, $id), 201);
            }
            if ($method === 'DELETE' && $id !== null) {
                if ($c = find_by_id($gs, $SID, 'complaints', $id)) {
                    $childRows = [];
                    foreach ($gs->table($SID, 'complaint_responses')['rows'] as $r) {
                        if ((string) ($r['complaint_id'] ?? '') === (string) $id) $childRows[] = $r['_row'];
                    }
                    if ($childRows) $gs->deleteRows($SID, 'complaint_responses', $childRows);
                    $gs->deleteRows($SID, 'complaints', [$c['_row']]);
                }
                json_out(['success' => true]);
            }
            break;
    }

    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);

} catch (Exception $e) {
    json_out(['error' => $e->getMessage()], 500);
}


// ══════════════════════════════════════════════════════════════════════════
//  RECORD helpers
// ══════════════════════════════════════════════════════════════════════════

function cil_record_shape(array $r, array $discRows) {
    $groups = [];
    foreach ($discRows as $d) {
        $k = (string) ($d['disc_order'] ?? '0');
        if (!isset($groups[$k])) $groups[$k] = ['topic' => $d['topic'] ?? '', 'points' => []];
        if (($d['point'] ?? '') !== '') {
            $groups[$k]['points'][(int) ($d['point_order'] ?? 0)] = $d['point'];
        }
    }
    ksort($groups, SORT_NUMERIC);
    $discussions = [];
    foreach ($groups as $g) {
        ksort($g['points'], SORT_NUMERIC);
        $discussions[] = ['topic' => $g['topic'], 'points' => array_values($g['points'])];
    }
    $participants = [];
    if (($r['participants'] ?? '') !== '') {
        $dec = json_decode($r['participants'], true);
        if (is_array($dec)) $participants = $dec;
    }
    return [
        'id'               => $r['id'],
        'company'          => $r['company'] ?? '',
        'salesRep'         => $r['sales_rep'] ?? '',
        'contactPerson'    => $r['contact_person'] ?? '',
        'channel'          => $r['channel'] ?? '',
        'date'             => $r['date'] ?? '',
        'time'             => $r['time'] ?? '',
        'location'         => $r['location'] ?? '',
        'urgentFollowUp'   => to_bool($r['urgent_follow_up'] ?? ''),
        'followUpNote'     => $r['follow_up_note'] ?? '',
        'followUpDeadline' => $r['follow_up_deadline'] ?? '',
        'participants'     => $participants,
        'discussions'      => $discussions,
        '_created'         => $r['created_at'] ?? '',
    ];
}

function cil_records_all(GoogleSheets $gs, $SID) {
    $recs = $gs->table($SID, 'records')['rows'];
    $byRec = [];
    foreach ($gs->table($SID, 'discussions')['rows'] as $d) {
        $byRec[$d['record_id'] ?? ''][] = $d;
    }
    $out = [];
    foreach ($recs as $r) {
        if (($r['id'] ?? '') === '' || to_bool($r['deleted'] ?? '')) continue;
        $out[] = cil_record_shape($r, $byRec[$r['id']] ?? []);
    }
    usort($out, function ($a, $b) {
        $c = strcmp($b['date'] ?? '', $a['date'] ?? '');
        return $c !== 0 ? $c : strcmp($b['_created'] ?? '', $a['_created'] ?? '');
    });
    foreach ($out as &$o) unset($o['_created']);
    return $out;
}

function cil_record_full(GoogleSheets $gs, $SID, $id) {
    $r = find_by_id($gs, $SID, 'records', $id);
    if (!$r) return null;
    $disc = [];
    foreach ($gs->table($SID, 'discussions')['rows'] as $d) {
        if ((string) ($d['record_id'] ?? '') === (string) $id) $disc[] = $d;
    }
    $shape = cil_record_shape($r, $disc);
    unset($shape['_created']);
    return $shape;
}

function cil_upsert_record(GoogleSheets $gs, $SID, array $b) {
    $id       = ($b['id'] ?? '') !== '' ? $b['id'] : sc_uid();
    $company  = trim($b['company'] ?? '');
    $salesRep = trim($b['salesRep'] ?? '');

    if ($company !== '' && !find_by_name($gs, $SID, 'companies', $company)) {
        $gs->appendAssoc($SID, 'companies', ['id' => sc_uid(), 'name' => $company]);
    }
    if ($salesRep !== '' && !find_by_name($gs, $SID, 'salespeople', $salesRep)) {
        $gs->appendAssoc($SID, 'salespeople', ['id' => sc_uid(), 'name' => $salesRep]);
    }

    $participants = json_encode(
        array_values(array_filter(array_map('trim', $b['participants'] ?? []), fn($x) => $x !== '')),
        JSON_UNESCAPED_UNICODE
    );

    $assoc = [
        'id'                 => $id,
        'company'            => $company,
        'sales_rep'          => $salesRep,
        'contact_person'     => $b['contactPerson'] ?? '',
        'channel'            => $b['channel'] ?? '',
        'date'               => $b['date'] ?? '',
        'time'               => $b['time'] ?? '',
        'location'           => $b['location'] ?? '',
        'urgent_follow_up'   => !empty($b['urgentFollowUp']) ? 'TRUE' : 'FALSE',
        'follow_up_note'     => $b['followUpNote'] ?? '',
        'follow_up_deadline' => $b['followUpDeadline'] ?? '',
        'participants'       => $participants,
        'deleted'            => 'FALSE',
    ];

    $existing = find_by_id($gs, $SID, 'records', $id);
    if ($existing) {
        $assoc['created_at'] = $existing['created_at'] ?? sc_now();
        $gs->updateAssoc($SID, 'records', $existing['_row'], $assoc);
    } else {
        $assoc['created_at'] = sc_now();
        $gs->appendAssoc($SID, 'records', $assoc);
    }

    cil_replace_discussions($gs, $SID, $id, $b['discussions'] ?? []);
    return cil_record_full($gs, $SID, $id);
}

function cil_replace_discussions(GoogleSheets $gs, $SID, $recordId, array $discussions) {
    $del = [];
    foreach ($gs->table($SID, 'discussions')['rows'] as $d) {
        if ((string) ($d['record_id'] ?? '') === (string) $recordId) $del[] = $d['_row'];
    }
    if ($del) $gs->deleteRows($SID, 'discussions', $del);

    $append = [];
    foreach ($discussions as $di => $disc) {
        $topic  = trim($disc['topic'] ?? '');
        $points = array_values(array_filter(array_map('trim', $disc['points'] ?? []), fn($x) => $x !== ''));
        if ($topic === '' && count($points) === 0) continue;
        if (count($points) === 0) {
            $append[] = ['record_id' => $recordId, 'disc_order' => $di, 'topic' => $topic, 'point_order' => 0, 'point' => ''];
        } else {
            foreach ($points as $pi => $pt) {
                $append[] = ['record_id' => $recordId, 'disc_order' => $di, 'topic' => $topic, 'point_order' => $pi, 'point' => $pt];
            }
        }
    }
    if ($append) $gs->appendAssocBulk($SID, 'discussions', $append);
}


// ══════════════════════════════════════════════════════════════════════════
//  COMPLAINT helpers
// ══════════════════════════════════════════════════════════════════════════

function cil_complaint_shape(array $c, array $responseRows) {
    usort($responseRows, function ($a, $b) {
        $cc = strcmp($a['date'] ?? '', $b['date'] ?? '');
        return $cc !== 0 ? $cc : strcmp($a['created_at'] ?? '', $b['created_at'] ?? '');
    });
    $responses = array_map(fn($r) => [
        'id'   => $r['id'],
        'date' => $r['date'] ?? '',
        'time' => $r['time'] ?? '',
        'note' => $r['note'] ?? '',
        'by'   => $r['by'] ?? '',
    ], $responseRows);

    return [
        'id'            => $c['id'],
        'company'       => $c['company'] ?? '',
        'assignedTo'    => $c['assigned_to'] ?? '',
        'contactPerson' => $c['contact_person'] ?? '',
        'priority'      => $c['priority'] ?? 'medium',
        'status'        => $c['status'] ?? 'open',
        'detail'        => $c['detail'] ?? '',
        'dateIn'        => $c['date_in'] ?? '',
        'timeIn'        => $c['time_in'] ?? '',
        'nextFollowUp'  => $c['next_follow_up'] ?? '',
        'createdAt'     => $c['created_at'] ?? '',
        'responses'     => $responses,
    ];
}

function cil_complaints_all(GoogleSheets $gs, $SID) {
    $rowsC = $gs->table($SID, 'complaints')['rows'];
    $byC = [];
    foreach ($gs->table($SID, 'complaint_responses')['rows'] as $r) {
        $byC[$r['complaint_id'] ?? ''][] = $r;
    }
    $out = [];
    foreach ($rowsC as $c) {
        if (($c['id'] ?? '') === '' || to_bool($c['deleted'] ?? '')) continue;
        $out[] = cil_complaint_shape($c, $byC[$c['id']] ?? []);
    }
    usort($out, fn($a, $b) => strcmp($b['dateIn'] ?? '', $a['dateIn'] ?? '')
        ?: strcmp($b['createdAt'] ?? '', $a['createdAt'] ?? ''));
    return $out;
}

function cil_complaint_full(GoogleSheets $gs, $SID, $id) {
    $c = find_by_id($gs, $SID, 'complaints', $id);
    if (!$c) return null;
    $resp = [];
    foreach ($gs->table($SID, 'complaint_responses')['rows'] as $r) {
        if ((string) ($r['complaint_id'] ?? '') === (string) $id) $resp[] = $r;
    }
    return cil_complaint_shape($c, $resp);
}

function cil_create_complaint(GoogleSheets $gs, $SID, array $b) {
    $id       = ($b['id'] ?? '') !== '' ? $b['id'] : sc_uid();
    $company  = trim($b['company'] ?? '');
    $assigned = trim($b['assignedTo'] ?? '');

    if ($company !== '' && !find_by_name($gs, $SID, 'companies', $company)) {
        $gs->appendAssoc($SID, 'companies', ['id' => sc_uid(), 'name' => $company]);
    }
    if ($assigned !== '' && !find_by_name($gs, $SID, 'salespeople', $assigned)) {
        $gs->appendAssoc($SID, 'salespeople', ['id' => sc_uid(), 'name' => $assigned]);
    }

    $gs->appendAssoc($SID, 'complaints', [
        'id'             => $id,
        'company'        => $company,
        'assigned_to'    => $assigned,
        'contact_person' => $b['contactPerson'] ?? '',
        'priority'       => $b['priority'] ?? 'medium',
        'status'         => 'open',
        'detail'         => $b['detail'] ?? '',
        'date_in'        => $b['dateIn'] ?? '',
        'time_in'        => $b['timeIn'] ?? '',
        'next_follow_up' => $b['nextFollowUp'] ?? '',
        'created_at'     => sc_now(),
        'deleted'        => 'FALSE',
    ]);

    if (!empty($b['initialResponse']) && trim($b['initialResponse']) !== '') {
        $gs->appendAssoc($SID, 'complaint_responses', [
            'id'           => sc_uid(),
            'complaint_id' => $id,
            'by'           => $assigned,
            'date'         => $b['dateIn'] ?? date('Y-m-d'),
            'time'         => $b['timeIn'] ?? '',
            'note'         => trim($b['initialResponse']),
            'created_at'   => sc_now(),
        ]);
    }
    return cil_complaint_full($gs, $SID, $id);
}

function cil_update_complaint(GoogleSheets $gs, $SID, $id, array $b) {
    $c = find_by_id($gs, $SID, 'complaints', $id);
    if (!$c) json_out(['error' => 'Complaint tidak ditemukan'], 404);

    $company  = trim($b['company'] ?? '');
    $assigned = trim($b['assignedTo'] ?? '');
    if ($company !== '' && !find_by_name($gs, $SID, 'companies', $company)) {
        $gs->appendAssoc($SID, 'companies', ['id' => sc_uid(), 'name' => $company]);
    }
    if ($assigned !== '' && !find_by_name($gs, $SID, 'salespeople', $assigned)) {
        $gs->appendAssoc($SID, 'salespeople', ['id' => sc_uid(), 'name' => $assigned]);
    }

    $c['company']        = $company;
    $c['assigned_to']    = $assigned;
    $c['contact_person'] = $b['contactPerson'] ?? '';
    $c['priority']       = $b['priority'] ?? 'medium';
    $c['detail']         = $b['detail'] ?? '';
    $c['date_in']        = $b['dateIn'] ?? '';
    $c['time_in']        = $b['timeIn'] ?? '';
    $c['next_follow_up'] = $b['nextFollowUp'] ?? '';
    $gs->updateAssoc($SID, 'complaints', $c['_row'], $c);

    return cil_complaint_full($gs, $SID, $id);
}
