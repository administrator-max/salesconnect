<?php
/**
 * Obtained baru yang belum ada di quotaLedger.json (snapshot beku 03-Agu-2026)
 * harus ikut menaikkan atap pemakaian per produk — kalau tidak, pemakaian yang
 * diinput tim di atasnya dibuang diam-diam.
 *
 * Kasus nyata 20-Okt-2026 (David): EMS GL ALLOY 500 dan KJK GL ALLOY 300 sudah
 * diinput tapi dashboard tetap menulis "500 MT / 300 MT available"; SJH lot 81
 * ikut terbuang. Semua kuota Re-Apply #2 dengan PERTEK Perubahan akhir September.
 * Lihat iq_obtained_belum_di_ledger() di iqdash_data.php.
 */
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_data.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

$hs = ['7225.99.90' => 'GL ALLOY', '7225.92.90' => 'GI ALLOY', '7301.10.00' => 'SHEET PILE'];
$siklus = fn($type, $mt, $prod, $extra = []) => $extra + [
    'type' => $type, 'mt' => $mt, 'products' => [$prod => $mt],
    'releaseDate' => null, 'pertekDate' => '', 'spiDate' => '', 'quotaYear' => 2026,
];
$jalankan = function (array $co, array $ent, array $alias = []) use ($hs) {
    iq_dengan_data_tahun_primer($co, function (array &$x) use ($ent, $hs, $alias) {
        iq_apply_ledger($x, $ent, $hs, '', null, $alias);
        iq_sync_util_with_cycles($x, $alias);
    });
    return $co;
};

/* ── A. KJK: ledger 1.400/1.400, Obtained #3 300 (PERTEK Submit #3 terbit),
 *       lot 300 @ 29 Sep sesudah utilisasi master terakhir -> 1.700 / 0 sisa. */
$kjk = [
    'code' => 'KJK',
    'cycles' => [
        $siklus('Submit #1', 6000, 'GL ALLOY', ['releaseDate' => '11/11/2025']),
        $siklus('Obtained #1', 950, 'GL ALLOY', ['releaseDate' => '31/12/2025']),
        $siklus('Submit #2', 3000, 'GL ALLOY', ['releaseDate' => '03/06/2026']),
        $siklus('Obtained #2', 450, 'GL ALLOY', ['releaseDate' => '04/06/2026']),
        $siklus('Submit #3', 3000, 'GL ALLOY', ['releaseDate' => '19/09/2026']),
        $siklus('Obtained #3', 300, 'GL ALLOY'),
        $siklus('Submit #4', 6000, 'GL ALLOY', ['quotaYear' => 2027]),
    ],
    'utilCycles' => [
        ['cycle' => 'Utilization #1', 'product' => 'GL ALLOY', 'mt' => 950, 'date' => '01/12/2025'],
        ['cycle' => 'Utilization #2', 'product' => 'GL ALLOY', 'mt' => 450, 'date' => '25/06/2026'],
    ],
    'shipments' => ['GL ALLOY' => [['lotNo' => '1', 'utilMT' => 300, 'utilDate' => '29 September 2026', 'quotaYear' => 2026]]],
    'utilizationByProd' => ['GL BORON' => 1400],
];
$r = $jalankan($kjk, ['7225.99.90' => ['obtained' => 1400, 'util' => 1400]], ['GL BORON' => 'GL ALLOY']);
ok(abs($r['utilizationByProd']['GL ALLOY'] - 1700) < 0.01, 'A KJK: lot 300 sesudah PERTEK #2 terhitung -> used 1.700 (got ' . $r['utilizationByProd']['GL ALLOY'] . ')');
ok(abs($r['availableByProd']['GL ALLOY']) < 0.01, 'A KJK: sisa 0');
ok(abs($r['obtained'] - 1700) < 0.01, 'A KJK: obtained 1.700 (ledger 1.400 + Obtained #3 300)');
ok(abs($r['_ledgerObtained'] - 1400) < 0.01, 'A KJK: _ledgerObtained tetap angka ledger murni');
ok(abs($r['obtained'] - 1700) < 0.01 && !isset($r['utilizationByProd']['GL BORON']), 'A KJK: Submit #4 (2027) tidak ikut dihitung');

