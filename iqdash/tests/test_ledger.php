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

/* ── Ledger util and lot util RECONCILE (max), never sum ────────────────────
 * Both state the same product total: the ledger carries the master's
 * `Utilization (MT)` at regen time, a lot re-states part of it with per-lot
 * detail. Summing them double-counts the overlap. This used to assert
 * 200 + (100+50) = 350; it was wrong, and the min(obtained) cap hid it
 * everywhere util happened to equal obtained.
 *
 * Trade-off worth knowing: because lots are usually only a PARTIAL
 * itemization (production has HKG 250 lot vs 1,000 ledger, JKT 100 vs 400),
 * a newly-entered lot only lifts utilization once the lot TOTAL passes the
 * ledger baseline. Regenerate the ledger after a master update and that
 * baseline moves with it. */
$co3 = ['code' => 'Y', 'shipments' => ['WEAR PLATE' => [['utilMT' => 100], ['utilMT' => 50]]]];
$le3 = ['7208.51.00' => ['obtained' => 1000, 'util' => 200]];
iq_apply_ledger($co3, $le3, ['7208.51.00' => 'WEAR PLATE']);
ok(abs($co3['utilizationByProd']['WEAR PLATE'] - 200) < 0.01, 'lots(150) below ledger(200) -> util stays 200, not 350');
ok(abs($co3['availableByProd']['WEAR PLATE'] - 800) < 0.01, 'available = obtained(1000) - util(200) = 800');

// lots ABOVE the ledger baseline still raise utilization (what the old `+` was for)
$co3b = ['code' => 'Y2', 'shipments' => ['WEAR PLATE' => [['utilMT' => 300], ['utilMT' => 90]]]];
iq_apply_ledger($co3b, $le3, ['7208.51.00' => 'WEAR PLATE']);
ok(abs($co3b['utilizationByProd']['WEAR PLATE'] - 390) < 0.01, 'lots(390) above ledger(200) -> util = 390');

/* Regression — the IKM shape that exposed the bug in production (2026-08-03):
 * the first company to utilize PARTIALLY. obtained 4,150 / ledger util 2,300 /
 * one 2,000 MT lot. The old `+` gave 4,300 capped to 4,150, so the dashboard
 * showed 0 available against a master saying 1,850. */
$coIKM = ['code' => 'IKM', 'shipments' => ['GI ALLOY' => [['utilMT' => 2000]]]];
$leIKM = ['7225.92.90' => ['obtained' => 4150, 'util' => 2300]];
iq_apply_ledger($coIKM, $leIKM, ['7225.92.90' => 'GI ALLOY']);
ok(abs($coIKM['utilizationByProd']['GI ALLOY'] - 2300) < 0.01, 'IKM: util = 2300 (master), not 4150');
ok(abs($coIKM['availableByProd']['GI ALLOY'] - 1850) < 0.01, 'IKM: available = 1850 (master), not 0');

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

/* ── def normalization: a single def and a list of defs read the same way ── */
ok(iq_pending_revision_defs($revDef) === [$revDef], 'single def normalizes to a one-element list');
ok(iq_pending_revision_defs([$revDef, $revDef]) === [$revDef, $revDef], 'a list of defs passes through');
ok(iq_pending_revision_defs([]) === [], 'empty def yields no defs');
ok(iq_pending_revision_defs(['from' => 'A', 'mt' => 5]) === [], 'def missing "to" is dropped, never half-gating');

/* ── multi-target split (GIS: SHEET PILE 400 -> WELDED 325 + FABRICATED 75) ──
 * Both targets must reverse into the SAME `from`, and origMT must report the
 * whole 400 — not the 325 it holds midway through the loop. */
$coG = ['code' => 'GIS', 'shipments' => []];
$leG = ['7306.40.90' => ['obtained' => 325, 'util' => 0], '7326.90.99' => ['obtained' => 75, 'util' => 0]];
$hsG = ['7306.40.90' => 'WELDED STAINLESS STEEL PIPE', '7326.90.99' => 'FABRICATED STEEL PAINTED FRAME'];
$revG = [
    ['from' => 'SHEET PILE', 'to' => 'WELDED STAINLESS STEEL PIPE', 'mt' => 325],
    ['from' => 'SHEET PILE', 'to' => 'FABRICATED STEEL PAINTED FRAME', 'mt' => 75],
];
iq_apply_ledger($coG, $leG, $hsG, '', $revG);
ok(abs($coG['_ledgerObtainedByProd']['SHEET PILE'] - 400) < 0.01, 'multi-split gated: both targets fold back into "from"');
ok(!array_key_exists('WELDED STAINLESS STEEL PIPE', $coG['_ledgerObtainedByProd'])
   && !array_key_exists('FABRICATED STEEL PAINTED FRAME', $coG['_ledgerObtainedByProd']),
   'multi-split gated: neither target is shown while pending');
