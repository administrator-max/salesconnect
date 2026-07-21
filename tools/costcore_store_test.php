<?php
/**
 * Offline unit tests for the column-based store (decompose/recompose), no network.
 * Run:  php tools/costcore_store_test.php
 */
require_once __DIR__ . '/../lib/costcore_store.php';

$pass = 0; $fail = 0;
function ok($c, $n) { global $pass, $fail; if ($c) { $pass++; echo "  ok   - $n\n"; } else { $fail++; echo "  FAIL - $n\n"; } }

// ── IMPORT round-trip ──
$imp = ['shipType'=>'container20','customer'=>'Acme','kurs'=>17000,'importDuty'=>0.05,'wht'=>0.025,
    'portCharges'=>370,'hedgeRate'=>2.2,'hedgeDays'=>90,'tujuan'=>'Cikarang','isPipa'=>true,'stripping'=>120,
    'addCost'=>50,'commission'=>10,'commUnit'=>'usd','marginType'=>'percent','margin'=>7,'payTerms'=>'NET 30 Days',
    'items'=>[['name'=>'A','qty'=>'10','cif'=>'800','remark'=>'x'],['name'=>'B','qty'=>'5','cif'=>'900','remark'=>'']]];
[$h,$it,$mg] = cc_decompose('import_1','import','Acme',$imp,'C','U');
ok($h['ship_type']==='container20' && $h['is_pipa']==='TRUE' && count($it)===2 && count($mg)===0, 'import decompose');
ok($it[0]['name']==='A' && $it[0]['qty']==='10' && $it[0]['cif']==='800' && $it[0]['item_no']===1, 'import item cols');
$r = cc_recompose($h,$it,$mg);
ok($r['shipType']==='container20' && $r['kurs']===17000.0 && $r['isPipa']===true && $r['commUnit']==='usd', 'import recompose scalars');
ok(count($r['items'])===2 && $r['items'][1]['name']==='B' && $r['items'][1]['cif']==='900', 'import recompose items');
ok(isset($r['paramsOpen'],$r['bdOpen'],$r['showUpload']), 'import recompose has UI defaults');

// ── DOMESTIC round-trip (with margins + marginIdx) ──
$dom = ['customer'=>'Beta','whtRate'=>0.003,'addCost'=>0,'trkCost'=>500,'trkFrom'=>'Marunda','trkTo'=>'Cikarang',
    'payTerms'=>'CBD','margins'=>[['name'=>'A','val'=>1000],['name'=>'B','val'=>800]],
    'items'=>[['name'=>'W','qtyKg'=>'100','buyPrice'=>'12000','marginIdx'=>1,'remark'=>'']]];
[$h2,$it2,$mg2] = cc_decompose('domestic_2','domestic','Beta',$dom,'C','U');
ok(count($mg2)===2 && $mg2[1]['name']==='B' && $mg2[1]['val']==800 && $mg2[1]['margin_no']===1, 'domestic margins decompose');
ok($it2[0]['qty_kg']==='100' && $it2[0]['buy_price']==='12000' && (int)$it2[0]['margin_idx']===1, 'domestic item cols');
$r2 = cc_recompose($h2,$it2,$mg2);
ok($r2['whtRate']===0.003 && $r2['trkFrom']==='Marunda' && count($r2['margins'])===2, 'domestic recompose');
ok($r2['items'][0]['marginIdx']===1 && $r2['items'][0]['qtyKg']==='100', 'domestic recompose item marginIdx');

// ── empty items -> gets a blank starter row (matches frontend initial state) ──
$r3 = cc_recompose(['type'=>'import','customer'=>'X'],[],[]);
ok(count($r3['items'])===1 && $r3['items'][0]['name']==='', 'empty import -> one blank item');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
