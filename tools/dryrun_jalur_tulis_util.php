<?php
/**
 * DRY-RUN jalur tulis utilisasi — tidak menulis apa pun, ke sheet maupun ke berkas.
 *
 * Menjawab satu pertanyaan: kalau Sales menyimpan lot untuk sebuah produk
 * SEKARANG, angka apa yang akan tertulis ke company_product_stats — dengan
 * rumus LAMA, dan dengan aturan BARU yang memanggil iq_sync_util_with_cycles()?
 *
 * Disimulasikan untuk SETIAP (company, produk) yang punya lot, dalam dua
 * keadaan:
 *
 *   1. SIMPAN ULANG apa adanya — lot tidak berubah. Ini yang terjadi tiap kali
 *      Sales menekan Simpan tanpa mengubah angka, dan idealnya TIDAK boleh
 *      menggeser apa pun. Selisih di sini berarti sekadar membuka lalu
 *      menyimpan sudah menggelembungkan data.
 *
 *   2. TAMBAH SATU LOT baru 100 MT bertanggal hari ini. Ini yang dilakukan tim
 *      pada IKM dan yang melahirkan 2.900.
 *
 * Jalankan: php tools/dryrun_jalur_tulis_util.php
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();
$gs->warmValues($sid, ['company_product_stats', 'company_shipments', 'cycle_utilization', 'product_aliases']);

$aliasMap = iq_alias_map($gs, $sid);
$stats    = $gs->table($sid, 'company_product_stats')['rows'];
$ship     = $gs->table($sid, 'company_shipments')['rows'];
$uc       = $gs->table($sid, 'cycle_utilization')['rows'];

/* Kelompokkan per company. */
$shipCo = []; foreach ($ship as $r) { $shipCo[(string) ($r['company_code'] ?? '')][] = $r; }
$ucCoAll = []; foreach ($uc as $r) { $ucCoAll[(string) ($r['company_code'] ?? '')][] = $r; }

$rumusLama = fn($prevUtil, $oldLotSum, $lotSum) => max(0.0, $prevUtil - $oldLotSum) + $lotSum;

$hariIni = date('d/m/Y');
$bedaSimpanUlang = [];
$bedaTambahLot   = [];
$diperiksa = 0;

foreach ($shipCo as $code => $lots) {
    if ($code === '') continue;
    $ucCo = $ucCoAll[$code] ?? [];

    /* Dikelompokkan KANONIK, sama seperti jalur tulis sebenarnya.
       Versi pertama harness ini mengelompokkan per ejaan MENTAH, sehingga
       baris lot kosong 'SHEETPILE' dan baris isi 'SHEET PILE' jatuh ke dua
       kelompok terpisah — lalu melaporkan BTS turun 1.939 -> 425 seolah
       aturan baru merusak data. Yang salah harness-nya, bukan aturannya:
       jalur tulis menyaring lot dengan iq_canon_product().

       Dicatat karena inilah gunanya dry-run dijalankan sebelum apa pun
       ditulis — dan karena harness yang salah kelompok akan menuduh
       perubahan yang benar. */
    $perProd = [];
    foreach ($lots as $l) {
        $p = (string) ($l['product'] ?? '');
        if ($p === '') continue;
        $perProd[iq_canon_product($p, $aliasMap)][] = $l;
    }

    foreach ($perProd as $prod => $lotProd) {
        $lotSum = 0.0;
        foreach ($lotProd as $l) $lotSum += iq_num($l['util_mt'] ?? 0);

        $exIdx = iq_find_product_row_idx($stats, $code, $prod, $aliasMap);
        if ($exIdx === null) continue;
        $prevUtil  = iq_num($stats[$exIdx]['utilization_mt'] ?? 0);
        $prevAvail = ($stats[$exIdx]['available_mt'] ?? null) !== null ? iq_num($stats[$exIdx]['available_mt']) : 0.0;
        $ejaanStats = (string) ($stats[$exIdx]['product'] ?? $prod);
        $diperiksa++;

        /* ── 1. Simpan ulang apa adanya ── */
        $lama = $rumusLama($prevUtil, $lotSum, $lotSum);          // oldLotSum == lotSum
        $baru = iq_util_efektif_produk($ucCo, $lotProd, $ejaanStats, $prevUtil, $prevAvail, $lotSum, $lotSum, $aliasMap);
        if (abs($lama - $baru) > 0.001) {
            $bedaSimpanUlang[] = [$code, $ejaanStats, $prevUtil, $lama, $baru];
        }

        /* ── 2. Tambah satu lot 100 MT hari ini ── */
        $lotPlus = $lotProd;
        $lotPlus[] = ['product' => $prod, 'util_mt' => 100, 'util_date' => $hariIni];
        $lama2 = $rumusLama($prevUtil, $lotSum, $lotSum + 100);
        $baru2 = iq_util_efektif_produk($ucCo, $lotPlus, $ejaanStats, $prevUtil, $prevAvail, $lotSum + 100, $lotSum, $aliasMap);
        if (abs($lama2 - $baru2) > 0.001) {
            $bedaTambahLot[] = [$code, $ejaanStats, $prevUtil, $lama2, $baru2, $prevUtil + $prevAvail];
        }
    }
}

$n = fn($v) => rtrim(rtrim(number_format((float) $v, 3, '.', ''), '0'), '.');

echo "\n=== DRY-RUN — tidak ada yang ditulis ===\n";
echo "Diperiksa: $diperiksa pasangan (company, produk) yang punya lot.\n";

echo "\n--- 1. SIMPAN ULANG tanpa mengubah lot ---\n";
if (!count($bedaSimpanUlang)) {
    echo "  Tidak ada yang berubah. Membuka lalu menyimpan tidak menggeser angka mana pun,\n";
    echo "  baik dengan rumus lama maupun aturan baru.\n";
} else {
    printf("  %-6s %-24s %10s %12s %12s\n", 'CO', 'PRODUK', 'TERSIMPAN', 'RUMUS LAMA', 'ATURAN BARU');
    foreach ($bedaSimpanUlang as $b) printf("  %-6s %-24s %10s %12s %12s\n", $b[0], $b[1], $n($b[2]), $n($b[3]), $n($b[4]));
}

echo "\n--- 2. TAMBAH satu lot 100 MT hari ini ---\n";
if (!count($bedaTambahLot)) {
    echo "  Tidak ada selisih.\n";
} else {
    printf("  %-6s %-24s %10s %12s %12s %10s\n", 'CO', 'PRODUK', 'TERSIMPAN', 'RUMUS LAMA', 'ATURAN BARU', 'OBTAINED');
    foreach ($bedaTambahLot as $b) {
        printf("  %-6s %-24s %10s %12s %12s %10s%s\n",
            $b[0], $b[1], $n($b[2]), $n($b[3]), $n($b[4]), $n($b[5]),
            ($b[3] > $b[5] + 0.001 ? '   <= rumus lama MELAMPAUI obtained' : ''));
    }
}
echo "\n";
