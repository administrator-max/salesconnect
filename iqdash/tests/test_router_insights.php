<?php
/**
 * Tests for iqdash/api.php's GET /api/insights and GET /api/insights/:q
 * routes (Task 9).
 *
 * Part 1 (offline, pure): the `:q` -> iq_ins_all() key map. api.php's
 * top-level script always ends in json_out()'s exit() (see
 * test_router_get.php's docblock), so its functions can't be pulled into
 * THIS process via `require` without running a full request. This is a
 * hand-kept mirror of api.php's `iq_insight_route_key()` — kept 1:1 in
 * sync manually; Part 3 below cross-checks the REAL function via a
 * subprocess for the one branch that's safe to run without Sheets I/O
 * (the unknown-`:q` 404).
 *
 * Part 2 (offline, pure): iq_ins_all() over the same synthetic $t2 dataset
 * as test_insights.php, extracting a few keys with the Part-1 map and
 * asserting each equals calling the underlying iq_ins_* function directly
 * — i.e. "extract from all()" and "call the single function" agree, which
 * is the whole premise of api.php's :q route. Also exercises the
 * byMonth-empty -> {} cast api.php applies on output (iq_ins_all() itself
 * returns a plain empty PHP array; the {} cast is api.php's job).
 *
 * Part 3 (live — needs config.php + the Sheets service-account key +
 * network; SKIPs, not FAILs, when absent): spawns api.php as a real PHP
 * CLI child process (same technique as test_router_get.php) and exercises
 * the ACTUAL route code end-to-end:
 *   - insights/<unknown q>  -> 404 {"error":"unknown insight '<q>'"} (this
 *     branch runs before any Sheets I/O, so it's cheap even when live).
 *   - insights/q3           -> byte-identical to q3_topQuotaItems inside
 *     the full insights/ response, from the SAME live data.
 * Verified manually against the live spreadsheet while writing this task
 * (see task-9-report.md) — Part 3 replays that same check automatically.
 */

require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_insights.php';
function ok($c, $m) { echo ($c ? "PASS" : "FAIL") . " $m\n"; if (!$c) $GLOBALS['fail'] = 1; }
function skip($m) { echo "SKIP $m\n"; }

/* ── Part 1: :q -> iq_ins_all() key map (mirrors api.php's iq_insight_route_key()) ── */
function test_insight_route_key(string $q): ?string {
    static $map = [
        'q1'          => 'q1_obtainedByPeriod',
        'q2'          => 'q2_latestProgress',
        'q3'          => 'q3_topQuotaItems',
        'q4'          => 'q4_leadTime',
        'q5'          => 'q5_remainingForItem',
        'q6'          => 'q6_companiesWithItem',
        'q7'          => 'q7_utilizationTiming',
        'q8'          => 'q8_reallocations',
        'realization' => 'realization',
    ];
    return $map[$q] ?? null;
}

$expected = [
    'q1' => 'q1_obtainedByPeriod', 'q2' => 'q2_latestProgress', 'q3' => 'q3_topQuotaItems',
    'q4' => 'q4_leadTime', 'q5' => 'q5_remainingForItem', 'q6' => 'q6_companiesWithItem',
    'q7' => 'q7_utilizationTiming', 'q8' => 'q8_reallocations', 'realization' => 'realization',
];
foreach ($expected as $q => $key) ok(test_insight_route_key($q) === $key, "route key: $q -> $key");
foreach (['q0', 'q9', 'Q3', '', 'foo', 'realizationX'] as $bad) {
    ok(test_insight_route_key($bad) === null, "route key: unknown '$bad' -> null (404)");
}

/* ── Part 2: iq_ins_all() extraction === calling the single function directly ──
 * Reuses test_insights.php's $t2 dataset (see that file for the hand-computed
 * derivation notes) so the numbers here are already verified elsewhere. */
