<?php
/**
 * Regression: SATU baris master menutupi BEBERAPA lot, bukan satu hari saja.
 *
 * Bug (dilaporkan tim 28-Agu-2026): IKM GI ALLOY punya satu baris master
 * "Utilization #1, 2.300 MT, 24/07/2026" yang sebenarnya merangkum dua lot —
 * 2.000 @ 24/07 dan 300 @ 29/07. Syarat "sudah terliput" di
 * iq_sync_util_with_cycles() memakai hari TERAKHIR yang master tahu, jadi lot
 * kedua (29/07 > 24/07) lolos dan ikut DITAMBAHKAN di atas 2.300.
 *
 * Saat Sales menambah lot ketiga (300 @ 10/08) selisih itu terbawa:
 * 2.300 + 300 + 300 = 2.900, tertulis ke company_product_stats, dan Available
 * jatuh ke 1.250 dari yang seharusnya 1.550.
 *
 * Perbaikannya: kalau ada AWALAN lot (urut tanggal) yang jumlahnya PAS sama
 * dengan total siklus master, awalan itu adalah rincian baris master — hanya
 * lot sesudahnya yang baru.
 *
 * Yang dikunci di sini bukan cuma kasus IKM, tapi juga BATASNYA: kasus di mana
 * lot memang peristiwa terpisah (BTS, KAN) TIDAK boleh ikut tertelan. Aturan
 * yang lebih longcar ("Σ lot >= master maka lot yang menang") lulus untuk IKM
 * tapi menghapus 425 MT milik BTS — itu sebabnya syaratnya kesamaan awalan.
 *
 * Run: php iqdash/tests/test_util_master_agregat.php
 */
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_data.php';
require __DIR__ . '/../iqdash_write.php';

$fail = 0;
function ok($c, $m, $x = '') {
    echo ($c ? '  ok   ' : 'FAIL   ') . $m . (!$c && $x !== '' ? "\n         $x" : '') . "\n";
    if (!$c) $GLOBALS['fail'] = 1;
}

/** Bentuk company minimal: stats + siklus utilisasi + lot Sales. */
function co(array $util, array $avail, array $cycles, array $lots): array {
    return [
        'code' => 'TST',
        'utilizationByProd' => $util,
        'availableByProd'   => $avail,
        'utilCycles'        => $cycles,
        'shipments'         => $lots,
    ];
}
function lot($mt, $tgl) { return ['lotNo' => '1', 'utilMT' => $mt, 'utilDate' => $tgl, 'etaJKT' => '']; }
function siklus($prod, $mt, $tgl) { return ['cycle' => 'Utilization #1', 'product' => $prod, 'mt' => $mt, 'date' => $tgl]; }

echo "\nA · Kasus IKM — baris master merangkum dua lot pertama\n";
{
    $c = co(
        ['GI ALLOY' => 2600], ['GI ALLOY' => 1550],
        [siklus('GI ALLOY', 2300, '24/07/2026')],
        ['GI ALLOY' => [
            ['lotNo' => '1', 'utilMT' => 2000, 'utilDate' => '24 Jul 26',      'etaJKT' => ''],
            ['lotNo' => '2', 'utilMT' => 300,  'utilDate' => '29 July 2026',   'etaJKT' => ''],
            ['lotNo' => '3', 'utilMT' => 300,  'utilDate' => '10 August 2026', 'etaJKT' => ''],
        ]]
    );
    iq_sync_util_with_cycles($c);
    ok(abs($c['utilizationByProd']['GI ALLOY'] - 2600) < 0.001,
       'utilisasi 2.600 — master 2.300 (memuat lot 1 dan 2) + lot 3 sebesar 300',
       'dapat ' . $c['utilizationByProd']['GI ALLOY']);
    ok(abs($c['availableByProd']['GI ALLOY'] - 1550) < 0.001,
       'available 1.550', 'dapat ' . $c['availableByProd']['GI ALLOY']);
}

