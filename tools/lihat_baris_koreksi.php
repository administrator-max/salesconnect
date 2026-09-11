<?php
/**
 * Lihat baris mentah yang akan disentuh koreksi PERTEK & SPI 11-Sep-2026.
 * HANYA MEMBACA. Tidak menulis apa pun.
 *
 * Jalankan: php tools/lihat_baris_koreksi.php
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();
$t   = iq_load_tables($gs, $sid);

$minat     = ['BBB', 'KJK', 'LCP', 'DIOR'];
$cycleIds  = ['45059','45139','45145','45061'];   // Obtained #2 BBB/KJK/LCP + Obtained #3 BBB

$cetak = function (array $r) {
    $x = [];
    foreach ($r as $k => $v) {
        if ($v === '' || $v === null) continue;
        if (in_array($k, ['created_at', 'updated_at', 'updated_by', 'created_by'], true)) continue;
        $x[] = $k . '=' . (is_scalar($v) ? (string) $v : json_encode($v));
    }
    echo "   " . implode('  ', $x) . "\n";
};

echo "== cycleProducts milik siklus yang akan dikoreksi ==\n";
foreach ($t['cycleProducts'] ?? [] as $r) {
    if (in_array((string) ($r['cycle_id'] ?? ''), $cycleIds, true)) $cetak($r);
}

echo "\n== cycleUtil (DIOR + tiga company) ==\n";
foreach ($t['cycleUtil'] ?? [] as $r) {
    if (in_array((string) ($r['company_code'] ?? ''), $minat, true)) $cetak($r);
}

echo "\n== stats ==\n";
foreach ($t['stats'] ?? [] as $r) {
    if (in_array((string) ($r['company_code'] ?? ''), $minat, true)) $cetak($r);
}

echo "\n== id tertinggi tiap tab (untuk baris baru) ==\n";
foreach (['cycles', 'cycleProducts', 'cycleUtil', 'stats'] as $tab) {
    $max = 0; $n = 0;
    foreach ($t[$tab] ?? [] as $r) { $n++; $id = (int) ($r['id'] ?? 0); if ($id > $max) $max = $id; }
    echo "   $tab: $n baris, id maks $max\n";
}
