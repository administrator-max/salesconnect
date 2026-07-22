<?php
/**
 * Tests for iqdash_write.php's realization READ helpers
 * (iq_realizations_list / iq_realizations_summary).
 *
 * Ported invariants from IQ/server.js:
 *   - dedupeRealizations() (server.js:2309-2318): key = company_code|pib_no|
 *     line_no; first occurrence wins UNLESS it was imported_by 'migrationA'
 *     and a later duplicate is NOT 'migrationA' (then the later one wins).
 *   - GET /api/realizations (server.js:2381-2419, Sheets branch): optional
 *     company_code filter (strict-equal in JS; string-cast here per this
 *     codebase's ID-compare convention), then dedupe, then sort by
 *     pib_date DESC (pib_date is DD/MM/YYYY, parsed; unparseable -> 0),
 *     tiebreak company_code ASC, pib_no ASC, line_no ASC numeric.
 *   - GET /api/realizations/summary (server.js:2334-2379, Sheets branch):
 *     dedupe (no company_code filter in the dedupe step itself), then keep
 *     only rows with a truthy company_code, group by company_code: pibs =
 *     count of DISTINCT truthy pib_no, lines = count of ALL matched rows
 *     (whether or not pib_no is set). totals = sum across companies.
 */

require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_write.php';
function ok($c, $m) { echo ($c ? "PASS" : "FAIL") . " $m\n"; if (!$c) $GLOBALS['fail'] = 1; }

/* ── iq_realizations_list ─────────────────────────────────────────────── */

// duplicate (company_code, pib_no, line_no) collapses to one; first wins
// when neither copy is 'migrationA'.
$rows = [
    ['company_code' => 'EMS', 'pib_no' => 'PIB-1', 'line_no' => '1', 'pib_date' => '01/01/2026', 'imported_by' => 'excel', 'volume' => '100'],
    ['company_code' => 'EMS', 'pib_no' => 'PIB-1', 'line_no' => '1', 'pib_date' => '01/01/2026', 'imported_by' => 'manual', 'volume' => '999'],
];
$out = iq_realizations_list($rows, null);
ok(count($out) === 1, 'duplicate (company_code,pib_no,line_no) collapses to one row');
ok(($out[0]['volume'] ?? null) === '100', 'first non-migrationA copy wins over a later non-migrationA duplicate');

// migrationA preference: an earlier 'migrationA' copy is replaced by a
// later non-migrationA duplicate.
$rows2 = [
    ['company_code' => 'EMS', 'pib_no' => 'PIB-2', 'line_no' => '1', 'pib_date' => '02/01/2026', 'imported_by' => 'migrationA', 'volume' => 'OLD'],
    ['company_code' => 'EMS', 'pib_no' => 'PIB-2', 'line_no' => '1', 'pib_date' => '02/01/2026', 'imported_by' => 'excel', 'volume' => 'NEW'],
];
$out2 = iq_realizations_list($rows2, null);
ok(count($out2) === 1, 'migrationA duplicate still collapses to one row');
ok(($out2[0]['volume'] ?? null) === 'NEW', 'later non-migrationA copy replaces an earlier migrationA copy');

// two migrationA copies: dedup does not upgrade (condition requires the
// LATER copy to be non-migrationA), so the first migrationA copy wins.
$rows2b = [
    ['company_code' => 'EMS', 'pib_no' => 'PIB-2B', 'line_no' => '1', 'pib_date' => '02/01/2026', 'imported_by' => 'migrationA', 'volume' => 'FIRST'],
    ['company_code' => 'EMS', 'pib_no' => 'PIB-2B', 'line_no' => '1', 'pib_date' => '02/01/2026', 'imported_by' => 'migrationA', 'volume' => 'SECOND'],
];
$out2b = iq_realizations_list($rows2b, null);
ok(count($out2b) === 1 && $out2b[0]['volume'] === 'FIRST', 'two migrationA copies: first one wins (no upgrade rule fires)');

// sort by pib_date DESC (DD/MM/YYYY parsed).
$rows3 = [
    ['company_code' => 'A', 'pib_no' => 'P1', 'line_no' => '1', 'pib_date' => '10/03/2026'],
    ['company_code' => 'A', 'pib_no' => 'P2', 'line_no' => '1', 'pib_date' => '25/01/2026'],
    ['company_code' => 'A', 'pib_no' => 'P3', 'line_no' => '1', 'pib_date' => '01/12/2025'],
];
$out3 = iq_realizations_list($rows3, null);
ok(array_column($out3, 'pib_no') === ['P1', 'P2', 'P3'], 'sorted by pib_date DESC (10/03/2026, 25/01/2026, 01/12/2025)');

