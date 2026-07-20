<?php
/** Pure helpers + write-lock for the SCOT module. */
require_once __DIR__ . '/../lib/sheet_util.php';

const SCOT_NUMERIC = ['id','no','quantity_mt','est_sailing_days','actual_sailing_days',
    'clearance_days','unloading_days','delivery_days','year'];
const SCOT_DATE = ['etd','eta','pib_billing','bpn','spjm','behandle','sppb',
    'start_unloading','finish_unloading','start_delivery','enter_warehouse'];
const SCOT_WRITABLE = ['no','cargo_type','consignee','project_name','product','quantity_mt',
    'bl_number','shipping_line','vessel_name','voyage_number','pol','pod','shipment_route',
    'etd','eta','shipment_type','est_sailing_days','actual_sailing_days','pib_billing','bpn',
    'spjm','behandle','sppb','clearance_days','start_unloading','finish_unloading','unloading_days',
    'cargo_status','start_delivery','enter_warehouse','delivery_days','vendor_trucking',
    'warehouse_location','status','remarks','year'];

function scot_shape(array $r): array {
    $out = [];
    foreach ($r as $k => $v) {
        if ($k === '_row') continue;
        if ($v === '' || $v === null) { $out[$k] = null; continue; }
        if (in_array($k, SCOT_NUMERIC, true))      $out[$k] = 0 + $v;
        elseif (in_array($k, SCOT_DATE, true))     $out[$k] = substr((string)$v, 0, 10);
        else                                       $out[$k] = $v;
    }
    return $out;
}

function scot_sanitize(array $body): array {
    $clean = [];
    foreach (SCOT_WRITABLE as $k) {
        if (!array_key_exists($k, $body)) continue;
        $v = $body[$k];
        $clean[$k] = ($v === '') ? null : $v;
    }
    return $clean;
}

function scot_sort(array &$rows): void {
    usort($rows, function ($a, $b) {
        $ay = $a['year'] ?? null; $by = $b['year'] ?? null;
        $an = ($ay === null); $bn = ($by === null);
        if ($an !== $bn) return $an ? 1 : -1;
        if (!$an && $ay != $by) return ($by <=> $ay);
        return (($b['id'] ?? 0) <=> ($a['id'] ?? 0));
    });
}

function scot_with_lock(callable $fn) {
    $cfg = sc_config();
    $dir = rtrim($cfg['cache_dir'] ?? (__DIR__ . '/../cache'), '/');
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $fh = @fopen($dir . '/scot.lock', 'c');
    if ($fh === false) return $fn();
    @flock($fh, LOCK_EX);
    try { return $fn(); }
    finally { @flock($fh, LOCK_UN); @fclose($fh); }
}

function scot_next_id(GoogleSheets $gs, string $sid, string $tab, string $col = 'id'): int {
    $max = 0;
    foreach ($gs->table($sid, $tab, false)['rows'] as $r) {
        $n = (int) ($r[$col] ?? 0);
        if ($n > $max) $max = $n;
    }
    return $max + 1;
}
