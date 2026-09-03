<?php
/**
 * DIOR: revisi Bordes Alloy -> GL Alloy dijadikan PENGGANTIAN, bukan tambahan.
 *
 * MASALAHNYA
 * ----------
 * Sesudah duplikatnya dibersihkan, DIOR masih membaca obtained 200 MT untuk
 * kuota yang hanya 100 — dan Available Quota menulis "obt 100 · sisa 200".
 * Obtained #1 (Bordes 100) dan Obtained #2 (GL Alloy 100) sama-sama dihitung,
 * padahal yang kedua MENGGANTIKAN yang pertama.
 *
 * POLA YANG SUDAH BEKERJA
 * -----------------------
 * BDG dan MJU menyatakan penggantian lewat DELTA bertanda pada siklus revisi:
 *
 *     BDG  Revision #2            produk {BORDES ALLOY: -350, GI ALLOY: +350}
 *          Obtained (Revision #2) produk []              mt 0
 *
 * Sisi negatifnya yang membuat totalnya tidak menggelembung. DIOR hanya punya
 * sisi positif — {GL ALLOY: +100} — plus Obtained #2 penuh 100 MT, jadi ia
 * MENAMBAH alih-alih MEMINDAHKAN.
 *
 * Diuji empat bentuk di sisi klien sebelum menulis:
 *
 *     sekarang                          canonicalObtained 200, sisa 200
 *     delta saja                        200 — tidak cukup
 *     nolkan Obtained #1                100, tapi baris riwayat jadi obt 6.000
 *     delta + Obtained #2 jadi mt 0     100, sisa 100   <- yang dipakai
 *
 * YANG DIUBAH
 * -----------
 *   1. cycle_products siklus revisi ditambah baris BORDES ALLOY -100;
 *   2. Obtained #2 disetel mt 0 dan baris cycle_products-nya dihapus.
 *      Barisnya TETAP ada — ia yang membawa tanggal & nomor SPI Perubahan,
 *      persis seperti "Obtained (Revision #N)" milik BDG/MJU.
 *
 * PAGAR
 * -----
 *   1. hanya DIOR;
 *   2. tonase delta diambil dari siklus revisi itu sendiri, tidak dikarang;
 *   3. sesudahnya obtained DIOR wajib 100 (bukan 200, bukan 0) — disimulasikan
 *      lebih dulu lewat payload; kalau meleset, tidak ada yang ditulis;
 *   4. company lain tidak boleh bergeser sepeser pun.
 *
 * Dry-run:   php tools/dior_revisi_jadi_penggantian.php
 * Terapkan:  php tools/dior_revisi_jadi_penggantian.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

const CO = 'DIOR';
$APPLY = in_array('--apply', $argv, true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$t     = iq_load_tables($gs, $sid);
$cyTbl = $gs->table($sid, 'cycles');
$cpTbl = $gs->table($sid, 'cycle_products');
$cycles = $cyTbl['rows'];
$cprod  = $cpTbl['rows'];

$aliasMap = iq_alias_map($gs, $sid);
$kanon = fn($p) => iq_canon_product((string) $p, $aliasMap);

/* ── Temukan siklus revisi & Obtained penggantinya ──────────────────────── */
$rev = null; $obt2 = null;
foreach ($cycles as $c) {
    if ((string) ($c['company_code'] ?? '') !== CO) continue;
    $ty = trim((string) ($c['cycle_type'] ?? ''));
    if (preg_match('/^Revision Request/i', $ty)) $rev = $c;
    if ($ty === 'Obtained #2') $obt2 = $c;
}
if (!$rev || !$obt2) { echo "BERHENTI: siklus revisi atau Obtained #2 tidak ketemu.\n"; exit(1); }

$prodRev = [];
foreach ($cprod as $x) if ((string) ($x['cycle_id'] ?? '') === (string) $rev['id']) $prodRev[] = $x;
$prodObt = [];
foreach ($cprod as $x) if ((string) ($x['cycle_id'] ?? '') === (string) $obt2['id']) $prodObt[] = $x;

if (count($prodRev) !== 1 || count($prodObt) !== 1) {
    printf("BERHENTI: bentuk tak terduga — revisi punya %d baris produk, Obtained #2 punya %d.\n",
        count($prodRev), count($prodObt));
    exit(1);
}
$produkBaru = $kanon($prodRev[0]['product'] ?? '');
$mt = iq_num($prodRev[0]['mt'] ?? 0);

/* Produk LAMA diambil dari nama siklus revisi ("Revision Request — BORDES ALLOY"),
   bukan ditebak. */
