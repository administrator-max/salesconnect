<?php
/**
 * Offline tests for Task 14's pure planning helper + the date-format gate
 * that feeds POST /api/company/:code/pertek-perubahan-release. Everything
 * exercised here is PURE (no GoogleSheets/network) — the full wrappers
 * iq_record_obtained() / iq_pertek_perubahan_release() need live Sheets
 * access and are exercised only through the router-level fixtures
 * elsewhere (see test_patch_company.php's subprocess technique for the
 * pattern this codebase uses when a route needs checking without hitting
 * Sheets).
 */
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_write.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

/* ── iq_record_obtained_plan(): idempotency (alreadyTerbit flag) ── */

$stats = [
    ['id' => 1, 'company_code' => 'EMS', 'product' => 'GI ALLOY', 'utilization_mt' => '50', 'available_mt' => '100'],
    ['id' => 2, 'company_code' => 'EMS', 'product' => 'WEAR PLATE', 'utilization_mt' => '0', 'available_mt' => '20'],
];

// alreadyTerbit=true -> skipped, no delta, available_mt unchanged
$planSkip = iq_record_obtained_plan($stats, 'GI ALLOY', 30.0, true);
ok($planSkip['skipped'] === true, 'alreadyTerbit=true -> skipped=true');
ok(abs($planSkip['delta'] - 0.0) < 0.0001, 'alreadyTerbit=true -> delta=0 (no double-count on re-post)');
ok(abs($planSkip['newAvailable'] - 100.0) < 0.0001, 'alreadyTerbit=true -> newAvailable unchanged (100, not 130)');
ok($planSkip['foundExisting'] === true, 'alreadyTerbit=true -> existing stats row for GI ALLOY was found');

// alreadyTerbit=false -> applies the full mt as a delta onto available_mt
$planApply = iq_record_obtained_plan($stats, 'GI ALLOY', 30.0, false);
ok($planApply['skipped'] === false, 'alreadyTerbit=false -> skipped=false');
ok(abs($planApply['delta'] - 30.0) < 0.0001, 'alreadyTerbit=false -> delta=+mt (30)');
ok(abs($planApply['newAvailable'] - 130.0) < 0.0001, 'alreadyTerbit=false -> newAvailable = 100 + 30 = 130');

// alreadyTerbit=false, brand-new product (no existing stats row) -> baseline 0
$planNew = iq_record_obtained_plan($stats, 'BRAND NEW PRODUCT', 75.0, false);
ok($planNew['foundExisting'] === false, 'no existing stats row for a brand-new product');
ok(abs($planNew['newAvailable'] - 75.0) < 0.0001, 'brand-new product -> newAvailable = 0 + 75 = 75');

// floored at 0 (mirrors server.js's Math.max(0, ...)) even for a hypothetical negative net
$statsLow = [['id' => 3, 'company_code' => 'EMS', 'product' => 'LOW', 'utilization_mt' => '0', 'available_mt' => '5']];
$planFloor = iq_record_obtained_plan($statsLow, 'LOW', -20.0, false);
ok(abs($planFloor['newAvailable'] - 0.0) < 0.0001, 'newAvailable floored at 0, never negative');

/* ── date gate feeding the pertek-perubahan-release upsert ──
 * server.js itself stores the RAW input string (never converts to ISO —
 * see iqdash_write.php's Task 14 header comment for the full read of
 * server.js:2101-2126 that established this). iq_date_iso() is used here
 * ONLY as a stricter input-validity gate (real calendar validation via
 * checkdate(), rejecting e.g. 31/02/2026 that server.js's shape-only regex
 * would accept), never as the stored/returned value. */
ok(iq_date_iso('05/02/2026') === '2026-02-05', "iq_date_iso('05/02/2026') === '2026-02-05' (DD/MM/YYYY parsed)");
ok(iq_date_iso('2026-02-05') === '2026-02-05', 'iq_date_iso ISO input passthrough (already YYYY-MM-DD)');
ok(iq_date_iso('31/02/2026') === null, 'iq_date_iso rejects a calendar-invalid date (31 Feb does not exist)');
ok(iq_date_iso('not-a-date') === null, 'iq_date_iso rejects garbage input');

/* ── the pending-revisions gate (company must have a pending PERTEK
 * Perubahan split to accept a release date) reads iqdash/data/
 * pendingRevisions.json — confirm the fixture used by iq_pending_revisions()
 * has at least one entry, so the "no pending revision -> 400" branch inside
 * iq_pertek_perubahan_release() is reachable/testable at the router level. */
$pending = iq_pending_revisions();
ok(is_array($pending) && count($pending) > 0, 'iq_pending_revisions() fixture has at least one pending entry');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
