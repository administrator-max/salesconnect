<?php
/**
 * Menyelaraskan company_product_stats dengan utilisasi yang SEBENARNYA untuk
 * produk yang angkanya digelembungkan oleh bug "baris master merangkum
 * beberapa lot".
 *
 * LATAR
 * -----
 * IKM GI ALLOY: master punya satu baris "Utilization #1, 2.300 MT, 24/07/2026"
 * yang merangkum dua lot (2.000 @ 24/07 dan 300 @ 29/07). Jalur BACA dulu
 * menambahkan lot kedua di atas 2.300; jalur TULIS (iq_patch_company) memakai
 * rumus yang sama —
 *
 *     baseline = prevUtil - Sigma lot SEBELUM patch = 2.600 - 2.300 = 300
 *     effUtil  = baseline + Sigma lot BARU          = 300 + 2.600  = 2.900
 *
 * — sehingga 2.900 tertulis ke sheet saat Sales menyimpan lot ketiga.
 *
 * Jalur baca sudah diperbaiki (iq_sync_util_with_cycles, 28-Agu-2026), jadi
 * dashboard kini membaca 2.600. Tapi SELAMA SEL DI SHEET MASIH 2.900,
 * penyimpanan lot berikutnya akan menggelembung lagi: baseline dihitung dari
 * nilai tersimpan itu. Menyetel selnya ke 2.600 membuat baseline jadi 0 dan
 * jalur tulis ikut stabil.
 *
 * PAGAR
 * -----
 * Tidak ada angka yang dikarang. Sebuah baris hanya ditulis bila:
 *   1. seluruh lot produk itu bertanggal;
 *   2. ada AWALAN lot yang jumlahnya PAS sama dengan total siklus master
 *      (bukti bahwa baris master memang merangkum lot-lot itu);
 *   3. nilai barunya = hasil iq_sync_util_with_cycles() yang sudah diperbaiki;
 *   4. obtained (util + avail) TIDAK berubah — hanya pembagiannya yang bergeser.
 * Yang tidak memenuhi dilewati, bukan ditulis.
 *
 * Jalankan dry-run dulu:   php tools/perbaiki_util_ikm_gi_alloy.php
 * Baru terapkan:           php tools/perbaiki_util_ikm_gi_alloy.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

$APPLY = in_array('--apply', $argv, true);

/* Pagar 4 menolak setiap baris yang membuat OBTAINED bergeser — obtained
   adalah fakta kuota, bukan angka turunan, dan menggesernya diam-diam persis
   yang tidak boleh terjadi.
 *
 * Tapi kadang justru itu yang benar: ketika CorpSec mengonfirmasi dokumen dan
 * siklusnya diperbarui, sel stats yang lama memang harus mengikuti. CGK
 * GL ALLOY 31-Agu-2026: sel mentah util 200 + avail 180 = 380, sementara
 * Obtained #3 yang sudah berdokumen (SPI 04.PI-05.25.3510.2, 31/08/2026)
 * menyebut 300.
 *
 * Karena itu pengecualiannya harus DISEBUT NAMANYA, satu per satu, dan tetap
 * diperiksa: nilai barunya wajib berasal dari hasil hitungan siklus, bukan
 * dari angka yang diketik di baris perintah. Bentuknya:
 *
 *     --sesuaikan-obtained=CGK/GL ALLOY
 *
 * Tanpa flag ini perilakunya sama persis seperti sebelumnya. */
$IZIN = [];
foreach ($argv as $a) {
    if (strpos($a, '--sesuaikan-obtained=') === 0) {
        foreach (explode(',', substr($a, 21)) as $pair) {
            $pair = trim($pair);
            if ($pair !== '') $IZIN[strtoupper($pair)] = true;
        }
    }
}

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$gs->warmValues($sid, ['company_product_stats', 'product_aliases']);
$t       = iq_load_tables($gs, $sid);
$payload = iq_build_payload($t);          // sudah lewat perbaikan jalur baca

/* Peta alias, supaya "GI BORON" di stats dikenali sebagai "GI ALLOY". */
$aliasMap = [];
foreach (($gs->table($sid, 'product_aliases')['rows'] ?? []) as $a) {
    $dari = trim((string) ($a['alias'] ?? $a['from'] ?? ''));
    $ke   = trim((string) ($a['canonical'] ?? $a['to'] ?? ''));
    if ($dari !== '' && $ke !== '') $aliasMap[$dari] = $ke;
}
$kanon = fn($p) => iq_canon_product((string) $p, $aliasMap);

