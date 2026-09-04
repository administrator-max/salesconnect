<?php
/**
 * Menampilkan BARIS MENTAH dari spreadsheet untuk satu atau beberapa company —
 * apa adanya, sebelum iq_build_payload() menyentuhnya.
 *
 * Dipakai untuk memisahkan dua kemungkinan yang terlihat sama dari dashboard:
 * data memang belum ada di master, atau data ada tapi hilang saat dibangun.
 * Menebak di antara keduanya adalah cara tercepat memperbaiki hal yang salah.
 *
 * Contoh:  php tools/lihat_baris_mentah.php AMP SNSD
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';

$kode = array_values(array_filter(array_slice($argv, 1), fn($a) => $a !== '' && $a[0] !== '-'));
if (!$kode) { echo "Pakai: php tools/lihat_baris_mentah.php <KODE> [KODE...]\n"; exit(1); }

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$tabs = ['companies', 'cycles', 'cycle_products', 'cycle_utilization', 'company_stats', 'products'];
foreach ($tabs as $tab) {
    $t = null;
    try { $t = $gs->table($sid, $tab); } catch (Throwable $e) { echo "\n[$tab] tidak terbaca: {$e->getMessage()}\n"; continue; }
    $rows = $t['rows'] ?? [];
    $cocok = array_values(array_filter($rows, function ($r) use ($kode) {
        foreach (['code', 'company', 'company_code', 'co'] as $k)
            if (isset($r[$k]) && in_array((string) $r[$k], $kode, true)) return true;
        return false;
    }));
    printf("\n══ %s ══ (%d dari %d baris)\n", $tab, count($cocok), count($rows));
    if (!$cocok) continue;
    printf("   kolom: %s\n", implode(', ', $t['headers'] ?? []));
    foreach ($cocok as $r) {
        $isi = [];
        foreach ($r as $k => $v) { if ($v === '' || $v === null) continue; $isi[] = "$k=" . (is_scalar($v) ? $v : json_encode($v)); }
        echo '   · ' . implode('  ', $isi) . "\n";
    }
}
echo "\n";
