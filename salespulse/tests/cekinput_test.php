<?php
/* Uji sp_cek_input (salespulse_cekinput.php) — kasus diambil dari audit 175 PS 2026 (03-Nov-2026). */
require __DIR__ . '/../salespulse_cekinput.php';
$fail=0; function chk($n,$c){global $fail; echo ($c?"ok  - ":"FAIL- ").$n."\n"; if(!$c)$fail++;}

$hdr = fn($ps,$nama,$cust,$th=2026) => ['ps_number'=>$ps,'project_name'=>$nama,'customer_name'=>$cust,'dashboard_year'=>$th];
$itm = fn($ps,$kg) => ['ps_number'=>$ps,'total_weight_kg'=>$kg];
$pl  = fn($ps,$nama,$cust,$po,$items) => ['header'=>['psNumber'=>$ps,'projectName'=>$nama,'customerName'=>$cust,'poDate'=>$po,'baseCurrency'=>'IDR'],'items'=>$items];
$it  = fn($no,$kg,$mat='GL-AZ20 G300-00001') => ['no'=>$no,'material'=>$mat,'size'=>'','totalWeight'=>$kg];
$AL  = [['alias'=>'GL','canonical_name'=>'Galvalume'],['alias'=>'GI-Z','canonical_name'=>'Galvanized']];
$jenis = fn($r,$ps=null) => array_map(fn($m)=>$m['level'].':'.$m['jenis'], array_values(array_filter($r['masalah'], fn($m)=>$ps===null||$m['ps']===$ps)));
$HARI = '2026-10-20';

// Rapikan nama
chk('rapikan "-NIM" menempel', sp_ci_rapikan_nama('Arsen 69A - Del. December 2026 -NIM') === 'Arsen 69A - Del. December 2026 - NIM');
chk('rapikan spasi ganda', sp_ci_rapikan_nama('Arsen 69B - Del.  December 2026 - NIM') === 'Arsen 69B - Del. December 2026 - NIM');
chk('rapikan bulan Indonesia', sp_ci_rapikan_nama('Youfa 10 - Del. Mei 2026 - SSL') === 'Youfa 10 - Del. May 2026 - SSL');
chk('rapikan singkatan Okt', sp_ci_rapikan_nama('Lantian 01 - Del Okt 2026 - PTJ') === 'Lantian 01 - Del. October 2026 - PTJ');
chk('kode dengan # tidak tersentuh', sp_ci_rapikan_nama('Arsen SSP#48B - Del. May 2026 - KEM') === 'Arsen SSP#48B - Del. May 2026 - KEM');
chk('format baku dikenali', sp_ci_format_baku('Arsen 69A - Del. December 2026 - NIM')['tahun'] === 2026);
chk('tanpa Del. bukan baku', sp_ci_format_baku('Fine Steel #01 - WR Plate') === null);

// Customer
chk('Mlion Intl = International', sp_customer_key('PT. Mlion Intl Indonesia') === sp_customer_key('PT. Mlion International Indonesia'));
chk('PT tanpa titik', sp_customer_key('PT Okaya') === sp_customer_key('PT. Okaya'));

// Batas input = hari kerja ke-3 bulan berikut (Okt 2026: 1 Nov Minggu -> 2,3,4 -> Rabu 4 Nov)
chk('batas Oktober 2026 = 04/11', sp_ci_batas_input(2026, 9)->format('d/m/Y') === '04/11/2026');
chk('batas April 2026 = 05/05', sp_ci_batas_input(2026, 3)->format('d/m/Y') === '05/05/2026');

// PS rapi, tepat waktu -> tanpa masalah
$r = sp_cek_input([$pl('PSF26-ATL-000100','Arsen 70A - Del. January 2027 - NIM','PT. Okaya','15/10/2026',[$it(1,100000)])], [], [], $AL, $HARI);
chk('PS rapi tanpa masalah', $r['masalah'] === []);

// Blok: leg ke customer luar tanpa barang; barang tanpa berat; PO kosong
$r = sp_cek_input([$pl('PSF26-IKM-000099','Arsen 70A - Del. January 2027 - NIM','PT. Okaya','15/10/2026',[])], [], [], $AL, $HARI);
chk('leg luar tanpa barang = blok', in_array('blok:Tabel barang kosong', $jenis($r), true));
$r = sp_cek_input([$pl('PSF26-BTS-000099','Arsen AS#46 - Del. June 2026 - LMI','PT. LMI','10/03/2026',[$it(1,0,'FG-AS-SCM440-00001')])], [], [], $AL, '2026-03-20');
chk('barang tanpa berat = blok', in_array('blok:Barang tanpa berat', $jenis($r), true));
$r = sp_cek_input([$pl('PSF26-ATL-000101','Arsen 70A - Del. January 2027 - NIM','PT. Okaya','',[$it(1,5)])], [], [], $AL, $HARI);
chk('PO kosong = blok', in_array('blok:PO Date tidak terbaca', $jenis($r), true));

// Leg internal tanpa barang: boleh kalau leg lain membawa barang
$H = [$hdr('PSF26-IKM-000016','Arsen 69A - Del. December 2026 - NIM','PT. Okaya')];
$I = [$itm('PSF26-IKM-000016', 300000)];
$r = sp_cek_input([$pl('PSF26-ATL-000090','Arsen 69A - Del. December 2026 - NIM','PT. Indah Kiat Metal','20/10/2026',[])], $H, $I, $AL, $HARI);
chk('leg internal tanpa barang + leg lain berbarang = aman', !in_array('cek:Tabel barang kosong', $jenis($r), true));

