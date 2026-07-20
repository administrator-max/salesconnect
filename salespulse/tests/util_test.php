<?php
require __DIR__ . '/../salespulse_util.php';
$fail=0; function chk($n,$c){global $fail; echo ($c?"ok  - ":"FAIL- ").$n."\n"; if(!$c)$fail++;}

// parse_cell
chk('int parse', sp_parse_cell('12', 'int') === 12);
chk('int lenient', sp_parse_cell('12abc', 'int') === 12);
chk('int nonnum null', sp_parse_cell('abc', 'int') === null);
chk('empty int null', sp_parse_cell('', 'int') === null);
chk('float parse', sp_parse_cell(3.5, 'float') === 3.5);
chk('empty json is []', sp_parse_cell('', 'json') === []);
chk('json decode', sp_parse_cell('{"a":1}', 'json') === ['a'=>1]);
chk('string', sp_parse_cell(5, 'string') === '5');

// serialize_cell
chk('ser empty', sp_serialize_cell(null,'string') === '');
chk('ser int num', sp_serialize_cell('12','int') === 12);
chk('ser date slice', sp_serialize_cell('2026-07-08T00:00:00Z','date') === '2026-07-08');
chk('ser json', sp_serialize_cell(['a'=>1],'json') === '{"a":1}');

// num / prod_key
chk('num nan->0', sp_num('abc') === 0.0);
chk('num float', sp_num('12.5') === 12.5);
chk('prodkey blank', sp_prod_key('  ') === 'Projects');
chk('prodkey keep', sp_prod_key('HRC') === 'HRC');

echo $fail?"\n$fail FAILURES\n":"\nALL PASS\n"; exit($fail?1:0);