/* ── B. EMS: produk GL ALLOY sama sekali tidak ada di ledger; pemakaian 500
 *       hanya hidup di company_product_stats -> 500 / 0 sisa. */
$ems = [
    'code' => 'EMS',
    'cycles' => [
        $siklus('Obtained #1', 1600, 'SHEET PILE', ['releaseDate' => '07/11/2025']),
        $siklus('Obtained #2', 500, 'GI ALLOY', ['releaseDate' => '18/05/2026']),
        $siklus('Submit #3', 3000, 'GL ALLOY', ['releaseDate' => '28/09/2026']),
        $siklus('Obtained #3', 500, 'GL ALLOY'),
    ],
    'utilCycles' => [
        ['cycle' => 'Utilization #1', 'product' => 'SHEET PILE', 'mt' => 1600, 'date' => '12/01/2026'],
        ['cycle' => 'Utilization #2', 'product' => 'GI ALLOY', 'mt' => 500, 'date' => '20/05/2026'],
    ],
    'shipments' => [],
    'utilizationByProd' => ['GL ALLOY' => 500],
];
$r = $jalankan($ems, ['7301.10.00' => ['obtained' => 1600, 'util' => 1600], '7225.92.90' => ['obtained' => 500, 'util' => 500]]);
ok(abs(($r['utilizationByProd']['GL ALLOY'] ?? -1) - 500) < 0.01, 'B EMS: GL ALLOY used 500 dari stats');
ok(abs(($r['availableByProd']['GL ALLOY'] ?? -1)) < 0.01, 'B EMS: GL ALLOY sisa 0');
ok(abs($r['obtained'] - 2600) < 0.01, 'B EMS: obtained 2.600');

/* ── C. Obtained yang BELUM terbit (PERTEK pasangannya belum ada) tidak boleh
 *       menaikkan apa pun — kalau tidak, lot liar bisa memakan kuota fiktif. */
$c = $kjk;
$c['cycles'][4]['releaseDate'] = 'TBA';
$r = $jalankan($c, ['7225.99.90' => ['obtained' => 1400, 'util' => 1400]], ['GL BORON' => 'GL ALLOY']);
ok(abs($r['obtained'] - 1400) < 0.01, 'C: PERTEK #3 belum terbit -> obtained tetap 1.400');
ok(abs($r['utilizationByProd']['GL ALLOY'] - 1400) < 0.01, 'C: lot di atas atap tetap tidak dihitung');

/* ── D. Ledger sudah mencakup semuanya -> tidak ada yang berubah. */
$r = $jalankan($kjk, ['7225.99.90' => ['obtained' => 1700, 'util' => 1400]], ['GL BORON' => 'GL ALLOY']);
ok(abs($r['obtained'] - 1700) < 0.01 && abs($r['_ledgerObtained'] - 1700) < 0.01, 'D: ledger lengkap -> tidak ada susulan ganda');

/* ── E. Siklus menyimpan produk SEBELUM revisi: kalau ledger (NET sesudah
 *       revisi) sudah >= siklus, produk lama tidak boleh hidup lagi. */
$bdg = [
    'code' => 'BDG',
    'cycles' => [$siklus('Obtained #1', 1000, 'BORDES ALLOY', ['releaseDate' => '01/01/2026'])],
    'shipments' => [],
    'utilizationByProd' => [],
];
$r = $jalankan($bdg, ['7225.99.90' => ['obtained' => 650, 'util' => 0], '7225.92.90' => ['obtained' => 350, 'util' => 0]]);
ok(!isset($r['utilizationByProd']['BORDES ALLOY']) && abs($r['obtained'] - 1000) < 0.01, 'E: revisi pengganti -> BORDES tidak hidup lagi');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
exit(empty($GLOBALS['fail']) ? 0 : 1);
