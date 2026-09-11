<?php
/**
 * Sisir seluruh tab IQ Dash untuk baris rusak: kosong, tanpa id, tanpa
 * company_code, atau yatim (menunjuk induk yang tidak ada).
 *
 * Dibuat sesudah 11-Sep-2026, ketika updateAssoc() dengan assoc parsial
 * mengosongkan tiga baris cycles. HANYA MEMBACA.
 *
 * Jalankan: php tools/audit_baris_kosong.php
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$tabs = ['companies', 'cycles', 'cycle_products', 'cycle_utilization',
         'company_product_stats', 'realizations'];

$temuan = 0;
foreach ($tabs as $tab) {
    $rows = [];
    try { $rows = ($gs->table($sid, $tab, false)["rows"] ?? []); } catch (Throwable $e) {
        echo "-- $tab: tidak terbaca (" . $e->getMessage() . ")\n"; continue;
    }
    $kosong = []; $tanpaId = []; $tanpaCo = [];
    foreach ($rows as $r) {
        $baris = $r['_row'] ?? '?';
        $isi = array_filter($r, fn($v, $k) => $k !== '_row' && $v !== '' && $v !== null, ARRAY_FILTER_USE_BOTH);
        if (!count($isi))                                   { $kosong[]  = $baris; continue; }
        if (array_key_exists('id', $r) && trim((string) $r['id']) === '')       $tanpaId[] = $baris;
        if (array_key_exists('company_code', $r) && trim((string) $r['company_code']) === '') $tanpaCo[] = $baris;
    }
    $n = count($rows);
    $pesan = [];
    if ($kosong)  $pesan[] = count($kosong)  . ' baris KOSONG (' . implode(',', array_slice($kosong, 0, 10)) . ')';
    if ($tanpaId) $pesan[] = count($tanpaId) . ' tanpa id ('     . implode(',', array_slice($tanpaId, 0, 10)) . ')';
    if ($tanpaCo) $pesan[] = count($tanpaCo) . ' tanpa company_code (' . implode(',', array_slice($tanpaCo, 0, 10)) . ')';
    $temuan += count($kosong) + count($tanpaId) + count($tanpaCo);
    printf("  %-24s %3d baris   %s\n", $tab, $n, $pesan ? implode(' · ', $pesan) : 'bersih');
}

/* Yatim: cycle_products yang cycle_id-nya tidak ada di cycles. */
$cyc = $gs->table($sid, 'cycles', false);
$ids = [];
foreach ($cyc as $r) { $id = trim((string) ($r['id'] ?? '')); if ($id !== '') $ids[$id] = true; }
$yatim = [];
foreach ($gs->table($sid, 'cycle_products', false) as $r) {
    $cid = trim((string) ($r['cycle_id'] ?? ''));
    if ($cid !== '' && !isset($ids[$cid])) $yatim[] = ($r['_row'] ?? '?') . '(cycle ' . $cid . ')';
}
$temuan += count($yatim);
printf("  %-24s %s\n", 'cycle_products yatim', $yatim ? (count($yatim) . ': ' . implode(', ', array_slice($yatim, 0, 12))) : 'nihil');

/* Duplikat id per tab. */
foreach (['cycles', 'cycle_products', 'cycle_utilization'] as $tab) {
    $lihat = []; $dobel = [];
    foreach (($gs->table($sid, $tab, false)["rows"] ?? []) as $r) {
        $id = trim((string) ($r['id'] ?? ''));
        if ($id === '') continue;
        if (isset($lihat[$id])) $dobel[] = $id; else $lihat[$id] = true;
    }
    $temuan += count($dobel);
    printf("  %-24s %s\n", "id kembar di $tab", $dobel ? implode(', ', array_slice($dobel, 0, 10)) : 'nihil');
}

echo "\n" . ($temuan ? "TEMUAN: $temuan" : 'BERSIH — tidak ada baris rusak.') . "\n";
