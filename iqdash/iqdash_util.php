<?php
/** Utility helpers for the iqdash module: coercion, dates, tab list, ledger loaders, file lock. */

require_once __DIR__ . '/../lib/helpers.php';

/** Ordered list of tab names read by the payload. */
function iq_tabs(): array {
    return [
        'companies',
        'company_directory',
        'products',
        'product_aliases',
        'company_products',
        'company_product_stats',
        'cycles',
        'cycle_products',
        'revision_changes',
        'company_shipments',
        'company_reapply_targets',
        'ra_records',
        'pending_meta',
        'realizations',
        'pertek_perubahan_release',
    ];
}

/** Mirror coerce() from IQ/lib/sheetsStore.js: ''/null -> null, 'TRUE'/'FALSE' -> bool, else passthrough. */
function iq_coerce($v) {
    if ($v === '' || $v === null) return null;
    if ($v === 'TRUE')  return true;
    if ($v === 'FALSE') return false;
    return $v;
}

/** Tolerant number parse: strips thousands commas; 'TBA'/''/null -> 0.0. */
function iq_num($v): float {
    if ($v === null) return 0.0;
    $s = trim((string)$v);
    if ($s === '') return 0.0;
    $s = str_replace(',', '', $s);
    if (!is_numeric($s)) return 0.0;
    return (float)$s;
}

/** Parse DD/MM/YYYY or ISO YYYY-MM-DD -> ISO YYYY-MM-DD, else null. */
function iq_date_iso($v): ?string {
    if ($v === null) return null;
    $s = trim((string)$v);
    if ($s === '') return null;

    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) {
        $y = (int)$m[1]; $mo = (int)$m[2]; $d = (int)$m[3];
        if (checkdate($mo, $d, $y)) return $s;
        return null;
    }

    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $s, $m)) {
        $d = (int)$m[1]; $mo = (int)$m[2]; $y = (int)$m[3];
        if (checkdate($mo, $d, $y)) {
            return sprintf('%04d-%02d-%02d', $y, $mo, $d);
        }
        return null;
    }

    return null;
}

/** Cached json_decode of iqdash/data/quotaLedger.json. */
function iq_ledger(): array {
    static $data = null;
    if ($data === null) {
        $raw = @file_get_contents(__DIR__ . '/data/quotaLedger.json');
        $decoded = $raw === false ? null : json_decode($raw, true);
        $data = is_array($decoded) ? $decoded : [];
    }
    return $data;
}

/** Cached json_decode of iqdash/data/pendingRevisions.json. */
function iq_pending_revisions(): array {
    static $data = null;
    if ($data === null) {
        $raw = @file_get_contents(__DIR__ . '/data/pendingRevisions.json');
        $decoded = $raw === false ? null : json_decode($raw, true);
        $data = is_array($decoded) ? $decoded : [];
    }
    return $data;
}

/** Cached json_decode of iqdash/data/ledgerCompanyDates.json. */
function iq_ledger_company_dates(): array {
    static $data = null;
    if ($data === null) {
        $raw = @file_get_contents(__DIR__ . '/data/ledgerCompanyDates.json');
        $decoded = $raw === false ? null : json_decode($raw, true);
        $data = is_array($decoded) ? $decoded : [];
    }
    return $data;
}

/** Serialize writes on the iqdash module via a file lock (copied from sp_with_lock). */
function iq_with_lock(callable $fn) {
    $cfg = sc_config();
    $dir = rtrim($cfg['cache_dir'] ?? (__DIR__ . '/../cache'), '/');
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $fh = @fopen($dir . '/iqdash.lock', 'c');
    if ($fh === false) return $fn();
    @flock($fh, LOCK_EX);
    try { return $fn(); }
    finally { @flock($fh, LOCK_UN); @fclose($fh); }
}
