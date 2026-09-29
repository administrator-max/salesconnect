<?php
/**
 * AMP / SUJU — 200 MT milik Obtained #2 tidak pernah sampai ke
 * company_product_stats, jadi atap utilisasi GL ALLOY terbaca 400 MT dan
 * SETIAP lot Sales yang baru dibuang diam-diam oleh pagar obtained.
 *
 *     cycles : Obtained #1 800 (SPI 27/11/2025)
 *            + Obtained #2 200 (SPI Perubahan 09/09/2026)   = 1.000
 *     stats  : GL BORON 400 + PPGL CARBON 400               =   800   <-- 200 hilang
 *
 * Skrip ini menambahkan 200 MT itu ke available_mt baris GL milik AMP. Tidak
 * menyentuh cycles, tidak menyentuh utilization_mt, tidak menyentuh company
 * lain. Sesudahnya atap GL jadi 600, dan kedua lot Sales (64 + 100 MT) masuk
 * sendiri saat payload dibangun ulang — lihat
 * iqdash/tests/test_lot_dibuang_atap_obtained.php yang mensimulasikan persis
 * perubahan ini.
 *
 * Baris ditulis LENGKAP: GoogleSheets::updateAssoc() menulis ulang seluruh
 * baris dan mengosongkan setiap kolom yang tidak disertakan. Sesudah menulis,
 * barisnya DIBACA ULANG — klaim "tersimpan" tanpa membaca ulang tidak
 * membuktikan apa pun.
 *
 * Dry run dulu:   php tools/selaraskan_stats_amp.php
 * Baru terapkan:  php tools/selaraskan_stats_amp.php --terapkan
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';

const KODE      = 'AMP';
const TAMBAHAN  = 200.0;    // Obtained #2, SPI Perubahan 09/09/2026

$terapkan = in_array('--terapkan', $argv, true);
$cfg = sc_config(); $SID = $cfg['spreadsheets']['iqdash']; $gs = new GoogleSheets();

/* ── 1. Pastikan dulu selisihnya memang masih ada ──────────────────────── */
$obCycles = 0.0; $rincian = [];
foreach ($gs->table($SID, 'cycles', false)['rows'] as $r) {
    if (strtoupper(trim((string)($r['company_code'] ?? ''))) !== KODE) continue;
    if (!preg_match('/^obtained\b/i', (string)($r['cycle_type'] ?? ''))) continue;
    $rd = trim((string)($r['release_date'] ?? ''));
    if ($rd === '' || preg_match('/^tba$/i', $rd)) continue;
    $mt = (float)($r['mt'] ?? 0);
    $obCycles += $mt;
    $rincian[] = sprintf('%s %s MT (terbit %s)', $r['cycle_type'], number_format($mt, 0, ',', '.'), $rd);
}

$statsTbl = $gs->table($SID, 'company_product_stats', false);
$barisGL = null; $obStats = 0.0;
foreach ($statsTbl['rows'] as $r) {
    if (strtoupper(trim((string)($r['company_code'] ?? ''))) !== KODE) continue;
    $obStats += (float)($r['utilization_mt'] ?? 0) + (float)($r['available_mt'] ?? 0);
    if (preg_match('/^GL\s+(ALLOY|BORON)$/i', trim((string)($r['product'] ?? '')))) $barisGL = $r;
}

echo ($terapkan ? "=== TERAPKAN ===" : "=== DRY RUN (tidak menulis apa pun) ===") . "\n\n";
echo "Obtained menurut cycles : " . number_format($obCycles, 0, ',', '.') . " MT\n";
foreach ($rincian as $x) echo "    · $x\n";
echo "Obtained menurut stats  : " . number_format($obStats, 0, ',', '.') . " MT\n";
echo "Selisih                 : " . number_format($obCycles - $obStats, 0, ',', '.') . " MT\n\n";

if ($barisGL === null) { fwrite(STDERR, "Baris stats GL untuk " . KODE . " tidak ketemu — berhenti.\n"); exit(1); }

$selisih = $obCycles - $obStats;
if (abs($selisih - TAMBAHAN) > 0.001) {
    fwrite(STDERR, "BERHENTI: selisihnya " . number_format($selisih, 3, ',', '.')
        . " MT, bukan " . number_format(TAMBAHAN, 0, ',', '.') . " MT seperti yang skrip ini harapkan.\n"
        . "Datanya sudah berubah sejak diagnosis. Periksa ulang sebelum melanjutkan.\n");
    exit(1);
}

$lama = (float)($barisGL['available_mt'] ?? 0);
$baru = $lama + TAMBAHAN;
printf("Baris stats id=%s  product=%s  (baris sheet %d)\n", $barisGL['id'] ?? '?', $barisGL['product'] ?? '?', $barisGL['_row']);
printf("  utilization_mt : %s  (TIDAK diubah)\n", (string)($barisGL['utilization_mt'] ?? ''));
printf("  available_mt   : %s  ->  %s\n\n", number_format($lama, 0, ',', '.'), number_format($baru, 0, ',', '.'));
echo "Sesudahnya: atap GL 600 MT -> lot 64 + 100 MT ikut terhitung -> terpakai 564, sisa 36.\n";

if (!$terapkan) { echo "\nDry run selesai. Jalankan ulang dengan --terapkan kalau sudah benar.\n"; exit(0); }

/* ── 2. Tulis baris LENGKAP ────────────────────────────────────────────── */
$sheetRow = $barisGL['_row'];
$assoc = $barisGL;
unset($assoc['_row']);
$assoc['available_mt'] = $baru;
$gs->updateAssoc($SID, 'company_product_stats', $sheetRow, $assoc);

/* ── 3. Baca ulang ─────────────────────────────────────────────────────── */
$cek = null;
foreach ($gs->table($SID, 'company_product_stats', false)['rows'] as $r) {
    if ((string)($r['id'] ?? '') === (string)($barisGL['id'] ?? '')) { $cek = $r; break; }
}
if ($cek === null) { fwrite(STDERR, "PERIKSA: baris id " . ($barisGL['id'] ?? '?') . " tidak ketemu sesudah menulis.\n"); exit(1); }

$okAvail = abs((float)($cek['available_mt'] ?? 0) - $baru) < 0.001;
$okUtuh  = true; $rusak = [];
foreach ($assoc as $k => $v) {
    if ($k === 'available_mt') continue;
    if ((string)($cek[$k] ?? '') !== (string)$v) { $okUtuh = false; $rusak[] = "$k: '" . (string)($cek[$k] ?? '') . "' (harusnya '" . (string)$v . "')"; }
}
echo "\nBACA ULANG:\n";
echo '  available_mt = ' . (string)($cek['available_mt'] ?? '') . ($okAvail ? "  OK\n" : "  TIDAK COCOK\n");
echo $okUtuh ? "  seluruh kolom lain utuh  OK\n" : "  KOLOM RUSAK: " . implode(' | ', $rusak) . "\n";

@unlink(rtrim($cfg['cache_dir'] ?? (__DIR__ . '/../cache'), '/') . '/iqdash_payload.json');
echo "\nMemo payload dihapus — dashboard akan menghitung ulang.\n";
exit(($okAvail && $okUtuh) ? 0 : 1);
