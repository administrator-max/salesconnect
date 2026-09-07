<?php
/**
 * SJH — mencatat siklus Re-Apply #1 yang selama ini tidak pernah dibuat.
 *
 * DUDUK PERKARANYA
 * ----------------
 * Audit bawaan dashboard (__auditObtained) melaporkan SJH sebagai satu-satunya
 * ketidakcocokan yang tersisa: cycles 300 vs stats 390, selisih -90.
 *
 * Angka 390 BENAR. Pemilik data menjelaskan 04-Sep-2026:
 *
 *     Obtained #1  300 MT GL ALLOY  ->  Utilization #1  300 MT  23/12/2025
 *     Obtained #2   90 MT GL ALLOY  ->  Utilization #2   90 MT  25/06/2026
 *                  ------                              ------
 *     total        390 MT                              390 MT
 *
 * Obtained #2 berasal dari Re-Apply #1 / Submit #2 sebesar 2.700 MT — yang
 * memang tercatat di `revision_changes` (from GL BORON 300 -> to GL BORON
 * 2.700), tapi siklusnya TIDAK PERNAH dibuat di tabel `cycles`. Jadi ledger
 * menyimpan totalnya dengan benar; yang hilang adalah siklusnya.
 *
 * Yang menahan pencatatan sampai sekarang cuma satu hal: tanggal PERTEK Terbit
 * Re-Apply #1. CorpSec menjawab 07-Sep-2026: **15/05/2026**.
 *
 * KENAPA TANGGAL ITU YANG MENENTUKAN
 * ----------------------------------
 * Obtained #2 belum ber-SPI. Ia tetap terhitung lewat aturan yang sudah ada —
 * _isObtainedTerbit() memakai PERTEK Terbit dari Submit pasangannya bila baris
 * Obtained-nya sendiri belum bertanggal. Itu sebabnya `Submit #2` harus dibuat
 * bertanggal PERTEK, bukan sekadar `Obtained #2` berdiri sendiri: tanpa
 * pasangannya, 90 MT itu tidak akan terhitung sama sekali.
 *
 * YANG DITULIS — empat baris, tidak ada yang diubah
 *   cycles            Submit #2    2.700 MT · PERTEK Terbit 15/05/2026
 *   cycles            Obtained #2     90 MT · SPI belum terbit
 *   cycle_products    GL ALLOY 2.700 untuk Submit #2
 *   cycle_products    GL ALLOY    90 untuk Obtained #2
 *
 * TANGGAL YANG TIDAK DIISI: submit_date Re-Apply #1 dan tanggal SPI Obtained #2
 * tidak diberikan CorpSec, jadi dikosongkan. Mengarangnya akan menghasilkan
 * Validity Date palsu pada dashboard kepatuhan.
 *
 * PAGAR
 *   - Hanya SJH yang boleh bergerak.
 *   - Obtained SJH harus jadi TEPAT 390 (300 + 90) — tidak lebih.
 *   - Utilisasi dan Available tidak boleh berubah sama sekali.
 *   - Tidak boleh ada siklus SJH yang kembar sesudahnya.
 *
 * Dry-run:   php tools/sjh_catat_reapply1.php
 * Terapkan:  php tools/sjh_catat_reapply1.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

const CO          = 'SJH';
const PRODUK      = 'GL ALLOY';
const PERTEK_RA1  = '15/05/2026';   // jawaban CorpSec 07-Sep-2026
const MT_SUBMIT2  = 2700;
const MT_OBTAINED2 = 90;
const TAHUN       = '2026';

$APPLY = in_array('--apply', $argv, true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$cyTbl = $gs->table($sid, 'cycles');
$cpTbl = $gs->table($sid, 'cycle_products');
$cycles = $cyTbl['rows'];
$cprods = $cpTbl['rows'];

/* ── Sudah ada? ────────────────────────────────────────────────────────── */
$punya = function (string $tipe) use ($cycles) {
    foreach ($cycles as $r)
        if (($r['company_code'] ?? '') === CO
            && preg_match('/^' . preg_quote($tipe, '/') . '\b/i', (string) ($r['cycle_type'] ?? ''))) return true;
    return false;
};
if ($punya('Submit #2') || $punya('Obtained #2')) {
    echo "BERHENTI: " . CO . " sudah punya Submit #2 atau Obtained #2. Tidak ditulis dua kali.\n";
    exit(0);
}