if (!preg_match('/^Revision Request\s*[—–-]\s*(.+)$/u', trim((string) $rev['cycle_type']), $m)) {
    echo "BERHENTI: nama siklus revisi tidak menyebut produk asal.\n"; exit(1);
}
$produkLama = $kanon($m[1]);
if ($produkLama === '' || $produkBaru === '' || $produkLama === $produkBaru) {
    echo "BERHENTI: produk asal & tujuan sama atau kosong — bukan penggantian.\n"; exit(1);
}
if ($mt <= 0) { echo "BERHENTI: tonase revisi bukan angka positif.\n"; exit(1); }

echo "\n── RENCANA ──────────────────────────────────────────────────────────\n";
printf("  Siklus revisi  : %s (id %s)\n", $rev['cycle_type'], $rev['id']);
printf("  Penggantian    : %s -> %s, %s MT\n", $produkLama, $produkBaru, $mt);
printf("  cycle_products : TAMBAH baris %s = -%s pada siklus revisi\n", $produkLama, $mt);
printf("  Obtained #2    : mt %s -> 0, baris produknya (id %s) dihapus\n",
    $obt2['mt'] ?? '', $prodObt[0]['id'] ?? '');
echo "                   barisnya TETAP ada — ia pembawa tanggal & nomor SPI.\n";

/* ── Susun keadaan sesudah ──────────────────────────────────────────────── */
$maxCp = 0; foreach ($cprod as $x) { $n = (int) ($x['id'] ?? 0); if ($n > $maxCp) $maxCp = $n; }
$cpBaru = [];
foreach ($cprod as $x) {
    if ((string) ($x['id'] ?? '') === (string) ($prodObt[0]['id'] ?? '')) continue;   // dihapus
    $cpBaru[] = $x;
}
$cpBaru[] = ['id' => (string) ($maxCp + 1), 'cycle_id' => (string) $rev['id'],
             'product' => $produkLama, 'mt' => (string) (-$mt), 'source_program' => 'B'];

$cyBaru = [];
foreach ($cycles as $c) {
    if ((string) ($c['id'] ?? '') === (string) $obt2['id']) $c['mt'] = '0';
    $cyBaru[] = $c;
}

/* ── Simulasi ───────────────────────────────────────────────────────────── */
$sebelum = iq_build_payload($t);
$t2 = $t; $t2['cycles'] = $cyBaru; $t2['cycleProducts'] = $cpBaru;
$sesudah = iq_build_payload($t2);

$ambil = function (array $pl, string $code) {
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c)
        if (($c['code'] ?? '') === $code) return $c;
    return null;
};
$obtCo = function (?array $c) {
    $n = 0;
    foreach (($c['utilizationByProd'] ?? []) as $v) $n += iq_num($v);
    foreach (($c['availableByProd'] ?? []) as $v) $n += iq_num($v);
    return round($n, 3);
};

$a = $ambil($sebelum, CO); $b = $ambil($sesudah, CO);
echo "\n── SIMULASI ─────────────────────────────────────────────────────────\n";
printf("  DIOR util  : %s -> %s\n", json_encode($a['utilizationByProd'] ?? []), json_encode($b['utilizationByProd'] ?? []));
printf("  DIOR avail : %s -> %s\n", json_encode($a['availableByProd'] ?? []), json_encode($b['availableByProd'] ?? []));
printf("  DIOR obtained: %s -> %s   (harus %s)\n", $obtCo($a), $obtCo($b), $mt);

$geser = [];
foreach (array_merge($sesudah['spi'] ?? [], $sesudah['pending'] ?? []) as $c) {
    $code = $c['code'] ?? ''; if ($code === CO) continue;
    $x = $ambil($sebelum, $code);
    if (json_encode($x['utilizationByProd'] ?? []) !== json_encode($c['utilizationByProd'] ?? [])
     || json_encode($x['availableByProd'] ?? [])  !== json_encode($c['availableByProd'] ?? [])) $geser[] = $code;
}
printf("  Company lain bergeser: %s\n", $geser ? implode(', ', $geser) : 'tidak ada');

$lolos = true;
if (abs($obtCo($b) - $mt) > 0.001) { printf("\n  PAGAR 3 GAGAL: obtained DIOR %s, seharusnya %s\n", $obtCo($b), $mt); $lolos = false; }
if ($geser) { echo "\n  PAGAR 4 GAGAL: company lain ikut berubah.\n"; $lolos = false; }
if (!$lolos) { echo "\nTIDAK ADA YANG DITULIS.\n"; exit(1); }
echo "\n  Pagar lolos.\n";

if (!$APPLY) { echo "\nDry-run — belum menulis apa pun. Ulangi dengan --apply.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/dior_sebelum_delta_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode(['cycles' => $cycles, 'cycle_products' => $cprod]));
echo "Cadangan: $cad\n";

iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'cycles',         'rows' => $cyBaru, 'headers' => $cyTbl['headers']],
    ['tab' => 'cycle_products', 'rows' => $cpBaru, 'headers' => $cpTbl['headers']],
]);
echo "Selesai. Revisi DIOR kini penggantian, bukan tambahan.\n";
