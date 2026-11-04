<?php
/** Tampilkan tab activity_log IQ Dash (dan SalesPulse bila ada). HANYA MEMBACA.
 *  php tools/lihat_activity_log.php [iqdash|salespulse] [jumlah_baris_terakhir] */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$cfg = sc_config(); $gs = new GoogleSheets();
$modul = $argv[1] ?? 'iqdash';
$n = (int) ($argv[2] ?? 400);
$SID = $cfg['spreadsheets'][$modul];
$t = $gs->table($SID, 'activity_log', false);
$rows = array_slice($t['rows'], -$n);
foreach ($rows as $r) {
  $p = [];
  foreach ($t['headers'] as $h) { if ($h === '') continue; $v = (string)($r[$h] ?? ''); if ($v !== '') $p[] = "$h=" . str_replace("\n", ' / ', $v); }
  echo implode(' | ', $p) . "\n";
}
echo "TOTAL " . count($t['rows']) . "\n";
