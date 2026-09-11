<?php
/**
 * PEMULIHAN — enam baris yang saya rusak sendiri 11-Sep-2026.
 *
 * APA YANG TERJADI
 * ----------------
 * selaraskan_dengan_pertek_spi.php memanggil updateAssoc() dengan assoc PARSIAL
 * (`['mt' => 300]`), mengira itu menyunting satu kolom. Ternyata updateAssoc()
 * menulis ULANG SELURUH BARIS:
 *
 *     foreach ($headers as $h) $row[] = array_key_exists($h, $assoc) ? $assoc[$h] : '';
 *
 * Kolom yang tidak disebut menjadi KOSONG. Akibatnya company_code dan
 * cycle_type ikut terhapus, dan ketiga baris Obtained #2 hilang dari payload.
 * Ketahuan karena kartu Obtained meleset 950 MT dari Σ per-produk, dan lencana
 * pemeriksaan mandiri menyalakan "⚠ 1 tidak cocok".
 *
 * Isi aslinya diambil dari pembacaan sebelum penulisan (tools/lihat_baris_koreksi.php),
 * dengan mt memakai nilai KOREKSI yang memang diminta.
 *
 * Dry-run:  php tools/pulihkan_baris_obtained2.php
 * Terapkan: php tools/pulihkan_baris_obtained2.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$apply = in_array('--apply', $argv, true);
$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$cycles = [
    [20, [
        'id' => '45059', 'company_code' => 'BBB', 'cycle_type' => 'Obtained #2', 'mt' => 300,
        'submit_type' => 'Submit MOT (Submit #2) Perubahan', 'submit_date' => '17/04/2026',
        'release_type' => 'SPI Perubahan', 'release_date' => '26/06/2026',
        'status' => 'SPI Perubahan TERBIT — No. 04.PI-05.26.0450.1 · 26/06/2026',
        'sort_order' => 2, 'pertek_date' => '', 'spi_date' => '26/06/2026',
        'from_rev_req' => '1', 'source_program' => 'B', 'quota_year' => '2026',
    ]],
    [100, [
        'id' => '45139', 'company_code' => 'KJK', 'cycle_type' => 'Obtained #2', 'mt' => 450,
        'submit_type' => 'Submit MOT (Submit #2) Perubahan', 'submit_date' => '',
        'release_type' => 'SPI Perubahan', 'release_date' => '04/06/2026', 'status' => '',
        'sort_order' => 3, 'pertek_date' => '', 'spi_date' => '04/06/2026',
        'from_rev_req' => '', 'source_program' => 'B', 'quota_year' => '2026',
    ]],
    [106, [
        'id' => '45145', 'company_code' => 'LCP', 'cycle_type' => 'Obtained #2', 'mt' => 200,
        'submit_type' => 'Submit MOT (Submit #2) Perubahan', 'submit_date' => '',
        'release_type' => 'SPI Perubahan', 'release_date' => '16/07/2026',
        'status' => 'SPI Perubahan TERBIT — No.  04.PI-05.25.3745.1 · 16/07/2026',
        'sort_order' => 4, 'pertek_date' => '', 'spi_date' => '16/07/2026',
        'from_rev_req' => '', 'source_program' => 'B', 'quota_year' => '2026',
    ]],
];

$prods = [
    [22,  ['id' => '47458', 'cycle_id' => '45059', 'product' => 'GL ALLOY', 'mt' => 300, 'source_program' => 'B']],
    [108, ['id' => '47544', 'cycle_id' => '45139', 'product' => 'GL ALLOY', 'mt' => 450, 'source_program' => 'B']],
    [114, ['id' => '47550', 'cycle_id' => '45145', 'product' => 'GL ALLOY', 'mt' => 200, 'source_program' => 'B']],
];

echo "\n=== BARIS YANG AKAN DIPULIHKAN ===\n";
foreach ($cycles as [$row, $a]) {
    echo sprintf("  cycles        baris %-4d %s %s = %s MT\n", $row, $a['company_code'], $a['cycle_type'], $a['mt']);
}
foreach ($prods as [$row, $a]) {
    echo sprintf("  cycle_products baris %-4d cycle %s %s = %s MT\n", $row, $a['cycle_id'], $a['product'], $a['mt']);
}

/* Pagar: header tab harus persis yang diharapkan, supaya tidak ada kolom yang
   diam-diam tertinggal kosong lagi. */
$hdrCycles = $gs->headers($sid, 'cycles');
$hdrProds  = $gs->headers($sid, 'cycle_products');
$kurang = [];
foreach ($hdrCycles as $h) if (!array_key_exists($h, $cycles[0][1])) $kurang[] = "cycles.$h";
foreach ($hdrProds  as $h) if (!array_key_exists($h, $prods[0][1]))  $kurang[] = "cycle_products.$h";
if ($kurang) {
    echo "\n=== PAGAR MENOLAK ===\n";
    echo "  Kolom berikut ada di sheet tapi tidak saya isi — akan jadi kosong lagi:\n";
    foreach ($kurang as $k) echo "    ! $k\n";
    echo "\nTIDAK ADA YANG DITULIS.\n";
    exit(1);
}
echo "\n  pagar: semua kolom sheet terisi (cycles " . count($hdrCycles)
   . " kolom, cycle_products " . count($hdrProds) . " kolom)\n";

if (!$apply) { echo "\nDRY-RUN. Jalankan ulang dengan --apply.\n"; exit(0); }

echo "\n=== MENULIS ===\n";
foreach ($cycles as [$row, $a]) { $gs->updateAssoc($sid, 'cycles', $row, $a);         echo "  ok  cycles baris $row\n"; }
foreach ($prods  as [$row, $a]) { $gs->updateAssoc($sid, 'cycle_products', $row, $a); echo "  ok  cycle_products baris $row\n"; }
echo "\nSelesai.\n";
