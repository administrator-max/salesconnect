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

// ── sp_build_data fixture (Task 5) ─────────────────────────────────────────
// One project family ("P1"), month=jul (idx 6, year 2026), 2 legs:
//   Leg A: external end-customer "PT Andalan Maju", carries ps_items (1000 KG).
//   Leg B: internal SPV leg to "PT Gunung Inti Sempurna" (real name from
//          company-rank-exclusions.json), no items — pure intercompany pass-through.
// Expected (by hand, from server.js:236-518 semantics):
//   margin is GROSS over both legs: (2,000,000 + 500,000) / 1e6 = 2.5 MIDR.
//   revenue counts ONLY the external item-bearing leg (A):
//     10,000,000 / 1e6 = 10.0 MIDR (leg B's 9,000,000 sales_revenue is excluded
//     because its customer is internal -> isExternalSaleLeg(B) === false).
//   Both legs collapse into ONE PS_CHAINS entry (same project_name + month),
//   whose customer is the external leg's customer (pickEndCustomer picks the
//   only external customer among the two headers).
//   QTY_DATA gets exactly one row: only leg A contributes items (leg B has
//   none, and is internal-customer so would be excluded from QTY_DATA anyway).
$headers = [
  ['ps_number'=>'A','dashboard_year'=>2026,'dashboard_month_idx'=>6,'project_name'=>'P1','customer_name'=>'PT Andalan Maju','subsidiary'=>'','margin'=>2000000,'sales_revenue'=>10000000,'product'=>'HRC','segment'=>'Flat','po_date'=>'2026-07-01','notes'=>'','currency'=>'IDR','fx_rate'=>1,'net_margin_native'=>2000000,'margin_percentage'=>20],
  ['ps_number'=>'B','dashboard_year'=>2026,'dashboard_month_idx'=>6,'project_name'=>'P1','customer_name'=>'PT Gunung Inti Sempurna','subsidiary'=>'','margin'=>500000,'sales_revenue'=>9000000,'product'=>'HRC','segment'=>'Flat','po_date'=>'2026-07-02','notes'=>'','currency'=>'IDR','fx_rate'=>1,'net_margin_native'=>500000,'margin_percentage'=>5],
];
$items = [ ['ps_number'=>'A','total_weight_kg'=>1000,'qty_val'=>10,'qty_unit'=>'pcs','material'=>'Coil','size'=>''] ];
$out = sp_build_data(2026, [], [], [], $headers, $items);

chk('is_internal(Gunung Inti Sempurna) true (fixture depends on this)', sp_is_internal_company('PT Gunung Inti Sempurna') === true);
chk('is_internal(Andalan Maju) false (fixture depends on this)', sp_is_internal_company('PT Andalan Maju') === false);

chk('ACTUAL margin jul = 2.5 (gross both legs)', abs($out['ACTUAL']['margin'][6] - 2.5) < 1e-9);
chk('ACTUAL revenue jul = 10 (external item leg only)', abs($out['ACTUAL']['revenue'][6] - 10.0) < 1e-9);
chk('ACTUAL other months still null', $out['ACTUAL']['margin'][0] === null && $out['ACTUAL']['revenue'][0] === null);

chk('ACTUAL_PRODUCTS HRC margin jul = 2.5', abs($out['ACTUAL_PRODUCTS']['HRC']['margin'][6] - 2.5) < 1e-9);
chk('ACTUAL_PRODUCTS HRC revenue jul = 10 (external only)', abs($out['ACTUAL_PRODUCTS']['HRC']['revenue'][6] - 10.0) < 1e-9);
chk('ACTUAL_PRODUCTS HRC volume jul = 1 MT (external leg kg/1000, internal leg excluded)', abs($out['ACTUAL_PRODUCTS']['HRC']['volume'][6] - 1.0) < 1e-9);

chk('one chain in jul', count($out['PS_CHAINS']['jul']) === 1);
$chain = $out['PS_CHAINS']['jul'][0];
chk('chain customer external', $chain['customer'] === 'PT Andalan Maju');
chk('chain not internal', $chain['customerInternal'] === false);
chk('chain ps joined', $chain['ps'] === 'A · B');
chk('chain margin gross = 2.5', abs($chain['margin'] - 2.5) < 1e-9);
chk('chain revenue external only = 10.0', abs($chain['revenue'] - 10.0) < 1e-9);
chk('chain pct = margin/revenue*100 = 25', abs($chain['pct'] - 25.0) < 1e-9);
chk('chain has 2 subsidiary legs', count($chain['subsidiaries']) === 2);
chk('leg A marginMIDR = 2.0', abs($chain['subsidiaries'][0]['marginMIDR'] - 2.0) < 1e-9);
chk('leg B marginMIDR = 0.5', abs($chain['subsidiaries'][1]['marginMIDR'] - 0.5) < 1e-9);

chk('one QTY_DATA row in jul', count($out['QTY_DATA']['jul']) === 1);
$qty = $out['QTY_DATA']['jul'][0];
chk('QTY_DATA customer external', $qty['customer'] === 'PT Andalan Maju');
chk('QTY_DATA totalQty = "10 pcs"', $qty['totalQty'] === '10 pcs');
chk('QTY_DATA totalWeight = "1.000 KG (1 MT)" (id-ID thousands = dot)', $qty['totalWeight'] === '1.000 KG (1 MT)');
chk('QTY_DATA color from COLORS[0]', $qty['color'] === SP_COLORS[0]);
chk('QTY_DATA product = HRC', $qty['product'] === 'HRC');

echo $fail?"\n$fail FAILURES\n":"\nALL PASS\n"; exit($fail?1:0);
