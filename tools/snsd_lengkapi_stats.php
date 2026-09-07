<?php
/**
 * SNSD — melengkapi baris company_product_stats yang tidak pernah dibuat.
 *
 * DITEMUKAN OLEH tools/audit_tidak_ada_yang_hilang.php (07-Sep-2026), satu-
 * satunya temuan dari sepuluh pemeriksaan: SNSD punya kuota 120 MT tapi tidak
 * punya SATU pun baris di company_product_stats. Dari 34 pemegang kuota, 33
 * punya rinciannya; SNSD tertinggal karena kuotanya baru terbit Agustus 2026,
 * sesudah master terakhir kali disegarkan.
 *
 * KENAPA PERLU DIPERBAIKI PADAHAL DI LAYAR SUDAH BENAR
 * ---------------------------------------------------
 * Di dashboard SNSD sudah tampil betul — GI ALLOY 120 / 0 / 120 — tapi itu
 * datang dari CADANGAN di getObtainedByProdAgg(), yang menyala hanya ketika
 * stats sama sekali kosong lalu membaca siklusnya. Jadi angkanya benar karena
 * ada jaring pengaman, bukan karena datanya lengkap.
 *
 * Itu bukan keadaan yang enak dibiarkan: jaring itu satu perubahan saja dari
 * hilang, dan kalau hilang, 120 MT SNSD ikut lenyap tanpa suara — persis jenis
 * kejadian yang diminta pemilik data supaya tidak terulang. Melengkapi datanya
 * membuat SNSD berdiri di atas sumber yang sama dengan 33 company lainnya.
 *
 * YANG DITULIS: SATU baris.
 *     SNSD · GI ALLOY · utilization 0 · available 120 · arrived FALSE
 *
 * Ejaan "GI ALLOY" dipilih, bukan "GI BORON" — tabel ini memakai keduanya
 * (5 baris vs 10 baris) dan alias memetakannya ke nama yang sama, tapi siklus
 * SNSD sendiri menulis "GI ALLOY". realization_mt, eta_jkt, dan quota_year
 * dikosongkan mengikuti 59 baris yang sudah ada — ketiganya memang kosong di
 * seluruh tabel.
 *
 * PAGAR: tampilan TIDAK BOLEH BERUBAH. Angkanya sudah benar lewat cadangan;
 * kalau menulis baris ini menggeser sesuatu, berarti dugaan saya keliru dan
 * lebih baik tidak ditulis sama sekali.
 *
 * Dry-run:   php tools/snsd_lengkapi_stats.php
 * Terapkan:  php tools/snsd_lengkapi_stats.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

const CO     = 'SNSD';
const PRODUK = 'GI ALLOY';
const AVAIL  = 120;

$APPLY = in_array('--apply', $argv, true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$stTbl = $gs->table($sid, 'company_product_stats');
$rows  = $stTbl['rows'];

foreach ($rows as $r) if ((string) ($r['company_code'] ?? '') === CO) {
    echo "BERHENTI: " . CO . " sudah punya baris company_product_stats. Tidak ditulis dua kali.\n";
    exit(0);
}

$id = 0; foreach ($rows as $r) $id = max($id, (int) ($r['id'] ?? 0));
$baru = [
    'id' => (string) ($id + 1), 'company_code' => CO, 'product' => PRODUK,
    'utilization_mt' => '0', 'available_mt' => (string) AVAIL,
    'realization_mt' => '', 'eta_jkt' => '', 'arrived' => 'FALSE',
    'source_program' => 'B', 'quota_year' => '',
];

echo "\n── RENCANA ──────────────────────────────────────────────────────────\n";
printf("  company_product_stats id=%d  %s · %s · util 0 · available %s\n", $id + 1, CO, PRODUK, AVAIL);

/* ── Simulasi: tampilan tidak boleh bergeser ───────────────────────────── */
$t  = iq_load_tables($gs, $sid);
$t2 = $t;
/* Kunci-nya `stats`, BUKAN `company_product_stats` — iq_load_tables()
   menamainya ulang (lihat iqdash_data.php baris 78). Versi pertama skrip ini
   menambah ke kunci yang salah, jadi payload "sesudah" identik dengan
   "sebelum" dan pagarnya lolos karena TIDAK ADA APA-APA yang terjadi. Pagar
   yang lolos karena perubahannya tidak terpasang adalah pagar yang berbohong. */
