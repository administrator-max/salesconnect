<?php
/**
 * DIOR: status company disetel "tidak ada revisi berjalan".
 *
 * MASALAHNYA
 * ----------
 * Revisi DIOR sudah SELESAI — SPI Perubahan terbit 31/08/2026, produk sudah
 * pindah ke GL Alloy. Tapi dashboard masih menulis "Under Revision".
 *
 * Sebabnya di outstandingStage(): sebuah `Submit #N` dianggap masih menggantung
 * selama `Obtained #N` pasangannya belum terbit lengkap. DIOR punya
 * `Obtained #1` yang SPI-nya TIDAK PERNAH terbit — ia ditahan ("Hold, waiting
 * address changes"), lalu revisi menggantikannya sebelum sempat terbit, dan
 * SPI-nya keluar sebagai `Obtained #2` (31/08/2026).
 *
 * Jadi pasangan Submit #1 <-> Obtained #1 tidak akan pernah lengkap, dan DIOR
 * akan selamanya terbaca "Under Revision" walau kuotanya sudah diterima.
 *
 * TIGA BENTUK DIUJI LEBIH DULU
 * ---------------------------
 *   Obtained #2 dijadikan Obtained #1   -> status benar TAPI obtained jatuh
 *                                          jadi 0: Obtained #2 memang tidak
 *                                          membawa produk (deltanya ada di
 *                                          siklus revisi). DITOLAK.
 *   tambah Revision #1 + Obtained (Rev) -> status TETAP "active". Tidak cukup.
 *   rev_type -> 'none'                  -> status Completed, obtained tetap
 *                                          100, tidak ada MT yang bergerak.
 *
 * YANG DITULIS
 * ------------
 * SATU sel: companies.rev_type = 'none' untuk DIOR. Pernyataannya benar —
 * tidak ada revisi yang sedang berjalan; yang ada sudah rampung.
 *
 * CATATAN KONVENSI: company lain yang revisinya selesai (BDG, MJU, GAS, SPA,
 * GIS) memakai rev_type='complete' dan terbaca selesai karena Obtained #1
 * mereka MEMANG terbit. DIOR tidak bisa mengikuti pola itu tanpa memalsukan
 * tanggal SPI pada siklus yang tidak pernah terbit. Perbaikan yang lebih dalam
 * adalah mengajari outstandingStage() mengenali Obtained yang digantikan
 * revisi — itu menyentuh status seluruh 40 company dan perlu diukur tersendiri.
 *
 * PAGAR: tidak satu MT pun boleh bergerak. Disimulasikan lebih dulu.
 *
 * Dry-run:   php tools/dior_status_selesai.php
 * Terapkan:  php tools/dior_status_selesai.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

const CO = 'DIOR';
$APPLY = in_array('--apply', $argv, true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$t     = iq_load_tables($gs, $sid);
$coTbl = $gs->table($sid, 'companies');
$comps = $coTbl['rows'];

$idx = null;
foreach ($comps as $i => $r) if ((string) ($r['code'] ?? '') === CO) { $idx = $i; break; }
if ($idx === null) { echo "BERHENTI: " . CO . " tidak ada.\n"; exit(1); }

$lama = (string) ($comps[$idx]['rev_type'] ?? '');
echo "\n── RENCANA ──────────────────────────────────────────────────────────\n";
printf("  %s · rev_type: %s -> none\n", CO, $lama === '' ? '(kosong)' : $lama);
printf("  rev_status dibiarkan apa adanya: %s\n", (string) ($comps[$idx]['rev_status'] ?? '(kosong)'));

if ($lama === 'none') { echo "\nSudah 'none'. Tidak ada yang perlu ditulis.\n"; exit(0); }

/* ── Simulasi: tidak satu MT pun boleh bergerak ─────────────────────────── */
$sebelum = iq_build_payload($t);
$compsBaru = $comps;
$compsBaru[$idx]['rev_type'] = 'none';
$t2 = $t; $t2['companies'] = $compsBaru;
$sesudah = iq_build_payload($t2);

$tot = function (array $pl) {
    $u = 0; $a = 0;
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c) {
        foreach (($c['utilizationByProd'] ?? []) as $v) $u += iq_num($v);
        foreach (($c['availableByProd'] ?? []) as $v) $a += iq_num($v);
    }
    return [round($u, 3), round($a, 3)];
};
[$u1, $a1] = $tot($sebelum);
[$u2, $a2] = $tot($sesudah);

echo "\n── SIMULASI ─────────────────────────────────────────────────────────\n";
printf("  total utilisasi : %s -> %s\n", $u1, $u2);
printf("  total available : %s -> %s\n", $a1, $a2);

$geser = [];
$ambil = function (array $pl, string $code) {
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c)
        if (($c['code'] ?? '') === $code) return $c;
    return null;
};
foreach (array_merge($sesudah['spi'] ?? [], $sesudah['pending'] ?? []) as $c) {
    $x = $ambil($sebelum, $c['code'] ?? '');
    if (json_encode($x['utilizationByProd'] ?? []) !== json_encode($c['utilizationByProd'] ?? [])
     || json_encode($x['availableByProd'] ?? [])  !== json_encode($c['availableByProd'] ?? [])) {
        $geser[] = $c['code'];
    }
}
printf("  company yang angkanya bergeser: %s\n", $geser ? implode(', ', $geser) : 'tidak ada');

if (abs($u1 - $u2) > 0.001 || abs($a1 - $a2) > 0.001 || $geser) {
    echo "\n  PAGAR GAGAL: ini seharusnya hanya menyentuh penanda status.\n";
    echo "  TIDAK ADA YANG DITULIS.\n";
    exit(1);
}
echo "\n  Pagar lolos — nol MT bergerak.\n";

if (!$APPLY) { echo "\nDry-run. Ulangi dengan --apply.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/companies_sebelum_status_dior_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode($comps));
echo "Cadangan: $cad\n";

iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'companies', 'rows' => $compsBaru, 'headers' => $coTbl['headers']],
]);
echo "Selesai. rev_type DIOR: $lama -> none.\n";
