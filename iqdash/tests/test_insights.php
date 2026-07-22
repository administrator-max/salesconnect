<?php
/**
 * Tests for iqdash_insights.php (PHP port of IQ/lib/insights.js).
 *
 * Part 1 is the exact starter test from the task-8 brief (shape check on
 * iq_ins_all()'s 9 top-level keys, using its minimal synthetic $t).
 * Part 2 exercises each iq_ins_* function individually against a richer,
 * hand-computed synthetic dataset so the actual numbers (not just the
 * shape) are verified.
 *
 * Deferred (not attempted here, per the task-8 brief): comparing against
 * an oracle fixture (fixtures/api_insights.json) — that fixture requires a
 * live Node run to capture and is captured by the user later.
 */

require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_insights.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

/* ── Part 1: brief's starter test — iq_ins_all() key shape ─────────────── */

$t = ['companies'=>[['code'=>'EMS']], 'cycles'=>[], 'cycleProducts'=>[], 'stats'=>[],
      'revisions'=>[], 'lots'=>[], 'realizations'=>[], 'aliases'=>[], 'products'=>[]];
$a = iq_ins_all($t, ['today'=>'2026-07-22','item'=>'GI ALLOY','company'=>'EMS']);
foreach (['q1_obtainedByPeriod','q2_latestProgress','q3_topQuotaItems','q4_leadTime',
  'q5_remainingForItem','q6_companiesWithItem','q7_utilizationTiming','q8_reallocations','realization'] as $k)
  ok(array_key_exists($k,$a), "insights has $k");

// q4_leadTime must carry exactly {pairs,avgDays,fastest,slowest} (no 'detail' leak).
ok(array_keys($a['q4_leadTime']) === ['pairs','avgDays','fastest','slowest'], 'q4_leadTime has exactly {pairs,avgDays,fastest,slowest}');
ok($a['q4_leadTime']['pairs'] === 0 && $a['q4_leadTime']['avgDays'] === null, 'q4_leadTime empty on no cycles');
ok($a['q3_topQuotaItems'] === [], 'q3_topQuotaItems empty on no cycleProducts');
ok($a['q2_latestProgress'] === ['company'=>'EMS','found'=>false], 'q2_latestProgress not-found shape on no cycles');

/* ── Part 2: richer synthetic dataset with hand-computed expectations ───
 * today = 2026-01-20 -> Y=2026, M=0(Jan), weekStart = 2026-01-14.
 *
 * cycles (company EMS):
 *   #1 Submit  #1  submit_date 01/01/2026                     sort 1
 *   #2 Obtained #1 mt 600  release_date 10/01/2026 (dated, out of week) sort 2
 *   #3 Obtained #2 mt 400  release_date ''         (pending/TBA)        sort 3
 *   #4 Obtained #3 mt 100  release_date 18/01/2026 (dated, in week)     sort 4
 *
 * cycleProducts: #2 -> GI(=GI ALLOY) 600, WEAR PLATE 50; #3 -> GI ALLOY 400; #4 -> GI ALLOY 100
 *   => topQuotaItems: GI ALLOY 1100, WEAR PLATE 50
 *
 * leadTime: Submit#1 (01/01) -> Obtained#1 (10/01) = 9 days, 1 pair.
 *
 * stats: EMS/GI ALLOY available 200, utilization 400 -> remaining/companiesWithItem.
 * lots:  EMS/GI util_mt 150, util_date 05/01/2026 -> utilizationTiming.
 * revisions: EMS from GI(=GI ALLOY) 50 "reallocated"; EMS to BORDES ALLOY 50 -> reallocations(item=GI ALLOY) keeps EMS row.
 * realizations: EMS/GI volume 300 pib_date 15/01/2026 (in week+month+year).
 * companies: EMS obtained 1000 -> vsObtained realizedPct 30.
 */

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

// q1: obtainedByPeriod
$q1 = iq_ins_obtainedByPeriod($t2, '2026-01-20');
ok($q1['week'] === 100, "q1 week = 100 (got {$q1['week']})");
ok($q1['month'] === 700, "q1 month = 700 (got {$q1['month']})");
ok($q1['year'] === 700, "q1 year = 700 (got {$q1['year']})");
ok(($q1['byMonth']['2026-01'] ?? null) === 700, 'q1 byMonth[2026-01] = 700');
ok($q1['datedObtainedCycles'] === 2, 'q1 datedObtainedCycles = 2');
ok($q1['pendingObtainedCycles'] === 1, 'q1 pendingObtainedCycles = 1');
ok($q1['pendingObtainedMT'] === 400, 'q1 pendingObtainedMT = 400');
ok($q1['asOf'] === '2026-01-20', 'q1 asOf = 2026-01-20');

// q2: latestProgress
$q2 = iq_ins_latestProgress($t2, 'EMS');
ok($q2['found'] === true, 'q2 found');
ok($q2['lastStage'] === 'Obtained #3', 'q2 lastStage = last row by sort_order');
ok($q2['mt'] === 100, 'q2 mt = 100');
ok(count($q2['timeline']) === 4, 'q2 timeline has all 4 cycles');

