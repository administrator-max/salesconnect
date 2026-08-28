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

echo "\n" . ($fail ? "ADA YANG GAGAL\n" : "semua lulus\n");
exit($fail ? 1 : 0);