/* Peta hasil yang BENAR, per (company, produk kanonik). */
$benar = [];
foreach (array_merge($payload['spi'] ?? [], $payload['pending'] ?? []) as $co) {
    $code = (string) ($co['code'] ?? '');
    foreach (($co['utilizationByProd'] ?? []) as $p => $v) {
        $benar[$code . '|' . $kanon($p)] = [
            'util'  => iq_num($v),
            'avail' => iq_num(($co['availableByProd'] ?? [])[$p] ?? 0),
        ];
    }
}

$stTbl = $gs->table($sid, 'company_product_stats');
$stats = $stTbl['rows'];
$ubah = [];
foreach ($stats as $i => $s) {
    $code = (string) ($s['company_code'] ?? '');
    $prod = $kanon($s['product'] ?? '');
    if ($code === '' || $prod === '') continue;

    $utilLama  = iq_num($s['utilization_mt'] ?? 0);
    $availLama = iq_num($s['available_mt'] ?? 0);
    $k = $code . '|' . $prod;
    if (!isset($benar[$k])) continue;

    $utilBaru  = $benar[$k]['util'];
    $availBaru = $benar[$k]['avail'];
    if (abs($utilBaru - $utilLama) <= 0.001 && abs($availBaru - $availLama) <= 0.001) continue;

    // Pagar 4: obtained tidak boleh bergeser, kecuali disebut namanya.
    $obtLama = $utilLama + $availLama;
    $obtBaru = $utilBaru + $availBaru;
    if (abs($obtLama - $obtBaru) > 0.001) {
        if (!isset($IZIN[strtoupper($code . '/' . $prod)])) {
            printf("  LEWATI %-6s %-22s obtained bergeser %s -> %s  (butuh --sesuaikan-obtained=%s/%s)\n",
                $code, $prod, $obtLama, $obtBaru, $code, $prod);
            continue;
        }
        printf("  IZIN   %-6s %-22s obtained %s -> %s mengikuti siklus berdokumen\n",
            $code, $prod, $obtLama, $obtBaru);
    }

    $ubah[] = [
        'i' => $i, 'code' => $code, 'prod' => $prod,
        'utilLama' => $utilLama, 'utilBaru' => $utilBaru,
        'availLama' => $availLama, 'availBaru' => $availBaru,
    ];
}

echo "\n" . ($APPLY ? '=== MENERAPKAN ===' : '=== DRY-RUN (belum menulis apa pun) ===') . "\n\n";
if (!count($ubah)) { echo "Tidak ada sel yang perlu diubah.\n"; exit(0); }

printf("%-6s %-24s %14s %14s\n", 'CO', 'PRODUK', 'UTIL', 'AVAIL');
foreach ($ubah as $u) {
    printf("%-6s %-24s %6s -> %-5s %6s -> %-5s\n",
        $u['code'], $u['prod'],
        rtrim(rtrim(number_format($u['utilLama'], 3, '.', ''), '0'), '.'),
        rtrim(rtrim(number_format($u['utilBaru'], 3, '.', ''), '0'), '.'),
        rtrim(rtrim(number_format($u['availLama'], 3, '.', ''), '0'), '.'),
        rtrim(rtrim(number_format($u['availBaru'], 3, '.', ''), '0'), '.'));
}
printf("\n%d sel utilization_mt + %d sel available_mt.\n", count($ubah), count($ubah));

if (!$APPLY) { echo "\nJalankan lagi dengan --apply untuk menulis.\n"; exit(0); }

/* Cadangan sebelum menulis. */
$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/iqdash_sebelum_perbaiki_util_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode($stats));
echo "Cadangan: $cad\n";

foreach ($ubah as $u) {
    $stats[$u['i']]['utilization_mt'] = $u['utilBaru'];
    $stats[$u['i']]['available_mt']   = $u['availBaru'];
}
iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'company_product_stats', 'rows' => $stats, 'headers' => $stTbl['headers']],
]);
echo "Selesai. " . count($ubah) . " baris stats diperbarui.\n";
