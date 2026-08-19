<?php
/* Menambah SATU baris ke tab `product_aliases` SalesPulse: Cutting Plate -> Galvanized.
   Aditif dan idempoten: membaca isi tab dulu, hanya menambah bila aliasnya belum ada,
   dan tidak menyentuh baris lain. Jalankan dengan --apply untuk benar-benar menulis. */
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/../salespulse/salespulse_util.php';

$APPLY = in_array('--apply', $argv, true);
$cfg = sc_config();
$SID = $cfg['spreadsheets']['salespulse'];
$gs  = new GoogleSheets();

$ALIAS = 'Cutting Plate';
$KANON = 'Galvanized';

$rows = sp_get_table($gs, $SID, 'product_aliases');
echo "Baris alias saat ini: " . count($rows) . "\n";

$sudahAda = false;
foreach ($rows as $r) {
    if (strcasecmp(trim((string)($r['alias'] ?? '')), $ALIAS) === 0) {
        $sudahAda = true;
        echo "SUDAH ADA: '{$r['alias']}' -> '{$r['canonical_name']}'\n";
    }
}

/* Nama kanonik tujuan wajib benar-benar ada di master produk — alias yang
   menunjuk nama tak dikenal hanya memindahkan masalah. */
$produk = sp_get_table($gs, $SID, 'products');
$adaKanon = false;
foreach ($produk as $p) if (trim((string)($p['canonical_name'] ?? '')) === $KANON) $adaKanon = true;
echo "Target '$KANON' ada di master produk: " . ($adaKanon ? 'YA' : 'TIDAK') . "\n";
if (!$adaKanon) { echo "BATAL — target kanonik tidak dikenal.\n"; exit(1); }

if ($sudahAda) { echo "Tidak ada yang perlu ditambah.\n"; exit(0); }

$baru = $rows;
$baru[] = ['alias' => $ALIAS, 'canonical_name' => $KANON];

if (!$APPLY) {
    echo "\n[UJI KERING] akan menambah: '$ALIAS' -> '$KANON'\n";
    echo "Total baris sesudah: " . count($baru) . "\n";
    echo "Jalankan ulang dengan --apply untuk menulis.\n";
    exit(0);
}

sp_with_lock(function () use ($gs, $SID, $baru) {
    sp_replace_table($gs, $SID, 'product_aliases', $baru);
});
echo "\nDITULIS: '$ALIAS' -> '$KANON'\n";

$cek = sp_get_table($gs, $SID, 'product_aliases');
echo "Baris alias sesudah: " . count($cek) . "\n";
foreach ($cek as $r) if (strcasecmp(trim((string)($r['alias'] ?? '')), 'Cutting Plate') === 0)
    echo "TERVERIFIKASI: '{$r['alias']}' -> '{$r['canonical_name']}'\n";