// unparseable / empty pib_date sorts as 0 (oldest / last among dated rows).
$rows3b = [
    ['company_code' => 'A', 'pib_no' => 'PDATED', 'line_no' => '1', 'pib_date' => '01/01/2026'],
    ['company_code' => 'A', 'pib_no' => 'PEMPTY', 'line_no' => '1', 'pib_date' => ''],
];
$out3b = iq_realizations_list($rows3b, null);
ok(array_column($out3b, 'pib_no') === ['PDATED', 'PEMPTY'], 'dated row sorts before an empty/unparseable pib_date');

// same pib_date -> tiebreak company_code ASC, then pib_no ASC, then
// line_no ASC (numeric).
$rows4 = [
    ['company_code' => 'B', 'pib_no' => 'P9', 'line_no' => '2', 'pib_date' => '01/01/2026'],
    ['company_code' => 'A', 'pib_no' => 'P9', 'line_no' => '1', 'pib_date' => '01/01/2026'],
    ['company_code' => 'A', 'pib_no' => 'P1', 'line_no' => '1', 'pib_date' => '01/01/2026'],
];
$out4 = iq_realizations_list($rows4, null);
ok(array_column($out4, 'company_code') === ['A', 'A', 'B'], 'tiebreak: company_code ASC');
ok($out4[0]['pib_no'] === 'P1' && $out4[1]['pib_no'] === 'P9', 'tiebreak: pib_no ASC within same company_code');

$rows4b = [
    ['company_code' => 'A', 'pib_no' => 'P1', 'line_no' => '10', 'pib_date' => '01/01/2026'],
    ['company_code' => 'A', 'pib_no' => 'P1', 'line_no' => '2', 'pib_date' => '01/01/2026'],
];
$out4b = iq_realizations_list($rows4b, null);
ok(array_column($out4b, 'line_no') === ['2', '10'], 'tiebreak: line_no ASC numeric (2 before 10, not lexicographic)');

// filter by company_code, string-cast (numeric-looking code matches).
$rows5 = [
    ['company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '1', 'pib_date' => '01/01/2026'],
    ['company_code' => '123', 'pib_no' => 'P2', 'line_no' => '1', 'pib_date' => '01/01/2026'],
];
$out5 = iq_realizations_list($rows5, 'EMS');
ok(count($out5) === 1 && $out5[0]['company_code'] === 'EMS', 'filters by company_code');
$out5b = iq_realizations_list($rows5, '123');
ok(count($out5b) === 1 && $out5b[0]['company_code'] === '123', 'string-cast filter: numeric-looking code "123" matches');
$out5c = iq_realizations_list($rows5, null);
ok(count($out5c) === 2, 'null code -> no filter, both rows returned');

/* ── iq_realizations_summary ────────────────────────────────────────────── */

$rowsSum = [
    // EMS: 2 distinct PIBs, 3 lines total
    ['company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '1'],
    ['company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '2'],
    ['company_code' => 'EMS', 'pib_no' => 'P2', 'line_no' => '1'],
    // duplicate of the first EMS/P1/1 row -> collapsed by dedup, must not double-count
    ['company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '1'],
    // ATH: 1 distinct PIB, 1 line, plus a row with NO pib_no (still counts as a line)
    ['company_code' => 'ATH', 'pib_no' => 'P3', 'line_no' => '1'],
    ['company_code' => 'ATH', 'pib_no' => '',   'line_no' => '2'],
    // no company_code -> excluded entirely
    ['company_code' => '',    'pib_no' => 'P9', 'line_no' => '1'],
];
$summary = iq_realizations_summary($rowsSum);
ok($summary['counts']['EMS']['pibs'] === 2, 'EMS: 2 distinct PIBs');
ok($summary['counts']['EMS']['lines'] === 3, 'EMS: 3 lines (dedup collapsed the duplicate, does not double-count)');
ok($summary['counts']['ATH']['pibs'] === 1, 'ATH: 1 distinct (truthy) PIB');
ok($summary['counts']['ATH']['lines'] === 2, 'ATH: 2 lines (row with empty pib_no still counts as a line)');
ok(!array_key_exists('', $summary['counts'] ?? []), 'rows with empty company_code excluded from counts');
ok($summary['totalPibs'] === 3, 'totalPibs = 2 (EMS) + 1 (ATH) = 3');
ok($summary['totalLines'] === 5, 'totalLines = 3 (EMS) + 2 (ATH) = 5');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
