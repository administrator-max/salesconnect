<?php
/**
 * Hapus baris "TOTAL" workbook yang terlanjur tersimpan sebagai baris realisasi.
 *
 * Workbook PIB memakai baris rekap di kaki tabel: Volume (dan Nilai) terisi
 * jumlah seluruh line item, tapi No. PIB, HS dan Uraian Barang kosong. Parser
 * lama hanya melewati baris yang SELURUH selnya kosong, jadi baris rekap ini
 * ikut tersimpan dan realisasi company itu terhitung DUA KALI. Penjaganya sudah
 * ditambal di 20-realization-import.js (commit 008b5e2); skrip ini membereskan
 * yang sudah terlanjur masuk.
 *
 * AMAN: hanya menghapus baris yang LOLOS DUA SYARAT sekaligus —
 *   1. tanpa product, tanpa pib_no, tanpa hs_code, tanpa description; dan
 *   2. volumenya SAMA PERSIS dengan jumlah baris berisi dari source_file yang
 *      sama (selisih < 0,01).
 * Baris kosong yang TIDAK cocok dengan jumlahnya dilaporkan tapi TIDAK
 * disentuh — bisa jadi itu line item yang datanya rusak, bukan baris rekap.
 *
 * Dry run dulu:   php tools/hapus_baris_total_realisasi.php
 * Baru terapkan:  php tools/hapus_baris_total_realisasi.php --terapkan
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';

$terapkan = in_array('--terapkan', $argv, true);
$cfg = sc_config(); $SID = $cfg['spreadsheets']['iqdash']; $gs = new GoogleSheets();

$rows = $gs->table($SID, 'realizations', false)['rows'] ?? [];

$perFile = [];
foreach ($rows as $r) {
    $f = trim((string) ($r['source_file'] ?? ''));
    if ($f === '' || $f === 'programA') continue;
    $kosong = trim((string) ($r['product']     ?? '')) === ''
           && trim((string) ($r['pib_no']      ?? '')) === ''
           && trim((string) ($r['hs_code']     ?? '')) === ''
           && trim((string) ($r['description'] ?? '')) === '';
    $perFile[$f][$kosong ? 'rekap' : 'isi'][] = $r;
}
ksort($perFile);

$hapus = [];
$ragu  = [];
foreach ($perFile as $file => $g) {
    if (empty($g['rekap'])) continue;
    $sumIsi = 0.0;
    foreach ($g['isi'] ?? [] as $x) $sumIsi += (float) ($x['volume'] ?? 0);
    foreach ($g['rekap'] as $x) {
        $vol = (float) ($x['volume'] ?? 0);
        $b = ['_row' => $x['_row'], 'id' => (string) ($x['id'] ?? ''),
              'co' => (string) ($x['company_code'] ?? ''), 'vol' => $vol,
              'sum' => $sumIsi, 'n' => count($g['isi'] ?? []), 'file' => $file];
        if ($vol > 0 && abs($vol - $sumIsi) < 0.01) $hapus[] = $b; else $ragu[] = $b;
    }
}

$f = fn($n) => number_format((float) $n, 3, ',', '.');
echo ($terapkan ? "=== TERAPKAN ===" : "=== DRY RUN (tidak menulis apa pun) ===") . "\n\n";

$total = 0.0;
foreach ($hapus as $b) {
    $total += $b['vol'];
    printf("HAPUS  id=%-5s co=%-5s vol=%-11s = Σ %2d line item (%s)  %s\n",
        $b['id'], $b['co'], $f($b['vol']), $b['n'], $f($b['sum']), $b['file']);
}
echo "\n" . count($hapus) . " baris rekap · " . $f($total) . " MT realisasi hantu\n";

if ($ragu) {
    echo "\nTIDAK DISENTUH — kosong tapi volumenya tidak sama dengan jumlah line item:\n";
    foreach ($ragu as $b) printf("  id=%-5s co=%-5s vol=%-11s vs Σ %s  %s\n",
        $b['id'], $b['co'], $f($b['vol']), $f($b['sum']), $b['file']);
}

if (!$terapkan) { echo "\nDry run selesai. Jalankan ulang dengan --terapkan kalau daftarnya benar.\n"; exit(0); }
if (!$hapus)    { echo "\nTidak ada yang perlu dihapus.\n"; exit(0); }

$sebelum = count($rows);

/* Dari bawah ke atas supaya nomor baris yang belum diproses tidak bergeser. */
$nomor = array_map(fn($b) => (int) $b['_row'], $hapus);
rsort($nomor);
$gs->deleteRows($SID, 'realizations', $nomor);

/* Baca ulang — klaim "berhasil" tanpa membaca ulang tidak membuktikan apa pun. */
$sesudah = $gs->table($SID, 'realizations', false)['rows'] ?? [];
$idHapus = array_flip(array_map(fn($b) => (string) $b['id'], $hapus));
$masih = 0;
foreach ($sesudah as $r) if (isset($idHapus[(string) ($r['id'] ?? '')])) $masih++;

echo "\nBACA ULANG:\n";
echo '  baris realisasi : ' . $sebelum . ' -> ' . count($sesudah)
   . ' (berkurang ' . ($sebelum - count($sesudah)) . ', harusnya ' . count($hapus) . ")\n";
echo $masih === 0
    ? "  tidak ada baris rekap yang tersisa  OK\n"
    : "  PERIKSA: masih ada $masih baris yang harusnya sudah hilang\n";

$ok = ($masih === 0) && (($sebelum - count($sesudah)) === count($hapus));
@unlink(rtrim($cfg['cache_dir'] ?? (__DIR__ . '/../cache'), '/') . '/iqdash_payload.json');
echo "\nMemo payload dihapus — dashboard akan menghitung ulang.\n";
exit($ok ? 0 : 1);