$t2['stats'] = array_merge($t['stats'] ?? [], [$baru]);

$sebelum = iq_build_payload($t);
$sesudah = iq_build_payload($t2);

$ringkas = function (array $pl) {
    $out = [];
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c) {
        $out[$c['code']] = [
            'obtained' => round(iq_num($c['obtained'] ?? 0), 3),
            'util'     => $c['utilizationByProd'] ?? [],
            'avail'    => $c['availableByProd'] ?? [],
        ];
    }
    return $out;
};
$a = $ringkas($sebelum); $b = $ringkas($sesudah);

$geser = [];
foreach ($b as $code => $v) if (json_encode($a[$code] ?? null) !== json_encode($v)) $geser[] = $code;

$tot = function (array $pl) {
    $o = 0; $u = 0; $av = 0;
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c) {
        $o += iq_num($c['obtained'] ?? 0);
        foreach (($c['utilizationByProd'] ?? []) as $z) $u += iq_num($z);
        foreach (($c['availableByProd'] ?? []) as $z) $av += iq_num($z);
    }
    return [round($o, 3), round($u, 3), round($av, 3)];
};
[$o1, $u1, $v1] = $tot($sebelum);
[$o2, $u2, $v2] = $tot($sesudah);

echo "\n── SIMULASI ─────────────────────────────────────────────────────────\n";
printf("  total obtained  : %s -> %s\n", $o1, $o2);
printf("  total utilisasi : %s -> %s\n", $u1, $u2);
printf("  total available : %s -> %s\n", $v1, $v2);
printf("  company bergeser: %s\n", $geser ? implode(', ', $geser) : 'tidak ada');
printf("  %s sebelum : %s\n", CO, json_encode($a[CO] ?? null));
printf("  %s sesudah : %s\n", CO, json_encode($b[CO] ?? null));

/* Pagar versi pertama menuntut "total available TIDAK boleh berubah". Itu
   keliru, dan simulasinya yang menunjukkan: available naik +120, tepat sebesar
   kuota SNSD sendiri.

   Sebabnya payload PHP selama ini KURANG 120 — SNSD tidak punya rincian
   per produk, jadi ia menyumbang nol. Yang menutupinya adalah cadangan di sisi
   peramban, dan justru itulah yang sedang diperbaiki. Jadi angka PHP memang
   HARUS naik 120 supaya sama dengan yang sudah lama dilihat tim.

   Yang benar-benar tidak boleh berubah adalah ANGKA DI LAYAR — dan itu
   diperiksa terpisah di peramban sesudah ditulis. */
$gagal = [];
if (abs($o1 - $o2) > 0.001)              $gagal[] = 'total obtained berubah — seharusnya tidak';
if (abs($u1 - $u2) > 0.001)              $gagal[] = 'total utilisasi berubah — seharusnya tidak';
if (abs(($v2 - $v1) - AVAIL) > 0.001)    $gagal[] = sprintf('total available bergerak %s, seharusnya tepat +%s', $v2 - $v1, AVAIL);
if ($geser !== [CO])                     $gagal[] = 'yang bergeser bukan hanya ' . CO . ': ' . implode(', ', $geser);
$sesudahCo = $b[CO]['avail'] ?? [];
if (round(array_sum(array_map('iq_num', (array) $sesudahCo)), 3) !== (float) AVAIL)
    $gagal[] = 'available ' . CO . ' bukan ' . AVAIL;

echo "\n── PAGAR ────────────────────────────────────────────────────────────\n";
if ($gagal) { echo "  GAGAL: " . implode('; ', $gagal) . "\n  TIDAK ADA YANG DITULIS.\n"; exit(1); }
printf("  Lolos — hanya %s yang bergeser, dan tepat sebesar kuotanya sendiri (+%s).\n", CO, AVAIL);
echo "  Obtained dan utilisasi tidak bergerak. Angka di layar diperiksa\n";
echo "  terpisah di peramban sesudah ini — di sana tidak boleh berubah sama sekali.\n";

if (!$APPLY) { echo "\nDry-run. Ulangi dengan --apply.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/company_product_stats_sebelum_snsd_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode($rows));
echo "Cadangan: $cad\n";

iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'company_product_stats', 'rows' => array_merge($rows, [$baru]), 'headers' => $stTbl['headers']],
]);
echo "Selesai. " . CO . " · " . PRODUK . " · available " . AVAIL . " MT tercatat.\n";