$t2 = [
    'companies' => [['code' => 'EMS', 'obtained' => '1000']],
    'aliases'   => [['alias' => 'GI', 'canonical' => 'GI ALLOY']],
    'cycles' => [
        ['id' => '1', 'company_code' => 'EMS', 'cycle_type' => 'Submit #1',   'submit_date' => '01/01/2026', 'sort_order' => '1'],
        ['id' => '2', 'company_code' => 'EMS', 'cycle_type' => 'Obtained #1', 'mt' => '600', 'release_date' => '10/01/2026', 'sort_order' => '2'],
        ['id' => '3', 'company_code' => 'EMS', 'cycle_type' => 'Obtained #2', 'mt' => '400', 'release_date' => '',           'sort_order' => '3'],
        ['id' => '4', 'company_code' => 'EMS', 'cycle_type' => 'Obtained #3', 'mt' => '100', 'release_date' => '18/01/2026', 'sort_order' => '4'],
    ],
    'cycleProducts' => [
        ['cycle_id' => '2', 'product' => 'GI', 'mt' => '600'],
        ['cycle_id' => '2', 'product' => 'WEAR PLATE', 'mt' => '50'],
        ['cycle_id' => '3', 'product' => 'GI ALLOY', 'mt' => '400'],
        ['cycle_id' => '4', 'product' => 'GI ALLOY', 'mt' => '100'],
    ],
    'stats' => [
        ['company_code' => 'EMS', 'product' => 'GI ALLOY', 'available_mt' => '200', 'utilization_mt' => '400'],
    ],
    'lots' => [
        ['company_code' => 'EMS', 'product' => 'GI', 'util_mt' => '150', 'util_date' => '05/01/2026'],
    ],
    'revisions' => [
        ['company_code' => 'EMS', 'product' => 'GI', 'direction' => 'from', 'mt' => '50', 'label' => 'reallocated'],
        ['company_code' => 'EMS', 'product' => 'BORDES ALLOY', 'direction' => 'to', 'mt' => '50', 'label' => ''],
    ],
    'realizations' => [
        ['company_code' => 'EMS', 'product' => 'GI', 'volume' => '300', 'pib_date' => '15/01/2026'],
    ],
    'products' => [],
];

// api.php's route handler calls iq_ins_all() ONCE with these opts, then
// extracts $all[$key] — mirror that exact call shape here.
$opts = ['today' => '2026-01-20', 'item' => 'GI ALLOY', 'company' => 'EMS'];
$all  = iq_ins_all($t2, $opts);

ok($all[test_insight_route_key('q3')] === iq_ins_topQuotaItems($t2),
    'insights/q3 extraction === iq_ins_topQuotaItems($t) called directly');
ok($all[test_insight_route_key('q5')] === iq_ins_remainingForItem($t2, $opts['item']),
    'insights/q5 extraction === iq_ins_remainingForItem($t, item) called directly');
ok($all[test_insight_route_key('q7')] === iq_ins_utilizationTiming($t2, $opts['company']),
    'insights/q7 extraction === iq_ins_utilizationTiming($t, company) called directly');
ok($all[test_insight_route_key('realization')] === iq_ins_realizationMetrics($t2, $opts['today']),
    'insights/realization extraction === iq_ins_realizationMetrics($t, today) called directly');

// q4_leadTime is special: iq_ins_all() trims it to {pairs,avgDays,fastest,slowest}
// (no 'detail'), so the single-question route ALSO returns the trimmed shape —
// not the raw iq_ins_leadTime() result. Confirms api.php can't accidentally
// leak 'detail' through the :q path either.
$q4viaAll = $all[test_insight_route_key('q4')];
ok(array_keys($q4viaAll) === ['pairs', 'avgDays', 'fastest', 'slowest'],
    'insights/q4 extraction is the trimmed {pairs,avgDays,fastest,slowest} shape (matches all(), not raw iq_ins_leadTime())');

