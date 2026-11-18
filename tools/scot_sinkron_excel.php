<?php
/** Sinkron SCOT ← Excel Drive dari CLI.
 *  php tools/scot_sinkron_excel.php coba   → hanya rencana (tidak menulis)
 *  php tools/scot_sinkron_excel.php jalan  → terapkan (paksa) */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../scot/scot_sync.php';
$cfg = sc_config(); $gs = new GoogleSheets(); $SID = $cfg['spreadsheets']['scot'];
$mode = $argv[1] ?? 'coba';
$r = scot_sync_run($gs, $SID, true, $mode !== 'jalan');
echo "status: {$r['status']} | file: {$r['file']} | Excel diubah {$r['excel_diubah']} oleh {$r['excel_diubah_oleh']}\n";
echo json_encode($r['hasil']) . "\n";
if (!empty($r['rencana'])) {
  $p = $r['rencana'];
  echo "\n== BARU (" . count($p['inserts']) . ")\n";
  foreach ($p['inserts'] as $x) echo "  [{$x['_sumber']}] {$x['year']} | " . ($x['consignee'] ?? '') . " | {$x['project_name']} | " . ($x['quantity_mt'] ?? '') . " | " . ($x['status'] ?? '') . "\n";
  echo "\n== DIPERBARUI (" . count($p['updates']) . ") — kolom yang berubah\n";
  $hit = [];
  foreach ($p['updates'] as $u) foreach ($u['data'] as $k => $v) $hit[$k] = ($hit[$k] ?? 0) + 1;
  arsort($hit); echo '  ' . json_encode($hit) . "\n";
  echo "\n== HANYA DI DASHBOARD (" . count($p['db_only']) . ")\n";
  foreach ($p['db_only'] as $x) echo "  id {$x['id']} | {$x['year']} | {$x['consignee']} | {$x['project_name']} | {$x['quantity_mt']}\n";
  file_put_contents($argv[2] ?? 'php://stderr', json_encode($p, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}
