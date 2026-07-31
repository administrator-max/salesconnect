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

/* ── Product aliases ──────────────────────────────────────────────────
 * The same real product appears under several spellings: shipment lots and
 * the ledger use the canonical name (`GI ALLOY`), while legacy rows still
 * carry the alias (`GI BORON`). The payload builder already resolves this on
 * READ (iqdash_data.php's $aliasMap). The WRITE path did not — it compared
 * `$s['product'] === $product` literally, so a lot saved under the canonical
 * name never matched the legacy stats row and a DUPLICATE row was inserted
 * instead. Six companies (BDG, BHG, HKG, JKT, SMS, SPA) drifted that way,
 * corrupting the `prevUtil + prevAvail` obtained basis that caps the next lot
 * edit. See logs/audit-mt-truncation_2026-07-27_log.md.
 * Every stats lookup must go through iq_find_product_row_idx(). */

/** alias => canonical map read from the `product_aliases` tab. */
function iq_alias_map(GoogleSheets $gs, string $sid): array {
    $rows = $gs->table($sid, 'product_aliases')['rows'] ?? [];
    $map = [];
    foreach ($rows as $r) {
        $alias = trim((string) ($r['alias'] ?? ''));
        $canon = trim((string) ($r['canonical'] ?? ''));
        if ($alias !== '' && $canon !== '') $map[$alias] = $canon;
    }
    return $map;
}

/** Canonical product name; identity when the name has no alias entry. */
function iq_canon_product($p, array $aliasMap): string {
    $s = trim((string) ($p ?? ''));
    return $aliasMap[$s] ?? $s;
}

/**
 * Index of the row in a company+product-keyed table (company_product_stats,
 * company_reapply_targets) matching $code + $product, comparing
 * CANONICAL names on both sides, or null when the company holds no row for
 * that product. Pass an empty $aliasMap for literal matching.
 */
function iq_find_product_row_idx(array $stats, string $code, $product, array $aliasMap): ?int {
    $want = iq_canon_product($product, $aliasMap);
    if ($want === '') return null;
    foreach ($stats as $i => $s) {
        if ((string) ($s['company_code'] ?? '') !== $code) continue;
        if (iq_canon_product($s['product'] ?? '', $aliasMap) === $want) return $i;
    }
    return null;
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

/* ── "is this cell a real date?" ─────────────────────────────────────────
 * The period filter lives in the browser and decides with pDate()
 * (assets/js/02-period-filter.js). Any server-side rule about dates has to
 * agree with it cell-for-cell, otherwise the API "fixes" something the
 * dashboard still reads as blank (or vice versa). iq_date_iso() is NOT that
 * rule — it is deliberately stricter (DD/MM/YYYY + ISO only, real-calendar
 * checked) and is used to VALIDATE user input. This one is the permissive
 * recogniser that mirrors pDate()'s accepted set, including the 'DD-Mon-YY'
 * shape todayStd() stamps onto revision cycles ("30-Jul-26") and the
 * Indonesian month names already sitting in the sheet ("12 Mei 2026"). */

/** Month name (EN + ID, long + short, lowercase) => 1-12. Mirrors _MONTH_NAME_MAP in assets/js/01-data.js. */
function iq_month_name_map(): array {
    static $map = null;
    if ($map !== null) return $map;
    // Kept key-for-key identical to the JS map — NOT a superset. A name PHP
    // accepts but pDate() does not would let the backfill below write a
    // "date" the dashboard still reads as blank, which is exactly the class
    // of drift this whole change removes.
    $map = [
        // English short + long
        'jan' => 1, 'january' => 1, 'feb' => 2, 'february' => 2, 'mar' => 3, 'march' => 3,
        'apr' => 4, 'april' => 4, 'may' => 5, 'jun' => 6, 'june' => 6, 'jul' => 7, 'july' => 7,
        'aug' => 8, 'august' => 8, 'sep' => 9, 'sept' => 9, 'september' => 9,
        'oct' => 10, 'october' => 10, 'nov' => 11, 'november' => 11, 'dec' => 12, 'december' => 12,
        // Indonesian short + long
        'mei' => 5, 'agu' => 8, 'agust' => 8, 'agustus' => 8, 'okt' => 10, 'oktober' => 10,
        'des' => 12, 'desember' => 12,
        'januari' => 1, 'februari' => 2, 'maret' => 3, 'juni' => 6, 'juli' => 7,
    ];
    return $map;
}

/**
 * True when $v reads as a calendar date to the dashboard's pDate(): ISO
 * 'YYYY-MM-DD', 'D/M/YY(YY)', or 'DD-Mon-YY' / 'DD Month YYYY' (EN + ID).
 * 'TBA', a document number ('1075/ILMATE/PERTEK-SPI-U-Rev.1/VI/2026'), an
 * empty cell and free text all return false.
 */
function iq_is_date_like($v): bool {
    if ($v === null) return false;
    $s = trim((string) $v);
    if ($s === '' || preg_match('/^(tba|null|undefined)$/i', $s)) return false;

    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) {
        return checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
    }
    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/', $s, $m)) {
        $y = (int) $m[3];
        if ($y < 100) $y += 2000;
        return checkdate((int) $m[2], (int) $m[1], $y);
    }
    if (preg_match('/^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{2,4})$/', $s, $m)) {
        $mo = iq_month_name_map()[strtolower($m[2])] ?? null;
        if ($mo === null) return false;
        $y = (int) $m[3];
        if ($y < 100) $y += 2000;
        return checkdate($mo, (int) $m[1], $y);
    }
    return false;
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

/* ── realization dedupe ──────────────────────────────────────────────────
 * Lives here, not in iqdash_write.php, because all three readers need it:
 * iqdash_data.php, iq_realizations_list() and iq_ins_realizationMetrics().
 * Insights loads no other module, so anything it calls has to sit in util.
 */

/** (string) cast that treats null/missing the same as JS `undefined`/''. */
function iq_wstr($v): string {
    return (string) ($v ?? '');
}

/**
 * Shared unique-key builder for realization rows: company_code|pib_no|
 * line_no (string-cast, '' for null/missing — mirrors JS `r.company_code ||
 * ''` etc.). Used by both the READ-side dedupe (iq_dedupe_realizations,
 * server.js's dedupeRealizations key, server.js:2312) and the WRITE-side
 * pure merge primitive (iq_realizations_merge, Task 11) so the two stay
 * consistent by construction.
 */
function iq_realization_key(array $r): string {
    return iq_wstr($r['company_code'] ?? null) . '|' . iq_wstr($r['pib_no'] ?? null) . '|' . iq_wstr($r['line_no'] ?? null);
}

/**
 * Collapse duplicate PIB lines (same company_code+pib_no+line_no) that an
 * earlier double-import created. Mirrors server.js's dedupeRealizations():
 * first occurrence wins UNLESS it was imported_by 'migrationA' and a LATER
 * duplicate is NOT 'migrationA' — in that case the later, non-migrationA
 * copy replaces it. Key/iteration order preserved (PHP array insertion
 * order mirrors the JS Map's).
 */
function iq_dedupe_realizations(array $rows): array {
    $byKey = [];
    foreach ($rows as $r) {
        $k = iq_realization_key($r);
        if (!array_key_exists($k, $byKey)) {
            $byKey[$k] = $r;
            continue;
        }
        $cur = $byKey[$k];
        if (($cur['imported_by'] ?? null) === 'migrationA' && ($r['imported_by'] ?? null) !== 'migrationA') {
            $byKey[$k] = $r;
        }
    }
    return array_values($byKey);
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
