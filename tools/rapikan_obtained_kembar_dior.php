<?php
/**
 * DIOR: tujuh siklus Obtained kembar dari SATU Revision #1 dirapikan jadi SATU
 * Obtained #2.
 *
 * APA YANG TERJADI
 * ----------------
 * Tim menginput Revision #1 (Bordes Alloy 100 MT -> GL Alloy 100 MT) lewat
 * Cycle History. Alur pelepasan revisi melahirkan satu siklus Obtained baru
 * SETIAP kali dijalankan, tanpa memeriksa apakah siklus untuk revisi itu sudah
 * ada. Hasilnya Obtained #2 sampai #8 — tujuh baris, masing-masing 100 MT
 * GL ALLOY, semuanya dari revisi yang sama.
 *
 * Akibatnya sudah menyentuh angka, bukan cuma tampilan:
 *
 *     canonicalObtained DIOR   200 MT   (kuotanya cuma 100)
 *     Available Quota          obt 100 · sisa 200
 *     PERTEK & SPI             BORDES ALLOY Active, GL ALLOY Inactive — terbalik
 *
 * DOKUMENNYA TERSEBAR DI TIGA BARIS
 * ---------------------------------
 * Tidak ada satu pun baris kembar yang memuat dokumen lengkap:
 *
 *     Obtained #6 (43195)  spi_date 31/08/2026        <- satu-satunya bertanggal
 *     Obtained #7 (43196)  status "…SPI: 04.PI-05.26.3558.1"
 *     Obtained #8 (43197)  status "SPI Perubahan TERBIT — No. 04.PI-05.26.3558.1"
 *
 * Jadi yang DIPERTAHANKAN adalah baris bertanggal (#6), dan nomor SPI-nya
 * diambil dari teks status saudaranya — bukan dikarang. Kalau nomornya tidak
 * bisa dibaca dari mana pun, skrip berhenti dan tidak menulis apa pun.
 *
 * KENAPA "Obtained #2"
 * -------------------
 * Permintaan tim: siklus ini berasal dari Revision #1, jadi penomorannya
 * mengikuti urutan Obtained company itu — sesudah Obtained #1, yaitu #2.
 *
 * PAGAR
 * -----
 *   1. hanya menyentuh DIOR;
 *   2. yang dihapus HANYA siklus Obtained yang produk & tonasenya identik
 *      dengan siklus yang dipertahankan (100 MT GL ALLOY) — bukan siklus lain;
 *   3. baris cycle_products milik siklus yang dihapus ikut dihapus, supaya
 *      tidak meninggalkan yatim (kesalahan yang pernah terjadi 28-Agu);
 *   4. SESUDAH perubahan, obtained DIOR harus 100 MT — bukan 200, bukan 0.
 *      Disimulasikan lebih dulu; kalau hasilnya bukan 100, tidak ada yang
 *      ditulis;
 *   5. total Obtained seluruh dashboard hanya boleh turun sebesar kelebihan
 *      DIOR, tidak lebih.
 *
 * Dry-run:   php tools/rapikan_obtained_kembar_dior.php
 * Terapkan:  php tools/rapikan_obtained_kembar_dior.php --apply
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

$t = iq_load_tables($gs, $sid);
$cyTbl = $gs->table($sid, 'cycles');
$cpTbl = $gs->table($sid, 'cycle_products');
$coTbl = $gs->table($sid, 'companies');
$prTbl = $gs->table($sid, 'company_products');
$stTbl = $gs->table($sid, 'company_product_stats');

$cycles = $cyTbl['rows']; $cprod = $cpTbl['rows'];
$comps  = $coTbl['rows']; $cpro  = $prTbl['rows']; $stats = $stTbl['rows'];

$aliasMap = iq_alias_map($gs, $sid);
$kanon = fn($p) => iq_canon_product((string) $p, $aliasMap);

/* ── 1. Siklus Obtained milik DIOR ──────────────────────────────────────── */
$obt = [];
foreach ($cycles as $i => $c) {
    if ((string) ($c['company_code'] ?? '') !== CO) continue;
    if (!preg_match('/^Obtained #(\d+)$/', trim((string) ($c['cycle_type'] ?? '')), $m)) continue;
    $prods = [];
    foreach ($cprod as $x) {
        if ((string) ($x['cycle_id'] ?? '') !== (string) ($c['id'] ?? '')) continue;
        $prods[$kanon($x['product'] ?? '')] = iq_num($x['mt'] ?? 0);
    }
    $obt[] = ['i' => $i, 'n' => (int) $m[1], 'id' => (string) ($c['id'] ?? ''),
              'mt' => iq_num($c['mt'] ?? 0), 'spi' => trim((string) ($c['spi_date'] ?? '')),
              'status' => (string) ($c['status'] ?? ''), 'prods' => $prods];
}
usort($obt, fn($a, $b) => $a['n'] <=> $b['n']);

