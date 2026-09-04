<?php
/**
 * SJH — kuota GL ALLOY disetel 300 MT sesuai jawaban CorpSec (04-Sep-2026).
 *
 * MASALAHNYA
 * ----------
 * Audit bawaan dashboard (__auditObtained) sudah lama melaporkan satu-satunya
 * ketidakcocokan di seluruh data:
 *
 *     SJH · cycles 300 · stats 390 · diff -90
 *
 * Sumbernya quotaLedger.json, yang menyimpan `obtained: 390` untuk HS
 * 7225.99.90. Angka itu tampaknya lahir dari cara ledger dibangun — obtained
 * disusun sebagai util + available, dan karena utilisasi SJH tercatat 390 MT
 * (Utilization #1 = 300 MT pada 23/12/2025 dan Utilization #2 = 90 MT pada
 * 25/06/2026), obtained ikut terangkat ke 390.
 *
 * Yang benar menurut CorpSec: kuotanya 300 MT. Itu juga yang tertulis di kolom
 * companies.obtained (300) dan di siklus Obtained #1 (300 MT, SPI terbit
 * 06/01/2026). Hanya ledger yang menyimpang — dan karena overlay ledger menimpa
 * kolom per-produk MAUPUN total company, 390 itulah yang selama ini tampil.
 *
 * YANG DITULIS
 * ------------
 * SATU angka di quotaLedger.json: companies.SJH["7225.99.90"].obtained
 * 390 -> 300.
 *
 * UTILISASI TIDAK DISENTUH. 390 MT itu dua catatan bertanggal di
 * cycle_utilization, dan mengubahnya berarti menghapus catatan pengiriman
 * nyata — bukan yang diminta. Akibatnya SJH tampil terpakai 390 MT terhadap
 * kuota 300 MT, yaitu KELEBIHAN PAKAI 90 MT. Itu keadaan yang memang perlu
 * terlihat, bukan disembunyikan: kalau angkanya salah, yang perlu diperiksa
 * adalah Utilization #2 (90 MT, 25/06/2026) — dan itu keputusan pemilik data.
 *
 * KENAPA SIMULASINYA MEMANGGIL PROSES TERPISAH
 * --------------------------------------------
 * iq_ledger() menyimpan isinya di `static`, jadi menukar berkasnya di tengah
 * proses yang sama TIDAK berpengaruh — payload "sesudah" akan identik dengan
 * "sebelum" dan simulasinya mengukur ketiadaan. Versi pertama skrip ini persis
 * begitu, dan pagarnya menolak menulis karena melihat "tidak ada yang bergeser"
 * pada perubahan yang jelas-jelas menggeser sesuatu. Maka tiap payload dibangun
 * di PROSES PHP-nya sendiri lewat mode --ringkas di bawah.
 *
 * PAGAR: hanya SJH yang boleh bergerak, dan total utilisasi wajib utuh.
 *
 * Dry-run:   php tools/sjh_kuota_300.php
 * Terapkan:  php tools/sjh_kuota_300.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

const CO   = 'SJH';
const HS   = '7225.99.90';
const BARU = 300;

/* ── Mode anak: bangun payload, cetak ringkasannya sebagai JSON ─────────── */
if (in_array('--ringkas', $argv, true)) {
    $cfg = sc_config();
    $gs  = new GoogleSheets();
    $pl  = iq_build_payload(iq_load_tables($gs, $cfg['spreadsheets']['iqdash']));
    $out = ['co' => [], 'totObt' => 0, 'totUtil' => 0, 'totAvail' => 0];
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c) {
        $u = 0; $v = 0;
        foreach (($c['utilizationByProd'] ?? []) as $z) $u += iq_num($z);
        foreach (($c['availableByProd'] ?? []) as $z) $v += iq_num($z);
        $out['co'][$c['code']] = [
            'obtained' => round(iq_num($c['obtained'] ?? 0), 3),
            'util'     => $c['utilizationByProd'] ?? [],
            'avail'    => $c['availableByProd'] ?? [],
        ];
        $out['totObt']   += iq_num($c['obtained'] ?? 0);
        $out['totUtil']  += $u;
        $out['totAvail'] += $v;
    }
    echo json_encode($out);
    exit(0);
}