echo "\nB · BATAS — lot yang memang peristiwa terpisah tetap DIJUMLAH\n";
{
    /* BTS SHEET PILE: master 425, lot tunggal 1.514. Tidak ada awalan lot yang
       jumlahnya 425, jadi keduanya peristiwa berbeda -> 1.939. */
    $c = co(
        ['SHEET PILE' => 1939], ['SHEET PILE' => 1261],
        [siklus('SHEET PILE', 425, '10/03/2026')],
        ['SHEET PILE' => [lot(1514, '27 Agust 2026')]]
    );
    iq_sync_util_with_cycles($c);
    ok(abs($c['utilizationByProd']['SHEET PILE'] - 1939) < 0.001,
       'BTS: 425 + 1.514 = 1.939 — aturan baru TIDAK menelan 425 MT milik master',
       'dapat ' . $c['utilizationByProd']['SHEET PILE']);

    /* KAN GI ALLOY: master 80 @ 31/03, lot 60 @ 07/08 — pemakaian baru. */
    $c2 = co(
        ['GI ALLOY' => 140], ['GI ALLOY' => 0],
        [siklus('GI ALLOY', 80, '31/03/2026')],
        ['GI ALLOY' => [lot(60, '07/08/2026')]]
    );
    iq_sync_util_with_cycles($c2);
    ok(abs($c2['utilizationByProd']['GI ALLOY'] - 140) < 0.001,
       'KAN: 80 + 60 = 140 — lot sesudah master tetap dihitung sebagai tambahan',
       'dapat ' . $c2['utilizationByProd']['GI ALLOY']);
}

echo "\nC · Syaratnya kesamaan PERSIS, bukan perbandingan jumlah\n";
{
    /* Σ lot (2.400) > master (2.300) tapi tidak ada awalan yang pas 2.300.
       Aturan lama yang berlaku: 2.300 + lot yang lolos syarat tanggal. */
    $c = co(
        ['GI ALLOY' => 0], ['GI ALLOY' => 5000],
        [siklus('GI ALLOY', 2300, '24/07/2026')],
        ['GI ALLOY' => [
            ['lotNo' => '1', 'utilMT' => 2000, 'utilDate' => '24 Jul 2026', 'etaJKT' => ''],
            ['lotNo' => '2', 'utilMT' => 400,  'utilDate' => '29 Jul 2026', 'etaJKT' => ''],
        ]]
    );
    iq_sync_util_with_cycles($c);
    ok(abs($c['utilizationByProd']['GI ALLOY'] - 2700) < 0.001,
       'tanpa awalan yang pas, perilaku lama dipertahankan (2.300 + 400)',
       'dapat ' . $c['utilizationByProd']['GI ALLOY']);
}

echo "\nD · Satu lot tanpa tanggal membatalkan penandaan\n";
{
    /* Urutan tak bisa dipastikan, jadi tidak ada yang boleh dianggap sudah
       dirangkum. Lot tanpa tanggal sendiri tetap diabaikan seperti sebelumnya. */
    $c = co(
        ['GI ALLOY' => 0], ['GI ALLOY' => 5000],
        [siklus('GI ALLOY', 2300, '24/07/2026')],
        ['GI ALLOY' => [
            ['lotNo' => '1', 'utilMT' => 2000, 'utilDate' => '',              'etaJKT' => ''],
            ['lotNo' => '2', 'utilMT' => 300,  'utilDate' => '29 July 2026',  'etaJKT' => ''],
        ]]
    );
    iq_sync_util_with_cycles($c);
    ok(abs($c['utilizationByProd']['GI ALLOY'] - 2600) < 0.001,
       'lot tak bertanggal tidak melahirkan penandaan; lot bertanggal tetap ditambah',
       'dapat ' . $c['utilizationByProd']['GI ALLOY']);
}

echo "\nE · Pagar obtained tetap berlaku\n";
{
    /* Lot sesudah awalan yang pas tetap tidak boleh melampaui obtained. */
    $c = co(
        ['GI ALLOY' => 0], ['GI ALLOY' => 2400],   // obtained = 0 + 2400
        [siklus('GI ALLOY', 2000, '24/07/2026')],
        ['GI ALLOY' => [
            ['lotNo' => '1', 'utilMT' => 2000, 'utilDate' => '24 Jul 2026',   'etaJKT' => ''],
            ['lotNo' => '2', 'utilMT' => 900,  'utilDate' => '29 July 2026',  'etaJKT' => ''],
        ]]
    );
    iq_sync_util_with_cycles($c);
    ok(abs($c['utilizationByProd']['GI ALLOY'] - 2000) < 0.001,
       'lot 900 ditolak karena 2.000 + 900 melampaui obtained 2.400',
       'dapat ' . $c['utilizationByProd']['GI ALLOY']);
}

