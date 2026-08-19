<?php
/* Memperbaiki field `product` pada SATU baris ps_headers SalesPulse.
   Aman: membaca seluruh tab, mengubah HANYA baris yang cocok nomor PS-nya,
   lalu menulis balik apa adanya. Tanpa --apply hanya uji kering.

   Dipakai 2026-08-19: PSF26-IKM-000001 bertanda produk "Plate" padahal
   barangnya berkode GI-Z40 G550 dengan deskripsi
   "CUTTING PLATE ... COATING GALVANIZED Z40" — satu bagian dari Galvanized.
   Diubah ke "Cutting Plate" supaya tertangkap alias Cutting Plate -> Galvanized
   di tab product_aliases.

   Pakai:
     php tools/salespulse_perbaiki_produk_ps.php                       (uji kering)
     php tools/salespulse_perbaiki_produk_ps.php --apply               (tulis)
     php tools/salespulse_perbaiki_produk_ps.php PSF26-XXX "Nama" --apply
*/
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/../salespulse/salespulse_util.php';

$args  = array_values(array_filter($argv ?? [], fn($a) => $a !== '--apply'));
$APPLY = in_array('--apply', $argv ?? [], true);
$PS    = $args[1] ?? 'PSF26-IKM-000001';
$BARU  = $args[2] ?? 'Cutting Plate';

$cfg = sc_config();
$SID = $cfg['spreadsheets']['salespulse'];
$gs  = new GoogleSheets();

$rows = sp_get_table($gs, $SID, 'ps_headers');
echo "Total baris ps_headers: " . count($rows) . "\n";

$idx = null;
foreach ($rows as $i => $r) {
    if (trim((string) ($r['ps_number'] ?? '')) === $PS) { $idx = $i; break; }
}
if ($idx === null) { echo "TIDAK KETEMU: $PS\n"; exit(1); }

$r = $rows[$idx];
echo "\n--- $PS (apa adanya di sheet) ---\n";
foreach (['ps_number', 'dashboard_year', 'dashboard_month_idx', 'product',
          'customer_name', 'subsidiary', 'margin', 'sales_revenue'] as $k) {
    echo str_pad($k, 22) . ': ' . var_export($r[$k] ?? null, true) . "\n";
}

$lama = (string) ($r['product'] ?? '');
if ($lama === $BARU) { echo "\nSudah '$BARU' — tidak ada yang perlu diubah.\n"; exit(0); }

echo "\nAkan diubah: product '$lama' -> '$BARU'\n";
echo "Baris lain tidak disentuh. Field lain pada baris ini juga tidak disentuh.\n";

if (!$APPLY) { echo "\n[UJI KERING] jalankan ulang dengan --apply untuk menulis.\n"; exit(0); }

$rows[$idx]['product'] = $BARU;
sp_with_lock(function () use ($gs, $SID, $rows) {
    sp_replace_table($gs, $SID, 'ps_headers', $rows);
});
echo "\nDITULIS.\n";

$cek = sp_get_table($gs, $SID, 'ps_headers');
echo "Total baris sesudah: " . count($cek) . "\n";
foreach ($cek as $r2) {
    if (trim((string) ($r2['ps_number'] ?? '')) === $PS) {
        echo "TERVERIFIKASI: $PS product = '" . ($r2['product'] ?? '') . "'\n";
    }
}
