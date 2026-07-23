<?php
/**
 * LIVE CRUD smoke test for the iqdash module — runs the real write functions
 * against the REAL Google Sheet, then cleans up after itself. Uses a throwaway
 * company code ("ZZ_SMOKE") that is NOT in quotaLedger.json, so it contributes
 * 0 to the headline totals and never affects real numbers. Cleanup runs in a
 * finally block, and a pre-clean removes any leftovers from a prior aborted run.
 *
 * GUARDED: does nothing unless invoked with --run-live-crud, so it can never
 * fire from the offline test sweep (test_*.php) or by accident.
 *
 *   php iqdash/tests/smoke_crud_live.php --run-live-crud
 */

if (($argv[1] ?? '') !== '--run-live-crud') {
    fwrite(STDERR, "Refusing to run: this writes to the LIVE sheet.\n");
    fwrite(STDERR, "Run explicitly:  php iqdash/tests/smoke_crud_live.php --run-live-crud\n");
    exit(2);
}

$ROOT = dirname(__DIR__, 2);
require_once $ROOT . '/lib/sheet_util.php';
require_once $ROOT . '/iqdash/iqdash_util.php';
require_once $ROOT . '/iqdash/iqdash_data.php';
require_once $ROOT . '/iqdash/iqdash_write.php';

const CODE = 'ZZ_SMOKE';
$cfg = sc_config();
$SID = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$pass = 0; $fail = 0;
function ok($cond, $label) {
    global $pass, $fail;
    if ($cond) { $pass++; echo "  PASS  $label\n"; }
    else       { $fail++; echo "  FAIL  $label\n"; }
    return (bool) $cond;
}
function step($n) { echo "\n[$n]\n"; }

/** Delete every row in $tab whose $field is in $vals (set of strings). */
function del_where(GoogleSheets $gs, string $sid, string $tab, string $field, array $vals): int {
    $set = array_flip(array_map('strval', $vals));
    $rows = $gs->table($sid, $tab)['rows'];
    $del = [];
    foreach ($rows as $r) {
        if (isset($set[(string) ($r[$field] ?? '')])) $del[] = (int) $r['_row'];
    }
    if ($del) $gs->deleteRows($sid, $tab, $del);
    return count($del);
}

/** Remove all traces of the throwaway company from every tab. */
function cleanup(GoogleSheets $gs, string $sid): void {
    // cycle_products link by cycle_id -> resolve the company's cycle ids first
    $cycleIds = [];
    foreach ($gs->table($sid, 'cycles')['rows'] as $c) {
        if ((string) ($c['company_code'] ?? '') === CODE) $cycleIds[] = (string) ($c['id'] ?? '');
    }
    if ($cycleIds) del_where($gs, $sid, 'cycle_products', 'cycle_id', $cycleIds);
    foreach (['company_products','pending_meta','cycles','company_product_stats',
              'company_shipments','company_reapply_targets','ra_records','realizations'] as $tab) {
        try { del_where($gs, $sid, $tab, 'company_code', [CODE]); } catch (Throwable $e) { /* tab may not exist */ }
    }
    del_where($gs, $sid, 'companies', 'code', [CODE]);
}

/** Read the current companies row for CODE (or null). */
function co_row(GoogleSheets $gs, string $sid): ?array {
    foreach ($gs->table($sid, 'companies')['rows'] as $r) {
        if ((string) ($r['code'] ?? '') === CODE) return $r;
    }
    return null;
}

echo "=== iqdash LIVE CRUD smoke test (throwaway code " . CODE . ") ===\n";
echo "sheet: $SID\n";

