<?php
/**
 * Offline tests for GoogleSheets::batchRewrite() (Part A of the batch-writes
 * task) and its wiring into iqdash's multi-tab full-table write sites
 * (Part B), specifically iq_replace_cycles() which now must issue exactly
 * ONE batchRewrite() call covering both `cycles` and `cycle_products`
 * instead of two separate sequential writes.
 *
 * WHY THIS FILE DOESN'T CALL THE REAL GoogleSheets::batchRewrite() OVER THE
 * NETWORK: this whole test suite runs offline (no service-account creds,
 * no network egress in this sandbox — see test_patch_company.php /
 * test_router_get.php for the same constraint applied to other endpoints).
 * `GoogleSheets::api()` (private, called twice inside batchRewrite — once
 * for values:batchUpdate, once for values:batchClear) is not interceptable
 * from a subclass: PHP resolves private-method calls made from WITHIN the
 * declaring class statically, never virtually, so a subclass overriding
 * `api`/`batchRewrite`'s private helpers has zero effect on what the base
 * class's own methods actually call (verified empirically while writing
 * this test — see the "private methods are not virtual" PHP semantics).
 * So the REAL batchRewrite()'s request-shape is verified two ways instead:
 *   1. A source-level assertion against the ACTUAL shipped method body
 *      (via Reflection) — confirms the literal '!A2' / ':BZ100000' range
 *      formats, the tab-name quoting, and that the values:batchUpdate call
 *      appears BEFORE the values:batchClear call in source (write-first
 *      ordering), i.e. this checks the real code, not a hand-written copy.
 *   2. A pure re-computation of the same formula (mirrored line-for-line
 *      from the method above) against concrete sample inputs, to pin the
 *      exact shape of `data`/`clearRanges` for a regression harness that
 *      doesn't require re-reading source text.
 * iq_replace_cycles()'s "exactly ONE batchRewrite call for both tabs" is
 * tested for real (no reflection tricks needed): it calls the PUBLIC
 * `GoogleSheets::batchRewrite($id, $tabWrites)` method, which a subclass
 * CAN legitimately override (it's public, not private) — so a StubSheets
 * override here genuinely intercepts and records what iq_replace_cycles()
 * (via iq_batch_write_full_tables()) sends.
 */
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_write.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

/* ═══════════════════════════════════════════════════════════════════════
 * 1) Source-level assertions against the REAL GoogleSheets::batchRewrite()
 * ═══════════════════════════════════════════════════════════════════════ */
$rm = new ReflectionMethod('GoogleSheets', 'batchRewrite');
$srcFile  = $rm->getFileName();
$srcLines = file($srcFile);
$body = implode('', array_slice($srcLines, $rm->getStartLine() - 1, $rm->getEndLine() - $rm->getStartLine() + 1));

ok(strpos($body, "'!A2'") !== false, "batchRewrite source writes data at '<tab>'!A2 (literal '!A2' present)");
ok(strpos($body, "count(\$rows) + 2") !== false && strpos($body, ':BZ100000') !== false,
    "batchRewrite source clears from row (count(\$rows)+2) through :BZ100000");
ok(strpos($body, "str_replace(\"'\", \"''\", \$tab)") !== false,
    'batchRewrite source quotes/escapes the tab name (doubled single-quotes) before building ranges');

$posUpdate = strpos($body, 'values:batchUpdate');
$posClear  = strpos($body, 'values:batchClear');
ok($posUpdate !== false && $posClear !== false && $posUpdate < $posClear,
    'batchRewrite source calls values:batchUpdate BEFORE values:batchClear (write-first-then-clear ordering)');

// The clear call is unconditional; the write call is gated on non-empty $data
// — confirms an explicitly-empty tab still gets its whole region cleared,
// but no write ever fires the batchClear before the batchUpdate is issued.
$ifDataPos = strpos($body, 'if ($data)');
ok($ifDataPos !== false && $ifDataPos < $posUpdate,
    'the values:batchUpdate call is gated behind `if ($data)` (skipped when every tab in the batch has zero rows)');

