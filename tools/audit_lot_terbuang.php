<?php
/**
 * Cari lot Sales (company_shipments) yang TERBUANG saat payload dibangun.
 * HANYA MEMBACA.
 *
 * Lot bertanggal yang tidak kembar dan sesudah hari terakhir master mestinya
 * ikut terhitung. Kalau tidak, satu dari tiga pagar iq_sync_util_with_cycles()
 * membuangnya — dan yang paling sering adalah PAGAR OBTAINED: ceiling per
 * produk diambil dari company_product_stats, jadi kalau stats tertinggal dari
 * cycles, setiap lot baru dibuang diam-diam.
 *
 * php tools/audit_lot_terbuang.php
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$cfg = sc_config(); $SID = $cfg['spreadsheets']['iqdash']; $gs = new GoogleSheets();

$cache = __DIR__ . '/../cache/iqdash_data.json';
if (!is_file($cache)) { fwrite(STDERR, "cache/iqdash_data.json tidak ada — jalankan tools/dump_payload_cache.php dulu\n"); exit(1); }
$D = json_decode(file_get_contents($cache), true);
$all = array_merge($D['spi'] ?? [], $D['pending'] ?? []);

// obtained menurut cycles (Obtained #N / Obtained (Revision #N))
$cy = $gs->table($SID, 'cycles', false)['rows'];
$obCycles = [];
foreach ($cy as $r) {
    if (!preg_match('/^obtained\b/i', (string)($r['cycle_type'] ?? ''))) continue;
    $rd = trim((string)($r['release_date'] ?? ''));
    if ($rd === '' || preg_match('/^tba$/i', $rd)) continue;   // belum terbit = belum dihitung
    $c = strtoupper(trim((string)($r['company_code'] ?? '')));
    $obCycles[$c] = ($obCycles[$c] ?? 0) + (float)($r['mt'] ?? 0);
}

$f = fn($n) => number_format((float)$n, 3, ',', '.');
$temuan = [];

foreach ($all as $co) {
    $kode = $co['code'] ?? '';
    $kirim = [];   // produk => Σ lot bertanggal
    foreach (($co['shipments'] ?? []) as $prod => $lots) {
        foreach ((array)$lots as $l) {
            $mt = (float)($l['utilMT'] ?? 0);
            if ($mt > 0 && trim((string)($l['utilDate'] ?? '')) !== '') $kirim[$prod] = ($kirim[$prod] ?? 0) + $mt;
        }
    }
    if (!$kirim) continue;

    $master = [];
    foreach (($co['utilCycles'] ?? []) as $u) {
        $p = (string)($u['product'] ?? '');
        $master[$p] = ($master[$p] ?? 0) + (float)($u['mt'] ?? 0);
    }

    /* Awalan lot yang SUDAH dirangkum baris agregat master — aturan yang sama
       dengan iq_sync_util_with_cycles(). Tanpa ini IKM GI ALLOY tampil sebagai
       "2.600 MT terbuang", padahal 2.600 itu justru rincian baris masternya
       sendiri dan memang tidak boleh dihitung dua kali. */
    $terliput = [];
    foreach (($co['shipments'] ?? []) as $prod => $lots) {
        $tm = (float)($master[$prod] ?? 0);
        if ($tm <= 0) continue;
        $ber = []; $adaTanpaTanggal = false;
        foreach ((array)$lots as $l) {
            $mt = (float)($l['utilMT'] ?? 0);
            if ($mt <= 0) continue;
            $h = trim((string)($l['utilDate'] ?? ''));
            if ($h === '') { $adaTanpaTanggal = true; break; }
            $ts = strtotime($h);
            if ($ts === false) { $adaTanpaTanggal = true; break; }
            $ber[] = ['h' => $ts, 'mt' => $mt];
        }
        if ($adaTanpaTanggal || !$ber) continue;
        usort($ber, fn($a, $b) => $a['h'] <=> $b['h']);
        $akum = 0.0;
        foreach ($ber as $x) {
            $akum += $x['mt'];
            if (abs($akum - $tm) <= 0.001) { $terliput[$prod] = $akum; break; }
        }
    }

    foreach ($kirim as $prod => $sumLot) {
        $tampil = (float)(($co['utilizationByProd'] ?? [])[$prod] ?? 0);
        $mst    = (float)($master[$prod] ?? 0);
        $sumBaru = $sumLot - (float)($terliput[$prod] ?? 0);   // lot yang memang BARU
        if ($sumBaru <= 0.001) continue;
        $terpakaiDariLot = $tampil - $mst;            // berapa MT lot yang benar-benar masuk
        $terbuang = $sumBaru - max(0, $terpakaiDariLot);
        if ($terbuang <= 0.001) continue;
        $terbuang = $sumLot - max(0, $terpakaiDariLot);
        if ($terbuang <= 0.001) continue;

        $obProd = $tampil + (float)(($co['availableByProd'] ?? [])[$prod] ?? 0);
        $temuan[] = [
            'co' => $kode, 'prod' => $prod, 'lot' => $sumLot, 'master' => $mst,
            'tampil' => $tampil, 'buang' => $terbuang, 'atap' => $obProd,
            'obCycles' => $obCycles[strtoupper($kode)] ?? 0,
            'obStats' => array_sum($co['utilizationByProd'] ?? []) + array_sum($co['availableByProd'] ?? []),
        ];
    }
}

usort($temuan, fn($a,$b) => $b['buang'] <=> $a['buang']);
echo "LOT SALES YANG TERBUANG\n";
echo str_repeat('-', 108) . "\n";
printf("%-6s %-14s %10s %10s %10s %10s %10s | %s\n", 'PT','PRODUK','Σ LOT','MASTER','TAMPIL','TERBUANG','ATAP/OBT','obtained cycles vs stats');
foreach ($temuan as $t) {
    printf("%-6s %-14s %10s %10s %10s %10s %10s | %s vs %s%s\n",
        $t['co'], $t['prod'], $f($t['lot']), $f($t['master']), $f($t['tampil']), $f($t['buang']), $f($t['atap']),
        $f($t['obCycles']), $f($t['obStats']),
        abs($t['obCycles'] - $t['obStats']) > 0.001 ? '   <-- STATS TERTINGGAL' : '');
}
echo "\n" . count($temuan) . " temuan\n";
