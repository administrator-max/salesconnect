<?php
/**
 * Create + seed the data-driven config (cfg_*) tabs for every registered module.
 * Idempotent and NON-DESTRUCTIVE: an existing cfg_ tab with a header row is left
 * untouched. Only ADDS tabs — never modifies existing data tabs.
 *
 * Run:  php tools/setup_config_tabs.php            (all registered modules)
 *       php tools/setup_config_tabs.php cil        (one module)
 */
require_once __DIR__ . '/../lib/config_util.php';

$cfg      = sc_config();
$registry = cfg_registry();
$only     = $argv[1] ?? null;

// Per-module service account (costcore uses its own; others the default).
function gs_for(string $module, array $cfg): GoogleSheets {
    if ($module === 'costcore' && !empty($cfg['costcore_service_account'])) {
        return new GoogleSheets($cfg['costcore_service_account']);
    }
    return new GoogleSheets();
}

foreach ($registry as $module => $lookups) {
    if ($only !== null && $only !== $module) continue;
    $sid = $cfg['spreadsheets'][$module] ?? null;
    if (!$sid) { echo "!! $module: no spreadsheet id in config\n"; continue; }
    $gs = gs_for($module, $cfg);
    echo "== $module ($sid) ==\n";
    foreach ($lookups as $name => $lk) {
        try {
            $status = cfg_ensure($gs, $sid, $lk);
            echo "  {$lk['tab']}: $status\n";
        } catch (Exception $e) {
            echo "  {$lk['tab']}: ERROR " . $e->getMessage() . "\n";
        }
    }
}
echo "Done.\n";
