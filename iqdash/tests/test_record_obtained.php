<?php
/**
 * Offline tests for Task 14's pure planning helper + the date-format gate
 * that feeds POST /api/company/:code/pertek-perubahan-release, PLUS a
 * regression test that drives the REAL iq_record_obtained() netting logic
 * (server.js:2015-2088) end-to-end via an in-memory StubSheets stand-in for
 * GoogleSheets — this is the drift-prone logic the endpoint exists to
 * protect (idempotent re-post of the same terbit must not double-count;
 * a correction with a different mt must net against the cycle's PREVIOUS
 * contribution, not stack on top of it). GoogleSheets has no `final` class/
 * method markers, so subclassing + overriding its I/O methods (table,
 * headers, updateRange, clearValues, append, appendAssoc/appendAssocBulk,
 * deleteRows, cacheClear) to operate on plain PHP arrays works cleanly and
 * needs no network / service-account credentials.
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

/* ── iq_record_obtained(): REAL netting logic, driven end-to-end via an
 * in-memory StubSheets (no network) ─────────────────────────────────────
 *
 * StubSheets extends GoogleSheets and overrides every I/O method
 * iq_record_obtained() (and the iq_log_change()/iq_write_full_table()
 * helpers it calls) touches, so the whole write path runs against plain
 * PHP arrays. The constructor deliberately does NOT call
 * parent::__construct() — that constructor requires a real service-account
 * JSON file and never gets a chance to run, so none of the private
 * network-only members it would set (email/privateKey/etc.) are ever
 * touched by the overridden methods below.
 */
class StubSheets extends GoogleSheets {
    public array $tables = [];   // tab => ['headers'=>[...], 'rows'=>[assoc w/ _row, ...]]
    public array $changeLog = [];

    public function __construct() {
        // Intentionally empty — skips GoogleSheets::__construct() (no
        // service-account file / network needed for this stub).
    }

    public function seedTable(string $tab, array $headers, array $rows): void {
        $out = [];
        foreach ($rows as $i => $r) {
            $assoc = ['_row' => $i + 2];
            foreach ($headers as $h) $assoc[$h] = array_key_exists($h, $r) ? $r[$h] : '';
            $out[] = $assoc;
        }
        $this->tables[$tab] = ['headers' => $headers, 'rows' => $out];
    }

    /** Parse "$tab!A5" / "$tab!A5:BZ100000" -> [$tab, $startRow]. */
    private function parseRange(string $range): array {
        [$tab, $ref] = explode('!', $range, 2);
        preg_match('/^[A-Z]+(\d+)/', $ref, $m);
        return [$tab, (int) ($m[1] ?? 1)];
    }

    public function headers($id, $tab) {
        return $this->tables[$tab]['headers'] ?? [];
    }

    public function table($id, $tab, $useCache = true) {
        return $this->tables[$tab] ?? ['headers' => [], 'rows' => []];
    }

    public function updateRange($id, $range, array $rows) {
        [$tab, $startRow] = $this->parseRange($range);
        $headers = $this->tables[$tab]['headers'] ?? [];
        $newRows = [];
        foreach ($rows as $i => $line) {
            $assoc = ['_row' => $startRow + $i];
            foreach ($headers as $c => $h) $assoc[$h] = $line[$c] ?? '';
            $newRows[] = $assoc;
        }
        $existing = $this->tables[$tab]['rows'] ?? [];
        $before = array_values(array_filter($existing, fn($r) => $r['_row'] < $startRow));
        $this->tables[$tab]['rows'] = array_merge($before, $newRows);
        return null;
    }

    public function clearValues($id, $range) {
        [$tab, $startRow] = $this->parseRange($range);
        $existing = $this->tables[$tab]['rows'] ?? [];
        $this->tables[$tab]['rows'] = array_values(array_filter($existing, fn($r) => $r['_row'] < $startRow));
        return null;
    }

    public function append($id, $tab, array $rows) {
        if ($tab === 'Change_Log') {
            foreach ($rows as $r) $this->changeLog[] = $r;
            return null;
        }
        $headers = $this->tables[$tab]['headers'] ?? [];
        $existing = $this->tables[$tab]['rows'] ?? [];
        $maxRow = 1;
        foreach ($existing as $r) if ($r['_row'] > $maxRow) $maxRow = $r['_row'];
        foreach ($rows as $line) {
            $maxRow++;
            $assoc = ['_row' => $maxRow];
            foreach ($headers as $c => $h) $assoc[$h] = $line[$c] ?? '';
            $existing[] = $assoc;
        }
        $this->tables[$tab]['rows'] = $existing;
        return null;
    }

