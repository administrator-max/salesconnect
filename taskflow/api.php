<?php
/**
 * TaskFlow REST API — backed by the TaskFlow Google Spreadsheet.
 * Routes (relative to /taskflow/api/):
 *   staff   GET, POST, DELETE/:id
 *   tasks   GET (?staff_id=), POST,
 *           PATCH/:id/accept, PATCH/:id/reject, PATCH/:id/done, DELETE/:id
 */
require_once __DIR__ . '/../lib/sheet_util.php';

$cfg = sc_config();
$SID = $cfg['spreadsheets']['taskflow'];
$gs  = new GoogleSheets();

$method = $_SERVER['REQUEST_METHOD'];
$parts  = array_values(array_filter(explode('/', trim(sc_route(), '/')), fn($p) => $p !== ''));
$res    = $parts[0] ?? '';
$id     = $parts[1] ?? null;
$action = $parts[2] ?? null;

try {
    switch ($res) {

        // ── STAFF ────────────────────────────────────────────────────────
        case 'staff':
            if ($method === 'GET') {
                $out = [];
                foreach ($gs->table($SID, 'staff')['rows'] as $r) {
                    if (($r['id'] ?? '') === '') continue;
                    $out[] = [
                        'id'         => $r['id'],
                        'name'       => $r['name'] ?? '',
                        'position'   => $r['position'] ?? '',
                        'created_at' => $r['created_at'] ?? '',
                    ];
                }
                usort($out, fn($a, $b) => strcmp($a['created_at'], $b['created_at']));
                json_out($out);
            }
            if ($method === 'POST') {
                $b = json_body();
                $name = trim($b['name'] ?? '');
                $pos  = trim($b['position'] ?? '');
                if ($name === '' || $pos === '') json_out(['error' => 'Name and position are required'], 400);
                $row = ['id' => sc_uid(), 'name' => $name, 'position' => $pos, 'created_at' => sc_now()];
                $gs->appendAssoc($SID, 'staff', $row);
                json_out($row, 201);
            }
            if ($method === 'DELETE' && $id !== null) {
                $row = find_by_id($gs, $SID, 'staff', $id);
                if (!$row) json_out(['error' => 'Staff not found'], 404);
                // cascade: remove tasks referencing this staff (ON DELETE CASCADE)
                $taskRows = [];
                foreach ($gs->table($SID, 'tasks')['rows'] as $t) {
                    if ((string) ($t['from'] ?? '') === (string) $id || (string) ($t['to'] ?? '') === (string) $id) $taskRows[] = $t['_row'];
                }
                if ($taskRows) $gs->deleteRows($SID, 'tasks', $taskRows);
                $gs->deleteRows($SID, 'staff', [$row['_row']]);
                json_out(['success' => true]);
            }
            break;

        // ── TASKS ────────────────────────────────────────────────────────
        case 'tasks':
            if ($method === 'GET' && $id === null) {
                $staffId = $_GET['staff_id'] ?? null;
                $out = [];
                foreach ($gs->table($SID, 'tasks')['rows'] as $t) {
                    if (($t['id'] ?? '') === '') continue;
                    if ($staffId && (string) ($t['from'] ?? '') !== (string) $staffId && (string) ($t['to'] ?? '') !== (string) $staffId) continue;
                    $out[] = tf_task_shape($t);
                }
                usort($out, fn($a, $b) => strcmp($b['createdAt'] ?? '', $a['createdAt'] ?? ''));
                json_out($out);
            }
            if ($method === 'POST' && $id === null) {
                $b = json_body();
                $title = trim($b['title'] ?? '');
                $from  = $b['from'] ?? '';
                $to    = $b['to'] ?? '';
                if ($title === '')      json_out(['error' => 'Title is required'], 400);
                if (!$from || !$to)     json_out(['error' => 'from and to are required'], 400);
                if ($from === $to)      json_out(['error' => 'Cannot assign a task to yourself'], 400);
                if (!find_by_id($gs, $SID, 'staff', $from) || !find_by_id($gs, $SID, 'staff', $to)) {
                    json_out(['error' => 'Invalid staff id(s)'], 400);
                }
                $row = [
                    'id'                => sc_uid(),
                    'title'             => $title,
                    'description'       => trim($b['description'] ?? ''),
                    'from'              => $from,
                    'to'                => $to,
                    'status'            => 'pending',
                    'proposed_deadline' => $b['proposedDeadline'] ?? '',
                    'deadline'          => '',
                    'deadline_revised'  => 'FALSE',
                    'reject_reason'     => '',
                    'completion_note'   => '',
                    'created_at'        => sc_now(),
                    'updated_at'        => sc_now(),
                ];
                $gs->appendAssoc($SID, 'tasks', $row);
                json_out(tf_task_shape($row), 201);
            }
            if ($method === 'PATCH' && $id !== null && in_array($action, ['accept', 'reject', 'done'], true)) {
                $b = json_body();
                $t = find_by_id($gs, $SID, 'tasks', $id);
                if (!$t) json_out(['error' => 'Task not found'], 404);

                if ($action === 'accept') {
                    if (empty($b['deadline'])) json_out(['error' => 'deadline is required'], 400);
                    if (($t['status'] ?? '') !== 'pending') json_out(['error' => 'Task not found or already processed'], 404);
                    $t['status']           = 'progress';
                    $t['deadline']         = $b['deadline'];
                    $t['deadline_revised'] = !empty($b['deadlineRevised']) ? 'TRUE' : 'FALSE';
                } elseif ($action === 'reject') {
                    if (empty($b['rejectReason'])) json_out(['error' => 'rejectReason is required'], 400);
                    if (($t['status'] ?? '') !== 'pending') json_out(['error' => 'Task not found or already processed'], 404);
                    $t['status']        = 'rejected';
                    $t['reject_reason'] = trim($b['rejectReason']);
                } else { // done
                    if (($t['status'] ?? '') !== 'progress') json_out(['error' => 'Task not found or not in progress'], 404);
                    $t['status']          = 'done';
                    $t['completion_note'] = trim($b['completionNote'] ?? '');
                }
                $t['updated_at'] = sc_now();
                $gs->updateAssoc($SID, 'tasks', $t['_row'], $t);
                json_out(tf_task_shape($t));
            }
            if ($method === 'DELETE' && $id !== null) {
                $t = find_by_id($gs, $SID, 'tasks', $id);
                if (!$t) json_out(['error' => 'Task not found'], 404);
                $gs->deleteRows($SID, 'tasks', [$t['_row']]);
                json_out(['success' => true]);
            }
            break;
    }

    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);

} catch (Exception $e) {
    json_out(['error' => $e->getMessage()], 500);
}


function tf_task_shape(array $row) {
    return [
        'id'               => $row['id'],
        'title'            => $row['title'] ?? '',
        'description'      => ($row['description'] ?? '') === '' ? null : $row['description'],
        'from'             => $row['from'] ?? '',
        'to'               => $row['to'] ?? '',
        'status'           => $row['status'] ?? 'pending',
        'proposedDeadline' => ($row['proposed_deadline'] ?? '') === '' ? null : $row['proposed_deadline'],
        'deadline'         => ($row['deadline'] ?? '') === '' ? null : $row['deadline'],
        'deadlineRevised'  => to_bool($row['deadline_revised'] ?? ''),
        'rejectReason'     => ($row['reject_reason'] ?? '') === '' ? null : $row['reject_reason'],
        'completionNote'   => ($row['completion_note'] ?? '') === '' ? null : $row['completion_note'],
        'createdAt'        => $row['created_at'] ?? '',
        'updatedAt'        => $row['updated_at'] ?? '',
    ];
}
