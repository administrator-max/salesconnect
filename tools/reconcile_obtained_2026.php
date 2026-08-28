<?php
/**
 * Rekonsiliasi Obtained & Available 2026 — menyelaraskan data dengan angka yang
 * dipegang tim, dan membuang satu siklus duplikat di GIS.
 *
 * ══ KENAPA ADA SKRIP INI ═══════════════════════════════════════════════════
 * Dua permukaan dashboard membaca dua sumber berbeda untuk hal yang sama:
 *
 *   kartu Overview        -> siklus (canonicalObtained)         35.335 MT
 *   tabel PERTEK & SPI    -> company_product_stats (util+avail)  37.825,5 MT
 *   master tim (Excel)                                           35.260 MT
 *
 * Penelusuran 27-Agu-2026 menemukan DUA cacat yang berbeda:
 *
 *  1. GIS punya siklus `Obtained #2` 75 MT FABRICATED STEEL PAINTED FRAME yang
 *     MENGULANG komponen FSPF 75 di dalam `Obtained (Revision #1)` — tanggal SPI
 *     sama (18/08/2026), produk sama, MT sama. Itulah persis selisih 75 MT
 *     antara kartu (35.335) dan master tim (35.260). Dikonfirmasi tim:
 *     "GIS 75 MT itu terduplikat, GIS hanya punya total 400 MT."
 *
 *  2. `company_product_stats` menyimpan saldo BASI: produk yang sudah
 *     dipindahkan revisi masih memegang `available_mt`, dan beberapa company
 *     punya sisa yang siklus Obtained-nya tidak pernah ada.
 *
 * ══ ANGKA SASARAN ══════════════════════════════════════════════════════════
 * DIBERIKAN LANGSUNG OLEH TIM, 27-Agu-2026. Tidak ada satu angka pun yang
 * diturunkan, ditebak, atau dihitung sendiri oleh skrip ini.
 *
 * ══ APA YANG DIUBAH ════════════════════════════════════════════════════════
 * · cycles               : baris GIS `Obtained #2` DIHAPUS.
 * · company_product_stats: `available_mt` disetel = sasaran − utilization.
 *   Produk yang menurut tim sudah tidak dipegang disetel 0.
 *   `utilization_mt` TIDAK DISENTUH — angkanya punya sumber sendiri (lot
 *   pengapalan) dan direkonsiliasi lewat jalur lain.
 * · companies            : `obtained` dan `available_quota` dihitung ulang dari
 *   baris stats company itu.
 *
 * ══ DAMPAK (disimulasikan lebih dulu atas payload live) ════════════════════
 *   kartu Obtained        35.335 -> 35.260   (cocok master tim)
 *   kartu Available Quota 11.153 -> 11.078
 *   kartu Utilized        24.182 -> 24.182   (tidak berubah)
 *   Σ Obtained tabel      37.825,5 -> 35.260 (akhirnya sama dengan kartu)
 *
 * Yang bergerak di Available Quota HANYA GIS dan MJU:
 *   GIS  Sheet Pile 237,5->0 · WSSP 193->325 · FSPF 44,5->75   (total 475->400)
 *   MJU  Hollow Pipe 160->0 · HRPO Alloy 40->200               (total 200->200)
 * Sepuluh company lain tidak tersentuh — saldo basi mereka memang tidak pernah
 * sampai ke kartu, karena Available Quota sudah membatasi total per company ke
 * angka siklus.
 *
 * ══ CARA MENJALANKAN ═══════════════════════════════════════════════════════
 *   php tools/reconcile_obtained_2026.php                      # rencana saja
 *   php tools/reconcile_obtained_2026.php --only=GIS,BDG       # batasi company
 *   php tools/reconcile_obtained_2026.php --only=... --apply   # tulis
 *
 * `--only` ADA KARENA dry-run 27-Agu-2026 menemukan konflik: pada ADP, HDP,
 * MSN, dan SPA nilai `utilization_mt` MELEBIHI angka obtained yang diberikan
 * tim (ADP 450 vs 350, HDP 1.100 vs 1.000, MSN 350 vs 250, SPA 115 vs 114).
 * Untuk keempatnya, menyetel available ke 0 tidak sampai ke angka tim — malah
 * menaikkan obtained ke tingkat utilisasi. Mana yang benar belum diputuskan
 * tim, jadi keempatnya HARUS bisa dikecualikan alih-alih ditulis dengan angka
 * yang belum tentu benar.
 *
 * Sesudah --apply, jalankan Import Master sekali supaya cache bersih.
 */

require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

