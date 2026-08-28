<?php
/**
 * Selaraskan `company_product_stats.utilization_mt` dengan SUMBERNYA SENDIRI,
 * yaitu tab `cycle_utilization`.
 *
 * ══ KENAPA ═════════════════════════════════════════════════════════════════
 * Selisih 301 MT antara kartu Overview (35.260, dari siklus) dan tabel
 * PERTEK & SPI (35.561, dari company_product_stats) ditelusuri 28-Agu-2026.
 * Hasilnya: BUKAN data yang hilang.
 *
 *   company  cycle_utilization   cycles (obtained)   company_product_stats
 *   ADP           350                 350                   450   <- menyimpang
 *   HDP         1.000               1.000                 1.100   <- menyimpang
 *   MSN           250                 250                   350   <- menyimpang
 *   SPA      114 + 401 = 515          515            115 + 400    <- salah bagi
 *
 * DUA sumber independen sepakat; hanya `company_product_stats` yang berbeda —
 * dan ia bertentangan dengan tab yang justru menjadi hulunya.
 *
 * Tim sempat menyimpulkan 450/1.100/350 yang benar dan mengirim nomor PERTEK/SPI
 * untuk "Obtained yang hilang". Penelusuran menemukan ketiga siklus itu SUDAH
 * ADA lengkap dengan nomor dan tanggal yang sama persis (ADP id 42223,
 * HDP id 42277, MSN id 42318) dan SUDAH terhitung. Mencatatnya lagi hanya akan
 * melahirkan baris kembar — persis bug duplikat GIS. Jadi yang diperbaiki
 * stats-nya, bukan siklusnya.
 *
 * ══ KENAPA MENYENTUH utilization_mt ════════════════════════════════════════
 * Skrip rekonsiliasi sebelumnya SENGAJA tidak menyentuh kolom ini, karena ia
 * punya sumber sendiri. Di sini justru itu alasannya BOLEH: nilainya berbeda
 * dari sumber hulunya, dan yang dilakukan skrip ini adalah menyetelnya KE
 * sumber itu. Tidak ada angka baru yang diciptakan — semuanya dijumlah dari
 * `cycle_utilization`.
 *
 * ══ PAGAR ══════════════════════════════════════════════════════════════════
 * Untuk tiap company, sesudah penyetelan diperiksa:
 *     Σ (utilization_mt + available_mt)  ==  Σ mt siklus 'Obtained #N'
 * Kalau tidak sama, company itu DILEWATI dan dilaporkan. Menyamakan stats
 * dengan satu sumber tapi membuatnya bertengkar dengan sumber lain bukan
 * perbaikan.
 *
 * Company yang punya baris stats TANPA baris cycle_utilization juga dilewati:
 * tidak adanya data bukan bukti bahwa nilainya nol.
 *
 * ══ CARA MENJALANKAN ═══════════════════════════════════════════════════════
 *   php tools/selaraskan_util_dengan_sumber.php            # rencana saja
 *   php tools/selaraskan_util_dengan_sumber.php --apply    # tulis
 */

require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

/** Company yang diselaraskan. Sengaja daftar tertutup — bukan sapuan seluruh
 *  tabel — supaya perbaikan ini tidak diam-diam menyentuh company lain. */
const SASARAN = ['ADP', 'HDP', 'MSN', 'SPA'];

