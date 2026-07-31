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

/* ═══════════════════════════════════════════════════════════════════════
 * DEDICATED DATE COLUMNS — iq_cycle_backfill_dates()
 *
 * `release_date` is overloaded: it holds the terbit DATE for cycles written
 * by the main edit form and by /record-obtained, but older Revision-
 * Management saves put the document NUMBER there instead. The browser filter
 * has a fallback on the Obtained side (pDate(releaseDate) || pDate(spiDate))
 * and NONE on the Submit side (pertekTerbit = pDate(releaseDate)), so a cycle
 * whose release_date is a number falls out of every period. Copying a real
 * release_date into the dedicated column on write means the date survives
 * even if release_date is later overwritten.
 * ═══════════════════════════════════════════════════════════════════════ */
echo "\n-- iq_is_date_like --\n";
ok(iq_is_date_like('15/02/2026') === true,  'DD/MM/YYYY is a date');
ok(iq_is_date_like('2026-02-15') === true,  'ISO is a date');
ok(iq_is_date_like('30-Jun-26')  === true,  "'DD-Mon-YY' (what todayStd() stamps) is a date");
ok(iq_is_date_like('12 Mei 2026') === true, 'Indonesian month name is a date');
ok(iq_is_date_like('1075/ILMATE/PERTEK-SPI-U-Rev.1/VI/2026') === false, 'a PERTEK document number is NOT a date');
ok(iq_is_date_like('04.PI-05.26.0450.1') === false, 'an SPI document number is NOT a date');
ok(iq_is_date_like('TBA') === false, "'TBA' is NOT a date");
ok(iq_is_date_like('')    === false, 'blank is NOT a date');
ok(iq_is_date_like(null)  === false, 'null is NOT a date');
ok(iq_is_date_like('31/02/2026') === false, '31 February is refused (real calendar check)');

echo "\n-- iq_cycle_backfill_dates --\n";
// Submit/Revision rows: release_date == PERTEK Terbit -> pertek_date
$r = iq_cycle_backfill_dates(['cycle_type' => 'Submit #1', 'release_date' => '10/01/2026', 'pertek_date' => '', 'spi_date' => '']);
ok($r['pertek_date'] === '10/01/2026', 'Submit #1: real release_date fills the blank pertek_date');
ok($r['spi_date'] === '', 'Submit #1: spi_date is left alone (wrong column for this row type)');

$r = iq_cycle_backfill_dates(['cycle_type' => 'Revision #2', 'release_date' => '2026-03-04', 'pertek_date' => '', 'spi_date' => '']);
ok($r['pertek_date'] === '2026-03-04', 'Revision #N is treated like Submit #N');

// Obtained rows: release_date == SPI Terbit -> spi_date
$r = iq_cycle_backfill_dates(['cycle_type' => 'Obtained #1', 'release_date' => '15/02/2026', 'pertek_date' => '', 'spi_date' => '']);
ok($r['spi_date'] === '15/02/2026', 'Obtained #1: real release_date fills the blank spi_date');
ok($r['pertek_date'] === '', 'Obtained #1: pertek_date is left alone');

// Fill-blanks ONLY — never clobber a date the user actually entered.
$r = iq_cycle_backfill_dates(['cycle_type' => 'Submit #1', 'release_date' => '10/01/2026', 'pertek_date' => '05/01/2026', 'spi_date' => '']);
ok($r['pertek_date'] === '05/01/2026', 'an existing pertek_date is NEVER overwritten');

// 'TBA' parked in the dedicated column is the same "no date yet" state as blank.
$r = iq_cycle_backfill_dates(['cycle_type' => 'Obtained #1', 'release_date' => '15/02/2026', 'pertek_date' => '', 'spi_date' => 'TBA']);
ok($r['spi_date'] === '15/02/2026', "'TBA' in spi_date counts as empty and gets filled");

// A release_date that is NOT a date must not be copied anywhere — that is how
// document numbers would leak into the dedicated date columns.
$r = iq_cycle_backfill_dates(['cycle_type' => 'Submit #2', 'release_date' => '601/ILMATE/PERTEK-SPI-P/II/2026', 'pertek_date' => '', 'spi_date' => '']);
ok($r['pertek_date'] === '', 'a document number in release_date is NOT copied into pertek_date');

$r = iq_cycle_backfill_dates(['cycle_type' => 'Submit #1', 'release_date' => 'TBA', 'pertek_date' => '', 'spi_date' => '']);
ok($r['pertek_date'] === '', "release_date 'TBA' fills nothing");

// Row types with no dedicated column pass through untouched.
$r = iq_cycle_backfill_dates(['cycle_type' => 'Revision Request — GL ALLOY', 'release_date' => '30-Jul-26', 'pertek_date' => '', 'spi_date' => '']);
ok($r['pertek_date'] === '' && $r['spi_date'] === '', 'Revision Request rows have no dedicated date column — untouched');

// End-to-end through the replacement builder: the Obtained #1 cycle above
// (releaseDate 15/02/2026, no spiDate sent by the client) must come out dated.
$obt = null;
foreach ($cycles as $cy) {
    if (($cy['company_code'] ?? '') === 'EMS' && ($cy['cycle_type'] ?? '') === 'Obtained #1') { $obt = $cy; break; }
}
ok($obt !== null && $obt['spi_date'] === '15/02/2026',
   'iq_build_cycles_replacement() backfills spi_date even when the client sent none');

$sub = null;
foreach ($cycles as $cy) {
    if (($cy['company_code'] ?? '') === 'EMS' && ($cy['cycle_type'] ?? '') === 'Submit #1') { $sub = $cy; break; }
}
ok($sub !== null && $sub['pertek_date'] === '',
   "a TBA release_date still leaves pertek_date blank (nothing to backfill)");

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