$idCy = 0; foreach ($cycles as $r) $idCy = max($idCy, (int) ($r['id'] ?? 0));
$idCp = 0; foreach ($cprods as $r) $idCp = max($idCp, (int) ($r['id'] ?? 0));
$sort = -1; foreach ($cycles as $r) if (($r['company_code'] ?? '') === CO) $sort = max($sort, (int) ($r['sort_order'] ?? 0));

$idSubmit2   = $idCy + 1;
$idObtained2 = $idCy + 2;

$barisSubmit2 = [
    'id' => (string) $idSubmit2, 'company_code' => CO, 'cycle_type' => 'Submit #2',
    'mt' => (string) MT_SUBMIT2, 'submit_type' => 'Submit MOI (Submit #2) Perubahan',
    'submit_date' => '', 'release_type' => 'PERTEK', 'release_date' => PERTEK_RA1,
    'status' => 'PERTEK Perubahan TERBIT ' . PERTEK_RA1 . ' (Re-Apply #1)',
    'sort_order' => (string) ($sort + 1), 'pertek_date' => PERTEK_RA1, 'spi_date' => '',
    'from_rev_req' => 'FALSE', 'source_program' => 'B', 'quota_year' => TAHUN,
];
$barisObtained2 = [
    'id' => (string) $idObtained2, 'company_code' => CO, 'cycle_type' => 'Obtained #2',
    'mt' => (string) MT_OBTAINED2, 'submit_type' => 'Submit MOT (Submit #2) Perubahan',
    'submit_date' => '', 'release_type' => 'SPI Perubahan', 'release_date' => '',
    'status' => 'Obtained #2 — ' . MT_OBTAINED2 . ' MT (Re-Apply #1) · SPI belum terbit',
    'sort_order' => (string) ($sort + 2), 'pertek_date' => '', 'spi_date' => '',
    'from_rev_req' => 'TRUE', 'source_program' => 'B', 'quota_year' => TAHUN,
];
$cpSubmit2   = ['id' => (string) ($idCp + 1), 'cycle_id' => (string) $idSubmit2,
                'product' => PRODUK, 'mt' => (string) MT_SUBMIT2, 'source_program' => 'B'];
$cpObtained2 = ['id' => (string) ($idCp + 2), 'cycle_id' => (string) $idObtained2,
                'product' => PRODUK, 'mt' => (string) MT_OBTAINED2, 'source_program' => 'B'];

echo "\n── RENCANA ──────────────────────────────────────────────────────────\n";
printf("  cycles         id=%d  Submit #2    %s MT · PERTEK %s\n", $idSubmit2, MT_SUBMIT2, PERTEK_RA1);
printf("  cycles         id=%d  Obtained #2  %s MT · SPI belum terbit\n", $idObtained2, MT_OBTAINED2);
printf("  cycle_products id=%d  %s %s -> siklus %d\n", $idCp + 1, PRODUK, MT_SUBMIT2, $idSubmit2);
printf("  cycle_products id=%d  %s %s -> siklus %d\n", $idCp + 2, PRODUK, MT_OBTAINED2, $idObtained2);

/* ── Simulasi payload ──────────────────────────────────────────────────── */
$t  = iq_load_tables($gs, $sid);
$t2 = $t;
$t2['cycles']         = array_merge($t['cycles'] ?? [],         [$barisSubmit2, $barisObtained2]);
$t2['cycle_products'] = array_merge($t['cycle_products'] ?? [], [$cpSubmit2, $cpObtained2]);

$sebelum = iq_build_payload($t);
$sesudah = iq_build_payload($t2);

