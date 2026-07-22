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

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
