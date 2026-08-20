<?php
/* Mengisi field `product` (+ `segment`) pada baris ps_headers SalesPulse yang
   MASIH KOSONG. Aman & idempoten: hanya menyentuh baris yang product-nya kosong,
   memverifikasi nama produk ada di master `products` atau punya alias di
   `product_aliases`, dan tanpa --apply hanya uji kering.

   Kenapa ada: product kosong dulu diam-diam jatuh ke kategori "Projects" di
   dashboard (lihat SP_PRODUK_BELUM_DIISI di salespulse/salespulse_util.php).
   Sekarang bucket-nya jujur bernama "(Produk Belum Diisi)", dan tool ini yang
   dipakai untuk menutup lubangnya.

   Dipakai 2026-08-20: 4 leg rantai SUMEC 01A/01B (PSF26-ATL-000045.R1,
   PSF26-HKG-000002.R1, PSF26-ATL-000046.R1, PSF26-JKT-000002.R2) diisi PPGL.

   Pakai:
     php tools/salespulse_isi_produk_kosong.php "PPGL" PS-A PS-B            (uji kering)
     php tools/salespulse_isi_produk_kosong.php "PPGL" PS-A PS-B --apply    (tulis)
     php tools/salespulse_isi_produk_kosong.php "PPGL" --semua              (semua yang kosong)
*/
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/../salespulse/salespulse_util.php';

$argvClean = array_values(array_filter($argv, fn($a) => $a !== '--apply' && $a !== '--semua'));
$APPLY = in_array('--apply', $argv, true);
$SEMUA = in_array('--semua', $argv, true);
$PRODUK = $argvClean[1] ?? null;
$TARGET = array_slice($argvClean, 2);

if ($PRODUK === null || (!$SEMUA && !$TARGET)) {
    fwrite(STDERR, "Pakai: php tools/salespulse_isi_produk_kosong.php \"Nama Produk\" PS-A [PS-B ...] [--apply]\n");
    fwrite(STDERR, "   atau: php tools/salespulse_isi_produk_kosong.php \"Nama Produk\" --semua [--apply]\n");
    exit(1);
}

$cfg = sc_config();
$SID = $cfg['spreadsheets']['salespulse'];
$gs  = new GoogleSheets();

// ── Verifikasi nama produk: harus dikenal master, bukan ejaan karangan ────────
$master = array_map(fn($p) => (string) ($p['canonical_name'] ?? ''), sp_get_table($gs, $SID, 'products'));
$alias  = [];
foreach (sp_get_table($gs, $SID, 'product_aliases') as $a) {
    $k = trim((string) ($a['alias'] ?? ''));
    if ($k !== '') $alias[$k] = (string) ($a['canonical_name'] ?? '');
}
if (!in_array($PRODUK, $master, true) && !isset($alias[$PRODUK])) {
    fwrite(STDERR, "TOLAK: '$PRODUK' tidak ada di master `products` maupun `product_aliases`.\n");
    fwrite(STDERR, "Master: " . implode(', ', $master) . "\n");
    exit(1);
}
$kanonik = $alias[$PRODUK] ?? $PRODUK;
$segment = sp_segment_for_product($kanonik);
echo "Produk    : '$PRODUK'" . ($kanonik !== $PRODUK ? " (alias -> '$kanonik')" : '') . "\n";
echo "Segment   : " . var_export($segment, true) . "\n\n";

$rows = sp_get_table($gs, $SID, 'ps_headers');
echo "Total baris ps_headers: " . count($rows) . "\n\n";

$ubah = [];
foreach ($rows as $i => $r) {
    $ps = trim((string) ($r['ps_number'] ?? ''));
    $kosong = trim((string) ($r['product'] ?? '')) === '';
    $dipilih = $SEMUA ? true : in_array($ps, $TARGET, true);
    if (!$dipilih) continue;
    if (!$kosong) {
        echo "LEWATI  $ps — sudah berproduk '" . $r['product'] . "', tidak disentuh.\n";
        continue;
    }
    $ubah[$i] = $ps;
    printf("ISI     %-22s | thn %s bln %2d | %-42s | margin %s\n",
        $ps, $r['dashboard_year'], ((int) $r['dashboard_month_idx']) + 1,
        substr((string) $r['project_name'], 0, 42), number_format((float) $r['margin']));
}

if (!$SEMUA) {
    $ketemu = array_values($ubah);
    foreach ($TARGET as $t) {
        if (!in_array($t, $ketemu, true)) {
            $ada = false;
            foreach ($rows as $r) if (trim((string) ($r['ps_number'] ?? '')) === $t) $ada = true;
            echo ($ada ? "" : "TIDAK ADA di ps_headers: $t\n");
        }
    }
}

if (!$ubah) { echo "\nTidak ada baris yang perlu diubah.\n"; exit(0); }
echo "\n" . count($ubah) . " baris akan diisi product='$kanonik', segment=" . var_export($segment, true) . ".\n";
echo "Baris lain dan field lain tidak disentuh.\n";

if (!$APPLY) { echo "\n[UJI KERING] jalankan ulang dengan --apply untuk menulis.\n"; exit(0); }

foreach (array_keys($ubah) as $i) {
    $rows[$i]['product'] = $kanonik;
    $rows[$i]['segment'] = $segment;
}
sp_with_lock(function () use ($gs, $SID, $rows) {
    sp_replace_table($gs, $SID, 'ps_headers', $rows);
});
echo "\nDITULIS.\n";

$cek = sp_get_table($gs, $SID, 'ps_headers');
echo "Total baris sesudah: " . count($cek) . "\n";
foreach ($cek as $r) {
    if (in_array(trim((string) ($r['ps_number'] ?? '')), array_values($ubah), true)) {
        echo "TERVERIFIKASI: " . $r['ps_number'] . " product='" . ($r['product'] ?? '') . "' segment='" . ($r['segment'] ?? '') . "'\n";
    }
}
$sisa = 0;
foreach ($cek as $r) if (trim((string) ($r['product'] ?? '')) === '') $sisa++;
echo "Sisa baris tanpa product: $sisa\n";
