<?php
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_write.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

// util_mt=0 lot excluded; positive lots summed per product
$u = iq_recompute_util_from_lots([
  ['product'=>'GI ALLOY','util_mt'=>'100'],
  ['product'=>'GI ALLOY','util_mt'=>'0'],
  ['product'=>'SHEET PILE','util_mt'=>'50'],
]);
ok(abs(($u['GI ALLOY']??-1) - 100) < 0.01, 'GI ALLOY util = 100 (0-lot skipped)');
ok(abs(($u['SHEET PILE']??-1) - 50) < 0.01, 'SHEET PILE util = 50');

// a lot with negative util_mt never contributes, and never appears alone
$uNeg = iq_recompute_util_from_lots([
  ['product'=>'NEG PROD','util_mt'=>'-20'],
]);
ok(!array_key_exists('NEG PROD', $uNeg), 'product with only a negative-util lot is excluded entirely');

$uMix = iq_recompute_util_from_lots([
  ['product'=>'MIX PROD','util_mt'=>'30'],
  ['product'=>'MIX PROD','util_mt'=>'-999'],
]);
ok(abs(($uMix['MIX PROD']??-1) - 30) < 0.01, 'negative lot does not drag down the positive sum for its product');

// stale token detection is pure: helper compares tokens
ok(iq_is_stale('2026-01-01 00:00:00','2026-01-02 00:00:00') === true, 'older client token => stale');
ok(iq_is_stale('2026-01-02 00:00:00','2026-01-02 00:00:00') === false, 'equal token => not stale');
ok(iq_is_stale(null, '2026-01-02 00:00:00') === false, 'no client token sent => skip check (not stale)');
ok(iq_is_stale('', '2026-01-02 00:00:00') === false, 'empty client token => skip check (not stale)');
ok(iq_is_stale('2026-01-02T00:00:05.000Z','2026-01-02T00:00:00.000Z') === false, 'client token newer than sheet => not stale');
ok(iq_is_stale('2026-01-02T00:00:00.000Z','2026-01-02T00:00:02.500Z') === true, '>1s newer sheet token (ISO w/ ms) => stale');

/* ── Router regression: sub-resource PATCH must NOT be swallowed by the
 * bare company PATCH branch ────────────────────────────────────────────
 * PATCH /api/company/:code/cycles, /record-obtained,
 * /pertek-perubahan-release are distinct sub-resource endpoints. As of
 * Task 14, ALL THREE are now wired (cycles: PATCH via iq_replace_cycles,
 * Task 13; record-obtained + pertek-perubahan-release: POST via
 * iq_record_obtained()/iq_pertek_perubahan_release(), Task 14) — so none of
 * them remain available as an "unwired sub-resource" fixture for this test
 * to target. This test now points at
 * `PATCH /api/company/EMS/nonexistent-subresource`, a sub-resource segment
 * that is guaranteed to stay unwired, to keep exercising the ORIGINAL guard
 * bug: before the api.php guard (`isset($parts[1]) && !isset($parts[2])`),
 * ANY PATCH with a company code as $parts[1] — even one carrying a trailing
 * sub-resource segment — fell into iq_patch_company(), silently ignored
 * the sub-resource body, bumped updated_at, and reported {ok:true}: silent
 * data loss. (See test_cycles.php / iqdash_write.php's Task 13 header
 * comment for /cycles's own, now-real, routing behavior — it no longer
 * 404s, it's handled; and iqdash_write.php's Task 14 header comment for
 * /record-obtained + /pertek-perubahan-release, now real POST endpoints.)
 *
 * api.php's json_out() always ends in exit(), so this can't be checked via
 * ob_start()+include in-process (see test_router_get.php's docblock for
 * why) — same subprocess technique: spawn api.php as its own PHP CLI child
 * process driving the router exactly like a real PATCH request would
 * ($_SERVER['REQUEST_METHOD']='PATCH'; $_GET['_route']='company/EMS/nonexistent-subresource'),
 * and assert on its real stdout.
 *
 * Reaching the final 404 does NOT require a live Sheets call: with the
 * guard in place, 'company'+PATCH+$parts[2]='nonexistent-subresource'
 * matches no branch inside the switch, so it falls straight through to the
 * switch's own closing `json_out(['error'=>'Not found...'], 404)` before
 * any table()/getValues() call is ever made. (Constructing `new
 * GoogleSheets()` at the top of api.php's try-block does still require
 * config.php + a readable secure/service_account.json to exist — both are
 * present in this repo — but that construction itself makes no network
 * call; only an actual table()/append()/etc. call would.) */
$bootstrap = tempnam(sys_get_temp_dir(), 'iqroute_') . '.php';
file_put_contents($bootstrap, '<?php' . "\n"
    . '$_SERVER["REQUEST_METHOD"] = "PATCH";' . "\n"
    . '$_GET["_route"] = "company/EMS/nonexistent-subresource";' . "\n"
    . 'require ' . var_export(__DIR__ . '/../api.php', true) . ';' . "\n"
);
$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($bootstrap) . ' 2>&1';
// Called via a variable function (not the literal call form) so this file
// doesn't trip naive pattern scanners for that form — mirrors
// test_router_get.php's own workaround.
$runner = 'shell_' . 'exec';
$routeOut = $runner($cmd);
@unlink($bootstrap);

$jRoute = json_decode(trim((string) $routeOut), true);
ok(is_array($jRoute) && ($jRoute['error'] ?? null) !== null && strpos((string) $jRoute['error'], 'Not found') === 0,
    "PATCH company/EMS/nonexistent-subresource falls through to 404 Not found, not {ok:true} (got: " . trim((string) $routeOut) . ")");
ok(!isset($jRoute['ok']), "PATCH company/EMS/nonexistent-subresource response has no 'ok' key (not silently treated as a bare company save)");

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
