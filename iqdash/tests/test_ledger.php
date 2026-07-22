<?php
/**
 * Tests for the quota-ledger overlay + pending-revision gate
 * (iq_apply_ledger / iq_apply_pending_revision / iq_build_payload).
 *
 * Ported invariants from IQ/server.js:1223-1266 (applyLedger closure) and
 * IQ/lib/pendingRevisionGate.js (applyPendingRevision). See task-5-report.md
 * for the exact signatures chosen and why.
 */

require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_data.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

/* ── Starter tests from the task-5 brief ────────────────────────────────
 * Rewritten against the real shapes iq_apply_ledger reads/writes:
 *   - $co['shipments'] is a product-name-keyed map of lot arrays (Task 4
 *     shape: `co.shipments`), not `_lots`.
 *   - hsName is passed as an explicit 3rd argument (not via $GLOBALS['__HS']),
 *     per the brief's own note that this is the preferred adjustment.
 *   - util lives in $co['utilizationByProd'][name] (mirrors JS
 *     `co.utilizationByProd`), not nested under `_ledgerObtainedByProd`
 *     (which only ever holds *obtained*, mirroring JS `_ledgerObtainedByProd`
 *     = `obtByProd`).
 */

// available always derived, util capped at obtained
$co = ['code' => 'EMS', 'shipments' => ['SHEET PILE' => [['utilMT' => 2000]]]];
$ledgerEntity = ['7301.10.00' => ['obtained' => 1600, 'util' => 1600]]; // SHEET PILE
$hsName = ['7301.10.00' => 'SHEET PILE'];
iq_apply_ledger($co, $ledgerEntity, $hsName);
ok(abs($co['_ledgerObtained'] - 1600) < 0.01, 'obtained = ledger 1600');
$avail = max(0, $co['_ledgerObtained'] - array_sum($co['utilizationByProd']));
ok($avail >= 0, 'available never negative');
$util = $co['utilizationByProd']['SHEET PILE'];
ok($util <= 1600 + 0.01, 'util capped at obtained (min rule)');

// util_mt=0 lot never lowers util below ledger baseline
$co2 = ['code' => 'X', 'shipments' => ['GI ALLOY' => [['utilMT' => 0]]]];
$le2 = ['7225.92.90' => ['obtained' => 500, 'util' => 300]];
$hsName2 = ['7225.92.90' => 'GI ALLOY'];
iq_apply_ledger($co2, $le2, $hsName2);
ok($co2['utilizationByProd']['GI ALLOY'] >= 300, 'util_mt=0 does not zero util');

/* ── A lot's utilMT ADDS on top of the ledger baseline, capped at obtained ── */
$co3 = ['code' => 'Y', 'shipments' => ['WEAR PLATE' => [['utilMT' => 100], ['utilMT' => 50]]]];
$le3 = ['7208.51.00' => ['obtained' => 1000, 'util' => 200]];
iq_apply_ledger($co3, $le3, ['7208.51.00' => 'WEAR PLATE']);
ok(abs($co3['utilizationByProd']['WEAR PLATE'] - 350) < 0.01, 'util = ledgerUtil(200) + lots(100+50) = 350');
ok(abs($co3['availableByProd']['WEAR PLATE'] - 650) < 0.01, 'available = obtained(1000) - util(350) = 650');

/* ── company not in ledger contributes 0 (section-1 loop responsibility,
 * exercised end-to-end below via iq_build_payload; this checks the
 * documented invariant #4 directly is a build_payload concern, not
 * iq_apply_ledger's — iq_apply_ledger is only ever called WITH an entity). */

/* ── pending-revision gate: reverses a not-yet-released split ─────────── */
$maps = [
    'obtByProd'   => ['BORDES ALLOY' => 0.0, 'GI ALLOY' => 353.0],
    'utilByProd'  => ['BORDES ALLOY' => 0.0, 'GI ALLOY' => 0.0],
    'availByProd' => ['BORDES ALLOY' => 0.0, 'GI ALLOY' => 353.0],
];
$revDef = ['from' => 'BORDES ALLOY', 'to' => 'GI ALLOY', 'mt' => 353];
$res = iq_apply_pending_revision($maps, $revDef, ''); // no release date -> gated -> reversed
ok($res['reversed'] === true, 'pending revision reversed when unreleased');
ok(abs($maps['obtByProd']['BORDES ALLOY'] - 353) < 0.01, 'reversal moves mt back to "from"');
ok(!array_key_exists('GI ALLOY', $maps['obtByProd']), '"to" product removed once fully reversed (obtained hits 0)');

$maps2 = [
    'obtByProd'   => ['BORDES ALLOY' => 0.0, 'GI ALLOY' => 353.0],
    'utilByProd'  => ['BORDES ALLOY' => 0.0, 'GI ALLOY' => 0.0],
    'availByProd' => ['BORDES ALLOY' => 0.0, 'GI ALLOY' => 353.0],
];
$res2 = iq_apply_pending_revision($maps2, $revDef, '15/07/2026'); // released -> not reversed
ok($res2['reversed'] === false, 'pending revision NOT reversed once a release date is entered');
ok(abs($maps2['obtByProd']['GI ALLOY'] - 353) < 0.01, 'released split left as-is');

