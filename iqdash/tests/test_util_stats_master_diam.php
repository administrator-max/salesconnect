<?php
/**
 * Utilisasi produk yang MASTER DIAM soal pemakaiannya.
 *
 * Dua lapis yang sebelumnya sama-sama membuang angkanya:
 *   1. iq_apply_ledger()          — quotaLedger.json itu snapshot BEKU; kolom
 *                                   company_product_stats ditulis aplikasi
 *                                   setiap kali tim menyimpan. Pemakaian yang
 *                                   dicatat sesudah regen hanya hidup di stats.
 *   2. iq_sync_util_with_cycles() — "rincian siklus yang berlaku" tanpa sengaja
 *                                   berlaku per COMPANY: satu produk punya
 *                                   siklus, produk lain milik company itu yang
 *                                   tidak disebut siklus mana pun ikut dinolkan.
 *
 * Kasus nyata: IKM SEAMLESS PIPE 275 MT (kontrak Arsen SSP #50 di SCOT) —
 * ledger 0, lot 0, stats 275. Tampil 0 terpakai / 2.100 tersisa, padahal
 * master sendiri bilang 275 terpakai / 1.825 sisa. Ketahuan 2026-08-10 dari
 * selisih kartu Pending Shipment (IQ) vs Total Tonnage (SCOT).
 *
 * Run: php iqdash/tests/test_util_stats_master_diam.php
 */
require __DIR__ . '/../iqdash_data.php';

function ok($c, $m) { echo ($c ? 'PASS' : 'FAIL') . " $m\n"; if (!$c) $GLOBALS['fail'] = 1; }
$eq = fn($a, $b) => abs((float) $a - (float) $b) < 0.001;

$HS = ['7225.92.90' => 'GI ALLOY', '7304.19.00' => 'SEAMLESS PIPE'];
$ENT = [
    '7225.92.90' => ['obtained' => 4150, 'util' => 2300],
    '7304.19.00' => ['obtained' => 2100, 'util' => 0],     // ledger beku: belum tahu
];

/* ── 1. iq_apply_ledger: stats mengangkat, ledger tidak menurunkan ───── */
$co = ['code' => 'IKM', 'shipments' => [], 'utilizationByProd' => ['GI ALLOY' => 2300, 'SEAMLESS PIPE' => 275]];
iq_apply_ledger($co, $ENT, $HS);
ok($eq($co['utilizationByProd']['SEAMLESS PIPE'], 275), 'ledger 0 + stats 275 -> 275 terpakai');
ok($eq($co['availableByProd']['SEAMLESS PIPE'], 1825), 'sisanya 1.825, bukan 2.100');
ok($eq($co['utilizationByProd']['GI ALLOY'], 2300), 'produk yang ledger-nya bicara tidak bergeser');
ok($eq($co['utilizationMT'], 2575), 'total company 2.575');

$coStale = ['code' => 'IKM', 'shipments' => [], 'utilizationByProd' => ['GI ALLOY' => 0]];
iq_apply_ledger($coStale, $ENT, $HS);
ok($eq($coStale['utilizationByProd']['GI ALLOY'], 2300), 'stats basi-rendah TIDAK menurunkan angka ledger');

$coCap = ['code' => 'IKM', 'shipments' => [], 'utilizationByProd' => ['SEAMLESS PIPE' => 99999]];
iq_apply_ledger($coCap, $ENT, $HS);
ok($eq($coCap['utilizationByProd']['SEAMLESS PIPE'], 2100), 'tetap dibatasi obtained (tak bisa pakai melebihi jatah)');

/* Alias: baris stats lama masih dieja `GI BORON`, ledger menamainya `GI ALLOY`. */
$coAlias = ['code' => 'X', 'shipments' => [], 'utilizationByProd' => ['GI BORON' => 3000]];
iq_apply_ledger($coAlias, ['7225.92.90' => ['obtained' => 4150, 'util' => 2300]], $HS, '', null, ['GI BORON' => 'GI ALLOY']);
ok($eq($coAlias['utilizationByProd']['GI ALLOY'], 3000), 'ejaan alias tetap ketemu');

/* ── 2. iq_sync_util_with_cycles: siklus menang di mana ia bicara ───── */
$co2 = [
    'code' => 'IKM',
    'utilCycles' => [['cycle' => 'Utilization #1', 'product' => 'GI ALLOY', 'mt' => 2300, 'date' => '24/07/2026']],
    'utilizationByProd' => ['GI ALLOY' => 2300, 'SEAMLESS PIPE' => 275, 'SHEET PILE' => 0],
    'availableByProd'   => ['GI ALLOY' => 1850, 'SEAMLESS PIPE' => 1825, 'SHEET PILE' => 1750],
    'shipments' => [],
];
iq_sync_util_with_cycles($co2);
ok($eq($co2['utilizationByProd']['SEAMLESS PIPE'], 275), 'produk tanpa siklus: nilai stats dipertahankan');
ok($eq($co2['availableByProd']['SEAMLESS PIPE'], 1825), 'sisanya ikut benar (obtained 2.100 - 275)');
ok($eq($co2['utilizationMT'], 2575), 'total sesudah sync 2.575');

$co3 = [
    'code' => 'UJI',
    // Master memecah pemakaian jadi 350; stats masih menyimpan 450 yang basi.
    'utilCycles' => [['cycle' => 'Utilization #1', 'product' => 'GL ALLOY', 'mt' => 350, 'date' => '02/12/2025']],
    'utilizationByProd' => ['GL ALLOY' => 450],
    'availableByProd'   => ['GL ALLOY' => 0],
    'shipments' => [],
];
iq_sync_util_with_cycles($co3);
ok($eq($co3['utilizationByProd']['GL ALLOY'], 350), 'di mana siklus bicara, siklus tetap menang atas stats');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