/** Kebenaran per company per produk — diberikan tim 27-Agu-2026. */
const SASARAN = [
    'ADP' => ['GL ALLOY' => 350],
    'BDG' => ['GL ALLOY' => 650, 'GI ALLOY' => 350],
    'BHG' => ['PPGL CARBON' => 200, 'GI ALLOY' => 150],
    'GIS' => ['WELDED STAINLESS STEEL PIPE' => 325, 'FABRICATED STEEL PAINTED FRAME' => 75],
    'HDP' => ['GL ALLOY' => 1000],
    'MJU' => ['HRPO ALLOY' => 200],
    'MSN' => ['GL ALLOY' => 250],
    'SMS' => ['GI ALLOY' => 150],
    /* SPA: tim menyebut GI ALLOY 401 sebagai produk aktif, TAPI total company-nya
       tetap 515 (401 GI + 114 BORDES) — dikonfirmasi tim, dan itulah yang membuat
       master berjumlah 35.260 dan bukan 35.146. BORDES 114 karena itu
       DIPERTAHANKAN; hanya 515,5 MT sisa yang tidak berhak yang dibuang. */
    'SPA' => ['GI ALLOY' => 401, 'BORDES ALLOY' => 114],
];

/** Siklus duplikat yang harus hilang: [company_code, cycle_type]. */
const HAPUS_SIKLUS = [['GIS', 'Obtained #2']];

$apply = in_array('--apply', $argv ?? [], true);

/* --only=KODE,KODE — batasi ke company tertentu. Tanpa ini semua company di
   SASARAN ikut. Kode yang tidak dikenal dihentikan sebagai error, bukan
   dilewati diam-diam: salah ketik satu kode berarti company itu tidak ikut
   diperbaiki tanpa ada yang menyadarinya. */
