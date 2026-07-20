<?php
require __DIR__ . '/../scot_util.php';
$fail = 0;
function chk($name, $cond) { global $fail; if ($cond) { echo "ok  - $name\n"; } else { echo "FAIL- $name\n"; $GLOBALS['fail']++; } }

// scot_shape: numeric->number, date->YYYY-MM-DD, empty->null
$shaped = scot_shape(['_row'=>2,'id'=>'7','no'=>'3','quantity_mt'=>'145.248','year'=>'2026','etd'=>'2026-01-05T00:00:00.000Z','consignee'=>'PT ABC','product'=>'']);
chk('id is int 7', $shaped['id'] === 7);
chk('qty is float', $shaped['quantity_mt'] === 145.248);
chk('year int', $shaped['year'] === 2026);
chk('etd sliced', $shaped['etd'] === '2026-01-05');
chk('empty product null', $shaped['product'] === null);
chk('_row dropped', !array_key_exists('_row', $shaped));

$badnum = scot_shape(['quantity_mt'=>'abc','year'=>'2026']);
chk('non-numeric qty -> null', $badnum['quantity_mt'] === null);
chk('valid year still int', $badnum['year'] === 2026);

// scot_sanitize: whitelist + ''->null, drops server-managed keys
$clean = scot_sanitize(['id'=>999,'created_at'=>'x','consignee'=>'PT X','bl_number'=>'','bogus'=>'y','year'=>2026]);
chk('drops id', !array_key_exists('id', $clean));
chk('drops created_at', !array_key_exists('created_at', $clean));
chk('drops bogus', !array_key_exists('bogus', $clean));
chk('keeps consignee', $clean['consignee'] === 'PT X');
chk('empty to blank', $clean['bl_number'] === '');
chk('keeps year', $clean['year'] === 2026);

// scot_sort: year desc nulls last, id desc
$rows = [ ['id'=>1,'year'=>2025], ['id'=>5,'year'=>2026], ['id'=>2,'year'=>null], ['id'=>9,'year'=>2026] ];
scot_sort($rows);
chk('first is 2026/id9', $rows[0]['id']===9 && $rows[0]['year']===2026);
chk('second is 2026/id5', $rows[1]['id']===5);
chk('third is 2025', $rows[2]['year']===2025);
chk('null year last', $rows[3]['year']===null);

echo $fail ? "\n$fail FAILURES\n" : "\nALL PASS\n";
exit($fail ? 1 : 0);
