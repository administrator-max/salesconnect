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