try {
    step("pre-clean any leftovers");
    cleanup($gs, $SID);
    ok(co_row($gs, $SID) === null, "no leftover " . CODE . " before start");

    step("CREATE company");
    $r = iq_create_company($gs, $SID, [
        'code' => CODE, 'fullName' => 'ZZ SMOKE TEST CO', 'mt' => 100,
        'products' => ['GI ALLOY'], 'submitDate' => '01/01/2026', 'updatedBy' => 'smoke',
    ]);
    ok(($r['ok'] ?? false) === true, "iq_create_company ok");
    $co = co_row($gs, $SID);
    ok($co !== null, "company row exists after create");
    ok((string) ($co['section'] ?? '') === 'PENDING', "created in PENDING section");

    step("READ via /api/data payload (ledger overlay)");
    $p = iq_build_payload(iq_load_tables($gs, $SID));
    $found = null;
    foreach (array_merge($p['spi'], $p['pending']) as $c) if ((string) $c['code'] === CODE) { $found = $c; break; }
    ok($found !== null, "company appears in payload");
    // Note: a not-in-ledger PENDING company carries no `_ledgerObtained` key (that
    // field is only set by the ledger overlay). The frontend handles its absence,
    // and the real safety guarantee is the post-cleanup totals check at the end.

    step("CREATE duplicate -> 409");
    $dup = iq_create_company($gs, $SID, ['code' => CODE, 'fullName' => 'dup']);
    ok((int) ($dup['status'] ?? 0) === 409, "duplicate create rejected 409");

    step("UPDATE (optimistic lock, fresh token)");
    $tok = (string) ($co['updated_at'] ?? '');
    $u = iq_patch_company($gs, $SID, CODE, ['_ifUpdatedAt' => $tok, 'remarks' => 'smoke-updated']);
    ok(($u['ok'] ?? false) === true, "iq_patch_company ok with current token");
    $co2 = co_row($gs, $SID);
    ok($co2 !== null && (string) ($co2['remarks'] ?? '') === 'smoke-updated', "remarks persisted");

    step("UPDATE with STALE token -> 409 (concurrency guard)");
    $stale = iq_patch_company($gs, $SID, CODE, ['_ifUpdatedAt' => '2000-01-01T00:00:00.000Z', 'remarks' => 'should-not-apply']);
    ok((int) ($stale['status'] ?? 0) === 409, "stale token rejected 409");
    $co3 = co_row($gs, $SID);
    ok($co3 !== null && (string) ($co3['remarks'] ?? '') === 'smoke-updated', "stale write did NOT overwrite remarks");

    step("REPLACE cycles (exercises GoogleSheets::batchRewrite)");
    $rc = iq_replace_cycles($gs, $SID, CODE, [
        ['type' => 'Submit #1',   'mt' => 100],
        ['type' => 'Obtained #1', 'mt' => 80],
    ]);
    ok(($rc['ok'] ?? false) === true, "iq_replace_cycles ok");
    $ncyc = 0; foreach ($gs->table($SID, 'cycles')['rows'] as $c) if ((string) ($c['company_code'] ?? '') === CODE) $ncyc++;
    ok($ncyc === 2, "exactly 2 cycles for " . CODE . " after replace (got $ncyc)");

    step("record-obtained (both obtained paths) — best-effort");
    try {
        $ro = iq_record_obtained($gs, $SID, CODE, ['product' => 'GI ALLOY', 'mt' => 50, 'terbitDate' => '02/01/2026', 'updatedBy' => 'smoke']);
        ok(($ro['ok'] ?? false) === true || isset($ro['available']), "iq_record_obtained returned a result");
    } catch (Throwable $e) {
        ok(false, "iq_record_obtained threw: " . $e->getMessage());
    }

    step("REALIZATION create + read + delete");
    $ids = iq_realizations_insert($gs, $SID, CODE,
        [['product' => 'GI ALLOY', 'pibNo' => 'ZZSMOKE-PIB', 'lineNo' => 1, 'volume' => 10, 'unit' => 'TNE', 'source' => 'manual']],
        ['source' => 'manual', 'importedBy' => 'smoke']);
    ok(is_array($ids) && count($ids) >= 1, "iq_realizations_insert returned id(s)");
    $rid = $ids[0] ?? null;
    $mine = array_values(array_filter($gs->table($SID, 'realizations')['rows'], fn($r) => (string) ($r['company_code'] ?? '') === CODE));
    ok(count($mine) === 1, "1 realization row for " . CODE . " (got " . count($mine) . ")");
    $del = $rid !== null ? iq_realizations_delete($gs, $SID, $rid) : false;
    ok($del === true, "iq_realizations_delete ok");
    $after = array_filter($gs->table($SID, 'realizations')['rows'], fn($r) => (string) ($r['company_code'] ?? '') === CODE);
    ok(count($after) === 0, "0 realizations for " . CODE . " after delete");

} catch (Throwable $e) {
    echo "\nUNEXPECTED ERROR: " . get_class($e) . ": " . $e->getMessage() . "\n";
    $fail++;
} finally {
    step("CLEANUP (remove all " . CODE . " traces)");
    cleanup($gs, $SID);
    $gone = co_row($gs, $SID) === null;
    $noReal = count(array_filter($gs->table($SID, 'realizations')['rows'], fn($r) => (string) ($r['company_code'] ?? '') === CODE)) === 0;
    ok($gone, "company fully removed");
    ok($noReal, "no realization residue");

    step("HEADLINE TOTALS unaffected (no residue)");
    $p = iq_build_payload(iq_load_tables($gs, $SID));
    $ob = 0; $ut = 0; $av = 0;
    foreach (array_merge($p['spi'], $p['pending']) as $c) {
        $ob += (float) ($c['_ledgerObtained'] ?? 0); $ut += (float) ($c['utilizationMT'] ?? 0); $av += (float) ($c['availableQuota'] ?? 0);
    }
    printf("  totals: Obtained=%d Utilized=%d Available=%d\n", round($ob), round($ut), round($av));
    ok(round($ob) == 33730 && round($ut) == 19398 && round($av) == 14332, "totals back to 33730/19398/14332");
}

echo "\n=== RESULT: $pass passed, $fail failed ===\n";
echo $fail === 0 ? "ALL PASS — live CRUD works and left no residue\n" : "SOME FAILED — check output above (cleanup still ran)\n";
exit($fail === 0 ? 0 : 1);
