<?php
/**
 * Human-readable companion tabs for Cost Core.
 *
 * The `costings` tab stores each costing as one opaque `data_json` blob (the app
 * needs it to load/save the nested state). These helpers keep two READ-ONLY
 * companion tabs in sync so Excel users can actually read the data:
 *   - costings_readable : one row per costing, header/parameter fields flattened
 *   - costings_items    : one row per line item
 * Both are fully rebuilt after every costcore write (and by the backfill script).
 * Nothing here modifies the operational `costings` tab.
 */
require_once __DIR__ . '/GoogleSheets.php';
require_once __DIR__ . '/helpers.php';

const CC_READABLE_TAB = 'costings_readable';
const CC_ITEMS_TAB    = 'costings_items';

const CC_HEADER_COLS = [
    'id', 'type', 'customer', 'created_at', 'updated_at',
    'ship_type', 'destination', 'kurs', 'import_duty', 'wht_pct', 'port_charges',
    'hedge_rate', 'hedge_days', 'is_pipa', 'stripping', 'add_cost',
    'commission', 'comm_unit', 'margin_type', 'margin',
    'wht_rate', 'truck_cost', 'truck_from', 'truck_to',
    'payment_terms', 'num_items', 'total_qty',
];
const CC_ITEM_COLS = ['costing_id', 'type', 'customer', 'item_no', 'product', 'quantity', 'unit_price', 'margin', 'remark'];

/** Coerce a JSON value to a clean cell string (booleans -> Yes/No, null -> ''). */
function cc_cell($v): string {
    if ($v === null || $v === '') return '';
    if ($v === true)  return 'Yes';
    if ($v === false) return 'No';
    return (string) $v;
}

/** Flatten one costings row (assoc with data_json) into a CC_HEADER_COLS-ordered line. */
function cc_header_line(array $r): array {
    $d = json_decode((string) ($r['data_json'] ?? ''), true);
    if (!is_array($d)) $d = [];
    $type = (string) ($r['type'] ?? '');
    $items = is_array($d['items'] ?? null) ? $d['items'] : [];
    $totalQty = 0.0;
    foreach ($items as $it) {
        $totalQty += (float) ($type === 'import' ? ($it['qty'] ?? 0) : ($it['qtyKg'] ?? 0));
    }
    $map = [
        'id'            => $r['id'] ?? '',
        'type'          => $type,
        'customer'      => $r['customer'] ?? ($d['customer'] ?? ''),
        'created_at'    => $r['created_at'] ?? '',
        'updated_at'    => $r['updated_at'] ?? '',
        'ship_type'     => $d['shipType'] ?? '',
        'destination'   => $d['tujuan'] ?? '',
        'kurs'          => $d['kurs'] ?? '',
        'import_duty'   => $d['importDuty'] ?? '',
        'wht_pct'       => $d['wht'] ?? '',
        'port_charges'  => $d['portCharges'] ?? '',
        'hedge_rate'    => $d['hedgeRate'] ?? '',
        'hedge_days'    => $d['hedgeDays'] ?? '',
        'is_pipa'       => $d['isPipa'] ?? '',
        'stripping'     => $d['stripping'] ?? '',
        'add_cost'      => $d['addCost'] ?? '',
        'commission'    => $d['commission'] ?? '',
        'comm_unit'     => $d['commUnit'] ?? '',
        'margin_type'   => $d['marginType'] ?? '',
        'margin'        => $d['margin'] ?? '',
        'wht_rate'      => $d['whtRate'] ?? '',
        'truck_cost'    => $d['trkCost'] ?? '',
        'truck_from'    => $d['trkFrom'] ?? '',
        'truck_to'      => $d['trkTo'] ?? '',
        'payment_terms' => $d['payTerms'] ?? '',
        'num_items'     => count($items),
        'total_qty'     => $totalQty ?: '',
    ];
    $line = [];
    foreach (CC_HEADER_COLS as $c) $line[] = cc_cell($map[$c] ?? '');
    return $line;
}

/** Explode one costings row into CC_ITEM_COLS-ordered item lines (import & domestic shapes). */
function cc_item_lines(array $r): array {
    $d = json_decode((string) ($r['data_json'] ?? ''), true);
    if (!is_array($d)) $d = [];
    $type = (string) ($r['type'] ?? '');
    $customer = (string) ($r['customer'] ?? ($d['customer'] ?? ''));
    $items = is_array($d['items'] ?? null) ? $d['items'] : [];
    $margins = is_array($d['margins'] ?? null) ? $d['margins'] : [];
    $out = [];
    $n = 0;
    foreach ($items as $it) {
        $n++;
        if ($type === 'import') {
            $qty = $it['qty'] ?? ''; $price = $it['cif'] ?? ''; $margin = $d['margin'] ?? '';
        } else {
            $qty = $it['qtyKg'] ?? ''; $price = $it['buyPrice'] ?? '';
            $mi = $it['marginIdx'] ?? null;
            $margin = ($mi !== null && isset($margins[$mi]))
                ? (($margins[$mi]['name'] ?? '') . ' = ' . ($margins[$mi]['val'] ?? '')) : '';
        }
        $map = [
            'costing_id' => $r['id'] ?? '', 'type' => $type, 'customer' => $customer,
            'item_no' => $n, 'product' => $it['name'] ?? '',
            'quantity' => $qty, 'unit_price' => $price, 'margin' => $margin, 'remark' => $it['remark'] ?? '',
        ];
        $line = [];
        foreach (CC_ITEM_COLS as $c) $line[] = cc_cell($map[$c] ?? '');
        $out[] = $line;
    }
    return $out;
}

/** Create a tab if missing (so replaceTable's clear won't fail). */
function cc_ensure_tab(GoogleSheets $gs, string $sid, string $tab): void {
    if (!array_key_exists($tab, $gs->sheetMeta($sid))) {
        $gs->batchUpdate($sid, [['addSheet' => ['properties' => ['title' => $tab]]]]);
    }
}

/** Rebuild both readable companion tabs from the current `costings` tab. Idempotent. */
function cc_rebuild_readable(GoogleSheets $gs, string $sid): array {
    $rows = $gs->table($sid, 'costings', false)['rows'];
    $hMatrix = [CC_HEADER_COLS];
    $iMatrix = [CC_ITEM_COLS];
    $costings = 0;
    foreach ($rows as $r) {
        if ((string) ($r['id'] ?? '') === '') continue;
        $costings++;
        $hMatrix[] = cc_header_line($r);
        foreach (cc_item_lines($r) as $il) $iMatrix[] = $il;
    }
    cc_ensure_tab($gs, $sid, CC_READABLE_TAB);
    cc_ensure_tab($gs, $sid, CC_ITEMS_TAB);
    $gs->replaceTable($sid, CC_READABLE_TAB, $hMatrix, count(CC_HEADER_COLS));
    $gs->replaceTable($sid, CC_ITEMS_TAB, $iMatrix, count(CC_ITEM_COLS));
    return ['costings' => $costings, 'item_rows' => count($iMatrix) - 1];
}

/** Best-effort rebuild: never let a readable-tab refresh break the actual save. */
function cc_rebuild_safe(GoogleSheets $gs, string $sid): void {
    try { cc_rebuild_readable($gs, $sid); }
    catch (Throwable $e) { error_log('costcore readable rebuild failed: ' . $e->getMessage()); }
}
