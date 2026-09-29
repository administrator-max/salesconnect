<?php
/** Lihat seluruh jejak utilisasi satu company. HANYA MEMBACA.
 *  php tools/lihat_utilisasi_company.php AMP */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$cfg = sc_config(); $SID = $cfg['spreadsheets']['iqdash']; $gs = new GoogleSheets();
$kode = strtoupper($argv[1] ?? 'AMP');

foreach (['companies','company_shipments','cycle_utilization','company_product_stats','cycles'] as $tab) {
  $t = $gs->table($SID, $tab, false);
  $kunci = $tab === 'companies' ? 'code' : 'company_code';
  $baris = array_values(array_filter($t['rows'], fn($r) => strtoupper(trim((string)($r[$kunci] ?? ''))) === $kode));
  echo "\n=== $tab (" . count($baris) . " baris) ===\n";
  foreach ($baris as $r) {
    $p = [];
    foreach ($t['headers'] as $h) { if ($h === '') continue; $v = (string)($r[$h] ?? ''); if ($v !== '') $p[] = "$h=$v"; }
    echo '  ' . implode(' | ', $p) . "\n";
  }
}