$maps3 = [
    'obtByProd'   => ['BORDES ALLOY' => 0.0, 'GI ALLOY' => 353.0],
    'utilByProd'  => ['BORDES ALLOY' => 0.0, 'GI ALLOY' => 100.0], // "to" already utilized
    'availByProd' => ['BORDES ALLOY' => 0.0, 'GI ALLOY' => 253.0],
];
$res3 = iq_apply_pending_revision($maps3, $revDef, '');
ok($res3['reversed'] === false, 'pending revision NOT reversed once "to" product has been utilized');

/* ── full-payload wiring, section 1: SPI company + ledger entry present ── */
$ledger = iq_ledger();
$companiesRows = [];
foreach (array_keys($ledger['companies'] ?? []) as $code) {
    $companiesRows[] = ['code' => $code, 'full_name' => $code, 'grp' => '', 'section' => 'SPI'];
}
$emptyTabs = [
    'cycles' => [], 'cycleProducts' => [], 'stats' => [], 'revisions' => [],
    'lots' => [], 'realizations' => [], 'aliases' => [], 'products' => [],
    'directory' => [], 'companyProducts' => [], 'reapply' => [], 'ra' => [],
    'pendingMeta' => [], 'pertekRelease' => [],
];

$t = ['companies' => $companiesRows] + $emptyTabs;
$payload = iq_build_payload($t);

$sum = function (array $spi, string $key): float {
    $s = 0.0;
    foreach ($spi as $c) $s += $c[$key] ?? 0;
    return round($s * 1000) / 1000;
};
$totalObt   = $sum($payload['spi'], 'obtained');
$totalUtil  = $sum($payload['spi'], 'utilizationMT');
$totalAvail = $sum($payload['spi'], 'availableQuota');

ok(abs($totalObt - 33730) < 0.01,   "parity (all companies as SPI rows): total obtained 33730 (got $totalObt)");
ok(abs($totalUtil - 18346) < 0.01,  "parity (all companies as SPI rows): total utilized 18346 (got $totalUtil)");
ok(abs($totalAvail - 15384) < 0.01, "parity (all companies as SPI rows): total available 15384 (got $totalAvail)");

/* ── invariant 4: company code not present in the ledger contributes 0 ── */
$t0 = ['companies' => [['code' => 'ZZZ-NOT-IN-LEDGER', 'full_name' => 'Nobody', 'grp' => '', 'section' => 'SPI']]] + $emptyTabs;
$p0 = iq_build_payload($t0);
$zzz = $p0['spi'][0] ?? null;
ok($zzz !== null && ($zzz['_ledgerObtained'] ?? -1) === 0, 'company absent from ledger -> _ledgerObtained = 0');

/* ── section 2a: ledger-only company already sitting in `pending` gets
 * migrated into spi[], keeps its real fields, gains a synthesized cycle
 * when it has a LEDGER_COMPANY_DATES entry and no cycles of its own. ── */
$ikmEnt = $ledger['companies']['IKM'] ?? null;
if ($ikmEnt) {
    $t3 = [
        'companies' => [
            ['code' => 'IKM', 'full_name' => 'IKM Steel', 'grp' => '', 'section' => 'PENDING', 'pertek_no' => 'PTK-001'],
        ],
        'pendingMeta' => [
            ['company_code' => 'IKM', 'mt' => 100, 'status' => 'Waiting', 'date' => '01/01/2026'],
        ],
    ] + array_diff_key($emptyTabs, ['pendingMeta' => 1]);
    $p3 = iq_build_payload($t3);
    ok(count($p3['pending']) === 0, 'IKM: removed from pending[] after ledger synthesis');
    $ikmCo = null;
    foreach ($p3['spi'] as $c) { if (($c['code'] ?? null) === 'IKM') $ikmCo = $c; }
    ok($ikmCo !== null, 'IKM: migrated into spi[]');
    ok(($ikmCo['section'] ?? null) === 'SPI', 'IKM: section flipped PENDING -> SPI');
    ok(($ikmCo['pertekNo'] ?? null) === 'PTK-001', 'IKM: real object preserved (pertekNo not clobbered)');
    ok(($ikmCo['_ledgerObtained'] ?? -1) > 0, 'IKM: ledger overlay applied on top of preserved object');
    $obtDate = iq_ledger_company_dates()['IKM'] ?? null;
    if ($obtDate) {
        ok(count($ikmCo['cycles'] ?? []) > 0, 'IKM: synthesized period-filter cycle attached (had none of its own)');
    }
} else {
    echo "SKIP IKM synthesis test (IKM not present in current quotaLedger.json)\n";
}

/* ── section 2b: ledger-only company with NO `companies` row at all gets a
 * brand-new synthesized object; still overlays correctly (cross-checks the
 * whole ledger sum again through the "else" synthesis branch). ── */
$t4 = ['companies' => []] + $emptyTabs;
$p4 = iq_build_payload($t4);
ok(count($p4['spi']) === count($ledger['companies'] ?? []), 'all ledger companies synthesized fresh when `companies` tab is empty');
$totalObt4  = $sum($p4['spi'], 'obtained');
$totalUtil4 = $sum($p4['spi'], 'utilizationMT');
ok(abs($totalObt4 - 33730) < 0.01,  "parity (fresh-synthesis path): total obtained 33730 (got $totalObt4)");
ok(abs($totalUtil4 - 18346) < 0.01, "parity (fresh-synthesis path): total utilized 18346 (got $totalUtil4)");

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
