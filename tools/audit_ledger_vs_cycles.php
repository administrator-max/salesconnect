<?php
/**
 * quotaLedger.json adalah SNAPSHOT BEKU master (regen 03-Agu-2026), dan ia yang
 * menentukan obtained PER PRODUK — termasuk ATAP yang dipakai pagar utilisasi.
 * Obtained yang terbit SESUDAH regen hanya hidup di `cycles`, jadi ledgernya
 * ketinggalan dan lot Sales baru dibuang diam-diam.
 *
 * HANYA MEMBACA. php tools/audit_ledger_vs_cycles.php
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$cfg = sc_config(); $SID = $cfg['spreadsheets']['iqdash']; $gs = new GoogleSheets();

$L = json_decode(file_get_contents(__DIR__ . '/../iqdash/data/quotaLedger.json'), true);
echo "ledger regen: " . ($L['_meta']['generated'] ?? '?') . "\n\n";

$ledgerObt = [];
foreach ($L['companies'] ?? [] as $kode => $ent) {
    $s = 0.0; foreach ($ent as $v) $s += (float)($v['obtained'] ?? 0);
    $ledgerObt[strtoupper($kode)] = $s;
}

$cyObt = []; $rincian = [];
foreach ($gs->table($SID, 'cycles', false)['rows'] as $r) {
    if (!preg_match('/^obtained\b/i', (string)($r['cycle_type'] ?? ''))) continue;
    $rd = trim((string)($r['release_date'] ?? ''));
    if ($rd === '' || preg_match('/^tba$/i', $rd)) continue;
    $c = strtoupper(trim((string)($r['company_code'] ?? '')));
    $mt = (float)($r['mt'] ?? 0);
    $cyObt[$c] = ($cyObt[$c] ?? 0) + $mt;
    $rincian[$c][] = sprintf('%s %s (terbit %s)', $r['cycle_type'], number_format($mt, 0, ',', '.'), $rd);
}

$f = fn($n) => number_format((float)$n, 0, ',', '.');
$beda = [];
foreach ($ledgerObt as $kode => $lo) {
    $co = $cyObt[$kode] ?? 0.0;
    if (abs($co - $lo) > 0.001) $beda[] = [$kode, $lo, $co, $co - $lo];
}
usort($beda, fn($a, $b) => abs($b[3]) <=> abs($a[3]));

printf("%-6s %10s %10s %10s\n", 'PT', 'LEDGER', 'CYCLES', 'SELISIH');
echo str_repeat('-', 40) . "\n";
foreach ($beda as [$kode, $lo, $co, $d]) {
    printf("%-6s %10s %10s %10s\n", $kode, $f($lo), $f($co), ($d > 0 ? '+' : '') . $f($d));
    foreach ($rincian[$kode] ?? [] as $x) echo "           · $x\n";
}
echo "\n" . count($beda) . " company berbeda dari " . count($ledgerObt) . " di ledger\n";
