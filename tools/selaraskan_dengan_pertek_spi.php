<?php
/**
 * Selaraskan siklus dengan tabel PERTEK & SPI (acuan pemilik data 11-Sep-2026).
 *
 * ACUANNYA
 * --------
 * Tabel yang dikirim pemilik data, kolom Submitted/Obtained/Utilized/Available
 * "From all cycle Total (MT)", total 252.845 / 35.460 / 26.146 / 9.314.
 * Cross-check penuh 50 baris x 4 ukuran menyisakan empat selisih, dan
 * keempatnya bermuara pada lima baris master di bawah ini.
 *
 * YANG DITULIS
 * ------------
 *  1. BBB  Obtained #2   700  -> 300   (cycles id 45059 + cycleProducts 47458)
 *  2. KJK  Obtained #2 3.000  -> 450   (cycles id 45139 + cycleProducts 47544)
 *  3. LCP  Obtained #2 3.000  -> 200   (cycles id 45145 + cycleProducts 47550)
 *  4. BBB  Submit #2  BARU, 2.300 MT   (cycles + cycleProducts)
 *  5. DIOR Utilization #1 BARU, 100 MT (cycleUtil)
 *
 * KENAPA ANGKA-ANGKA ITU, BUKAN TEBAKAN
 * -------------------------------------
 * Ketiga Obtained cocok dengan lot utilisasi yang SUDAH tercatat di master:
 *   BBB  Utilization #1 400 + #2 300 = 700   -> Obtained #1 400 + #2 300 = 700
 *   KJK  Utilization #1 550+400 + #2 450 = 1.400 -> Obtained #1 950 + #2 450
 *   LCP  Utilization #1 275 + #2 200 = 475   -> Obtained #1 275 + #2 200 = 475
 * Ketiganya sama persis dengan kolom Obtained di acuan. Nilai 3.000/700 yang
 * sekarang adalah angka yang DIMINTA pada re-apply, bukan yang diperoleh —
 * panel Obtained memang mengisi otomatis dengan angka request.
 *
 * BBB Submit #2 = 11.300 (acuan) - 6.000 (Submit #1) - 3.000 (re-apply yang
 * sudah dikonfirmasi) = 2.300. Tanggalnya 17/04/2026, diambil dari submit_date
 * pada Obtained #2 BBB yang bertuliskan "Submit MOT (Submit #2) Perubahan" —
 * prosesnya memang ada, baris siklusnya yang tidak pernah dicatat. Tanggal itu
 * WAJIB lebih tua dari konfirmasi re-apply (10-Sep-26), kalau tidak
 * pendingReapplyCycles() akan menganggap re-apply-nya sudah menjelma jadi
 * siklus Submit dan 3.000 MT-nya berhenti dihitung.
 *
 * DIOR 100 MT: acuan menyebut Utilized 100 dan Available 0, sementara master
 * tidak punya satu pun lot utilisasi DIOR. Tanggalnya 31/08/2026, mengikuti
 * SPI Perubahan yang menerbitkan kuota itu.
 *
 * PAGAR
 * -----
 * Menolak menulis kalau baris sasarannya tidak ditemukan, atau nilainya sudah
 * bukan nilai yang diharapkan (berarti ada yang mengubahnya lebih dulu).
 *
 * Dry-run:  php tools/selaraskan_dengan_pertek_spi.php
 * Terapkan: php tools/selaraskan_dengan_pertek_spi.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$apply = in_array('--apply', $argv, true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();
$t   = iq_load_tables($gs, $sid);

$cari = function (array $rows, string $kunci, string $nilai) {
    foreach ($rows as $r) if ((string) ($r[$kunci] ?? '') === $nilai) return $r;
    return null;
};

$ubah   = [];   // [tab, sheetRow, assoc, keterangan]
$tambah = [];   // [tab, assoc, keterangan]
$salah  = [];

/* ── 1-3. Tiga Obtained #2 ─────────────────────────────────────────────── */
$koreksi = [
    ['BBB', '45059', '47458', 700,  300],
    ['KJK', '45139', '47544', 3000, 450],
    ['LCP', '45145', '47550', 3000, 200],
];
foreach ($koreksi as [$co, $cycId, $prodId, $dari, $ke]) {
    $c = $cari($t['cycles'] ?? [], 'id', $cycId);
    if (!$c)                                   { $salah[] = "$co: siklus id $cycId tidak ada"; continue; }
    if ((float) ($c['mt'] ?? 0) !== (float) $dari) {
        $salah[] = "$co: siklus id $cycId mt-nya " . ($c['mt'] ?? '?') . ", bukan $dari — sudah diubah orang lain?";
        continue;
    }
    $ubah[] = ['cycles', $c['_row'], ['mt' => $ke], "$co {$c['cycle_type']}: $dari -> $ke MT"];

    $p = $cari($t['cycleProducts'] ?? [], 'id', $prodId);
    if (!$p)                                   { $salah[] = "$co: cycleProducts id $prodId tidak ada"; continue; }
    if ((float) ($p['mt'] ?? 0) !== (float) $dari) {
        $salah[] = "$co: cycleProducts id $prodId mt-nya " . ($p['mt'] ?? '?') . ", bukan $dari";
        continue;
    }
    $ubah[] = ['cycleProducts', $p['_row'], ['mt' => $ke], "$co rincian {$p['product']}: $dari -> $ke MT"];
}

