<?php
/**
 * Catat PERTEK Perubahan DIOR — 25/08/2026, Wear Plate 100 MT → GL Alloy 100 MT.
 *
 * ══ KENAPA LEWAT SKRIP ═════════════════════════════════════════════════════
 * Diminta tim 28-Agu-2026. Revisi DIOR sudah dikonfirmasi CorpSec (siklus
 * "Revision Request — BORDES ALLOY", GL ALLOY 100 MT) tapi tanggal PERTEK
 * Perubahan-nya belum pernah tercatat di mana pun, sehingga seluruh dashboard
 * masih menampilkan produk lama. Tidak ada yang bisa dibaca sistem dari
 * tanggal yang tidak ada.
 *
 * ══ BENTUK YANG DIIKUTI ════════════════════════════════════════════════════
 * SAMA PERSIS dengan SMS, satu-satunya company yang revisinya tercatat rapi
 * pada siklus Revision Request-nya sendiri:
 *
 *   SMS  Revision Request — SHEETPILE | release_type PERTEK Perubahan
 *                                     | pertek_date 26/06/2026
 *                                     | spi_date    10/07/2026
 *
 * DIOR mendapat bentuk yang sama, tapi `spi_date` DIBIARKAN KOSONG — tim
 * menyatakan SPI Perubahannya masih proses. Mengisinya dengan tanggal karangan
 * akan membuat DIOR tampil 🟢 Active padahal SPI-nya belum terbit.
 *
 * ══ YANG DIUBAH ════════════════════════════════════════════════════════════
 * · cycles                : siklus Revision Request DIOR diberi
 *                           release_type 'PERTEK Perubahan' + pertek_date.
 * · company_product_stats : saldo 100 MT pindah dari BORDES ALLOY ke GL ALLOY.
 *                           Barisnya DITAMBAH kalau belum ada.
 * · company_products      : daftar produk DIOR ikut jadi GL ALLOY.
 *
 * `utilization_mt` tidak disentuh (DIOR 0, belum ada pengapalan).
 * Total Obtained DIOR TIDAK berubah — tetap 100 MT, hanya produknya berpindah.
 *
 * ══ TIDAK DISENTUH ═════════════════════════════════════════════════════════
 * DIOR punya EMPAT siklus placeholder kembar: Obtained #2/#3/#4/#5, masing-
 * masing 100 MT GL ALLOY tanpa tanggal. Semuanya digugurkan _isObtainedTerbit()
 * selama tanggalnya kosong, jadi tidak berbahaya HARI INI — tapi begitu ada
 * yang mengisi tanggal SPI di lebih dari satu, DIOR terhitung sampai 400 MT.
 * Itu persis kelas bug duplikat GIS. Skrip ini SENGAJA tidak menghapusnya:
 * membuang baris siklus adalah keputusan tim, bukan efek samping pencatatan
 * tanggal. Dilaporkan terpisah.
 *
 * ══ CARA MENJALANKAN ═══════════════════════════════════════════════════════
 *   php tools/catat_pertek_perubahan_dior.php            # rencana saja
 *   php tools/catat_pertek_perubahan_dior.php --apply    # tulis
 */

require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

const CO           = 'DIOR';
const PERTEK_BARU  = '25/08/2026';
const PRODUK_LAMA  = 'BORDES ALLOY';
const PRODUK_BARU  = 'GL ALLOY';
const MT_PINDAH    = 100;