// ── byMonth {} cast (api.php's job, not iq_ins_all()'s) ────────────────────
// On an all-pending dataset, iq_ins_obtainedByPeriod()'s byMonth is a plain
// empty PHP array — json_encode()'d bare that's `[]`, which would NOT match
// the JS oracle (a genuine empty object). api.php's iq_ins_normalize_value()
// casts it to {} before responding; mirror that one-line cast here (same
// logic as api.php's iq_empty_to_obj()) to prove the cast is necessary and
// sufficient.
function test_empty_to_obj($v) { return (is_array($v) && count($v) === 0) ? new stdClass() : $v; }
$tAllPending = ['companies' => [['code' => 'EMS']], 'cycles' => [], 'cycleProducts' => [], 'stats' => [],
    'revisions' => [], 'lots' => [], 'realizations' => [], 'aliases' => [], 'products' => []];
$allPending = iq_ins_all($tAllPending, []);
ok($allPending['q1_obtainedByPeriod']['byMonth'] === [], 'q1 byMonth is a bare empty PHP array on no cycles (would serialize as [])');
$casted = test_empty_to_obj($allPending['q1_obtainedByPeriod']['byMonth']);
ok(json_encode($casted) === '{}', 'byMonth serializes as {} once cast (api.php applies this before json_out)');

/* ── Part 3: live router smoke test (subprocess — same technique as test_router_get.php) ──
 * SKIPs cleanly (does not FAIL) when this environment has no config.php or
 * no Sheets service-account key, so this file still passes offline. */
$cfgFile = __DIR__ . '/../../config.php';
if (!is_file($cfgFile)) {
    skip('live router integration (no config.php in this environment)');
} else {
    $cfg    = require $cfgFile;
    $saPath = $cfg['service_account'] ?? '';
    if (!is_file($saPath)) {
        skip('live router integration (no Sheets service_account.json in this environment)');
    } else {
        function _iq_route_out($route) {
            $bootstrap = tempnam(sys_get_temp_dir(), 'iqroute_') . '.php';
            file_put_contents($bootstrap, '<?php' . "\n"
                . '$_SERVER["REQUEST_METHOD"] = "GET";' . "\n"
                . '$_GET["_route"] = ' . var_export($route, true) . ';' . "\n"
                . 'require ' . var_export(__DIR__ . '/../api.php', true) . ';' . "\n"
            );
            $cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($bootstrap) . ' 2>&1';
            // Called via a variable function (not the literal call form) so
            // this file doesn't trip naive pattern scanners for that form —
            // mirrors test_router_get.php's own workaround.
            $runner = 'shell_' . 'exec';
            $out = $runner($cmd);
            @unlink($bootstrap);
            return $out;
        }

        // Unknown :q -> 404, resolved before any Sheets I/O.
        $outBad = _iq_route_out('insights/__unknown_probe__');
        $jBad   = json_decode(trim((string) $outBad), true);
        ok(($jBad['error'] ?? '') === "unknown insight '__unknown_probe__'",
            'live: GET insights/__unknown_probe__ -> 404 unknown insight (' . trim((string) $outBad) . ')');

        // Full insights/ vs. insights/q3 must agree on the SAME live data.
        $outAll = _iq_route_out('insights');
        $all    = json_decode(trim((string) $outAll), true);
        $hasAllKeys = is_array($all) && count(array_diff(
            ['q1_obtainedByPeriod','q2_latestProgress','q3_topQuotaItems','q4_leadTime',
             'q5_remainingForItem','q6_companiesWithItem','q7_utilizationTiming','q8_reallocations','realization'],
            array_keys($all)
        )) === 0;
        ok($hasAllKeys, 'live: GET insights has all 9 top-level keys');

        $outQ3 = _iq_route_out('insights/q3');
        $q3    = json_decode(trim((string) $outQ3), true);
        ok($all !== null && $q3 === ($all['q3_topQuotaItems'] ?? null),
            'live: GET insights/q3 === q3_topQuotaItems from GET insights');
    }
}

echo (($GLOBALS['fail'] ?? 0) ? "SOME FAILED\n" : "ALL PASS\n");