    public function appendAssoc($id, $tab, array $assoc) {
        return $this->appendAssocBulk($id, $tab, [$assoc]);
    }

    public function appendAssocBulk($id, $tab, array $assocList) {
        if (!$assocList) return null;
        $headers = $this->tables[$tab]['headers'] ?? [];
        $rows = [];
        foreach ($assocList as $a) {
            $row = [];
            foreach ($headers as $h) $row[] = array_key_exists($h, $a) ? $a[$h] : '';
            $rows[] = $row;
        }
        return $this->append($id, $tab, $rows);
    }

    public function deleteRows($id, $tab, array $sheetRows) {
        $existing = $this->tables[$tab]['rows'] ?? [];
        $this->tables[$tab]['rows'] = array_values(array_filter($existing, fn($r) => !in_array($r['_row'], $sheetRows, true)));
        return null;
    }

    public function cacheClear() {
        // no-op: this stub keeps no read cache to invalidate.
    }
}

$stub = new StubSheets();
$sid  = 'stub-sheet-id';

$stub->seedTable('companies',
    ['id', 'code', 'full_name', 'utilization_mt', 'available_quota', 'obtained', 'updated_at'],
    [['id' => 1, 'code' => 'EMS', 'full_name' => 'EMS Steel', 'utilization_mt' => '0', 'available_quota' => '20', 'obtained' => '20', 'updated_at' => '']]
);
$stub->seedTable('cycles',
    ['id', 'company_code', 'cycle_type', 'mt', 'submit_type', 'submit_date', 'release_type', 'release_date', 'status', 'sort_order', 'pertek_date', 'spi_date', 'from_rev_req', 'source_program'],
    [['id' => 1, 'company_code' => 'EMS', 'cycle_type' => 'Obtained #2', 'mt' => '0', 'submit_type' => '', 'submit_date' => '', 'release_type' => '', 'release_date' => '', 'status' => '', 'sort_order' => '0', 'pertek_date' => '', 'spi_date' => '', 'from_rev_req' => false, 'source_program' => 'B']]
);
$stub->seedTable('cycle_products',
    ['id', 'cycle_id', 'product', 'mt', 'source_program'],
    [['id' => 1, 'cycle_id' => 1, 'product' => 'GI ALLOY', 'mt' => '0', 'source_program' => 'B']]
);
$stub->seedTable('company_product_stats',
    ['id', 'company_code', 'product', 'utilization_mt', 'available_mt', 'realization_mt', 'eta_jkt', 'arrived', 'source_program'],
    [['id' => 1, 'company_code' => 'EMS', 'product' => 'GI ALLOY', 'utilization_mt' => '0', 'available_mt' => '20', 'realization_mt' => '', 'eta_jkt' => '', 'arrived' => false, 'source_program' => 'B']]
);

/* ── Scenario 1: first record (mt=100) ──
 * prevContribution=0 (cycle not yet counted: from_rev_req===false but
 * release_date=='' so wasCounted stays false) -> available =
 * max(0, 20 - 0 + 100) = 120. */
$r1 = iq_record_obtained($stub, $sid, 'EMS', ['product' => 'GI ALLOY', 'terbitDate' => '05/01/2026', 'mt' => 100, 'updatedBy' => 'tester']);
ok(($r1['ok'] ?? false) === true, 'scenario 1: first record-obtained call returns ok=true');

$statsAfter1 = array_values(array_filter($stub->tables['company_product_stats']['rows'], fn($s) => $s['company_code'] === 'EMS' && $s['product'] === 'GI ALLOY'));
ok(count($statsAfter1) === 1, 'scenario 1: exactly one company_product_stats row for EMS/GI ALLOY (no duplicate)');
ok(abs((float) $statsAfter1[0]['available_mt'] - 120.0) < 0.0001, 'scenario 1: available_mt = 20 - 0(prevContribution) + 100 = 120');

$cpAfter1 = array_values(array_filter($stub->tables['cycle_products']['rows'], fn($r) => (string) $r['cycle_id'] === '1'));
ok(count($cpAfter1) === 1, 'scenario 1: exactly one cycle_products row for cycle 1 (replaced, not accumulated)');
ok((float) $cpAfter1[0]['mt'] === 100.0 || $cpAfter1[0]['mt'] === '100', 'scenario 1: cycle_products row carries mt=100');

$cycAfter1 = $stub->tables['cycles']['rows'][0];
ok(strpos((string) $cycAfter1['status'], 'SPI TERBIT') === 0, 'scenario 1: cycle marked terbit (status starts with "SPI TERBIT")');
ok($cycAfter1['release_date'] === '05/01/2026', 'scenario 1: cycle release_date set to terbitDate');

