<?php
/**
 * Column-based storage for Cost Core — NO JSON blob.
 *
 * A costing is stored across three tabs instead of a `data_json` cell:
 *   - costings         : one row per costing, header/parameter fields in real columns
 *   - costings_items   : one row per line item (the SOURCE of items, not a mirror)
 *   - costings_margins : one row per domestic margin tier (A/B/C ...)
 *
 * The API keeps its exact contract: it still receives/returns the nested `data`
 * object the frontend uses. This layer decomposes that object into columns on
 * write and recomposes it on read. For rows not yet migrated, cc_load falls back
 * to parsing a legacy `data_json` cell if present (seamless transition).
 */
require_once __DIR__ . '/GoogleSheets.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/sheet_util.php';

const CS_TAB        = 'costings';
const CS_ITEMS_TAB  = 'costings_items';
const CS_MARGIN_TAB = 'costings_margins';

// Header columns (readable + sufficient to reconstruct the nested object).
const CS_HEADER_COLS = [
    'id', 'type', 'customer', 'created_at', 'updated_at',
    // import params
    'ship_type', 'kurs', 'import_duty', 'wht', 'port_charges', 'hedge_rate', 'hedge_days',
    'destination', 'is_pipa', 'stripping', 'add_cost', 'commission', 'comm_unit',
    'margin_type', 'margin', 'pay_terms',
    // domestic params
    'wht_rate', 'truck_cost', 'truck_from', 'truck_to',
];
const CS_ITEM_COLS   = ['costing_id', 'type', 'item_no', 'name', 'qty', 'cif', 'qty_kg', 'buy_price', 'margin_idx', 'remark'];
const CS_MARGIN_COLS = ['costing_id', 'margin_no', 'name', 'val'];

// Numeric header fields → recomposed as numbers (frontend stores them as numbers).
const CS_NUM_HEADER = ['kurs', 'import_duty', 'wht', 'port_charges', 'hedge_rate', 'hedge_days',
    'stripping', 'add_cost', 'commission', 'margin', 'wht_rate', 'truck_cost'];

function cs_num($v) { return $v === '' || $v === null ? 0 : (float) $v; }
function cs_b($v)   { return $v === true || $v === 'TRUE' || $v === 'true' || $v === 1 || $v === '1'; }

// ── DECOMPOSE: nested data object -> header assoc + item rows + margin rows ──
function cc_decompose(string $id, string $type, string $customer, array $data, string $created, string $updated): array {
    $items   = is_array($data['items'] ?? null) ? $data['items'] : [];
    $margins = is_array($data['margins'] ?? null) ? $data['margins'] : [];

    $h = array_fill_keys(CS_HEADER_COLS, '');
    $h['id'] = $id; $h['type'] = $type; $h['customer'] = $customer;
    $h['created_at'] = $created; $h['updated_at'] = $updated;
    if ($type === 'import') {
        $h['ship_type']    = $data['shipType']    ?? '';
        $h['kurs']         = $data['kurs']        ?? '';
        $h['import_duty']  = $data['importDuty']  ?? '';
        $h['wht']          = $data['wht']         ?? '';
        $h['port_charges'] = $data['portCharges'] ?? '';
        $h['hedge_rate']   = $data['hedgeRate']   ?? '';
        $h['hedge_days']   = $data['hedgeDays']   ?? '';
        $h['destination']  = $data['tujuan']      ?? '';
        $h['is_pipa']      = !empty($data['isPipa']) ? 'TRUE' : 'FALSE';
        $h['stripping']    = $data['stripping']   ?? '';
        $h['add_cost']     = $data['addCost']     ?? '';
        $h['commission']   = $data['commission']  ?? '';
        $h['comm_unit']    = $data['commUnit']    ?? '';
        $h['margin_type']  = $data['marginType']  ?? '';
        $h['margin']       = $data['margin']      ?? '';
        $h['pay_terms']    = $data['payTerms']    ?? '';
    } else { // domestic
        $h['wht_rate']   = $data['whtRate'] ?? '';
        $h['add_cost']   = $data['addCost'] ?? '';
        $h['truck_cost'] = $data['trkCost'] ?? '';
        $h['truck_from'] = $data['trkFrom'] ?? '';
        $h['truck_to']   = $data['trkTo']   ?? '';
        $h['pay_terms']  = $data['payTerms'] ?? '';
    }

    $itemRows = [];
    foreach (array_values($items) as $i => $it) {
        $row = array_fill_keys(CS_ITEM_COLS, '');
        $row['costing_id'] = $id; $row['type'] = $type; $row['item_no'] = $i + 1;
        $row['name'] = $it['name'] ?? ''; $row['remark'] = $it['remark'] ?? '';
        if ($type === 'import') {
            $row['qty'] = $it['qty'] ?? ''; $row['cif'] = $it['cif'] ?? '';
        } else {
            $row['qty_kg'] = $it['qtyKg'] ?? ''; $row['buy_price'] = $it['buyPrice'] ?? '';
            $row['margin_idx'] = $it['marginIdx'] ?? 0;
        }
        $itemRows[] = $row;
    }

    $marginRows = [];
    if ($type === 'domestic') {
        foreach (array_values($margins) as $i => $m) {
            $marginRows[] = ['costing_id' => $id, 'margin_no' => $i, 'name' => $m['name'] ?? '', 'val' => $m['val'] ?? ''];
        }
    }
    return [$h, $itemRows, $marginRows];
}