$only = null;
foreach ($argv ?? [] as $a) {
    if (strpos($a, '--only=') !== 0) continue;
    $only = array_values(array_filter(array_map(
        fn($x) => strtoupper(trim($x)), explode(',', substr($a, 7)))));
}
if ($only !== null) {
    $asing = array_diff($only, array_keys(SASARAN));
    if ($asing) {
        fwrite(STDERR, "Kode company tidak dikenal di --only: " . implode(', ', $asing) . "\n");
        fwrite(STDERR, "Yang tersedia: " . implode(', ', array_keys(SASARAN)) . "\n");
        exit(1);
    }
    if (!$only) { fwrite(STDERR, "--only kosong\n"); exit(1); }
}
$ikut = fn(string $code): bool => $only === null || in_array($code, $only, true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'] ?? null;
if (!$sid) { fwrite(STDERR, "spreadsheet id iqdash tidak ada di config.php\n"); exit(1); }

$gs = new GoogleSheets();
$gs->cacheClear();

echo $apply
    ? "MODE: TULIS — spreadsheet akan diubah\n"
    : "MODE: RENCANA SAJA — tidak ada yang ditulis (tambahkan --apply untuk menulis)\n";
if ($only === null) {
    echo "CAKUPAN: SEMUA company (" . implode(', ', array_keys(SASARAN)) . ")\n\n";
} else {
    $lewat = array_values(array_diff(array_keys(SASARAN), $only));
    echo "CAKUPAN: " . implode(', ', $only) . "\n";
    echo "DILEWATI: " . (implode(', ', $lewat) ?: '(tidak ada)') . " — tidak disentuh sama sekali\n\n";
}

$alias = iq_alias_map($gs, $sid);
$kanon = fn(string $p): string => $alias[trim($p)] ?? trim($p);
$fmt   = fn($v): string => rtrim(rtrim(number_format((float)$v, 1, '.', ''), '0'), '.');

$statsTbl  = $gs->table($sid, 'company_product_stats');
$cyTbl     = $gs->table($sid, 'cycles');
$coTbl     = $gs->table($sid, 'companies');
$stats     = $statsTbl['rows'];
$cycles    = $cyTbl['rows'];
$companies = $coTbl['rows'];

/* ── 1. Siklus duplikat ─────────────────────────────────────────────────── */
echo "── 1. SIKLUS DUPLIKAT ───────────────────────────────────────────────\n";
$idxHapus = [];
foreach (HAPUS_SIKLUS as [$code, $type]) {
    if (!$ikut($code)) { printf("   lewat  %s · %s (di luar --only)\n", $code, $type); continue; }
    $ketemu = false;
    foreach ($cycles as $i => $c) {
        if ((string)($c['company_code'] ?? '') !== $code) continue;
        if ((string)($c['cycle_type'] ?? '') !== $type)   continue;
        $idxHapus[] = $i;
        $ketemu = true;
        printf("   HAPUS  %s · %s · mt %s · SPI %s · %s\n",
            $code, $type, $fmt($c['mt'] ?? 0),
            (string)($c['spi_date'] ?? '') ?: (string)($c['release_date'] ?? '-'),
            (string)($c['status'] ?? ''));
    }
    if (!$ketemu) printf("   ??     %s · %s tidak ditemukan (mungkin sudah dihapus)\n", $code, $type);
}

/* ── 2. Saldo per produk ────────────────────────────────────────────────── */
echo "\n── 2. company_product_stats · available_mt ──────────────────────────\n";
printf("   %-5s %-32s %8s %10s %10s %9s\n", 'CO', 'PRODUK', 'util', 'avail', 'avail→', 'selisih');

$ubah = [];
$totalSelisih = 0.0;
$peringatan = [];

foreach (SASARAN as $code => $target) {
    if (!$ikut($code)) continue;
    $adaProduk = [];
    foreach ($stats as $i => $s) {
        if ((string)($s['company_code'] ?? '') !== $code) continue;
        $prod  = (string)($s['product'] ?? '');
        $k     = $kanon($prod);
        $util  = iq_num($s['utilization_mt'] ?? 0);
        $avail = iq_num($s['available_mt'] ?? 0);
        $adaProduk[$k] = true;

        $mau       = array_key_exists($k, $target) ? (float)$target[$k] : 0.0;
        $availBaru = max(0.0, $mau - $util);
        $selisih   = $availBaru - $avail;

        printf("   %-5s %-32s %8s %10s %10s %9s%s\n", $code, $prod,
            $fmt($util), $fmt($avail), $fmt($availBaru), $fmt($selisih),
            abs($selisih) > 0.001 ? '  ←' : '');

        if (abs($selisih) > 0.001) { $ubah[$i] = $availBaru; $totalSelisih += $selisih; }
        if ($mau > 0 && $util > $mau + 0.001) {
            $peringatan[] = sprintf('%s/%s: utilization %s MELEBIHI sasaran %s — avail disetel 0, selisih %s MT perlu dicek tim',
                $code, $k, $fmt($util), $fmt($mau), $fmt($util - $mau));
        }
    }
    foreach ($target as $k => $mau) {
        if (!isset($adaProduk[$k])) {
            $peringatan[] = sprintf('%s/%s: sasaran %s MT tapi TIDAK ADA barisnya di company_product_stats — skrip ini tidak membuat baris baru', $code, $k, $fmt($mau));
        }
    }
}

printf("\n   baris available_mt yang berubah : %d\n", count($ubah));
printf("   perubahan available_mt total    : %s MT\n", $fmt($totalSelisih));

if ($peringatan) {
    echo "\n── PERINGATAN ───────────────────────────────────────────────────────\n";
    foreach ($peringatan as $w) echo "   ⚠ $w\n";
}

/* ── 3. Company yang ikut dihitung ulang ────────────────────────────────── */
echo "\n── 3. companies · obtained & available_quota ────────────────────────\n";
$stSim = $stats;
foreach ($ubah as $i => $v) $stSim[$i]['available_mt'] = (string)$v;
$hitung = function (array $rows, string $code): array {
    $o = 0.0; $a = 0.0;
    foreach ($rows as $s) {
        if ((string)($s['company_code'] ?? '') !== $code) continue;
        $u = iq_num($s['utilization_mt'] ?? 0);
        $v = iq_num($s['available_mt'] ?? 0);
        $o += $u + $v; $a += $v;
    }
    return [$o, $a];
};
printf("   %-5s %12s %12s %14s %14s\n", 'CO', 'obtained', 'obtained→', 'avail_quota', 'avail_quota→');
$coUbah = [];
foreach ($companies as $i => $c) {
    $code = (string)($c['code'] ?? '');
    if (!isset(SASARAN[$code]) || !$ikut($code)) continue;
    [$oBaru, $aBaru] = $hitung($stSim, $code);
    $oLama = iq_num($c['obtained'] ?? 0);
    $aLama = iq_num($c['available_quota'] ?? 0);
    printf("   %-5s %12s %12s %14s %14s%s\n", $code,
        $fmt($oLama), $fmt($oBaru), $fmt($aLama), $fmt($aBaru),
        (abs($oBaru - $oLama) > 0.001 || abs($aBaru - $aLama) > 0.001) ? '  ←' : '');
    $coUbah[$i] = [$oBaru, $aBaru];
}

if (!$apply) {
    echo "\n─────────────────────────────────────────────────────────────────────\n";
    echo "Tidak ada yang ditulis. Jalankan ulang dengan --apply bila sudah cocok.\n";
    exit(0);
}

/* ── TULIS ───────────────────────────────────────────────────────────────── */
foreach ($ubah as $i => $v) $stats[$i]['available_mt'] = (string)$v;
foreach ($coUbah as $i => [$o, $a]) {
    $companies[$i]['obtained']        = (string)$o;
    $companies[$i]['available_quota'] = (string)$a;
}
$sisaCycles = [];
foreach ($cycles as $i => $c) if (!in_array($i, $idxHapus, true)) $sisaCycles[] = $c;

iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'company_product_stats', 'rows' => $stats,      'headers' => $statsTbl['headers']],
    ['tab' => 'cycles',                'rows' => $sisaCycles, 'headers' => $cyTbl['headers']],
    ['tab' => 'companies',             'rows' => $companies,  'headers' => $coTbl['headers']],
]);
$gs->cacheClear();

echo "\n✓ Ditulis. Cache dibersihkan.\n";
echo "  Muat ulang dashboard (Ctrl+F5) — kartu Obtained harus jadi 35.260.\n";