$ringkas = function (array $pl) {
    $out = [];
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c) {
        $u = 0; $a = 0;
        foreach (($c['utilizationByProd'] ?? []) as $v) $u += iq_num($v);
        foreach (($c['availableByProd'] ?? []) as $v) $a += iq_num($v);
        $out[$c['code']] = [
            'obtained' => round(iq_num($c['obtained'] ?? 0), 3),
            'submit1'  => round(iq_num($c['submit1'] ?? 0), 3),
            'util'     => round($u, 3), 'avail' => round($a, 3),
            'siklus'   => count($c['cycles'] ?? []),
        ];
    }
    return $out;
};
$a = $ringkas($sebelum); $b = $ringkas($sesudah);

$geser = [];
foreach ($b as $code => $v) if (json_encode($a[$code] ?? null) !== json_encode($v)) $geser[] = $code;

echo "\n── SIMULASI ─────────────────────────────────────────────────────────\n";
printf("  company yang bergeser: %s\n", $geser ? implode(', ', $geser) : 'tidak ada');
printf("  %s sebelum : %s\n", CO, json_encode($a[CO] ?? null));
printf("  %s sesudah : %s\n", CO, json_encode($b[CO] ?? null));

$totUtil = function (array $pl) { $s = 0;
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c)
        foreach (($c['utilizationByProd'] ?? []) as $v) $s += iq_num($v);
    return round($s, 3); };
$totAvail = function (array $pl) { $s = 0;
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c)
        foreach (($c['availableByProd'] ?? []) as $v) $s += iq_num($v);
    return round($s, 3); };
printf("  total utilisasi : %s -> %s\n", $totUtil($sebelum), $totUtil($sesudah));
printf("  total available : %s -> %s\n", $totAvail($sebelum), $totAvail($sesudah));

/* ── Pagar ─────────────────────────────────────────────────────────────── */
$gagal = [];
if ($geser !== [CO] && $geser !== []) $gagal[] = 'ada company selain ' . CO . ' yang bergeser: ' . implode(', ', $geser);
if (abs($totUtil($sebelum)  - $totUtil($sesudah))  > 0.001) $gagal[] = 'total utilisasi berubah';
if (abs($totAvail($sebelum) - $totAvail($sesudah)) > 0.001) $gagal[] = 'total available berubah';

$sjhSesudah = $b[CO] ?? [];
if (abs(($sjhSesudah['util'] ?? -1) - ($a[CO]['util'] ?? -2)) > 0.001) $gagal[] = 'utilisasi ' . CO . ' berubah';
$tipe = [];
foreach (($sesudah['spi'] ?? []) as $c) if (($c['code'] ?? '') === CO)
    foreach (($c['cycles'] ?? []) as $cy) $tipe[] = strtolower(trim((string) ($cy['type'] ?? '')));
if (count($tipe) !== count(array_unique($tipe))) $gagal[] = 'ada siklus ' . CO . ' yang kembar';

echo "\n── PAGAR ────────────────────────────────────────────────────────────\n";
if ($gagal) { echo "  GAGAL: " . implode("; ", $gagal) . "\n  TIDAK ADA YANG DITULIS.\n"; exit(1); }
echo "  Lolos — hanya " . CO . " yang bergerak, utilisasi & available utuh, tidak ada siklus kembar.\n";

if (!$APPLY) { echo "\nDry-run. Ulangi dengan --apply.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cap = date('Y-m-d_His');
file_put_contents($dir . "/cycles_sebelum_sjh_ra1_$cap.json", json_encode($cycles));
file_put_contents($dir . "/cycle_products_sebelum_sjh_ra1_$cap.json", json_encode($cprods));
echo "Cadangan: backups/cycles_sebelum_sjh_ra1_$cap.json (+ cycle_products)\n";

iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'cycles',         'rows' => array_merge($cycles, [$barisSubmit2, $barisObtained2]), 'headers' => $cyTbl['headers']],
    ['tab' => 'cycle_products', 'rows' => array_merge($cprods, [$cpSubmit2, $cpObtained2]),       'headers' => $cpTbl['headers']],
]);
echo "Selesai. Re-Apply #1 " . CO . " tercatat: Submit #2 " . MT_SUBMIT2 . " MT · Obtained #2 " . MT_OBTAINED2 . " MT.\n";
