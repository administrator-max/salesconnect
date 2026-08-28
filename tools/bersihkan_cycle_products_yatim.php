<?php
/**
 * Buang baris `cycle_products` yatim — rincian produk yang siklusnya sudah
 * tidak ada lagi.
 *
 * ══ KENAPA ADA YANG YATIM ══════════════════════════════════════════════════
 * Siklus dan rincian produknya hidup di DUA tab: `cycles` dan `cycle_products`
 * (dikaitkan lewat `cycle_id`). Menghapus baris siklus TIDAK otomatis membuang
 * rinciannya. Rekonsiliasi 28-Agu-2026 membuang siklus duplikat GIS
 * `Obtained #2` (id 42271) tapi meninggalkan baris cycle_products-nya — itu
 * kelalaian skrip rekonsiliasi, bukan kondisi normal.
 *
 * Yatim tidak ikut dihitung: iq_get_cycles_for() hanya membaca cycle_products
 * yang `cycle_id`-nya ada di daftar siklus. Jadi ia tidak mengubah angka mana
 * pun. Yang dibersihkan adalah sampahnya — dan risiko kecil kalau suatu saat
 * id lama dipakai ulang, rincian usang itu menempel ke siklus yang salah.
 *
 * ══ PAGAR ══════════════════════════════════════════════════════════════════
 * Hanya baris yang `cycle_id`-nya BENAR-BENAR tidak ada di tab `cycles` yang
 * dibuang. Baris tanpa `cycle_id` sama sekali DIBIARKAN — itu bentuk yang
 * tidak dikenali, dan menebak maksudnya lebih berbahaya daripada
 * membiarkannya.
 *
 * ══ CARA MENJALANKAN ═══════════════════════════════════════════════════════
 *   php tools/bersihkan_cycle_products_yatim.php            # rencana saja
 *   php tools/bersihkan_cycle_products_yatim.php --apply    # buang
 */

require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

$apply = in_array('--apply', $argv ?? [], true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'] ?? null;
if (!$sid) { fwrite(STDERR, "spreadsheet id iqdash tidak ada di config.php\n"); exit(1); }

$gs = new GoogleSheets();
$gs->cacheClear();
$gs->warmValues($sid, ['cycles', 'cycle_products']);

echo $apply ? "MODE: BUANG\n\n" : "MODE: RENCANA SAJA (tambahkan --apply untuk membuang)\n\n";

$cyRows = $gs->table($sid, 'cycles')['rows'];
$cpTbl  = $gs->table($sid, 'cycle_products');
$cprods = $cpTbl['rows'];

$adaId = [];
foreach ($cyRows as $c) { $id = (string)($c['id'] ?? ''); if ($id !== '') $adaId[$id] = true; }

echo "── BARIS YATIM ──────────────────────────────────────────────────────\n";
$idxBuang = []; $tanpaId = 0;
foreach ($cprods as $i => $cp) {
    $cid = trim((string)($cp['cycle_id'] ?? ''));
    if ($cid === '') { $tanpaId++; continue; }        // bentuk tak dikenal — dibiarkan
    if (isset($adaId[$cid])) continue;
    $idxBuang[] = $i;
    printf("   cycle_id %-8s %-34s mt %s\n", $cid, $cp['product'] ?? '', $cp['mt'] ?? '');
}
if (!$idxBuang) echo "   (tidak ada — sudah bersih)\n";
if ($tanpaId)   printf("\n   %d baris tanpa cycle_id DIBIARKAN (bentuk tidak dikenali).\n", $tanpaId);

printf("\n   %d dari %d baris cycle_products akan dibuang.\n", count($idxBuang), count($cprods));
echo "\n── DAMPAK ───────────────────────────────────────────────────────────\n";
echo "   NOL perubahan angka. iq_get_cycles_for() hanya membaca rincian yang\n";
echo "   cycle_id-nya ada di daftar siklus, jadi baris yatim memang tidak\n";
echo "   pernah terbaca. Yang hilang hanya sampahnya.\n";

if (!$idxBuang) exit(0);

if (!$apply) {
    echo "\n─────────────────────────────────────────────────────────────────────\n";
    echo "Tidak ada yang dibuang. Jalankan ulang dengan --apply bila sudah cocok.\n";
    exit(0);
}

$sisa = [];
foreach ($cprods as $i => $x) if (!in_array($i, $idxBuang, true)) $sisa[] = $x;
iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'cycle_products', 'rows' => $sisa, 'headers' => $cpTbl['headers']],
]);
$gs->cacheClear();
printf("\n✓ Dibuang %d baris. Cache dibersihkan.\n", count($idxBuang));