echo "\nSiklus Obtained DIOR saat ini:\n";
foreach ($obt as $o) {
    printf("  #%-2d id=%-7s mt=%-6s spi=%-12s produk=%-28s %s\n",
        $o['n'], $o['id'], $o['mt'], $o['spi'] ?: '—', json_encode($o['prods']), $o['status'] ? '· ' . mb_substr($o['status'], 0, 46) : '');
}

/* Kelompok kembar = Obtained yang produk & tonasenya identik, jumlahnya > 1. */
$sidik = fn($o) => json_encode($o['prods']) . '|' . $o['mt'];
$grup = [];
foreach ($obt as $o) $grup[$sidik($o)][] = $o;

$kembar = null;
foreach ($grup as $sig => $g) { if (count($g) > 1) { $kembar = $g; break; } }
if (!$kembar) { echo "\nTidak ada siklus Obtained kembar. Tidak ada yang perlu dirapikan.\n"; exit(0); }

/* Yang DIPERTAHANKAN: yang punya spi_date. Kalau tidak ada, skrip berhenti —
   memilih sembarang baris berarti membuang tanggal terbit yang sah. */
$simpan = null;
foreach ($kembar as $o) if ($o['spi'] !== '') { $simpan = $o; break; }
if (!$simpan) {
    echo "\nBERHENTI: tidak satu pun siklus kembar punya spi_date. Tanggal terbitnya\n";
    echo "harus ditentukan tim dulu — memilih sembarang baris berarti mengarang.\n";
    exit(1);
}

/* Nomor SPI dipungut dari teks status saudara-saudaranya. */
$spiNo = '';
foreach ($kembar as $o) {
    if (preg_match('/\b(\d{2}\.[A-Z]{2}-[\d.]+)/', $o['status'], $m)) { $spiNo = $m[1]; break; }
}

$buang = array_values(array_filter($kembar, fn($o) => $o['id'] !== $simpan['id']));

echo "\n── RENCANA ──────────────────────────────────────────────────────────\n";
printf("  DIPERTAHANKAN : #%d id=%s (spi %s) -> diganti nama jadi \"Obtained #2\"\n",
    $simpan['n'], $simpan['id'], $simpan['spi']);
printf("  NOMOR SPI     : %s\n", $spiNo ?: '(tidak terbaca dari status mana pun)');
printf("  DIHAPUS       : %d siklus — %s\n", count($buang),
    implode(', ', array_map(fn($o) => '#' . $o['n'] . ' (id ' . $o['id'] . ')', $buang)));

if ($spiNo === '') {
    echo "\nBERHENTI: nomor SPI tidak terbaca dari status mana pun. Tidak ditulis.\n";
    exit(1);
}

/* ── 2. Susun keadaan SESUDAH, untuk disimulasikan ──────────────────────── */
$idBuang = array_map(fn($o) => $o['id'], $buang);

$cyBaru = [];
foreach ($cycles as $c) {
    $id = (string) ($c['id'] ?? '');
    if (in_array($id, $idBuang, true)) continue;                    // dibuang
    if ($id === $simpan['id']) { $c['cycle_type'] = 'Obtained #2';   // dipertahankan
        if (trim((string) ($c['status'] ?? '')) === '')
            $c['status'] = 'SPI Perubahan TERBIT — No. ' . $spiNo . ' · dari Revision #1';
    }
    $cyBaru[] = $c;
}
$cpBaru = array_values(array_filter($cprod,
    fn($x) => !in_array((string) ($x['cycle_id'] ?? ''), $idBuang, true)));

/* company_products & stats: GL ALLOY jadi produk aktif, BORDES ALLOY tidak. */
$prodBaru = $kanon(array_key_first($simpan['prods']));               // GL ALLOY
$prBaru = [];
$sudah = false;
foreach ($cpro as $x) {
    if ((string) ($x['company_code'] ?? '') === CO) {
        if ($kanon($x['product'] ?? '') === $prodBaru) { $sudah = true; $prBaru[] = $x; continue; }
        continue;                                                    // produk lama dibuang
    }
    $prBaru[] = $x;
}
if (!$sudah) {
    $maxPr = 0; foreach ($cpro as $x) { $n = (int) ($x['id'] ?? 0); if ($n > $maxPr) $maxPr = $n; }
    $prBaru[] = ['id' => (string) ($maxPr + 1), 'company_code' => CO, 'product' => $prodBaru,
                 'sort_order' => '0', 'source_program' => 'B'];
}

$stBaru = [];
foreach ($stats as $x) {
    if ((string) ($x['company_code'] ?? '') === CO) {
        if ($kanon($x['product'] ?? '') === $prodBaru) {
            $x['available_mt'] = (string) $simpan['mt'];             // 100
            $x['utilization_mt'] = $x['utilization_mt'] ?? '0';
        } else {
            $x['available_mt'] = '0'; $x['utilization_mt'] = '0';    // produk lama dinolkan
        }
    }
    $stBaru[] = $x;
}

