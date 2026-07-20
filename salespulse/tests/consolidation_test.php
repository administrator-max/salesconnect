<?php
require __DIR__ . '/../consolidation.php';
$fail=0; function chk($n,$c){global $fail; echo ($c?"ok  - ":"FAIL- ").$n."\n"; if(!$c)$fail++;}

chk('norm strips PT', sp_norm_company('PT. Eka Mulia') === 'eka mulia');
chk('normNoSpace', sp_norm_no_space('Eka Mulia') === 'ekamulia');
chk('endCustomerFromName', sp_end_customer_from_name('Proj X - Del. Jul 2026 - Andalan Maju') === 'Andalan Maju');
chk('endCustomer none if no alpha', sp_end_customer_from_name('Proj - 123') === '');
chk('familyKey strips del', sp_project_family_key('Foo Bar - Del. Jul 2026 - X') === 'foo bar');

// parseProjectSheetDate: excel serial 46000 ~ 2025-12-...  d/m/y, iso
$d1 = sp_parse_project_sheet_date('08/07/2026');
chk('dmy date', $d1['date'] === '2026-07-08' && $d1['monthIdx'] === 6);
$d2 = sp_parse_project_sheet_date('2026-03-15');
chk('iso monthIdx', $d2['monthIdx'] === 2);
$d3 = sp_parse_project_sheet_date('');
chk('empty null', $d3['date'] === null && $d3['monthIdx'] === null);

// group_reduce
$g = sp_group_reduce([['k'=>'a','v'=>1],['k'=>'a','v'=>2],['k'=>'b','v'=>5]],
  fn($r)=>$r['k'], fn()=>['s'=>0], function(&$a,$r){$a['s']+=$r['v'];});
$byKey = []; foreach($g as $e){$byKey[$e['key']]=$e['acc']['s'];}
chk('group a=3', $byKey['a']===3); chk('group b=5', $byKey['b']===5);

// internal-company (depends on the copied JSON having group SPVs)
chk('is_internal returns bool', is_bool(sp_is_internal_company('PT Random External Co')));

echo $fail?"\n$fail FAILURES\n":"\nALL PASS\n"; exit($fail?1:0);
