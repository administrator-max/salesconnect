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
chk('prodkey blank -> sentinel', sp_prod_key('  ') === '(Produk Belum Diisi)');
chk('prodkey blank BUKAN Projects', sp_prod_key('') !== 'Projects');
chk('prodkey Projects tetap Projects', sp_prod_key('Projects') === 'Projects');
chk('prodkey keep', sp_prod_key('HRC') === 'HRC');

// sp_detect_product — kode material menang atas deskripsi (Arsen 69, 02-Nov-2026)
$AL = [];
foreach (['GL'=>'Galvalume','PPGL'=>'PPGL','GI-Z'=>'Galvanized','Cutting Plate'=>'Galvanized','Plate'=>'Plate','Wear Plate'=>'Wear Plate','SMLS'=>'Seamless Pipe','Seamless'=>'Seamless Pipe'] as $a=>$c) $AL[] = ['alias'=>$a,'canonical_name'=>$c];
$it = fn($m,$s) => ['material'=>$m,'size'=>$s];
chk('detect 69A GL-AZ20 + "Cutting Plate" -> Galvalume', sp_detect_product('Arsen 69A - Del. December 2026 - NIM (Okaya)', [$it('GL-AZ20 G300-00001','CUTTING PLATE TYPE B, 0.20 MM, COATING ALUMINIUM ZINC AZ20')], $AL) === 'Galvalume');
chk('detect 69B PPGL-AZ20 -> PPGL', sp_detect_product('Arsen 69B', [$it('PPGL-AZ20 G550-0006','CUTTING PLATE TYPE B')], $AL) === 'PPGL');
chk('detect GI-Z40 -> Galvanized', sp_detect_product('Arsen 64A', [$it('GI-Z40 G550-00048','CUTTING PLATE TYPE B, GALVANIZED Z40')], $AL) === 'Galvanized');
chk('detect Wear Plate tetap (material tak dikenal, nama+deskripsi)', sp_detect_product('Fine Steel #01 - WR Plate', [$it('WP-NM 400-00017','WEAR PLATE NM 400')], $AL) === 'Wear Plate');
chk('detect tanpa item -> dari nama', sp_detect_product('SSP Seamless 01', [], $AL) === 'Seamless Pipe');
chk('detect tak dikenal -> null', sp_detect_product('Arsen 68 - Del. December 2026 - BJM', [], $AL) === null);

echo $fail?"\n$fail FAILURES\n":"\nALL PASS\n"; exit($fail?1:0);
