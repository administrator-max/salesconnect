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
echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
