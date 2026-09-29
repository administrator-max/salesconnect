<?php
/** Rincian produk per cycle + catatan revisi satu company. HANYA MEMBACA. */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$cfg = sc_config(); $SID = $cfg['spreadsheets']['iqdash']; $gs = new GoogleSheets();
$kode = strtoupper($argv[1] ?? 'AMP');
$ids = [];
foreach ($gs->table($SID, 'cycles', false)['rows'] as $r)
  if (strtoupper(trim((string)($r['company_code'] ?? ''))) === $kode) $ids[(string)$r['id']] = (string)$r['cycle_type'];
echo "=== cycle_products $kode ===\n";
foreach ($gs->table($SID, 'cycle_products', false)['rows'] as $r) {
  $cid = (string)($r['cycle_id'] ?? '');
  if (!isset($ids[$cid])) continue;
  printf("  %-44s : %-14s %s MT\n", $ids[$cid], (string)($r['product'] ?? ''), (string)($r['mt'] ?? ''));
}
echo "\n=== companies.$kode ===\n";
foreach ($gs->table($SID, 'companies', false)['rows'] as $r)
  if (strtoupper((string)($r['code'] ?? '')) === $kode)
    foreach (['rev_type','rev_mt','rev_status','rev_submit_date','rev_note','obtained','utilization_mt','available_quota'] as $k)
      echo "  $k = " . substr((string)($r[$k] ?? ''), 0, 700) . "\n";