/* ── 4. BBB Submit #2 yang belum pernah dicatat ────────────────────────── */
$adaSubmit2 = false;
foreach ($t['cycles'] ?? [] as $r) {
    if (($r['company_code'] ?? '') === 'BBB' && stripos((string) ($r['cycle_type'] ?? ''), 'submit #2') === 0) $adaSubmit2 = true;
}
$idCycleBaru = 0;
foreach ($t['cycles'] ?? [] as $r) { $idCycleBaru = max($idCycleBaru, (int) ($r['id'] ?? 0)); }
$idCycleBaru++;
if ($adaSubmit2) {
    $salah[] = 'BBB: Submit #2 SUDAH ada — jangan ditambah lagi';
} else {
    $tambah[] = ['cycles', [
        'id' => (string) $idCycleBaru, 'company_code' => 'BBB', 'cycle_type' => 'Submit #2',
        'mt' => 2300, 'submit_type' => 'Submit MOI Perubahan (Submit #2)', 'submit_date' => '17/04/2026',
        'release_type' => 'PERTEK', 'release_date' => '', 'status' => 'Dicatat 11/09/2026 — selaras PERTEK & SPI',
        'sort_order' => 3, 'pertek_date' => '', 'spi_date' => '', 'from_rev_req' => '',
        'source_program' => 'B', 'quota_year' => '2026',
    ], 'BBB Submit #2 BARU: 2.300 MT, submit 17/04/2026'];

    $idProdBaru = 0;
    foreach ($t['cycleProducts'] ?? [] as $r) { $idProdBaru = max($idProdBaru, (int) ($r['id'] ?? 0)); }
    $tambah[] = ['cycleProducts', [
        'id' => (string) ($idProdBaru + 1), 'cycle_id' => (string) $idCycleBaru,
        'product' => 'GL ALLOY', 'mt' => 2300, 'source_program' => 'B',
    ], 'BBB rincian Submit #2 BARU: GL ALLOY 2.300 MT'];
}

/* ── 5. DIOR: lot utilisasi 100 MT ─────────────────────────────────────── */
$adaLotDior = false;
foreach ($t['cycleUtil'] ?? [] as $r) { if (($r['company_code'] ?? '') === 'DIOR') $adaLotDior = true; }
if ($adaLotDior) {
    $salah[] = 'DIOR: lot utilisasi SUDAH ada — periksa dulu, jangan ditambah';
} else {
    $idUtilBaru = 0;
    foreach ($t['cycleUtil'] ?? [] as $r) { $idUtilBaru = max($idUtilBaru, (int) ($r['id'] ?? 0)); }
    $tambah[] = ['cycleUtil', [
        'id' => (string) ($idUtilBaru + 1), 'company_code' => 'DIOR', 'cycle_type' => 'Utilization #1',
        'product' => 'GL ALLOY', 'util_mt' => 100, 'util_date' => '31/08/2026',
        'source_program' => 'B', 'quota_year' => '2026',
    ], 'DIOR lot utilisasi BARU: GL ALLOY 100 MT, 31/08/2026'];
}

/* Nama TAB di spreadsheet berbeda dari kunci di iq_load_tables(). */
function tabAsli(string $kunci): string {
    $peta = ['cycles' => 'cycles', 'cycleProducts' => 'cycle_products',
             'cycleUtil' => 'cycle_utilization'];
    return $peta[$kunci] ?? $kunci;
}

/* ── Laporan ───────────────────────────────────────────────────────────── */
echo "\n=== YANG AKAN DIUBAH (" . count($ubah) . ") ===\n";
foreach ($ubah as [$tab, $row, $assoc, $ket]) {
    echo sprintf("  %-14s baris %-4s  %s\n", $tab, $row, $ket);
}
echo "\n=== YANG AKAN DITAMBAH (" . count($tambah) . ") ===\n";
foreach ($tambah as [$tab, $assoc, $ket]) {
    echo sprintf("  %-14s              %s\n", $tab, $ket);
}
if ($salah) {
    echo "\n=== PAGAR MENOLAK (" . count($salah) . ") ===\n";
    foreach ($salah as $s) echo "  ! $s\n";
}

if ($salah) {
    echo "\nTIDAK ADA YANG DITULIS — pagar menolak. Periksa dulu baris di atas.\n";
    exit(1);
}
if (!$apply) {
    echo "\nDRY-RUN. Tidak ada yang ditulis. Jalankan ulang dengan --apply untuk menerapkan.\n";
    exit(0);
}

/* ── Terapkan ──────────────────────────────────────────────────────────── */
echo "\n=== MENULIS ===\n";
foreach ($ubah as [$tab, $row, $assoc, $ket]) {
    $gs->updateAssoc($sid, tabAsli($tab), (int) $row, $assoc);
    echo "  ok  $tab baris $row — $ket\n";
}
foreach ($tambah as [$tab, $assoc, $ket]) {
    $gs->appendAssoc($sid, tabAsli($tab), $assoc);
    echo "  ok  $tab (baris baru) — $ket\n";
}
@unlink(iq_payload_memo_file());
echo "\nSelesai. Cache payload dibersihkan.\n";
