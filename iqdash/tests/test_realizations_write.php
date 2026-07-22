<?php
/**
 * Tests for iqdash_write.php's realization WRITE helpers (Task 11).
 *
 * Ported invariants from IQ/server.js, Sheets branch:
 *   - iq_realization_key() (server.js:2312, shared with Task 10's dedupe):
 *     key = company_code|pib_no|line_no (string-cast, '' for null/missing).
 *   - iq_realizations_merge() is a GENERIC pure primitive matching the
 *     interface this task's brief asked for (conflict on the unique key ->
 *     'update' against the existing sheet row, else 'append'). It is
 *     exercised directly here.
 *   - IMPORTANT DISCREPANCY vs the brief: reading server.js's actual Sheets
 *     write path (insertRealizationsSheets(), server.js:2319-2326, used by
 *     both POST /api/realizations and POST /api/realizations/single) shows
 *     NO conflict resolution at write time at all -- every call always
 *     APPENDS new rows with freshly minted sequential ids (`++maxId`).
 *     The (company_code,pib_no,line_no) "unique key" only matters at READ
 *     time via dedupeRealizations() (Task 10's iq_dedupe_realizations()).
 *     So iq_realizations_merge() exists (pure, tested, per the brief's
 *     explicit interface ask) but is NOT invoked by the production write
 *     path -- iq_realizations_insert() (which mirrors insertRealizationsSheets
 *     exactly: always append, sequential ids, best-effort Change_Log) is
 *     what api.php actually wires up. See task-11-report.md for the full
 *     writeup.
 *   - iq_realization_build() ports buildRealizationObj() (server.js:2290-2305)
 *     field-for-field, including the Sheets-branch-only quirk that
 *     source_file/imported_by do NOT fall back to the row's own value (only
 *     `source` does: `defaults.source || row.source || 'manual'`), unlike
 *     the Postgres branch's insertRealization() defaults.
 */

require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_write.php';
function ok($c, $m) { echo ($c ? "PASS" : "FAIL") . " $m\n"; if (!$c) $GLOBALS['fail'] = 1; }

/* ── iq_realization_key (shared with Task 10's dedupe) ──────────────────── */

