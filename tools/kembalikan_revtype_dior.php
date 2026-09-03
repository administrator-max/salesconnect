<?php
/**
 * Mengembalikan companies.rev_type DIOR ke 'complete'.
 *
 * KENAPA DIKEMBALIKAN
 * -------------------
 * Menyetelnya ke 'none' memang membuat status terbaca "Completed" — tapi ada
 * akibat yang tidak saya periksa sebelum menulis: tabel "Submission & Revision
 * Summary" menyaring company dengan `revType && revType !== 'none'`, jadi DIOR
 * LENYAP dari daftar revisi. Diukur di browser:
 *
 *     rev_type = none      tabel revisi 29 baris, DIOR tidak ada, hitungan 28
 *     rev_type = complete  tabel revisi 31 baris, DIOR ada,       hitungan 29
 *
 * Dilaporkan tim 03-Sep-2026. Menukar satu keluhan dengan keluhan lain bukan
 * perbaikan — apalagi DIOR justru sedang mereka kerjakan di panel itu.
 *
 * Status "Completed" akan dicapai lewat perbaikan LOGIKA di outstandingStage(),
 * bukan dengan menyembunyikan fakta bahwa DIOR punya revisi.
 *
 * PAGAR: tidak satu MT pun boleh bergerak.
 *
 * Dry-run:   php tools/kembalikan_revtype_dior.php
 * Terapkan:  php tools/kembalikan_revtype_dior.php --apply
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
printf("\n  %s · rev_type: %s -> complete\n", CO, $lama === '' ? '(kosong)' : $lama);
if ($lama === 'complete') { echo "  Sudah 'complete'. Tidak ada yang ditulis.\n"; exit(0); }

$sebelum = iq_build_payload($t);
$baru = $comps; $baru[$idx]['rev_type'] = 'complete';
$t2 = $t; $t2['companies'] = $baru;
$sesudah = iq_build_payload($t2);

$tot = function (array $pl) {
    $u = 0; $a = 0;
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c) {
        foreach (($c['utilizationByProd'] ?? []) as $v) $u += iq_num($v);
        foreach (($c['availableByProd'] ?? []) as $v) $a += iq_num($v);
    }
    return [round($u, 3), round($a, 3)];
};
[$u1, $a1] = $tot($sebelum); [$u2, $a2] = $tot($sesudah);
printf("  total utilisasi %s -> %s · available %s -> %s\n", $u1, $u2, $a1, $a2);
if (abs($u1 - $u2) > 0.001 || abs($a1 - $a2) > 0.001) {
    echo "  PAGAR GAGAL: ini hanya penanda status. TIDAK DITULIS.\n"; exit(1);
}
echo "  Pagar lolos — nol MT bergerak.\n";

if (!$APPLY) { echo "\nDry-run. Ulangi dengan --apply.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/companies_sebelum_kembalikan_revtype_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode($comps));
echo "Cadangan: $cad\n";

iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'companies', 'rows' => $baru, 'headers' => $coTbl['headers']],
]);
echo "Selesai. rev_type DIOR dikembalikan ke 'complete'.\n";