/* companies.spi_no diisi kalau masih kosong. */
$coBaru = [];
foreach ($comps as $x) {
    if ((string) ($x['code'] ?? '') === CO && trim((string) ($x['spi_no'] ?? '')) === '') {
        $x['spi_no'] = $spiNo;
    }
    $coBaru[] = $x;
}

/* ── 3. Simulasi: pagar 4 & 5 ───────────────────────────────────────────── */
$sebelum = iq_build_payload($t);
$t2 = $t;
$t2['cycles'] = $cyBaru; $t2['cycleProducts'] = $cpBaru;
$t2['companies'] = $coBaru; $t2['companyProducts'] = $prBaru; $t2['stats'] = $stBaru;
$sesudah = iq_build_payload($t2);

$ambil = function (array $pl, string $code) {
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c)
        if (($c['code'] ?? '') === $code) return $c;
    return null;
};
$totObt = function (array $pl) {
    $n = 0;
    foreach (array_merge($pl['spi'] ?? [], $pl['pending'] ?? []) as $c) {
        foreach (($c['utilizationByProd'] ?? []) as $v) $n += iq_num($v);
        foreach (($c['availableByProd'] ?? []) as $v) $n += iq_num($v);
    }
    return round($n, 3);
};

$dA = $ambil($sebelum, CO); $dB = $ambil($sesudah, CO);
$obtA = 0; foreach (($dA['utilizationByProd'] ?? []) as $v) $obtA += iq_num($v);
foreach (($dA['availableByProd'] ?? []) as $v) $obtA += iq_num($v);
$obtB = 0; foreach (($dB['utilizationByProd'] ?? []) as $v) $obtB += iq_num($v);
foreach (($dB['availableByProd'] ?? []) as $v) $obtB += iq_num($v);

echo "\n── SIMULASI ─────────────────────────────────────────────────────────\n";
printf("  DIOR util  : %s  ->  %s\n", json_encode($dA['utilizationByProd'] ?? []), json_encode($dB['utilizationByProd'] ?? []));
printf("  DIOR avail : %s  ->  %s\n", json_encode($dA['availableByProd'] ?? []), json_encode($dB['availableByProd'] ?? []));
printf("  DIOR obtained (util+avail): %s -> %s\n", $obtA, $obtB);
printf("  TOTAL obtained seluruh company: %s -> %s  (selisih %s)\n",
    $totObt($sebelum), $totObt($sesudah), round($totObt($sesudah) - $totObt($sebelum), 3));

/* Company lain tidak boleh bergeser. */
$geser = [];
foreach (array_merge($sesudah['spi'] ?? [], $sesudah['pending'] ?? []) as $c) {
    $code = $c['code'] ?? '';
    if ($code === CO) continue;
    $a = $ambil($sebelum, $code);
    if (json_encode($a['utilizationByProd'] ?? []) !== json_encode($c['utilizationByProd'] ?? [])
     || json_encode($a['availableByProd'] ?? [])  !== json_encode($c['availableByProd'] ?? [])) {
        $geser[] = $code;
    }
}
printf("  Company lain yang ikut bergeser: %s\n", $geser ? implode(', ', $geser) : 'tidak ada');

$lolos = true;
if (abs($obtB - $simpan['mt']) > 0.001) {
    printf("\n  PAGAR 4 GAGAL: obtained DIOR sesudah = %s, seharusnya %s\n", $obtB, $simpan['mt']);
    $lolos = false;
}
if ($geser) { echo "\n  PAGAR 1 GAGAL: company selain DIOR ikut berubah.\n"; $lolos = false; }
if (!$lolos) { echo "\nTIDAK ADA YANG DITULIS.\n"; exit(1); }
echo "\n  Pagar lolos.\n";

if (!$APPLY) { echo "\nDry-run — belum menulis apa pun. Ulangi dengan --apply.\n"; exit(0); }

/* ── 4. Tulis ───────────────────────────────────────────────────────────── */
$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/dior_sebelum_rapikan_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode(['cycles' => $cycles, 'cycle_products' => $cprod,
    'companies' => $comps, 'company_products' => $cpro, 'company_product_stats' => $stats]));
echo "Cadangan: $cad\n";

iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'cycles',                'rows' => $cyBaru,  'headers' => $cyTbl['headers']],
    ['tab' => 'cycle_products',        'rows' => $cpBaru,  'headers' => $cpTbl['headers']],
    ['tab' => 'companies',             'rows' => $coBaru,  'headers' => $coTbl['headers']],
    ['tab' => 'company_products',      'rows' => $prBaru,  'headers' => $prTbl['headers']],
    ['tab' => 'company_product_stats', 'rows' => $stBaru,  'headers' => $stTbl['headers']],
]);
printf("Selesai. %d siklus kembar dihapus, 1 dipertahankan sebagai Obtained #2.\n", count($buang));
