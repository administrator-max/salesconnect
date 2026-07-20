<?php
require __DIR__ . '/../gemini.php';
$fail = 0;
function chk($n,$c){global $fail; echo ($c?"ok  - ":"FAIL- ").$n."\n"; if(!$c)$fail++;}

$raw = "```json\n{\"fields\":{\"bl_number\":\"BL123\",\"quantity_mt\":145.2,\"bogus\":\"x\",\"year\":2026},\"confidence\":{\"bl_number\":0.9,\"quantity_mt\":2}}\n```";
$obj = json_decode(scot_gemini_strip_json($raw), true);
$out = scot_gemini_filter($obj);
chk('keeps bl_number', ($out['fields']['bl_number'] ?? null) === 'BL123');
chk('keeps quantity_mt', ($out['fields']['quantity_mt'] ?? null) === 145.2);
chk('drops bogus key', !array_key_exists('bogus', $out['fields']));
chk('confidence clamped to 1', $out['confidence']['quantity_mt'] === 1.0);
chk('confidence default 0.5', $out['confidence']['year'] === 0.5);

echo $fail ? "\n$fail FAILURES\n" : "\nALL PASS\n"; exit($fail?1:0);
