<?php
/**
 * Backfill / rebuild the Cost Core readable companion tabs
 * (costings_readable + costings_items) from the current `costings` tab.
 * Idempotent, non-destructive to `costings`. Run once now, then it self-maintains
 * on every costcore write.
 *   php tools/rebuild_costcore_readable.php
 */
require_once __DIR__ . '/../lib/costcore_readable.php';

$cfg = sc_config();
$sid = $cfg['spreadsheets']['costcore'];
$gs  = new GoogleSheets($cfg['costcore_service_account']);
$r = cc_rebuild_readable($gs, $sid);
echo "Rebuilt: {$r['costings']} costings -> costings_readable, {$r['item_rows']} rows -> costings_items\n";