ok(abs($coG['obtained'] - 400) < 0.01 && abs($coG['availableQuota'] - 400) < 0.01, 'multi-split gated: company total unchanged at 400');
ok(count($coG['_pendingRevision']['targets']) === 2, 'multi-split banner carries both targets');
ok(abs($coG['_pendingRevision']['origMT'] - 400) < 0.01, 'origMT is the FULL restored amount, not a partial');
ok($coG['_pendingRevision']['from'] === 'SHEET PILE', 'banner names the shared "from" product');

$coG2 = ['code' => 'GIS', 'shipments' => []];
iq_apply_ledger($coG2, $leG, $hsG, '01/08/2026', $revG); // released -> split shows
ok(abs($coG2['_ledgerObtainedByProd']['WELDED STAINLESS STEEL PIPE'] - 325) < 0.01
   && abs($coG2['_ledgerObtainedByProd']['FABRICATED STEEL PAINTED FRAME'] - 75) < 0.01,
   'multi-split released: both targets show at their own MT');
ok(!isset($coG2['_pendingRevision']), 'released multi-split clears the banner');

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

/* These pin quotaLedger.json's totals, so they move whenever the ledger is
 * regenerated from the master — that is the point: a silent ledger drift
 * should break a test. Updated 2026-07-27 when the ledger was rebuilt from the
 * current master via tools/build_quota_ledger.py. It had been frozen at the
 * 2026-07-01 hand-built snapshot (33,730 / 18,346 / 15,384) for four weeks
 * while the master moved to 34,240 / 22,547 / 11,693.
 * Updated again 2026-08-03, rebuilt from the 3-Aug master (via the Node port
 * tools/build_quota_ledger.js — this machine has no Python/openpyxl). Two
 * changes, both traced to master edits, not to the generator:
 *   + GKL  GL ALLOY  Obtained #2 = 600 (Submit MOT 3-Aug-26, SPI still TBA)
 *   ~ MIN  collapsed back to BORDES ALLOY 600 — the 247/353.3 split is gone
 *     from the master. The split IS CorpSec-confirmed in `revision_changes`,
 *     but its SPI Perubahan is still TBA, so master and gate agree it is not
 *     effective yet. That also retires the stray .3, so obtained is a round
 *     34,840 for the first time. If CorpSec says the split stands, restore
 *     backups/quotaLedger_before_regen_2026-08-03.json and revert these three. */
ok(abs($totalObt - 34840) < 0.01,   "parity (all companies as SPI rows): total obtained 34840 (got $totalObt)");
ok(abs($totalUtil - 22547) < 0.01,  "parity (all companies as SPI rows): total utilized 22547 (got $totalUtil)");
ok(abs($totalAvail - 12293) < 0.01, "parity (all companies as SPI rows): total available 12293 (got $totalAvail)");

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

/* ── server.js:1043 parity: when the `companies` tab has ZERO rows, the
 * real app returns the empty payload BEFORE the ledger overlay ever runs —
 * it never synthesizes spi[] rows out of the ledger. iq_build_payload must
 * short-circuit exactly like iq_build_payload_raw() does, gated on the real
 * `companies` input being empty (not on the ledger being empty). The
 * 33730/18346/15384 parity totals are already exercised above (section 1,
 * lines 107-113) via a NON-empty `companies` input feeding the ledger
 * companies in as real SPI rows — that legitimate overlay path is
 * untouched by this fix. ── */
$t4 = ['companies' => []] + $emptyTabs;
$p4 = iq_build_payload($t4);
ok($p4['spi'] === [], 'empty `companies` tab -> spi === [] (no ledger synthesis, mirrors server.js:1043)');
ok($p4['pending'] === [], 'empty `companies` tab -> pending === [] (mirrors server.js:1043)');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