// ── RECOMPOSE: header assoc + item rows + margin rows -> nested data object ──
function cc_recompose(array $h, array $itemRows, array $marginRows): array {
    $type = $h['type'] ?? 'import';
    usort($itemRows, fn($a, $b) => (int) ($a['item_no'] ?? 0) <=> (int) ($b['item_no'] ?? 0));
    usort($marginRows, fn($a, $b) => (int) ($a['margin_no'] ?? 0) <=> (int) ($b['margin_no'] ?? 0));

    if ($type === 'import') {
        $items = array_map(fn($r) => [
            'name' => $r['name'] ?? '', 'qty' => $r['qty'] ?? '', 'cif' => $r['cif'] ?? '', 'remark' => $r['remark'] ?? '',
        ], $itemRows);
        return [
            'shipType' => $h['ship_type'] ?? 'breakbulk', 'customer' => $h['customer'] ?? '',
            'kurs' => cs_num($h['kurs'] ?? ''), 'importDuty' => cs_num($h['import_duty'] ?? ''),
            'wht' => cs_num($h['wht'] ?? ''), 'portCharges' => cs_num($h['port_charges'] ?? ''),
            'hedgeRate' => cs_num($h['hedge_rate'] ?? ''), 'hedgeDays' => cs_num($h['hedge_days'] ?? ''),
            'tujuan' => $h['destination'] ?? '', 'isPipa' => cs_b($h['is_pipa'] ?? ''),
            'stripping' => cs_num($h['stripping'] ?? ''), 'addCost' => cs_num($h['add_cost'] ?? ''),
            'commission' => cs_num($h['commission'] ?? ''), 'commUnit' => $h['comm_unit'] ?? 'idr',
            'marginType' => $h['margin_type'] ?? 'fixed', 'margin' => cs_num($h['margin'] ?? ''),
            'payTerms' => $h['pay_terms'] ?? '',
            'items' => $items ?: [['name' => '', 'qty' => '', 'cif' => '', 'remark' => '']],
            'paramsOpen' => true, 'bdOpen' => true, 'showUpload' => false, 'upTab' => 'excel',
            'uping' => false, 'upPreview' => null, 'upErr' => '', 'pasteTxt' => '', 'showPL' => false,
        ];
    }
    $margins = array_map(fn($r) => ['name' => $r['name'] ?? '', 'val' => cs_num($r['val'] ?? '')], $marginRows);
    $items = array_map(fn($r) => [
        'name' => $r['name'] ?? '', 'qtyKg' => $r['qty_kg'] ?? '', 'buyPrice' => $r['buy_price'] ?? '',
        'marginIdx' => (int) ($r['margin_idx'] ?? 0), 'remark' => $r['remark'] ?? '',
    ], $itemRows);
    return [
        'customer' => $h['customer'] ?? '', 'whtRate' => cs_num($h['wht_rate'] ?? ''),
        'addCost' => cs_num($h['add_cost'] ?? ''),
        'margins' => $margins ?: [['name' => 'A', 'val' => 1000], ['name' => 'B', 'val' => 800], ['name' => 'C', 'val' => 600]],
        'trkCost' => cs_num($h['truck_cost'] ?? ''), 'trkFrom' => $h['truck_from'] ?? '', 'trkTo' => $h['truck_to'] ?? '',
        'payTerms' => $h['pay_terms'] ?? '',
        'items' => $items ?: [['name' => '', 'qtyKg' => '', 'buyPrice' => '', 'marginIdx' => 0, 'remark' => '']],
        'showUpload' => false, 'upTab' => 'excel', 'uping' => false, 'upPreview' => null,
        'upErr' => '', 'pasteTxt' => '', 'showPL' => false,
    ];
}

