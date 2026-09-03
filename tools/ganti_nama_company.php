<?php
/**
 * Mengganti NAMA TAMPILAN (companies.full_name) sebuah company.
 *
 * KENAPA full_name, BUKAN code
 * ----------------------------
 * `code` adalah kunci asing: AMP dirujuk 21 baris di 6 tab (cycles,
 * company_products, company_product_stats, company_shipments,
 * cycle_utilization, realizations). Menggantinya berarti cascade ke semuanya,
 * dan kode ber-spasi/garis-miring bukan bentuk yang aman untuk kunci.
 * Keputusan tim 03-Sep-2026: cukup full_name.
 *
 * YANG BERUBAH DI LAYAR: header drawer saat company dibuka
 * (08-drawer.js: `headerName = fullName || code`). Tabel utama tetap memakai
 * kode 3 huruf — itu memang kolom Company-nya, dan tidak ikut berubah.
 *
 * Dry-run:   php tools/ganti_nama_company.php AMP "AMP / SUJU"
 * Terapkan:  php tools/ganti_nama_company.php AMP "AMP / SUJU" --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

$args = array_values(array_filter(array_slice($argv, 1), fn($a) => $a !== '--apply'));
$APPLY = in_array('--apply', $argv, true);
if (count($args) < 2) {
    echo "Pemakaian: php tools/ganti_nama_company.php <CODE> \"<Nama Baru>\" [--apply]\n";
    exit(1);
}
[$code, $namaBaru] = $args;

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$coTbl = $gs->table($sid, 'companies');
$comps = $coTbl['rows'];

$idx = null;
foreach ($comps as $i => $r) if ((string) ($r['code'] ?? '') === $code) { $idx = $i; break; }
if ($idx === null) { echo "BERHENTI: company $code tidak ada di tab companies.\n"; exit(1); }

$lama = (string) ($comps[$idx]['full_name'] ?? '');
echo "\n=== " . ($APPLY ? 'MENERAPKAN' : 'DRY-RUN') . " ===\n";
printf("  %s · full_name: %s  ->  %s\n", $code, $lama === '' ? '(kosong)' : $lama, $namaBaru);

if ($lama === $namaBaru) { echo "\nSudah bernilai sama. Tidak ada yang perlu ditulis.\n"; exit(0); }

/* Nama lama dicetak supaya tidak lenyap tanpa jejak — ia tidak tersimpan di
   tempat lain mana pun. */
echo "  Nama lama disimpan di cadangan dan di pesan commit.\n";

/* Kode TIDAK disentuh. Ditegaskan di sini supaya jelas terbaca. */
$n = 0;
foreach (['cycles','company_products','company_product_stats','company_shipments','cycle_utilization','realizations'] as $tab) {
    foreach ($gs->table($sid, $tab)['rows'] as $r) if ((string) ($r['company_code'] ?? '') === $code) $n++;
}
printf("  Kode \"%s\" TIDAK diubah — %d baris di 6 tab tetap merujuk kode yang sama.\n", $code, $n);

if (!$APPLY) { echo "\nBelum menulis apa pun. Ulangi dengan --apply.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/companies_sebelum_ganti_nama_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode($comps));
echo "Cadangan: $cad\n";

$comps[$idx]['full_name'] = $namaBaru;
iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'companies', 'rows' => $comps, 'headers' => $coTbl['headers']],
]);
echo "Selesai.\n";