$apply = in_array('--apply', $argv ?? [], true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'] ?? null;
if (!$sid) { fwrite(STDERR, "spreadsheet id iqdash tidak ada di config.php\n"); exit(1); }

$gs = new GoogleSheets();
$gs->cacheClear();

echo $apply ? "MODE: TULIS\n\n" : "MODE: RENCANA SAJA (tambahkan --apply untuk menulis)\n\n";

$cyTbl = $gs->table($sid, 'cycles');
$stTbl = $gs->table($sid, 'company_product_stats');
$cpTbl = $gs->table($sid, 'company_products');
$cycles = $cyTbl['rows']; $stats = $stTbl['rows']; $cprod = $cpTbl['rows'];

/* ── 1. Siklus Revision Request DIOR ────────────────────────────────────── */
echo "── 1. cycles · tanggal PERTEK Perubahan ─────────────────────────────\n";
$revIdx = null;
foreach ($cycles as $i => $c) {
    if ((string)($c['company_code'] ?? '') !== CO) continue;
    if (stripos((string)($c['cycle_type'] ?? ''), 'Revision Request') !== 0) continue;
    $revIdx = $i; break;
}
if ($revIdx === null) {
    fwrite(STDERR, "Siklus 'Revision Request' milik " . CO . " tidak ditemukan — dihentikan.\n");
    exit(1);
}
$r = $cycles[$revIdx];
printf("   siklus       : %s (id %s)\n", $r['cycle_type'] ?? '', $r['id'] ?? '');
printf("   release_type : %-32s -> %s\n", (string)($r['release_type'] ?? '') ?: '(kosong)', 'PERTEK Perubahan');
printf("   pertek_date  : %-32s -> %s\n", (string)($r['pertek_date'] ?? '') ?: '(kosong)', PERTEK_BARU);
printf("   spi_date     : %-32s -> %s  (SPI Perubahan masih proses)\n", (string)($r['spi_date'] ?? '') ?: '(kosong)', '(dibiarkan kosong)');

/* ── 2. Saldo per produk ────────────────────────────────────────────────── */
echo "\n── 2. company_product_stats · saldo pindah produk ───────────────────\n";
$idxLama = null; $idxBaru = null; $maxId = 0;
foreach ($stats as $i => $s) {
    $n = (int)($s['id'] ?? 0); if ($n > $maxId) $maxId = $n;
    if ((string)($s['company_code'] ?? '') !== CO) continue;
    if (trim((string)($s['product'] ?? '')) === PRODUK_LAMA) $idxLama = $i;
    if (trim((string)($s['product'] ?? '')) === PRODUK_BARU) $idxBaru = $i;
}
if ($idxLama === null) { fwrite(STDERR, "Baris stats " . CO . '/' . PRODUK_LAMA . " tidak ditemukan — dihentikan.\n"); exit(1); }

$utilLama  = iq_num($stats[$idxLama]['utilization_mt'] ?? 0);
$availLama = iq_num($stats[$idxLama]['available_mt'] ?? 0);
if (abs($availLama - MT_PINDAH) > 0.001 || $utilLama > 0.001) {
    printf("   ⚠ saldo %s tidak seperti yang diharapkan (util %s, avail %s vs %s MT).\n",
        PRODUK_LAMA, $utilLama, $availLama, MT_PINDAH);
    printf("     Dihentikan — angka yang tidak sesuai harapan tidak boleh ditimpa diam-diam.\n");
    if (!$apply) { /* mode rencana boleh lanjut menampilkan */ } else { exit(1); }
}
printf("   %-32s util %-6s avail %-6s -> avail %s\n", CO . '/' . PRODUK_LAMA, $utilLama, $availLama, 0);
printf("   %-32s %s -> util 0  avail %s\n", CO . '/' . PRODUK_BARU,
    $idxBaru === null ? '(baris BELUM ADA, akan dibuat)' : 'baris sudah ada', MT_PINDAH);

/* ── 3. Daftar produk company ───────────────────────────────────────────── */
echo "\n── 3. company_products · daftar produk ──────────────────────────────\n";
$cpIdx = null; $cpMax = 0;
foreach ($cprod as $i => $x) {
    $n = (int)($x['id'] ?? 0); if ($n > $cpMax) $cpMax = $n;
    if ((string)($x['company_code'] ?? '') !== CO) continue;
    if (trim((string)($x['product'] ?? '')) === PRODUK_LAMA) $cpIdx = $i;
}
printf("   %s -> %s%s\n", PRODUK_LAMA, PRODUK_BARU, $cpIdx === null ? '  (baris tidak ketemu — dilewati)' : '');

echo "\n── DAMPAK ───────────────────────────────────────────────────────────\n";
echo "   Obtained DIOR TETAP 100 MT — hanya produknya berpindah.\n";
echo "   Drill Overview & tab PERTEK & SPI akan menampilkan GL ALLOY 100 MT,\n";
echo "   PERTEK " . PERTEK_BARU . ", SPI '-' (masih proses) → status '⏳ Belum terbit'.\n";
echo "   Available Quota DIOR tetap 100 MT, berpindah ke GL ALLOY.\n";

echo "\n   TIDAK disentuh: 4 siklus placeholder kembar Obtained #2/#3/#4/#5\n";
echo "   (masing-masing 100 MT GL ALLOY tanpa tanggal). Dilaporkan terpisah.\n";

if (!$apply) {
    echo "\n─────────────────────────────────────────────────────────────────────\n";
    echo "Tidak ada yang ditulis. Jalankan ulang dengan --apply bila sudah cocok.\n";
    exit(0);
}

/* ── TULIS ───────────────────────────────────────────────────────────────── */
$cycles[$revIdx]['release_type'] = 'PERTEK Perubahan';
$cycles[$revIdx]['pertek_date']  = PERTEK_BARU;

$stats[$idxLama]['available_mt'] = '0';
if ($idxBaru !== null) {
    $stats[$idxBaru]['utilization_mt'] = '0';
    $stats[$idxBaru]['available_mt']   = (string) MT_PINDAH;
} else {
    $stats[] = [
        'id' => (string)($maxId + 1), 'company_code' => CO, 'product' => PRODUK_BARU,
        'utilization_mt' => '0', 'available_mt' => (string) MT_PINDAH,
        'realization_mt' => '', 'eta_jkt' => '', 'arrived' => false, 'source_program' => 'B',
    ];
}
if ($cpIdx !== null) $cprod[$cpIdx]['product'] = PRODUK_BARU;

iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'cycles',                'rows' => $cycles, 'headers' => $cyTbl['headers']],
    ['tab' => 'company_product_stats', 'rows' => $stats,  'headers' => $stTbl['headers']],
    ['tab' => 'company_products',      'rows' => $cprod,  'headers' => $cpTbl['headers']],
]);
$gs->cacheClear();
echo "\n✓ Ditulis. Cache dibersihkan. Muat ulang dashboard (Ctrl+F5).\n";