$APPLY  = in_array('--apply', $argv, true);
$berkas = __DIR__ . '/../iqdash/data/quotaLedger.json';

$json = json_decode(file_get_contents($berkas), true);
if (!is_array($json) || !isset($json['companies'][CO][HS])) {
    echo "BERHENTI: entri " . CO . " / " . HS . " tidak ada di ledger.\n"; exit(1);
}
$lama = (float) ($json['companies'][CO][HS]['obtained'] ?? 0);

echo "\n── RENCANA ──────────────────────────────────────────────────────────\n";
printf("  %s · %s (GL ALLOY) · obtained: %s -> %s MT\n", CO, HS, $lama, BARU);
printf("  util dibiarkan apa adanya: %s MT\n", $json['companies'][CO][HS]['util'] ?? '(kosong)');
if (abs($lama - BARU) < 0.001) { echo "\n  Sudah " . BARU . ". Tidak ada yang ditulis.\n"; exit(0); }

/* ── Simulasi: dua proses PHP terpisah ─────────────────────────────────── */
$php = PHP_BINARY;
$ini = escapeshellarg(__FILE__);
$jalankan = function () use ($php, $ini) {
    $keluaran = shell_exec(escapeshellarg($php) . ' ' . $ini . ' --ringkas 2>&1');
    $d = json_decode((string) $keluaran, true);
    if (!is_array($d) || !isset($d['co'])) {
        echo "BERHENTI: proses anak gagal.\n" . substr((string) $keluaran, 0, 400) . "\n"; exit(1);
    }
    return $d;
};

echo "  (membangun payload sebelum…)\n";
$sebelum = $jalankan();

$baru = $json;
$baru['companies'][CO][HS]['obtained'] = BARU;
$simpan = file_get_contents($berkas);
file_put_contents($berkas, json_encode($baru, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
echo "  (membangun payload sesudah…)\n";
try { $sesudah = $jalankan(); } finally { file_put_contents($berkas, $simpan); }

$geser = [];
foreach ($sesudah['co'] as $code => $v) {
    if (json_encode($sebelum['co'][$code] ?? null) !== json_encode($v)) $geser[] = $code;
}

echo "\n── SIMULASI ─────────────────────────────────────────────────────────\n";
printf("  total obtained  : %s -> %s   (%+d)\n", round($sebelum['totObt'], 3),   round($sesudah['totObt'], 3),   $sesudah['totObt'] - $sebelum['totObt']);
printf("  total utilisasi : %s -> %s   (%+d)\n", round($sebelum['totUtil'], 3),  round($sesudah['totUtil'], 3),  $sesudah['totUtil'] - $sebelum['totUtil']);
printf("  total available : %s -> %s   (%+d)\n", round($sebelum['totAvail'], 3), round($sesudah['totAvail'], 3), $sesudah['totAvail'] - $sebelum['totAvail']);
printf("  company yang bergeser: %s\n", $geser ? implode(', ', $geser) : 'tidak ada');
printf("  %s sebelum : %s\n", CO, json_encode($sebelum['co'][CO] ?? null));
printf("  %s sesudah : %s\n", CO, json_encode($sesudah['co'][CO] ?? null));

if ($geser !== [CO]) {
    echo "\n  PAGAR GAGAL: seharusnya HANYA " . CO . " yang bergeser.\n  TIDAK ADA YANG DITULIS.\n"; exit(1);
}
if (abs($sebelum['totUtil'] - $sesudah['totUtil']) > 0.001) {
    echo "\n  PAGAR GAGAL: utilisasi tidak boleh berubah — skrip ini hanya menyentuh kuota.\n  TIDAK ADA YANG DITULIS.\n"; exit(1);
}
echo "\n  Pagar lolos — hanya " . CO . " yang bergerak, utilisasi utuh.\n";

if (!$APPLY) { echo "\nDry-run. Ulangi dengan --apply.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/quotaLedger_sebelum_sjh300_' . date('Y-m-d_His') . '.json';
copy($berkas, $cad);
echo "Cadangan: $cad\n";

file_put_contents($berkas, json_encode($baru, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
echo "Selesai. " . CO . " " . HS . " obtained: $lama -> " . BARU . " MT.\n";
echo "Ingat: berkas ini perlu di-deploy (iqdash/data/quotaLedger.json).\n";
