<?php
/**
 * iqdash write-side helpers: starts with the realization READ helpers used
 * by `GET /api/realizations` and `GET /api/realizations/summary` (Task 10).
 * Later tasks (11-14) add realization + company WRITE helpers to this same
 * file.
 *
 * PHP port of IQ/server.js (Sheets branch only):
 *   - dedupeRealizations()               server.js:2309-2318
 *   - GET /api/realizations              server.js:2381-2419
 *   - GET /api/realizations/summary      server.js:2334-2379
 */

require_once __DIR__ . '/iqdash_util.php';

/** (string) cast that treats null/missing the same as JS `undefined`/''. */
function iq_wstr($v): string {
    return (string) ($v ?? '');
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
        $k = iq_wstr($r['company_code'] ?? null) . '|' . iq_wstr($r['pib_no'] ?? null) . '|' . iq_wstr($r['line_no'] ?? null);
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

/**
 * Parse a pib_date string shaped DD/MM/YYYY into a comparable UTC
 * timestamp; anything else (empty, ISO, garbage) -> 0. Mirrors server.js's
 * inline `ts()` helper used only for this sort (server.js:2397) — NOT the
 * more permissive iq_date_iso() used elsewhere in this module.
 */
function iq_realization_date_ts($v): int {
    $s = iq_wstr($v);
    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $s, $m)) {
        return gmmktime(0, 0, 0, (int) $m[2], (int) $m[1], (int) $m[3]);
    }
    return 0;
}

/**
 * PURE: GET /api/realizations. Optional company_code filter (string-cast
 * compare, per this codebase's ID-compare convention), dedupe by
 * (company_code,pib_no,line_no), sort by pib_date DESC with tiebreak
 * company_code ASC, pib_no ASC, line_no ASC (numeric) — mirrors
 * server.js:2392-2403 exactly. Drops the GoogleSheets-internal `_row`
 * marker (not present in the JS store's row shape) from the output.
 */
function iq_realizations_list(array $rows, ?string $code): array {
    if ($code !== null && $code !== '') {
        $rows = array_values(array_filter($rows, function ($r) use ($code) {
            return iq_wstr($r['company_code'] ?? null) === (string) $code;
        }));
    }

    $rows = iq_dedupe_realizations($rows);

    usort($rows, function ($a, $b) {
        $ta = iq_realization_date_ts($a['pib_date'] ?? null);
        $tb = iq_realization_date_ts($b['pib_date'] ?? null);
        if ($ta !== $tb) return $tb <=> $ta; // DESC

        $c = strcmp(iq_wstr($a['company_code'] ?? null), iq_wstr($b['company_code'] ?? null));
        if ($c !== 0) return $c;

        $c = strcmp(iq_wstr($a['pib_no'] ?? null), iq_wstr($b['pib_no'] ?? null));
        if ($c !== 0) return $c;

        $la = (int) ($a['line_no'] ?? 0);
        $lb = (int) ($b['line_no'] ?? 0);
        return $la <=> $lb;
    });

    foreach ($rows as &$r) unset($r['_row']);
    unset($r);

    return array_values($rows);
}

/**
 * PURE: GET /api/realizations/summary. Dedupe (no company_code filter in
 * this step), keep rows with a truthy company_code, group by company_code:
 * pibs = count of DISTINCT truthy pib_no, lines = count of ALL matched
 * rows (with or without pib_no). Mirrors server.js:2342-2354 exactly.
 * Shape: { counts: {CODE: {pibs, lines}}, totalPibs, totalLines }.
 */
function iq_realizations_summary(array $rows): array {
    $deduped = iq_dedupe_realizations($rows);

    $byCo = [];
    foreach ($deduped as $r) {
        $code = $r['company_code'] ?? null;
        if ($code === null || $code === '') continue; // mirrors JS `if (r.company_code)`
        $codeKey = (string) $code;

        if (!isset($byCo[$codeKey])) $byCo[$codeKey] = ['pibs' => [], 'lines' => 0];

        $pib = $r['pib_no'] ?? null;
        if ($pib !== null && $pib !== '') $byCo[$codeKey]['pibs'][(string) $pib] = true;

        $byCo[$codeKey]['lines'] += 1;
    }

    $counts = [];
    $totalPibs = 0;
    $totalLines = 0;
    foreach ($byCo as $code => $c) {
        $pibCount = count($c['pibs']);
        $counts[$code] = ['pibs' => $pibCount, 'lines' => $c['lines']];
        $totalPibs += $pibCount;
        $totalLines += $c['lines'];
    }

    return ['counts' => $counts, 'totalPibs' => $totalPibs, 'totalLines' => $totalLines];
}
