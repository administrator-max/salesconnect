<?php
/* Menambahkan SATU baris item ke PS SalesPulse yang tersimpan TANPA item sama sekali.

   Kenapa ada: volume dashboard dijumlahkan dari `ps_items.total_weight_kg`, dan revenue
   hanya diakui untuk leg eksternal yang MEMBAWA item ($isExternalSaleLeg di
   consolidation.php). PS yang masuk tanpa tabel item karena itu punya margin tapi
   0 MT dan 0 revenue — produknya lenyap dari grafik volume.
   Dilaporkan 2026-08-20: PPGL Juli bermargin Rp 407,79 juta tapi tidak ada batangnya
   di grafik MT, karena 4 leg SUMEC 01A/01B tersimpan tanpa item.

   Aman: MENOLAK PS yang sudah punya item (tidak akan menggandakan tonase), memakai
   metadata dari ps_headers PS itu sendiri, dan tanpa --apply hanya uji kering.

   Pakai:
     php tools/salespulse_isi_item_ps.php <PS> <BERAT_KG> "<MATERIAL>" ["<SIZE>"]           (uji kering)
     php tools/salespulse_isi_item_ps.php <PS> <BERAT_KG> "<MATERIAL>" ["<SIZE>"] --apply   (tulis)
*/
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/../salespulse/salespulse_util.php';

$a = array_values(array_filter($argv, fn($x) => $x !== '--apply'));
$APPLY = in_array('--apply', $argv, true);
$PS   = $a[1] ?? null;
$KG   = isset($a[2]) ? (float) str_replace([',', '.'], ['', ''], $a[2]) : 0.0;
$MAT  = $a[3] ?? null;
$SIZE = $a[4] ?? '';

if (!$PS || $KG <= 0 || !$MAT) {
    fwrite(STDERR, "Pakai: php tools/salespulse_isi_item_ps.php <PS> <BERAT_KG> \"<MATERIAL>\" [\"<SIZE>\"] [--apply]\n");
    exit(1);
}

$cfg = sc_config();
$SID = $cfg['spreadsheets']['salespulse'];
$gs  = new GoogleSheets();

$H = sp_get_table($gs, $SID, 'ps_headers');
$hdr = null;
foreach ($H as $h) if (trim((string) ($h['ps_number'] ?? '')) === $PS) { $hdr = $h; break; }
if ($hdr === null) { fwrite(STDERR, "TIDAK KETEMU di ps_headers: $PS\n"); exit(1); }

$I = sp_get_table($gs, $SID, 'ps_items');
$sudahAda = 0; $kgLama = 0.0;
foreach ($I as $it) if (trim((string) ($it['ps_number'] ?? '')) === $PS) { $sudahAda++; $kgLama += sp_num($it['total_weight_kg'] ?? null); }
if ($sudahAda > 0) {
    fwrite(STDERR, "TOLAK: $PS sudah punya $sudahAda baris item ($kgLama kg). Tool ini hanya untuk PS yang benar-benar kosong,\n");
    fwrite(STDERR, "supaya tonasenya tidak tergandakan. Perbaiki lewat unggah ulang PS-nya.\n");
    exit(1);
}

$rev = sp_num($hdr['sales_revenue'] ?? null);
printf("PS         : %s\n", $PS);
printf("Project    : %s\n", $hdr['project_name'] ?? '');
printf("Customer   : %s\n", $hdr['customer_name'] ?? '');
printf("Produk     : %s\n", $hdr['product'] ?? '');
printf("Periode    : thn %s bln %d\n", $hdr['dashboard_year'], ((int) $hdr['dashboard_month_idx']) + 1);
printf("Berat baru : %s kg (%.1f MT)\n", number_format($KG), $KG / 1000);
printf("Revenue    : %s  ->  Rp %s /kg\n", number_format($rev), $KG > 0 ? number_format($rev / $KG, 2) : '-');
printf("Material   : '%s'   Size: '%s'\n", $MAT, $SIZE);

if (!$APPLY) { echo "\n[UJI KERING] jalankan ulang dengan --apply untuk menulis.\n"; exit(0); }

$baris = [
    'ps_number'           => $PS,
    'dashboard_year'      => $hdr['dashboard_year'] ?? null,
    'dashboard_month_idx' => $hdr['dashboard_month_idx'] ?? null,
    'project_name'        => $hdr['project_name'] ?? null,
    'item_no'             => 1,
    'material'            => $MAT,
    'size'                => $SIZE,
    'length'              => '',
    'qty_val'             => null,
    'qty_unit'            => 'PCS',
    'total_weight_kg'     => $KG,
    'purchase_price_kg'   => null,
    'created_at'          => date('c'),
];
sp_with_lock(function () use ($gs, $SID, $I, $baris) {
    sp_replace_table($gs, $SID, 'ps_items', array_merge($I, [$baris]));
});
echo "\nDITULIS.\n";

$cek = sp_get_table($gs, $SID, 'ps_items');
$n = 0; $kg = 0.0;
foreach ($cek as $it) if (trim((string) ($it['ps_number'] ?? '')) === $PS) { $n++; $kg += sp_num($it['total_weight_kg'] ?? null); }
echo "TERVERIFIKASI: $PS punya $n baris item, total " . number_format($kg) . " kg\n";
echo "Total baris ps_items sesudah: " . count($cek) . "\n";