/* ═══════════════════════════════════════════════════════════════════════
 * 2) Pure re-computation of the same range-building formula (mirrors the
 *    method above line-for-line) against concrete sample inputs — pins the
 *    exact shape of `data` / `clearRanges` a caller of batchRewrite($id,
 *    $tabWrites) should expect the real method to send to the Sheets API.
 * ═══════════════════════════════════════════════════════════════════════ */
function mirror_batch_rewrite_shape(array $tabWrites): array {
    $data = [];
    $clearRanges = [];
    foreach ($tabWrites as $w) {
        $tab = $w['tab'];
        $rows = $w['rows'] ?? [];
        $q = "'" . str_replace("'", "''", $tab) . "'";
        if ($rows) $data[] = ['range' => $q . '!A2', 'values' => $rows];
        $clearRanges[] = $q . '!A' . (count($rows) + 2) . ':BZ100000';
    }
    return ['data' => $data, 'clearRanges' => $clearRanges];
}

$shape = mirror_batch_rewrite_shape([
    ['tab' => 'cycles', 'rows' => [['1', 'ATH', '100']]],
    ['tab' => 'cycle_products', 'rows' => []], // explicit empty -> clear-only
]);
ok(count($shape['data']) === 1, 'only the non-empty tab (cycles) gets a data entry');
ok($shape['data'][0]['range'] === "'cycles'!A2", "cycles data entry range is 'cycles'!A2");
ok($shape['data'][0]['values'] === [['1', 'ATH', '100']], 'cycles data entry carries the given row matrix verbatim');
ok($shape['clearRanges'][0] === "'cycles'!A3:BZ100000", 'cycles clearRange starts right after its 1 written row (A3)');
ok($shape['clearRanges'][1] === "'cycle_products'!A2:BZ100000", 'cycle_products (0 rows) clearRange starts at A2 (whole region)');

$shapeQuoted = mirror_batch_rewrite_shape([
    ['tab' => "O'Brien Corp", 'rows' => [['x']]],
]);
ok($shapeQuoted['data'][0]['range'] === "'O''Brien Corp'!A2", "a tab name containing a single quote is doubled per Sheets A1-range quoting rules (O''Brien Corp)");

/* ═══════════════════════════════════════════════════════════════════════
 * 3) iq_replace_cycles() issues exactly ONE batchRewrite() covering BOTH
 *    `cycles` and `cycle_products` — the actual atomicity fix under test.
 * ═══════════════════════════════════════════════════════════════════════ */
class StubSheets extends GoogleSheets {
    public array $tables = [];
    public array $changeLog = [];
    public array $batchRewriteCalls = []; // list of $tabWrites arrays, one per call