ok(iq_realization_key(['company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '2']) === 'EMS|P1|2',
    'iq_realization_key builds company_code|pib_no|line_no');
ok(iq_realization_key(['company_code' => null, 'pib_no' => null, 'line_no' => null]) === '||',
    'iq_realization_key treats missing fields as empty string (matches JS `|| \'\'`)');

/* ── iq_realizations_merge (pure) ───────────────────────────────────────── */

// same key, different data -> update against the existing row's _row.
$existing1 = [
    ['_row' => 5, 'company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '1', 'volume' => '100'],
];
$incoming1 = [
    ['company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '1', 'volume' => '999'],
];
$merge1 = iq_realizations_merge($existing1, $incoming1);
ok(count($merge1['update']) === 1 && count($merge1['append']) === 0, 'conflicting key -> one update, no appends');
ok($merge1['update'][0][0] === 5, 'update entry carries the existing row\'s _row (5)');
ok($merge1['update'][0][1]['volume'] === '999', 'update entry carries the INCOMING row\'s data, not the old data');

// new key (no match in existing) -> append.
$existing2 = [
    ['_row' => 5, 'company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '1', 'volume' => '100'],
];
$incoming2 = [
    ['company_code' => 'EMS', 'pib_no' => 'P2', 'line_no' => '1', 'volume' => '50'],
];
$merge2 = iq_realizations_merge($existing2, $incoming2);
ok(count($merge2['update']) === 0 && count($merge2['append']) === 1, 'non-matching key -> one append, no updates');
ok($merge2['append'][0]['pib_no'] === 'P2', 'appended entry is the incoming row unchanged');

// mixed batch: one conflicting + one new.
$existing3 = [
    ['_row' => 5, 'company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '1', 'volume' => '100'],
];
$incoming3 = [
    ['company_code' => 'EMS', 'pib_no' => 'P1', 'line_no' => '1', 'volume' => '999'], // conflict
    ['company_code' => 'EMS', 'pib_no' => 'P3', 'line_no' => '1', 'volume' => '50'],  // new
];
$merge3 = iq_realizations_merge($existing3, $incoming3);
ok(count($merge3['update']) === 1 && count($merge3['append']) === 1, 'mixed batch: 1 update + 1 append');

// two incoming rows share a key that has NO match in $existing: verified
// against server.js that the real write path never cross-checks incoming
// rows against each other (only against $existing) -- both are appended as
// separate entries; de-duplication only happens later, at READ time
// (iq_dedupe_realizations). iq_realizations_merge() mirrors that scoping:
// it only resolves conflicts against $existing, never incoming-vs-incoming.
$existing4 = [];
$incoming4 = [
    ['company_code' => 'EMS', 'pib_no' => 'P9', 'line_no' => '1', 'volume' => 'A'],
    ['company_code' => 'EMS', 'pib_no' => 'P9', 'line_no' => '1', 'volume' => 'B'],
];
$merge4 = iq_realizations_merge($existing4, $incoming4);
ok(count($merge4['update']) === 0 && count($merge4['append']) === 2,
    'two incoming rows sharing a key with no existing match: BOTH appended (matches server.js: no incoming-vs-incoming conflict check)');

// two incoming rows share a key that DOES match an existing row: both are
// queued as 'update' against the same _row (generic behaviour of the pure
// primitive -- not exercised by the real write path, which never updates).
$existing5 = [
    ['_row' => 7, 'company_code' => 'EMS', 'pib_no' => 'P4', 'line_no' => '1', 'volume' => 'OLD'],
];
$incoming5 = [
    ['company_code' => 'EMS', 'pib_no' => 'P4', 'line_no' => '1', 'volume' => 'FIRST'],
    ['company_code' => 'EMS', 'pib_no' => 'P4', 'line_no' => '1', 'volume' => 'SECOND'],
];
$merge5 = iq_realizations_merge($existing5, $incoming5);
ok(count($merge5['update']) === 2 && count($merge5['append']) === 0, 'two incoming rows matching one existing row -> two update entries, same _row');
ok($merge5['update'][0][0] === 7 && $merge5['update'][1][0] === 7, 'both update entries reference the same existing _row (7)');

// string-cast key matching: numeric-looking line_no as int vs string still matches.
$existing6 = [
    ['_row' => 3, 'company_code' => 'EMS', 'pib_no' => 'P5', 'line_no' => 2],
];
$incoming6 = [
    ['company_code' => 'EMS', 'pib_no' => 'P5', 'line_no' => '2'],
];
$merge6 = iq_realizations_merge($existing6, $incoming6);
ok(count($merge6['update']) === 1, 'string-cast key match: int line_no in existing matches string "2" in incoming');

/* ── iq_realization_build (buildRealizationObj port) ────────────────────── */

$row = [
    'lineNo' => '3', 'product' => 'HRC', 'description' => 'Hot rolled coil',
    'hsCode' => '7208.10', 'volume' => '250.5', 'unit' => 'TNE',
    'valueUSD' => '10000', 'unitPrice' => '400', 'kurs' => '15500',
    'countryOrigin' => 'CN', 'portDestination' => 'Tanjung Priok', 'portLoading' => 'Shanghai',
    'lsNo' => 'LS-1', 'lsDate' => '01/01/2026', 'pibNo' => 'PIB-9', 'pibDate' => '02/01/2026',
    'invoiceNo' => 'INV-1', 'invoiceDate' => '03/01/2026', 'pengajuanNo' => 'PGJ-1', 'pengajuanDate' => '04/01/2026',
];
$defaults = ['source' => 'excel', 'sourceFile' => 'import.xlsx', 'importedBy' => 'ridwan'];
$built = iq_realization_build('EMS', $row, $defaults, 42);
ok($built['id'] === 42, 'build: id passed through');
ok($built['company_code'] === 'EMS', 'build: company_code from arg, not row');
ok($built['line_no'] === 3.0, 'build: line_no coerced to number');
ok($built['product'] === 'HRC', 'build: product passthrough');
ok($built['volume'] === 250.5, 'build: volume coerced to float');
ok($built['source'] === 'excel', 'build: source = defaults.source (takes priority over row.source)');
ok($built['source_file'] === 'import.xlsx', 'build: source_file = defaults.sourceFile');
ok($built['imported_by'] === 'ridwan', 'build: imported_by = defaults.importedBy');
ok($built['source_program'] === 'B', 'build: source_program is always literal "B"');

// defaults empty -> line_no missing defaults to 1, unit defaults to 'TNE',
// source falls through to 'manual' when neither defaults.source nor
// row.source is set.
$rowMin = [];
$builtMin = iq_realization_build('ATH', $rowMin, [], 1);
ok($builtMin['line_no'] === 1, 'build: missing lineNo defaults to 1 (JS `?? 1`)');
ok($builtMin['unit'] === 'TNE', 'build: missing unit defaults to "TNE"');
ok($builtMin['source'] === 'manual', 'build: no defaults.source/row.source -> literal "manual"');
ok($builtMin['volume'] === null, 'build: missing volume stays null (not coerced to 0)');

// Sheets-branch quirk: source_file/imported_by do NOT fall back to the
// row's own value (unlike Postgres branch's insertRealization defaults) --
// only defaults.sourceFile/defaults.importedBy are used.
$rowWithOwnDefaults = ['sourceFile' => 'row-level.xlsx', 'importedBy' => 'row-level-user'];
$builtNoFallback = iq_realization_build('ATH', $rowWithOwnDefaults, [], 2);
ok($builtNoFallback['source_file'] === '', 'build: row.sourceFile is IGNORED when defaults.sourceFile is empty (server.js quirk)');
ok($builtNoFallback['imported_by'] === '', 'build: row.importedBy is IGNORED when defaults.importedBy is empty (server.js quirk)');

/* ── iq_realizations_insert / DELETE are thin Sheets I/O wrappers ───────
 * (iq_realizations_insert(), iq_company_exists(), iq_log_change()) that
 * need live GoogleSheets credentials to exercise end-to-end -- out of scope
 * for this offline test file, same limitation as every other iqdash write
 * task in this sandbox (no network). Covered here only via the pure
 * building blocks above (iq_realization_key, iq_realizations_merge,
 * iq_realization_build) which contain all of the actual business logic. */

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