// q3: topQuotaItems
$q3 = iq_ins_topQuotaItems($t2);
ok(count($q3) === 2, 'q3 has 2 distinct products');
ok($q3[0]['product'] === 'GI ALLOY' && $q3[0]['mt'] === 1100, "q3 top item GI ALLOY 1100 (got {$q3[0]['product']} {$q3[0]['mt']})");
ok($q3[1]['product'] === 'WEAR PLATE' && $q3[1]['mt'] === 50, 'q3 second item WEAR PLATE 50');
$q3limited = iq_ins_topQuotaItems($t2, 1);
ok(count($q3limited) === 1, 'q3 respects $limit');

// q4: leadTime
$q4 = iq_ins_leadTime($t2);
ok($q4['pairs'] === 1, 'q4 pairs = 1');
ok($q4['avgDays'] === 9.0, "q4 avgDays = 9.0 (got {$q4['avgDays']})");
ok($q4['fastest']['days'] === 9 && $q4['slowest']['days'] === 9, 'q4 fastest === slowest (single pair)');
ok(array_key_exists('detail', $q4), 'q4 (full) exposes detail; iq_ins_all trims it (checked in Part 1)');

// q5: remainingForItem
$q5 = iq_ins_remainingForItem($t2, 'GI ALLOY');
ok($q5['item'] === 'GI ALLOY', 'q5 item resolved via canon');
ok($q5['remainingMT'] === 200, 'q5 remainingMT = 200');
ok($q5['utilizedMT'] === 400, 'q5 utilizedMT = 400');
ok($q5['companies'] === 1, 'q5 companies = 1');
$q5alias = iq_ins_remainingForItem($t2, 'GI'); // alias should canon to the same item
ok($q5alias['item'] === 'GI ALLOY' && $q5alias['remainingMT'] === 200, 'q5 alias GI canonicalizes to GI ALLOY');

// q6: companiesWithItem
$q6 = iq_ins_companiesWithItem($t2, 'GI ALLOY');
ok(count($q6['companies']) === 1, 'q6 one company holds GI ALLOY');
ok($q6['companies'][0]['company'] === 'EMS' && $q6['companies'][0]['quotaMT'] === 600, 'q6 EMS quotaMT = 600 (200+400)');

// q7: utilizationTiming
$q7 = iq_ins_utilizationTiming($t2, 'EMS');
ok(count($q7['events']) === 1, 'q7 one utilization event');
ok($q7['events'][0]['product'] === 'GI ALLOY', 'q7 event product canonicalized GI -> GI ALLOY');
ok($q7['totalUtilizedMT'] === 150, 'q7 totalUtilizedMT = 150');

// q8: reallocations
$q8 = iq_ins_reallocations($t2, 'GI ALLOY');
ok($q8['item'] === 'GI ALLOY', 'q8 item resolved');
ok(count($q8['reallocations']) === 1, 'q8 one company has a reallocation touching GI ALLOY');
ok($q8['reallocations'][0]['company'] === 'EMS', 'q8 company = EMS');
ok($q8['reallocations'][0]['from'][0]['product'] === 'GI ALLOY', 'q8 from[0] canonicalized');
ok($q8['reallocations'][0]['to'][0]['product'] === 'BORDES ALLOY', 'q8 to[0] product BORDES ALLOY');
$q8none = iq_ins_reallocations($t2, null);
ok(count($q8none['reallocations']) === 1 && $q8none['item'] === null, 'q8 no item filter returns all companies, item=null');

// realization metrics
$rz = iq_ins_realizationMetrics($t2, '2026-01-20');
ok($rz['totalRealizedMT'] === 300.0, 'realization totalRealizedMT = 300');
ok($rz['realizedThisWeekMT'] === 300.0, 'realization week = 300 (15/01 within [14/01,20/01])');
ok($rz['realizedThisMonthMT'] === 300.0, 'realization month = 300');
ok($rz['realizedThisYearMT'] === 300.0, 'realization year = 300');
ok(count($rz['byProduct']) === 1 && $rz['byProduct'][0]['product'] === 'GI ALLOY' && $rz['byProduct'][0]['mt'] === 300.0, 'realization byProduct GI ALLOY 300');
ok(count($rz['vsObtained']) === 1, 'realization vsObtained has EMS row');
$vs = $rz['vsObtained'][0];
ok($vs['obtainedMT'] === 1000, 'vsObtained obtainedMT = 1000');
ok($vs['realizedMT'] === 300.0, 'vsObtained realizedMT = 300');
ok($vs['outstandingMT'] === 700.0, 'vsObtained outstandingMT = 700');
ok($vs['realizedPct'] === 30.0, "vsObtained realizedPct = 30.0 (got {$vs['realizedPct']})");

// iq_ins_all wiring end to end on the richer dataset (defaults: item GI ALLOY, company = companies[0].code = EMS)
$all2 = iq_ins_all($t2, ['today' => '2026-01-20']);
ok($all2['q1_obtainedByPeriod']['week'] === 100, 'iq_ins_all wires q1 correctly');
ok($all2['q2_latestProgress']['company'] === 'EMS', 'iq_ins_all defaults company to companies[0].code');
ok($all2['q5_remainingForItem']['item'] === 'GI ALLOY', 'iq_ins_all defaults item to GI ALLOY');
ok($all2['q4_leadTime']['pairs'] === 1 && !array_key_exists('detail', $all2['q4_leadTime']), 'iq_ins_all q4_leadTime trimmed to 4 keys');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