echo "\nF · JALUR TULIS memakai aturan yang SAMA — iq_util_efektif_produk()\n";
{
    /* Sebelum 31-Agu-2026 jalur tulis punya rumusnya sendiri
       (baseline + Sigma lot) dan itulah yang menulis 2.900 ke sheet. Sekarang
       ia memanggil iq_sync_util_with_cycles(). Yang dikunci di sini: kedua
       jalur memberi angka yang SAMA untuk masukan yang sama — kalau tidak,
       sheet dan dashboard kembali bisa berbeda. */
    $ucIKM = [
        ['company_code' => 'IKM', 'cycle_type' => 'Utilization #1', 'product' => 'GI ALLOY',
         'util_mt' => 2300, 'util_date' => '24/07/2026'],
    ];
    $lotIKM = [
        ['product' => 'GI ALLOY', 'util_mt' => 2000, 'util_date' => '24 Jul 26'],
        ['product' => 'GI ALLOY', 'util_mt' => 300,  'util_date' => '29 July 2026'],
        ['product' => 'GI ALLOY', 'util_mt' => 300,  'util_date' => '10 August 2026'],
    ];
    /* prevUtil 2.600 / prevAvail 1.550 = keadaan SEBELUM lot ketiga disimpan
       (Sigma lot lama 2.300). Rumus lama menghasilkan 2.900 di sini. */
    $eff = iq_util_efektif_produk($ucIKM, $lotIKM, 'GI ALLOY', 2600.0, 1550.0, 2600.0, 2300.0);
    ok(abs($eff - 2600) < 0.001,
       'menyimpan lot ketiga IKM menulis 2.600, bukan 2.900 seperti rumus lama',
       'dapat ' . $eff);

    /* BATAS: master diam soal company ini -> rumus lama dipertahankan. */
    $eff2 = iq_util_efektif_produk([], $lotIKM, 'GI ALLOY', 500.0, 500.0, 2600.0, 2300.0);
    ok(abs($eff2 - (max(0.0, 500.0 - 2300.0) + 2600.0)) < 0.001,
       'tanpa baris cycle_utilization, rumus lama dipakai apa adanya',
       'dapat ' . $eff2);

    /* BATAS: lot yang memang peristiwa terpisah tetap DIJUMLAH (BTS). */
    $ucBTS = [
        ['company_code' => 'BTS', 'cycle_type' => 'Utilization #1', 'product' => 'SHEET PILE',
         'util_mt' => 425, 'util_date' => '27/02/2026'],
    ];
    $lotBTS = [
        ['product' => 'SHEETPILE',  'util_mt' => 0,    'util_date' => ''],
        ['product' => 'SHEET PILE', 'util_mt' => 1514, 'util_date' => '27 Agust 2026'],
    ];
    $eff3 = iq_util_efektif_produk($ucBTS, $lotBTS, 'SHEETPILE', 1939.0, 1261.0, 1514.0, 1514.0,
                                   ['SHEETPILE' => 'SHEET PILE']);
    ok(abs($eff3 - 1939) < 0.001,
       'BTS: 425 + 1.514 = 1.939 — ejaan lot berbeda dicocokkan kanonik, baris kosong diabaikan',
       'dapat ' . $eff3);

    /* SIMPAN ULANG tanpa mengubah lot tidak boleh menggeser apa pun.
       Ini sifat yang paling mudah rusak diam-diam: tiap kali Sales membuka
       lalu menekan Simpan, angkanya harus tetap. */
    $eff4 = iq_util_efektif_produk($ucIKM, $lotIKM, 'GI ALLOY', 2600.0, 1550.0, 2600.0, 2600.0);
    ok(abs($eff4 - 2600) < 0.001, 'simpan ulang tanpa perubahan tetap 2.600', 'dapat ' . $eff4);
}

echo "\n" . ($fail ? "ADA YANG GAGAL\n" : "semua lulus\n");
exit($fail ? 1 : 0);
