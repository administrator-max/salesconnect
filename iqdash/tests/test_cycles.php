<?php
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_write.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

/* ── Fixture: TWO companies' existing cycles + cycle_products ──────────
 * ATH: 1 cycle (id=1), 1 cycle_product (id=1, cycle_id=1).
 * EMS: 2 cycles (id=2,3), 2 cycle_products (id=2 -> cycle 2, id=3 -> cycle 3).
 * Max existing cycle id = 3, max existing cycle_product id = 3. */
$allCycles = [
    ['id' => 1, 'company_code' => 'ATH', 'cycle_type' => 'Submit #1', 'mt' => '100', 'submit_type' => 'Submit MOI', 'submit_date' => '01/01/2026', 'release_type' => 'PERTEK', 'release_date' => '10/01/2026', 'status' => 'Done', 'sort_order' => 0, 'pertek_date' => '', 'spi_date' => '', 'from_rev_req' => false, 'source_program' => 'B'],
    ['id' => 2, 'company_code' => 'EMS', 'cycle_type' => 'Submit #1', 'mt' => '50',  'submit_type' => 'Submit MOI', 'submit_date' => '01/02/2026', 'release_type' => 'PERTEK', 'release_date' => '10/02/2026', 'status' => 'Done', 'sort_order' => 0, 'pertek_date' => '', 'spi_date' => '', 'from_rev_req' => false, 'source_program' => 'B'],
    ['id' => 3, 'company_code' => 'EMS', 'cycle_type' => 'Obtained #1', 'mt' => '20', 'submit_type' => 'Reapply', 'submit_date' => '01/03/2026', 'release_type' => 'SPI', 'release_date' => '', 'status' => 'Pending', 'sort_order' => 1, 'pertek_date' => '', 'spi_date' => '', 'from_rev_req' => false, 'source_program' => 'B'],
];
$allCp = [
    ['id' => 1, 'cycle_id' => 1, 'product' => 'GI ALLOY',    'mt' => '100', 'source_program' => 'B'],
    ['id' => 2, 'cycle_id' => 2, 'product' => 'SHEET PILE',  'mt' => '50',  'source_program' => 'B'],
    ['id' => 3, 'cycle_id' => 3, 'product' => 'SHEET PILE',  'mt' => '20',  'source_program' => 'B'],
];

// Incoming replacement cycles for EMS only.
$newCycles = [
    ['type' => 'Submit #1', 'mt' => 60, 'submitType' => 'Submit MOI', 'submitDate' => '05/01/2026', 'releaseType' => 'PERTEK', 'releaseDate' => 'TBA', 'status' => 'Open', 'products' => ['SHEET PILE' => 60]],
    ['type' => 'Obtained #1', 'mt' => 35, 'submitType' => 'Reapply', 'submitDate' => '', 'releaseType' => 'SPI', 'releaseDate' => '15/02/2026', 'status' => 'Done', 'products' => ['SHEET PILE' => 30, 'GI ALLOY' => 5]],
];

$result = iq_build_cycles_replacement($allCycles, $allCp, 'EMS', $newCycles);
$cycles = $result['cycles'];
$cp = $result['cycleProducts'];

// ── ATH is untouched ──
$athCycles = array_values(array_filter($cycles, fn($c) => $c['company_code'] === 'ATH'));
ok(count($athCycles) === 1, 'ATH keeps exactly 1 cycle row');
ok(($athCycles[0]['id'] ?? null) === 1, 'ATH cycle row keeps its original id (1)');
ok(($athCycles[0]['mt'] ?? null) === '100', 'ATH cycle row untouched (mt=100)');

$athCp = array_values(array_filter($cp, fn($r) => $r['cycle_id'] === 1));
ok(count($athCp) === 1, 'ATH keeps exactly 1 cycle_product row');
ok(($athCp[0]['id'] ?? null) === 1, 'ATH cycle_product row keeps its original id (1)');
ok(($athCp[0]['product'] ?? null) === 'GI ALLOY', 'ATH cycle_product row untouched (product=GI ALLOY)');

// ── EMS's OLD rows are gone ──
$emsOldCycles = array_values(array_filter($cycles, fn($c) => $c['company_code'] === 'EMS' && in_array($c['id'], [2, 3], true)));
ok(count($emsOldCycles) === 0, "EMS's old cycle rows (id 2,3) are gone");
$emsOldCp = array_values(array_filter($cp, fn($r) => in_array($r['id'], [2, 3], true) && in_array($r['cycle_id'], [2, 3], true)));
ok(count($emsOldCp) === 0, "EMS's old cycle_product rows (id 2,3, cycle_id 2/3) are gone");

// ── EMS's NEW rows replace them, ids minted from the GLOBAL max (3+1=4, 4+1=5) ──
$emsNewCycles = array_values(array_filter($cycles, fn($c) => $c['company_code'] === 'EMS'));
ok(count($emsNewCycles) === 2, 'EMS has exactly 2 new cycle rows');
usort($emsNewCycles, fn($a, $b) => $a['id'] <=> $b['id']);
ok(($emsNewCycles[0]['id'] ?? null) === 4, 'first new EMS cycle gets id=4 (max existing id 3, +1)');
ok(($emsNewCycles[1]['id'] ?? null) === 5, 'second new EMS cycle gets id=5');
ok($emsNewCycles[0]['cycle_type'] === 'Submit #1', 'first new EMS cycle carries its type');
ok($emsNewCycles[0]['release_date'] === '', "release_date 'TBA' is normalized to blank");
ok($emsNewCycles[1]['release_date'] === '15/02/2026', 'non-TBA release_date is preserved as-is');
ok($emsNewCycles[1]['submit_date'] === '', 'blank submitDate stays blank');

// ── cycle_products: linked by generated cycle_id, ids minted from global max (3+1=4,5,6) ──
$cyId4 = $emsNewCycles[0]['id']; // Submit #1 (1 product)
$cyId5 = $emsNewCycles[1]['id']; // Obtained #1 (2 products)

$cpFor4 = array_values(array_filter($cp, fn($r) => $r['cycle_id'] === $cyId4));
ok(count($cpFor4) === 1, 'new Submit #1 cycle has exactly 1 cycle_product row');
ok($cpFor4[0]['product'] === 'SHEET PILE' && $cpFor4[0]['mt'] === '60', 'Submit #1 cycle_product row correct (SHEET PILE, mt=60)');

$cpFor5 = array_values(array_filter($cp, fn($r) => $r['cycle_id'] === $cyId5));
ok(count($cpFor5) === 2, 'new Obtained #1 cycle has exactly 2 cycle_product rows');
$prodsFor5 = array_column($cpFor5, 'mt', 'product');
ok(($prodsFor5['SHEET PILE'] ?? null) === '30', 'Obtained #1 SHEET PILE mt=30');
ok(($prodsFor5['GI ALLOY'] ?? null) === '5', 'Obtained #1 GI ALLOY mt=5');

// New cycle_product ids are also globally sequential (4,5,6 in emission order)
$newCpIds = array_values(array_filter(array_map(fn($r) => $r['id'], $cp), fn($id) => $id > 3));
sort($newCpIds);
ok($newCpIds === [4, 5, 6], 'new cycle_product ids are globally sequential (4,5,6)');

// ── Totals: 1 preserved + 2 new = 3 cycles; 1 preserved + 3 new = 4 cycle_products ──
ok(count($cycles) === 3, 'total cycles = 1 (ATH) + 2 (new EMS)');
ok(count($cp) === 4, 'total cycle_products = 1 (ATH) + 3 (new EMS)');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
