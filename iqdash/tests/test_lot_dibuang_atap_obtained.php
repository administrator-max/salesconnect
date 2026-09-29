<?php
/**
 * Pagar obtained di iq_sync_util_with_cycles() membuang lot Sales diam-diam.
 *
 * Pagar itu sendiri benar — memakai lebih banyak dari yang didapat mustahil,
 * dan tanpa pagar satu salah ketik tanggal cukup untuk melipatgandakan angka
 * sebuah produk. Yang berbahaya adalah ATAPNYA diambil dari
 * `company_product_stats`, sedangkan Obtained yang baru terbit dicatat di
 * `cycles`. Begitu keduanya berbeda, atapnya terlalu rendah dan SETIAP lot
 * baru dibuang tanpa jejak — bagi tim terlihat seperti isian yang hilang.
 *
 * Kasus AMP / SUJU, dilaporkan Sales 29-Sep-2026 ("udah gw isi di utilisasi 2x
 * tapi ilang mulu"):
 *     cycles : Obtained #1 800 (SPI 27/11/2025) + Obtained #2 200
 *              (SPI Perubahan 09/09/2026)                        = 1.000
 *     stats  : GL BORON 400 + PPGL CARBON 400                    =   800
 * 200 MT milik Obtained #2 tidak pernah sampai ke stats, jadi atap GL ALLOY
 * cuma 400 — persis sebesar baris master 400 MT @ 01/12/2025. Tidak ada ruang
 * tersisa, dan kedua lot Sales (64 MT @ 08-Sep, 100 MT @ 29-Sep) dibuang.
 *
 * Uji ini memaku dua hal sekaligus:
 *   A. dengan stats yang tertinggal, lot MEMANG terbuang (mereproduksi keluhan);
 *   B. begitu 200 MT itu ada di stats, kedua lot masuk dan angkanya benar.
 * Kalau kelak ada yang melonggarkan pagarnya, A yang akan gagal; kalau ada yang
 * memutus jalur stats, B yang gagal.
 *
 * Run: php iqdash/tests/test_lot_dibuang_atap_obtained.php
 */
require_once __DIR__ . '/../iqdash_util.php';
require_once __DIR__ . '/../iqdash_data.php';

function ok($c, $m) { echo ($c ? 'PASS' : 'FAIL') . " $m\n"; if (!$c) $GLOBALS['fail'] = 1; }

/* PRODUCT_ALIASES seperti yang dipakai produksi — stats AMP masih mengeja
   GL BORON sementara lot dan master sudah GL ALLOY. */
$alias = ['GL BORON' => 'GL ALLOY', 'GI BORON' => 'GI ALLOY', 'SHEETPILE' => 'SHEET PILE'];

/** Bentuk AMP apa adanya; $availGL = saldo GL di stats. */
function amp(float $availGL): array {
    return [
        'code' => 'AMP',
        'utilizationByProd' => ['GL BORON' => 400.0, 'PPGL CARBON' => 400.0],
        'availableByProd'   => ['GL BORON' => $availGL, 'PPGL CARBON' => 0.0],
        'utilCycles' => [
            ['cycle' => 'Utilization #1', 'product' => 'GL ALLOY',    'mt' => 400, 'date' => '01/12/2025'],
            ['cycle' => 'Utilization #1', 'product' => 'PPGL CARBON', 'mt' => 400, 'date' => '28/01/2026'],
        ],
        'shipments' => [
            'GL ALLOY' => [
                ['lotNo' => '1', 'utilMT' => 64,  'utilDate' => '08 September 2026', 'note' => 'Centra Lays'],
                ['lotNo' => '2', 'utilMT' => 100, 'utilDate' => '29 September 2026', 'note' => 'NIM (Arsen 67)'],
            ],
            'PPGL CARBON' => [
                ['lotNo' => '1', 'utilMT' => 0, 'utilDate' => ''],
            ],
        ],
    ];
}

/* Kunci keluaran memakai ejaan stats (GL BORON), jadi dibaca lewat helper
   supaya uji ini tidak ikut memaku ejaannya. */
function glDari(array $map) {
    foreach ($map as $k => $v) if (preg_match('/^GL\s+(ALLOY|BORON)$/i', (string) $k)) return (float) $v;
    return null;
}

/* ── A. Keadaan sekarang: stats tertinggal 200 MT → lot terbuang ───────── */
{
    $co = amp(0.0);
    iq_sync_util_with_cycles($co, $alias);

    ok(glDari($co['utilizationByProd']) === 400.0,
        'A. atap 400 → utilisasi GL mentok di baris master saja (400), lot tidak masuk');
    ok(glDari($co['availableByProd']) === 0.0,
        'A. saldo GL 0 — tidak ada ruang untuk lot mana pun');
    ok($co['utilizationMT'] === 800.0, 'A. total utilisasi 800, bukan 964');
    ok($co['availableQuota'] === 0.0,  'A. total saldo 0');
}

/* ── B. Sesudah 200 MT Obtained #2 ada di stats → kedua lot masuk ──────── */
{
    $co = amp(200.0);
    iq_sync_util_with_cycles($co, $alias);

    ok(glDari($co['utilizationByProd']) === 564.0,
        'B. atap 600 → 400 master + 64 + 100 = 564 MT terpakai');
    ok(glDari($co['availableByProd']) === 36.0,
        'B. sisa GL 600 - 564 = 36 MT');
    ok($co['utilizationMT'] === 964.0, 'B. total utilisasi 964');
    ok($co['availableQuota'] === 36.0, 'B. total saldo 36');
    ok($co['utilizationMT'] + $co['availableQuota'] === 1000.0,
        'B. terpakai + sisa = 1.000, sama dengan Obtained #1 800 + Obtained #2 200');
}

/* ── C. Pagarnya tetap mengikat: lot yang MELAMPAUI obtained tetap ditolak,
       supaya perbaikan di atas tidak terbaca sebagai "pagar dilonggarkan". ── */
{
    $co = amp(50.0);                      // atap GL = 450 saja
    iq_sync_util_with_cycles($co, $alias);
    ok(glDari($co['utilizationByProd']) === 400.0,
        'C. atap 450: lot 64 MT (jadi 464) melampaui atap → tetap ditolak');
    ok(glDari($co['availableByProd']) === 50.0, 'C. saldo GL utuh 50');
}

echo empty($GLOBALS['fail']) ? "\nSEMUA LULUS\n" : "\nADA YANG GAGAL\n";
exit(empty($GLOBALS['fail']) ? 0 : 1);