// ── schema self-setup (idempotent; makes the cutover seamless) ──
/** Append any missing header columns to `costings` without disturbing existing columns (incl. data_json). */
function cc_ensure_header(GoogleSheets $gs, string $sid): void {
    $headers = $gs->headers($sid, CS_TAB);
    $missing = array_values(array_diff(CS_HEADER_COLS, $headers));
    if (!$missing) return;
    $gs->updateRange($sid, CS_TAB . '!A1', [array_merge($headers, $missing)]);
    $gs->cacheClear();
}
/** Create a child tab, or fix its header if it carries a different (e.g. legacy) schema. */
function cc_ensure_tab(GoogleSheets $gs, string $sid, string $tab, array $cols): void {
    if (!array_key_exists($tab, $gs->sheetMeta($sid))) {
        $gs->batchUpdate($sid, [['addSheet' => ['properties' => ['title' => $tab]]]]);
        $gs->updateRange($sid, $tab . '!A1', [$cols]);
        return;
    }
    if ($gs->headers($sid, $tab) !== $cols) {
        $gs->replaceTable($sid, $tab, [$cols], count($cols));   // discard non-authoritative old rows
    }
}
function cc_child_rows(GoogleSheets $gs, string $sid, string $tab, string $id): array {
    $out = [];
    foreach ($gs->table($sid, $tab, false)['rows'] as $r) if ((string) ($r['costing_id'] ?? '') === $id) $out[] = $r;
    return $out;
}
function cc_delete_child(GoogleSheets $gs, string $sid, string $tab, string $id): void {
    $rows = [];
    foreach ($gs->table($sid, $tab, false)['rows'] as $r) if ((string) ($r['costing_id'] ?? '') === $id) $rows[] = $r['_row'];
    if ($rows) $gs->deleteRows($sid, $tab, $rows);
}

// ── public CRUD ──
function cc_list(GoogleSheets $gs, string $sid, string $type): array {
    $out = [];
    foreach ($gs->table($sid, CS_TAB)['rows'] as $r) {
        if (($r['id'] ?? '') === '' || ($r['type'] ?? '') !== $type) continue;
        $out[] = ['id' => $r['id'], 'customer' => $r['customer'] ?? '', 'created_at' => $r['created_at'] ?? ''];
    }
    usort($out, fn($a, $b) => strcmp($b['created_at'] ?? '', $a['created_at'] ?? ''));
    return $out;
}

/** Recompose a costing to its nested data object, or null if not found. */
function cc_load(GoogleSheets $gs, string $sid, string $id): ?array {
    $h = find_by_id($gs, $sid, CS_TAB, $id);
    if (!$h) return null;
    // Legacy fallback: un-migrated row still carries data_json and empty columns.
    if (($h['ship_type'] ?? '') === '' && ($h['wht_rate'] ?? '') === '' && !empty($h['data_json'])) {
        $d = json_decode((string) $h['data_json'], true);
        if (is_array($d)) return $d;
    }
    $items   = cc_child_rows($gs, $sid, CS_ITEMS_TAB, $id);
    $margins = cc_child_rows($gs, $sid, CS_MARGIN_TAB, $id);
    return cc_recompose($h, $items, $margins);
}

/** Create or update a costing (upsert by id). */
function cc_save(GoogleSheets $gs, string $sid, string $id, string $type, string $customer, array $data, string $created, string $updated): void {
    cc_ensure_header($gs, $sid);
    cc_ensure_tab($gs, $sid, CS_ITEMS_TAB, CS_ITEM_COLS);
    cc_ensure_tab($gs, $sid, CS_MARGIN_TAB, CS_MARGIN_COLS);
    [$h, $itemRows, $marginRows] = cc_decompose($id, $type, $customer, $data, $created, $updated);

    $existing = find_by_id($gs, $sid, CS_TAB, $id);
    if ($existing) $gs->updateAssoc($sid, CS_TAB, $existing['_row'], $h);
    else           $gs->appendAssoc($sid, CS_TAB, $h);

    cc_delete_child($gs, $sid, CS_ITEMS_TAB, $id);
    if ($itemRows) $gs->appendAssocBulk($sid, CS_ITEMS_TAB, $itemRows);
    cc_delete_child($gs, $sid, CS_MARGIN_TAB, $id);
    if ($marginRows) $gs->appendAssocBulk($sid, CS_MARGIN_TAB, $marginRows);
}

function cc_delete(GoogleSheets $gs, string $sid, string $id): void {
    $h = find_by_id($gs, $sid, CS_TAB, $id);
    if ($h) $gs->deleteRows($sid, CS_TAB, [$h['_row']]);
    cc_delete_child($gs, $sid, CS_ITEMS_TAB, $id);
    cc_delete_child($gs, $sid, CS_MARGIN_TAB, $id);
}