$apply = in_array('--apply', $argv ?? [], true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'] ?? null;
if (!$sid) { fwrite(STDERR, "spreadsheet id iqdash tidak ada di config.php\n"); exit(1); }

$gs = new GoogleSheets();
$gs->cacheClear();
$gs->warmValues($sid, ['cycles', 'cycle_utilization', 'company_product_stats', 'companies', 'product_aliases']);

echo $apply ? "MODE: TULIS\n\n" : "MODE: RENCANA SAJA (tambahkan --apply untuk menulis)\n\n";

$alias = iq_alias_map($gs, $sid);
$kanon = fn(string $p): string => $alias[trim($p)] ?? trim($p);
$fmt   = fn($v): string => rtrim(rtrim(number_format((float) $v, 1, '.', ''), '0'), '.');

$stTbl = $gs->table($sid, 'company_product_stats');
$coTbl = $gs->table($sid, 'companies');
$stats = $stTbl['rows'];
$comps = $coTbl['rows'];
$ucRows = $gs->table($sid, 'cycle_utilization')['rows'];
$cyRows = $gs->table($sid, 'cycles')['rows'];

/* Σ utilisasi per (company, produk kanonik) — dari sumbernya. */
$sumberUtil = [];
foreach ($ucRows as $u) {
    $c = (string) ($u['company_code'] ?? '');
    if (!in_array($c, SASARAN, true)) continue;
    $p = $kanon((string) ($u['product'] ?? ''));
    if ($p === '') continue;
    $sumberUtil[$c][$p] = ($sumberUtil[$c][$p] ?? 0) + iq_num($u['util_mt'] ?? 0);
}

/* Σ mt siklus 'Obtained #N' per company — pembanding independen. */
$obtSiklus = [];
foreach ($cyRows as $c) {
    $code = (string) ($c['company_code'] ?? '');
    if (!in_array($code, SASARAN, true)) continue;
    if (!preg_match('/^obtained\s*#\d/i', (string) ($c['cycle_type'] ?? ''))) continue;
    $obtSiklus[$code] = ($obtSiklus[$code] ?? 0) + iq_num($c['mt'] ?? 0);
}

echo "── PER COMPANY ──────────────────────────────────────────────────────\n";
$ubah = [];      // index baris stats => util baru
$dilewati = [];

foreach (SASARAN as $code) {
    $barisCo = [];
    foreach ($stats as $i => $s) if ((string) ($s['company_code'] ?? '') === $code) $barisCo[$i] = $s;

    printf("\n  %s   (siklus Obtained #N = %s MT)\n", $code, $fmt($obtSiklus[$code] ?? 0));
    if (!isset($sumberUtil[$code])) {
        $dilewati[] = "$code: tidak ada baris cycle_utilization — dilewati (tidak adanya data bukan bukti nol)";
        echo "    ⚠ tidak ada baris cycle_utilization — DILEWATI\n";
        continue;
    }

    $rencana = []; $totBaru = 0.0; $adaYangTanpaSumber = false;
    foreach ($barisCo as $i => $s) {
        $prod  = (string) ($s['product'] ?? '');
        $k     = $kanon($prod);
        $lama  = iq_num($s['utilization_mt'] ?? 0);
        $avail = iq_num($s['available_mt'] ?? 0);

        if (!array_key_exists($k, $sumberUtil[$code])) {
            $adaYangTanpaSumber = true;
            printf("    %-30s util %-9s (tidak ada di cycle_utilization)\n", $prod, $fmt($lama));
            $totBaru += $lama + $avail;
            continue;
        }
        $baru = (float) $sumberUtil[$code][$k];
        $totBaru += $baru + $avail;
        $rencana[$i] = $baru;
        printf("    %-30s util %-9s -> %-9s  avail %-7s %s\n", $prod, $fmt($lama), $fmt($baru), $fmt($avail),
            abs($baru - $lama) > 0.001 ? '  ←' : '');
    }

    if ($adaYangTanpaSumber) {
        $dilewati[] = "$code: ada produk tanpa baris cycle_utilization — DILEWATI seluruhnya";
        echo "    ⚠ DILEWATI — ada produk yang tidak punya sumber utilisasi\n";
        continue;
    }

    $target = $obtSiklus[$code] ?? 0;
    printf("    Σ (util+avail) sesudah : %s   vs siklus Obtained: %s   %s\n",
        $fmt($totBaru), $fmt($target), abs($totBaru - $target) < 0.001 ? '✓ cocok' : '✗ TIDAK COCOK');
    if (abs($totBaru - $target) > 0.001) {
        $dilewati[] = sprintf('%s: sesudah penyetelan Σ %s != siklus %s — DILEWATI', $code, $fmt($totBaru), $fmt($target));
        echo "    ⚠ DILEWATI — hasilnya akan bertengkar dengan siklus\n";
        continue;
    }
    foreach ($rencana as $i => $v) if (abs($v - iq_num($stats[$i]['utilization_mt'] ?? 0)) > 0.001) $ubah[$i] = $v;
}

if ($dilewati) {
    echo "\n── DILEWATI ─────────────────────────────────────────────────────────\n";
    foreach ($dilewati as $d) echo "   ⚠ $d\n";
}

printf("\n   baris utilization_mt yang berubah : %d\n", count($ubah));

/* Ringkasan dampak ke company. */
$stSim = $stats;
foreach ($ubah as $i => $v) $stSim[$i]['utilization_mt'] = (string) $v;
echo "\n── companies · obtained · utilization_mt · available_quota ──────────\n";
printf("   %-5s %12s %12s %12s %12s\n", 'CO', 'obtained', 'obtained→', 'util', 'util→');
$coUbah = [];
foreach ($comps as $i => $c) {
    $code = (string) ($c['code'] ?? '');
    if (!in_array($code, SASARAN, true)) continue;
    $o = 0.0; $u = 0.0; $a = 0.0;
    foreach ($stSim as $s) {
        if ((string) ($s['company_code'] ?? '') !== $code) continue;
        $x = iq_num($s['utilization_mt'] ?? 0); $y = iq_num($s['available_mt'] ?? 0);
        $o += $x + $y; $u += $x; $a += $y;
    }
    printf("   %-5s %12s %12s %12s %12s%s\n", $code,
        $fmt($c['obtained'] ?? 0), $fmt($o), $fmt($c['utilization_mt'] ?? 0), $fmt($u),
        abs($o - iq_num($c['obtained'] ?? 0)) > 0.001 ? '  ←' : '');
    $coUbah[$i] = [$o, $u, $a];
}

echo "\n── DAMPAK ───────────────────────────────────────────────────────────\n";
$turun = 0.0;
foreach ($ubah as $i => $v) $turun += $v - iq_num($stats[$i]['utilization_mt'] ?? 0);
printf("   Σ utilization_mt berubah %s MT\n", $fmt($turun));
echo "   Tabel PERTEK & SPI turun ke angka siklus, jadi ia bertemu kartu\n";
echo "   Overview di 35.260 MT. Kartu Obtained TIDAK berubah (membaca siklus).\n";
echo "   Kartu Total Utilized ikut turun — memang seharusnya, karena angka\n";
echo "   lamanya melebihi utilisasi yang benar-benar tercatat.\n";

if (!$ubah) { echo "\nTidak ada yang perlu diubah.\n"; exit(0); }

if (!$apply) {
    echo "\n─────────────────────────────────────────────────────────────────────\n";
    echo "Tidak ada yang ditulis. Jalankan ulang dengan --apply bila sudah cocok.\n";
    exit(0);
}

foreach ($ubah as $i => $v) $stats[$i]['utilization_mt'] = (string) $v;
foreach ($coUbah as $i => [$o, $u, $a]) {
    $comps[$i]['obtained']        = (string) $o;
    $comps[$i]['utilization_mt']  = (string) $u;
    $comps[$i]['available_quota'] = (string) $a;
}
iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'company_product_stats', 'rows' => $stats, 'headers' => $stTbl['headers']],
    ['tab' => 'companies',             'rows' => $comps, 'headers' => $coTbl['headers']],
]);
$gs->cacheClear();
echo "\n✓ Ditulis. Cache dibersihkan. Muat ulang dashboard (Ctrl+F5).\n";
