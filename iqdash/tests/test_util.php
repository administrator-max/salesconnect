<?php
require __DIR__ . '/../iqdash_util.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

ok(iq_coerce('') === null, 'empty -> null');
ok(iq_coerce('TRUE') === true, 'TRUE -> bool true');
ok(iq_coerce('FALSE') === false, 'FALSE -> bool false');
ok(iq_coerce('EMS') === 'EMS', 'string passthrough');
ok(iq_num('1,600') === 1600.0, 'comma number');
ok(iq_num('TBA') === 0.0, 'TBA -> 0');
ok(iq_date_iso('05/02/2026') === '2026-02-05', 'DD/MM/YYYY -> ISO');
ok(iq_date_iso('2026-02-05') === '2026-02-05', 'ISO passthrough');
ok(iq_date_iso('') === null, 'empty date -> null');
$led = iq_ledger();
ok(isset($led['companies']) && isset($led['products']), 'ledger loads');
echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