// Nama beda antar-leg (Arsen 69) + saran nama baku
$H = [$hdr('PSF26-IKM-000016','Arsen 69A - Del. December 2026 - NIM (Okaya)','PT. Okaya')];
$r = sp_cek_input([$pl('PSF26-ATL-000090','Arsen 69A - Del. December 2026 -NIM','PT. Okaya','20/10/2026',[$it(1,300000)])], $H, [$itm('PSF26-IKM-000016',300000)], $AL, $HARI);
chk('Arsen 69: nama beda antar-leg', in_array('cek:Nama beda dengan leg lain', $jenis($r), true));
chk('Arsen 69: saran nama baku', ((array) $r['saran'])['PSF26-ATL-000090']['projectName'] === 'Arsen 69A - Del. December 2026 - NIM');

// Phase berbeda bukan masalah
$H = [$hdr('PSF26-SPA-000006','Hanwa 02 - Del. April 2026 - Artha Mas Graha Phase 2','PT. Artha Mas Graha')];
$r = sp_cek_input([$pl('PSF26-SPA-000004','Hanwa 02 - Del. April 2026 - Artha Mas Graha Phase 1','PT. Artha Mas Graha','01/04/2026',[$it(1,474900)])], $H, [], $AL, '2026-04-10');
chk('Hanwa 02 Phase 1 vs 2 bukan nama beda', !in_array('cek:Nama beda dengan leg lain', $jenis($r), true));

// Induk paralel "A dan B" vs anak
$H = [$hdr('PSF26-SSL-000001','Youfa 10 - Del. May 2026 - PT. Sapta Sumber Lancar','PT. Sapta Sumber Lancar')];
$r = sp_cek_input([$pl('PSF26-ATL-000011','Youfa 10 - Del. May 2026 - PT. Sapta Sumber Lancar dan PT. Karyawaja Eka Mulia','PT. Gantari Kara Loka','05/05/2026',[$it(1,1000)])], $H, [], $AL, '2026-05-10');
chk('induk "A dan B" tidak dianggap nama beda', !in_array('cek:Nama beda dengan leg lain', $jenis($r), true));

// Dobel: Hanwa 02 Phase 1 SPA-000004 vs SPA-000005
$H = [$hdr('PSF26-SPA-000004','Hanwa 02 - Del. April 2026 - Artha Mas Graha Phase 1','PT. Artha Mas Graha')];
$r = sp_cek_input([$pl('PSF26-SPA-000005','Hanwa 02 - Del. April 2026 - Artha Mas Graha Phase 1','PT. Artha Mas Graha','01/04/2026',[$it(1,474900)])], $H, [$itm('PSF26-SPA-000004',474900)], $AL, '2026-04-10');
chk('Hanwa 02: dugaan dobel', in_array('cek:Dugaan PS dobel', $jenis($r), true));

// Versi lama masih ada
$H = [$hdr('PSF26-LSJ-000001','Arsen 55 - Del. May 2026 - BJM','PT. BJM')];
$r = sp_cek_input([$pl('PSF26-LSJ-000001.R1','Arsen 55 - Del. May 2026 - BJM','PT. BJM','10/03/2026',[$it(1,1000)])], $H, [], $AL, '2026-03-20');
chk('revisi .R1 sementara versi lama ada', in_array('cek:Versi lain masih ada', $jenis($r), true));

// Tahun kirim salah (Kewei 68)
$r = sp_cek_input([$pl('PSF26-IKM-000003','Kewei 68A - Del. October 2025 - BJP','PT. BJP','30/07/2026',[$it(1,300000)])], [], [], $AL, '2026-08-01');
chk('Kewei 68: Del. October 2025 di PO Juli 2026', in_array('cek:Bulan kirim sebelum PO', $jenis($r), true));

// Ejaan customer + saran
$H = [$hdr('PSF26-EMS-000001','Mlion 09A - Del. March 2026 - Mlion','PT. Mlion International Indonesia'), $hdr('PSF26-EMS-000003','Mlion 11 - Del. May 2026 - Mlion','PT. Mlion International Indonesia')];
$r = sp_cek_input([$pl('PSF26-SGD-000009','Mlion 12 - Del. June 2026 - Mlion','PT. Mlion Intl Indonesia','10/04/2026',[$it(1,1000)])], $H, [], $AL, '2026-04-10');
chk('Mlion Intl: ejaan customer', in_array('cek:Ejaan customer', $jenis($r), true));
chk('Mlion Intl: saran ejaan lama', ((array) $r['saran'])['PSF26-SGD-000009']['customerName'] === 'PT. Mlion International Indonesia');

// Terlambat: PS Oktober diinput 05/11 (batas 04/11)
$r = sp_cek_input([$pl('PSF26-ATL-000102','Arsen 70A - Del. January 2027 - NIM','PT. Okaya','15/10/2026',[$it(1,100)])], [], [], $AL, '2026-11-05');
chk('PS Oktober diinput 05/11 = lewat batas', in_array('cek:Lewat batas input', $jenis($r), true));
$r = sp_cek_input([$pl('PSF26-ATL-000102','Arsen 70A - Del. January 2027 - NIM','PT. Okaya','15/10/2026',[$it(1,100)])], [], [], $AL, '2026-11-04');
chk('PS Oktober diinput 04/11 = masih boleh', !in_array('cek:Lewat batas input', $jenis($r), true));

echo $fail?"\n$fail FAILURES\n":"\nALL PASS\n"; exit($fail?1:0);
