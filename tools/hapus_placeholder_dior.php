<?php
/**
 * Hapus siklus placeholder kembar DIOR — Obtained #2/#3/#4/#5.
 *
 * ══ KENAPA ═════════════════════════════════════════════════════════════════
 * DIOR memegang EMPAT siklus yang isinya sama persis: masing-masing 100 MT
 * GL ALLOY, tanpa satu pun tanggal (release/pertek/spi kosong). Keempatnya
 * lahir dari alur revisi yang dijalankan berulang kali.
 *
 * Hari ini tidak berbahaya: _isObtainedTerbit() menggugurkan siklus Obtained
 * #N yang tanpa tanggal, jadi tidak satu pun ikut dihitung. Bahayanya nanti —
 * begitu SPI Perubahan terbit dan seseorang mengisi tanggalnya di lebih dari
 * satu baris, DIOR terhitung sampai 400 MT untuk kuota yang hanya 100 MT.
 * Itu persis kelas bug duplikat GIS (Obtained #2 mengulang komponen revisi,
 * membuat kartu Obtained kelebihan 75 MT) yang baru dibereskan 28-Agu-2026.
 *
 * Diminta tim 28-Agu-2026 untuk dihapus seluruhnya.
 *
 * ══ AMAN DIHAPUS SEMUA ═════════════════════════════════════════════════════
 * Tidak perlu menyisakan satu sebagai penampung SPI Perubahan nanti:
 * iq_record_obtained() MEMBUAT sendiri baris siklusnya kalau (company_code,
 * cycle_type) belum ada. Jadi "📌 Catat Terbit" tetap bekerja sesudah ini.
 *
 * ══ PAGAR ══════════════════════════════════════════════════════════════════
 * Yang dihapus HANYA baris yang memenuhi SEMUA syarat:
 *   · company_code = DIOR
 *   · cycle_type   = Obtained #2 / #3 / #4 / #5
 *   · release_date, pertek_date, DAN spi_date ketiganya kosong
 * Satu tanggal saja terisi -> baris itu dilewati dan skrip berhenti. Siklus
 * yang sudah punya tanggal bukan placeholder; ia catatan kuota sungguhan.
 *
 * Baris `cycle_products` milik siklus yang dihapus ikut dibuang — kalau
 * ditinggal, ia jadi yatim dan menempel ke siklus lain saat id dipakai ulang.
 *
 * ══ CARA MENJALANKAN ═══════════════════════════════════════════════════════
 *   php tools/hapus_placeholder_dior.php            # rencana saja
 *   php tools/hapus_placeholder_dior.php --apply    # hapus
 */

require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

const CO    = 'DIOR';
const TARGET = ['Obtained #2', 'Obtained #3', 'Obtained #4', 'Obtained #5'];

$apply = in_array('--apply', $argv ?? [], true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'] ?? null;
if (!$sid) { fwrite(STDERR, "spreadsheet id iqdash tidak ada di config.php\n"); exit(1); }

$gs = new GoogleSheets();
$gs->cacheClear();

echo $apply ? "MODE: HAPUS\n\n" : "MODE: RENCANA SAJA (tambahkan --apply untuk menghapus)\n\n";

$cyTbl = $gs->table($sid, 'cycles');
$cpTbl = $gs->table($sid, 'cycle_products');
$cycles = $cyTbl['rows'];
$cprods = $cpTbl['rows'];

$kosong = fn($v): bool => trim((string) $v) === '';

echo "── SIKLUS YANG AKAN DIHAPUS ─────────────────────────────────────────\n";
$idxHapus = []; $idHapus = []; $batal = [];
foreach ($cycles as $i => $c) {
    if ((string)($c['company_code'] ?? '') !== CO) continue;
    $type = trim((string)($c['cycle_type'] ?? ''));
    if (!in_array($type, TARGET, true)) continue;

    $rd = (string)($c['release_date'] ?? '');
    $pd = (string)($c['pertek_date'] ?? '');
    $sd = (string)($c['spi_date'] ?? '');
    if (!$kosong($rd) || !$kosong($pd) || !$kosong($sd)) {
        $batal[] = sprintf('%s (id %s) punya tanggal — release "%s", pertek "%s", spi "%s"',
            $type, $c['id'] ?? '', $rd, $pd, $sd);
        continue;
    }

    $idxHapus[] = $i;
    $idHapus[(string)($c['id'] ?? '')] = $type;
    printf("   id=%-6s %-14s mt %-6s release '%s' pertek '%s' spi '%s'\n",
        $c['id'] ?? '', $type, $c['mt'] ?? '', $rd, $pd, $sd);
}

if ($batal) {
    echo "\n── DIHENTIKAN ───────────────────────────────────────────────────────\n";
    foreach ($batal as $b) echo "   ⚠ $b\n";
    echo "   Siklus yang sudah punya tanggal BUKAN placeholder — ia catatan kuota\n";
    echo "   sungguhan. Tidak ada yang dihapus. Periksa dulu dengan tim.\n";
    exit(1);
}
if (!$idxHapus) { echo "   (tidak ada yang cocok — mungkin sudah dihapus)\n"; exit(0); }

echo "\n── cycle_products yang ikut terbuang ────────────────────────────────\n";
$idxCp = [];
foreach ($cprods as $i => $cp) {
    $cid = (string)($cp['cycle_id'] ?? '');
    if (!isset($idHapus[$cid])) continue;
    $idxCp[] = $i;
    printf("   cycle %-6s (%-14s) %-32s %s\n", $cid, $idHapus[$cid], $cp['product'] ?? '', $cp['mt'] ?? '');
}
if (!$idxCp) echo "   (tidak ada)\n";

printf("\n   %d baris cycles · %d baris cycle_products\n", count($idxHapus), count($idxCp));

echo "\n── DAMPAK ───────────────────────────────────────────────────────────\n";
echo "   NOL perubahan angka. Keempatnya tanpa tanggal, jadi sudah digugurkan\n";
echo "   _isObtainedTerbit() dan tidak pernah ikut hitungan mana pun.\n";
echo "   Yang hilang hanya potensi salah hitung di kemudian hari.\n";
echo "   'Catat Terbit' tetap bekerja — iq_record_obtained() membuat sendiri\n";
echo "   baris siklusnya kalau belum ada.\n";

if (!$apply) {
    echo "\n─────────────────────────────────────────────────────────────────────\n";
    echo "Tidak ada yang dihapus. Jalankan ulang dengan --apply bila sudah cocok.\n";
    exit(0);
}

$sisaCy = [];
foreach ($cycles as $i => $c) if (!in_array($i, $idxHapus, true)) $sisaCy[] = $c;
$sisaCp = [];
foreach ($cprods as $i => $x) if (!in_array($i, $idxCp, true)) $sisaCp[] = $x;

iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'cycles',         'rows' => $sisaCy, 'headers' => $cyTbl['headers']],
    ['tab' => 'cycle_products', 'rows' => $sisaCp, 'headers' => $cpTbl['headers']],
]);
$gs->cacheClear();
printf("\n✓ Dihapus: %d siklus + %d cycle_products. Cache dibersihkan.\n", count($idxHapus), count($idxCp));
