<?php
/**
 * Lihat isi SCOT — kolom, sebaran cargo_type, dan contoh baris Domestic.
 * HANYA MEMBACA. Dipakai untuk memahami bentuk data sebelum membandingkannya
 * dengan IQ Dash.
 *
 * Jalankan: php tools/lihat_scot.php
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';

$cfg = sc_config();
$sid = $cfg['spreadsheets']['scot'];
$gs  = new GoogleSheets();

$t = $gs->table($sid, 'shipments', false);
$h = $t['headers'] ?? [];
$rows = $t['rows'] ?? [];

echo "KOLOM (" . count($h) . "):\n  " . implode(' | ', $h) . "\n\n";
echo "BARIS: " . count($rows) . "\n";

$jenis = [];
foreach ($rows as $r) { $k = trim((string) ($r['cargo_type'] ?? '')) ?: '(kosong)'; $jenis[$k] = ($jenis[$k] ?? 0) + 1; }
echo "cargo_type: " . json_encode($jenis) . "\n\n";

/* Kolom yang tampak penting untuk dicocokkan dengan IQ Dash. */
$minat = array_values(array_filter($h, fn($c) => preg_match(
    '/project|company|customer|client|consignee|product|item|qty|quantity|mt|ton|weight|volume|status|contract|hs|code|date|delivery|warehouse|remark|pt\b/i', $c)));
echo "kolom yang tampak relevan:\n  " . implode(', ', $minat) . "\n\n";

echo "CONTOH 6 BARIS DOMESTIC (kolom tak kosong):\n";
$n = 0;
foreach ($rows as $r) {
    if (($r['cargo_type'] ?? '') !== 'Domestic') continue;
    if ($n++ >= 6) break;
    $x = [];
    foreach ($r as $k => $v) {
        if ($v === '' || $v === null || $k === '_row') continue;
        $x[] = $k . '=' . mb_substr((string) $v, 0, 40);
    }
    echo "  - " . implode('  ', $x) . "\n";
}
