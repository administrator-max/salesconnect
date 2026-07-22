<?php
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_data.php';
$oracle = json_decode(file_get_contents(__DIR__.'/fixtures/api_data.json'), true);
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }
// Feed the oracle's own tables back is not available; instead assert the
// builder produces the same TOP-LEVEL KEYS and that spi rows carry the
// expected fields. Use a tiny synthetic $t.
$t = [
  'companies'=>[['code'=>'EMS','full_name'=>'Eng Multi Steel','grp'=>'AB','section'=>'SPI','updated_at'=>'2026-01-01 00:00:00']],
  'cycles'=>[], 'cycleProducts'=>[], 'stats'=>[], 'revisions'=>[], 'lots'=>[],
  'realizations'=>[], 'aliases'=>[['alias'=>'GI','canonical'=>'GI ALLOY']],
  'products'=>[['name'=>'GI ALLOY','hs_code'=>'7225.92.90','sort_order'=>'1']],
  'directory'=>[['full_name'=>'Eng Multi Steel','abbreviation'=>'EMS','sort_order'=>'1']],
  'companyProducts'=>[], 'reapply'=>[], 'ra'=>[], 'pendingMeta'=>[], 'pertekRelease'=>[],
];
$p = iq_build_payload_raw($t);
foreach (['spi','pending','ra','products','productAliases','companyDirectory','lastUpdate'] as $k)
  ok(array_key_exists($k,$p), "payload has key $k");
ok(is_array($p['spi']) && count($p['spi'])===1, 'one SPI company');
ok(($p['spi'][0]['code']??'')==='EMS', 'SPI company code EMS');
ok(($p['productAliases']['GI']??'')==='GI ALLOY', 'alias map built');
// ── Regression: cycle mt mirrors JS `isNaN(mt) ? mt : Number(mt)` ────────
// 'TBA' (not-yet-terbit) must stay the raw string, not become 0/false;
// a plain numeric string must become a real number.
$t2 = [
  'companies'=>[['code'=>'EMS','full_name'=>'Eng Multi Steel','grp'=>'AB','section'=>'SPI','updated_at'=>'2026-01-01 00:00:00']],
  'cycles'=>[
    ['id'=>'1','company_code'=>'EMS','cycle_type'=>'A','mt'=>'TBA','sort_order'=>'1'],
    ['id'=>'2','company_code'=>'EMS','cycle_type'=>'B','mt'=>'1600','sort_order'=>'2'],
  ],
  'cycleProducts'=>[], 'stats'=>[['company_code'=>'EMS','product'=>'GI ALLOY','eta_jkt'=>'0']], 'revisions'=>[],
  'lots'=>[
    ['company_code'=>'EMS','product'=>'GI ALLOY','lot_no'=>'1','util_mt'=>'10','note'=>'0','pib_date'=>'0','eta_jkt'=>'0'],
  ],
  'realizations'=>[], 'aliases'=>[['alias'=>'GI','canonical'=>'GI ALLOY']],
  'products'=>[['name'=>'GI ALLOY','hs_code'=>'7225.92.90','sort_order'=>'1']],
  'directory'=>[['full_name'=>'Eng Multi Steel','abbreviation'=>'EMS','sort_order'=>'1']],
  'companyProducts'=>[['company_code'=>'EMS','product'=>'GI ALLOY','sort_order'=>'1']],
  'reapply'=>[], 'ra'=>[], 'pendingMeta'=>[], 'pertekRelease'=>[],
];
$p2 = iq_build_payload_raw($t2);
$cycles = $p2['spi'][0]['cycles'] ?? [];
$byType = [];
foreach ($cycles as $c) { $byType[$c['type']] = $c; }
ok(($byType['A']['mt'] ?? null) === 'TBA', "cycle mt='TBA' stays raw string 'TBA'");
ok(($byType['B']['mt'] ?? null) === 1600, "cycle mt='1600' becomes numeric 1600");

// ── Regression: string "0" must survive JS `||`/truthy passthrough gates ──
$shipments = $p2['spi'][0]['shipments']['GI ALLOY'][0] ?? [];
ok(($shipments['note'] ?? null) === '0', "shipment note='0' survives as string '0', not ''");
ok(($shipments['pibDate'] ?? null) === '0', "shipment pibDate='0' survives as string '0', not ''");
ok(($shipments['etaJKT'] ?? null) === '0', "shipment etaJKT='0' survives as string '0', not ''");
ok(($p2['spi'][0]['etaByProd']['GI ALLOY'] ?? null) === '0', "stat eta_jkt='0' presence gate keeps '0' (not skipped by empty())");

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
