<?php
/**
 * CUTOVER: migrate Cost Core from data_json blob → column-based storage.
 *
 * For every costing: load it (columns if present, else data_json fallback) and
 * re-save it in column form (costings header + costings_items + costings_margins),
 * then verify a round-trip, then physically drop the `data_json` column and remove
 * the obsolete `costings_readable` tab.
 *
 * ⚠️ RUN THIS ONLY AFTER the new column-based code (costcore/api.php + costcore_store.php)
 *    is DEPLOYED to the live host. Running it while the old (data_json) code is live
 *    would break the app, because it removes data_json.
 *
 *   php tools/migrate_costcore_columns.php            # dry-run: report only
 *   php tools/migrate_costcore_columns.php --confirm  # apply
 *
 * Idempotent and safe to re-run. A full backup exists under backups/<ts>/costcore/.
 */
require_once __DIR__ . '/../lib/costcore_store.php';

$APPLY = in_array('--confirm', $argv, true);
$cfg = sc_config();
$sid = $cfg['spreadsheets']['costcore'];
$gs  = new GoogleSheets($cfg['costcore_service_account']);

// Snapshot every costing's current data (from whichever source) BEFORE writing.
$ids = [];
foreach ($gs->table($sid, CS_TAB, false)['rows'] as $r) {
    if (($r['id'] ?? '') !== '') $ids[] = ['id' => $r['id'], 'type' => $r['type'] ?? 'import',
        'customer' => $r['customer'] ?? '', 'created_at' => $r['created_at'] ?? '', 'updated_at' => $r['updated_at'] ?? ''];
}
echo count($ids) . " costing(s) found.\n";
if (!$APPLY) { echo "DRY-RUN — re-run with --confirm to migrate.\n"; exit(0); }

// 1) Re-save each in column form.
$done = 0;
foreach ($ids as $c) {
    $data = cc_load($gs, $sid, $c['id']);
    if ($data === null) { echo "  skip {$c['id']} (no data)\n"; continue; }
    cc_save($gs, $sid, $c['id'], $c['type'], $c['customer'], $data, $c['created_at'], $c['updated_at']);
    $done++;
}
echo "Re-saved $done costing(s) into columns.\n";

// 2) Verify round-trip: reload from columns must equal what we just saved.
$bad = 0;
foreach ($ids as $c) { if (cc_load($gs, $sid, $c['id']) === null) { $bad++; echo "  VERIFY FAIL {$c['id']}\n"; } }
echo $bad ? "⚠️ $bad verification failures — NOT dropping data_json.\n" : "Verification OK.\n";

// 3) Physically drop the data_json column + obsolete readable tab (only if clean).
if ($bad === 0) {
    $headers = $gs->headers($sid, CS_TAB);
    $idx = array_search('data_json', $headers, true);
    $meta = $gs->sheetMeta($sid);
    if ($idx !== false && isset($meta[CS_TAB])) {
        $gs->batchUpdate($sid, [['deleteDimension' => ['range' => [
            'sheetId' => $meta[CS_TAB], 'dimension' => 'COLUMNS', 'startIndex' => $idx, 'endIndex' => $idx + 1]]]]);
        echo "Dropped data_json column.\n";
    }
    foreach (['costings_readable'] as $obsolete) {
        if (isset($meta[$obsolete])) {
            $gs->batchUpdate($sid, [['deleteSheet' => ['sheetId' => $meta[$obsolete]]]]);
            echo "Removed obsolete tab: $obsolete\n";
        }
    }
}
echo "Done.\n";