    public function __construct() {
        // Intentionally empty — no service-account file / network needed.
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

    public function headers($id, $tab) {
        return $this->tables[$tab]['headers'] ?? [];
    }

    public function table($id, $tab, $useCache = true) {
        return $this->tables[$tab] ?? ['headers' => [], 'rows' => []];
    }

    /** Records the call and applies it to the in-memory tables, mirroring
     * the real method's write-first-then-clear net effect (rows at 2+, rest
     * cleared), so callers relying on a post-write table() read still work. */
    public function batchRewrite($id, array $tabWrites) {
        $this->batchRewriteCalls[] = $tabWrites;
        foreach ($tabWrites as $w) {
            $tab = $w['tab'];
            $rows = $w['rows'] ?? [];
            $headers = $this->tables[$tab]['headers'] ?? [];
            $newRows = [];
            foreach ($rows as $i => $line) {
                $assoc = ['_row' => $i + 2];
                foreach ($headers as $c => $h) $assoc[$h] = $line[$c] ?? '';
                $newRows[] = $assoc;
            }
            $this->tables[$tab]['rows'] = $newRows;
        }
        return true;
    }

    public function append($id, $tab, array $rows) {
        if ($tab === 'Change_Log') {
            foreach ($rows as $r) $this->changeLog[] = $r;
        }
        return null;
    }

    public function cacheClear() {
        // no-op
    }
}

$stub = new StubSheets();
$sid  = 'stub-sheet-id';

$stub->seedTable('cycles',
    ['id', 'company_code', 'cycle_type', 'mt', 'submit_type', 'submit_date', 'release_type', 'release_date', 'status', 'sort_order', 'pertek_date', 'spi_date', 'from_rev_req', 'source_program'],
    [
        ['id' => 1, 'company_code' => 'ATH', 'cycle_type' => 'Submit #1', 'mt' => '100', 'submit_type' => 'Submit MOI', 'submit_date' => '01/01/2026', 'release_type' => 'PERTEK', 'release_date' => '10/01/2026', 'status' => 'Done', 'sort_order' => 0, 'pertek_date' => '', 'spi_date' => '', 'from_rev_req' => false, 'source_program' => 'B'],
        ['id' => 2, 'company_code' => 'EMS', 'cycle_type' => 'Submit #1', 'mt' => '50', 'submit_type' => 'Submit MOI', 'submit_date' => '01/02/2026', 'release_type' => 'PERTEK', 'release_date' => '10/02/2026', 'status' => 'Done', 'sort_order' => 0, 'pertek_date' => '', 'spi_date' => '', 'from_rev_req' => false, 'source_program' => 'B'],
    ]
);
$stub->seedTable('cycle_products',
    ['id', 'cycle_id', 'product', 'mt', 'source_program'],
    [
        ['id' => 1, 'cycle_id' => 1, 'product' => 'GI ALLOY', 'mt' => '100', 'source_program' => 'B'],
        ['id' => 2, 'cycle_id' => 2, 'product' => 'SHEET PILE', 'mt' => '50', 'source_program' => 'B'],
    ]
);

$newCycles = [
    ['type' => 'Submit #1', 'mt' => 60, 'submitType' => 'Submit MOI', 'submitDate' => '05/01/2026', 'releaseType' => 'PERTEK', 'releaseDate' => 'TBA', 'status' => 'Open', 'products' => ['SHEET PILE' => 60]],
];

$result = iq_replace_cycles($stub, $sid, 'EMS', $newCycles);
ok(($result['ok'] ?? false) === true, 'iq_replace_cycles returns ok=true');
ok(($result['cycles'] ?? null) === 1, "iq_replace_cycles returns cycles=count(\$newCycles)=1");

ok(count($stub->batchRewriteCalls) === 1, 'iq_replace_cycles issues exactly ONE batchRewrite() call (not two sequential per-tab writes)');

$tabsInCall = array_column($stub->batchRewriteCalls[0] ?? [], 'tab');
ok(in_array('cycles', $tabsInCall, true), "the single batchRewrite call includes 'cycles'");
ok(in_array('cycle_products', $tabsInCall, true), "the single batchRewrite call includes 'cycle_products'");
ok(count($tabsInCall) === 2, 'the single batchRewrite call covers exactly these 2 tabs (no extras, no fewer)');

// ATH's rows are preserved (untouched company), EMS's are replaced — sanity
// check that the batched write still landed correct data, not just "a call".
$cyclesAfter = $stub->tables['cycles']['rows'];
$athCycles = array_values(array_filter($cyclesAfter, fn($c) => $c['company_code'] === 'ATH'));
$emsCycles = array_values(array_filter($cyclesAfter, fn($c) => $c['company_code'] === 'EMS'));
ok(count($athCycles) === 1 && $athCycles[0]['mt'] === '100', 'ATH cycle row untouched by the batched EMS replace');
ok(count($emsCycles) === 1, 'EMS has exactly 1 new cycle row after the batched replace');
ok((string) $emsCycles[0]['mt'] === '60', 'EMS new cycle row carries the replacement mt=60');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
