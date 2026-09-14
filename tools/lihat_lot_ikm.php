<?php
/**
 * Periksa lot utilisasi IKM — khususnya dua lot September yang membuat
 * Utilized dashboard berbeda 600 MT dari acuan tim 11-Sep-2026.
 * HANYA MEMBACA.
 *
 * Jalankan: php tools/lihat_lot_ikm.php
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();
$t   = iq_load_tables($gs, $sid);

$cetak = function (array $r) {
    $x = [];
    foreach ($r as $k => $v) {
        if ($v === '' || $v === null) continue;
        $x[] = $k . '=' . (is_scalar($v) ? (string) $v : json_encode($v));
    }
    echo "   " . implode('  ', $x) . "\n";
};

echo "== lots (input Sales) milik IKM ==\n";
$n = 0;
foreach ($t['lots'] ?? [] as $r) {
    if (($r['company_code'] ?? '') !== 'IKM') continue;
    $n++; $cetak($r);
}
echo "   ($n baris)\n";

echo "\n== cycle_utilization (master) milik IKM ==\n";
foreach ($t['cycleUtil'] ?? [] as $r) {
    if (($r['company_code'] ?? '') === 'IKM') $cetak($r);
}

echo "\n== stats IKM ==\n";
foreach ($t['stats'] ?? [] as $r) {
    if (($r['company_code'] ?? '') === 'IKM') $cetak($r);
}

echo "\n== realisasi IKM (PIB) ==\n";
$tot = 0.0; $baris = 0;
foreach ($t['realizations'] ?? [] as $r) {
    if (($r['company_code'] ?? '') !== 'IKM') continue;
    $baris++;
    $tot += (float) str_replace(',', '', (string) ($r['volume'] ?? 0));
}
echo "   $baris baris · Σ volume " . number_format($tot, 3) . " TNE\n";

echo "\n== tanggal yang TIDAK terbaca di seluruh tab ==\n";
$rusak = 0;
foreach ([['lots', ['utilDate', 'util_date', 'eta_jkt', 'etaJKT']],
          ['cycleUtil', ['util_date']],
          ['cycles', ['submit_date', 'release_date', 'pertek_date', 'spi_date']]] as [$tab, $kolom]) {
    foreach ($t[$tab] ?? [] as $r) {
        foreach ($kolom as $k) {
            if (!array_key_exists($k, $r)) continue;
            $v = trim((string) $r[$k]);
            if ($v === '' || preg_match('/^(tba|null|undefined)$/i', $v)) continue;
            if (iq_util_day_key($v) === null) {
                $rusak++;
                printf("   %-12s baris %-4s %-14s = %s   <- TIDAK TERBACA\n",
                    $tab, $r['_row'] ?? '?', $k, json_encode($v));
            }
            if ($v !== preg_replace('/\s+/', ' ', $v)) {
                printf("   %-12s baris %-4s %-14s = %s   <- spasi tidak rapi\n",
                    $tab, $r['_row'] ?? '?', $k, json_encode($v));
            }
        }
    }
}
echo "   " . ($rusak ? "$rusak tanggal tidak terbaca" : 'semua tanggal terbaca') . "\n";