$coAfter1 = $stub->tables['companies']['rows'][0];
ok(abs((float) $coAfter1['obtained'] - 120.0) < 0.0001, 'scenario 1: company obtained recomputed to 120 (0 util + 120 available)');
ok(abs((float) $r1['available'] - 120.0) < 0.0001, "scenario 1: return value 'available' = 120");

/* ── Scenario 2: re-post the SAME terbit (mt=100 again) -> idempotency ──
 * The cycle is now counted (from_rev_req===false, release_date='05/01/2026'
 * non-empty/non-TBA) -> prevContribution = 100 (the cycle's own prior mt).
 * available = max(0, 120 - 100 + 100) = 120 -> UNCHANGED, no double-count. */
$r2 = iq_record_obtained($stub, $sid, 'EMS', ['product' => 'GI ALLOY', 'terbitDate' => '05/01/2026', 'mt' => 100, 'updatedBy' => 'tester']);
ok(($r2['ok'] ?? false) === true, 'scenario 2: idempotent re-post returns ok=true');

$statsAfter2 = array_values(array_filter($stub->tables['company_product_stats']['rows'], fn($s) => $s['company_code'] === 'EMS' && $s['product'] === 'GI ALLOY'));
ok(count($statsAfter2) === 1, 'scenario 2: still exactly one company_product_stats row for EMS/GI ALLOY (no duplicate row created)');
ok(abs((float) $statsAfter2[0]['available_mt'] - 120.0) < 0.0001, 'scenario 2: available_mt stays 120 (120 - 100 prevContribution + 100 = 120, NOT double-counted to 220)');

$cpAfter2 = array_values(array_filter($stub->tables['cycle_products']['rows'], fn($r) => (string) $r['cycle_id'] === '1'));
ok(count($cpAfter2) === 1, 'scenario 2: still exactly one cycle_products row for cycle 1 (replaced in place)');

/* ── Scenario 3: re-post a CORRECTION (mt=150, different from the 100 on
 * file) ──
 * prevContribution nets against the cycle's CURRENT counted mt (100, from
 * scenario 2), not the original 20 baseline or a fresh add:
 * available = max(0, 120 - 100 + 150) = 170 (NOT 270 double-add, NOT a
 * second cycle_products/stats row). */
$r3 = iq_record_obtained($stub, $sid, 'EMS', ['product' => 'GI ALLOY', 'terbitDate' => '05/01/2026', 'mt' => 150, 'updatedBy' => 'tester']);
ok(($r3['ok'] ?? false) === true, 'scenario 3: correction re-post returns ok=true');

$statsAfter3 = array_values(array_filter($stub->tables['company_product_stats']['rows'], fn($s) => $s['company_code'] === 'EMS' && $s['product'] === 'GI ALLOY'));
ok(count($statsAfter3) === 1, 'scenario 3: still exactly one company_product_stats row for EMS/GI ALLOY (updated in place, not duplicated)');
ok(abs((float) $statsAfter3[0]['available_mt'] - 170.0) < 0.0001, 'scenario 3: available_mt nets to 170 (120 - 100 prevContribution + 150), NOT 270');

$cpAfter3 = array_values(array_filter($stub->tables['cycle_products']['rows'], fn($r) => (string) $r['cycle_id'] === '1'));
ok(count($cpAfter3) === 1, 'scenario 3: still exactly one cycle_products row for cycle 1 (replaced, not accumulated across corrections)');
ok((float) $cpAfter3[0]['mt'] === 150.0 || $cpAfter3[0]['mt'] === '150', 'scenario 3: cycle_products row now carries the corrected mt=150');

ok(abs((float) $r3['available'] - 170.0) < 0.0001, "scenario 3: return value 'available' = 170");
ok(count($stub->tables['cycles']['rows']) === 1, 'scenario 3: still exactly one cycles row total (no phantom extra cycle minted across the 3 calls)');

/* ── the Change_Log audit string built alongside this write is exactly the
 * string Fix 1 (brace-delimiting $mt) produces — confirms the interpolation
 * fix is exercised through the real call path too, not just in isolation. */
$lastLog = end($stub->changeLog);
ok($lastLog !== false && strpos((string) $lastLog[5], 'GI ALLOY +150→avail terbit 05/01/2026') !== false,
    'scenario 3: Change_Log new_value carries the correctly-interpolated "+150→avail" string (brace-delimited $mt, no dropped value)');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
