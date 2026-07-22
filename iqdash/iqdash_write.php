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
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/sheet_util.php'; // find_by_id(), used by iq_realizations_delete()

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

/* ═══════════════════════════════════════════════════════════════════════
 * Task 11 — realization WRITES: POST /api/realizations (bulk),
 * POST /api/realizations/single, DELETE /api/realizations/:id.
 *
 * IMPORTANT DISCREPANCY vs the brief/plan: the brief's interface list asked
 * for `iq_realizations_upsert($gs,$sid,$rows)` doing conflict-resolution
 * ("upsert on unique (company_code,pib_no,line_no): update matching sheet
 * row via updateAssoc, else appendAssocBulk"). Reading the REAL server.js
 * Sheets write path shows this is wrong — insertRealizationsSheets()
 * (server.js:2319-2326), used by BOTH POST routes, never updates anything:
 * it always computes `maxId = max(existing ids) `, then appends every row
 * (bulk or single) as a brand-new row with a freshly minted sequential id
 * (`++maxId` per row). The (company_code,pib_no,line_no) "unique key" is
 * never consulted on write — only on READ, via dedupeRealizations()
 * (Task 10's iq_dedupe_realizations()), which collapses accidental
 * duplicates for display without touching the underlying Sheet rows.
 *
 * Per this task's own ambiguity-resolution note ("If bulk POST always
 * appends ... rather than upserts, port the REAL behavior and note the
 * discrepancy"), this port therefore provides:
 *   - iq_realization_key()      (factored above, Task 10 dedupe + this)
 *   - iq_realizations_merge()   — the GENERIC pure primitive the brief's
 *     interface literally asked for (conflict-on-key -> update, else
 *     append), implemented faithfully and offline-tested per Step 1 of the
 *     brief. It is NOT wired into the production write path, because doing
 *     so would make this port diverge from server.js's real behavior.
 *   - iq_realization_build()    — ports buildRealizationObj() (Sheets
 *     branch, server.js:2290-2305) field-for-field.
 *   - iq_realizations_insert()  — the thin Sheets wrapper actually used by
 *     the routes; mirrors insertRealizationsSheets() (server.js:2319-2326)
 *     exactly: always append, sequential ids, best-effort Change_Log.
 *   - iq_company_exists(), iq_log_change() — small shared helpers.
 */

/** Coerce a value-or-empty into a float, null for blanks/non-numeric — mirrors server.js's `_num()` (server.js:2234-2238). */
function iq_realization_num($v): ?float {
    if ($v === null || $v === '') return null;
    if (is_bool($v)) return null;
    if (!is_numeric($v)) return null;
    return (float) $v;
}

/** JS `||` fallback semantics for the falsy set actually reachable here (null/''/false/0/0.0): falsy -> $default, else $v unchanged. */
function iq_js_or($v, $default) {
    $falsy = ($v === null || $v === '' || $v === false || $v === 0 || $v === 0.0);
    return $falsy ? $default : $v;
}

/** ISO-8601 UTC "now", matching JS `new Date().toISOString()` shape (…SSSZ). */
function iq_iso_now(): string {
    $now = microtime(true);
    $ms  = (int) round(($now - floor($now)) * 1000);
    if ($ms >= 1000) $ms = 999; // guard the rare rounding-up-to-1000 edge
    return gmdate('Y-m-d\TH:i:s', (int) $now) . '.' . sprintf('%03d', $ms) . 'Z';
}

/**
 * PURE: ports buildRealizationObj() (server.js:2290-2305, Sheets branch)
 * field-for-field. $row uses the camelCase keys the frontend sends
 * (lineNo, hsCode, valueUSD, ...); the returned assoc row uses the
 * snake_case Sheet column names. $defaults = ['source'=>..,'sourceFile'=>..,
 * 'importedBy'=>..] (top-level POST body fields shared across all rows in
 * one call). $id is the pre-computed sequential id for this row.
 *
 * Sheets-branch-only quirk (verified against server.js, differs from the
 * Postgres branch's insertRealization()): `source` falls back to the row's
 * own `row.source` when `defaults.source` is empty, but `source_file` and
 * `imported_by` do NOT fall back to `row.sourceFile`/`row.importedBy` —
 * only `defaults.sourceFile`/`defaults.importedBy` are used. Ported as-is.
 */
function iq_realization_build(string $code, array $row, array $defaults, $id): array {
    $now = iq_iso_now();
    return [
        'id'               => $id,
        'company_code'     => $code,
        'product'          => iq_js_or($row['product'] ?? null, ''),
        'line_no'          => iq_realization_num($row['lineNo'] ?? null) ?? 1,
        'description'      => iq_js_or($row['description'] ?? null, ''),
        'hs_code'          => iq_js_or($row['hsCode'] ?? null, ''),
        'volume'           => iq_realization_num($row['volume'] ?? null),
        'unit'             => iq_js_or($row['unit'] ?? null, 'TNE'),
        'value_usd'        => iq_realization_num($row['valueUSD'] ?? null),
        'unit_price'       => iq_realization_num($row['unitPrice'] ?? null),
        'kurs'             => iq_realization_num($row['kurs'] ?? null),
        'country_origin'   => iq_js_or($row['countryOrigin'] ?? null, ''),
        'port_destination' => iq_js_or($row['portDestination'] ?? null, ''),
        'port_loading'     => iq_js_or($row['portLoading'] ?? null, ''),
        'ls_no'            => iq_js_or($row['lsNo'] ?? null, ''),
        'ls_date'          => iq_js_or($row['lsDate'] ?? null, ''),
        'pib_no'           => iq_js_or($row['pibNo'] ?? null, ''),
        'pib_date'         => iq_js_or($row['pibDate'] ?? null, ''),
        'invoice_no'       => iq_js_or($row['invoiceNo'] ?? null, ''),
        'invoice_date'     => iq_js_or($row['invoiceDate'] ?? null, ''),
        'pengajuan_no'     => iq_js_or($row['pengajuanNo'] ?? null, ''),
        'pengajuan_date'   => iq_js_or($row['pengajuanDate'] ?? null, ''),
        'source'           => iq_js_or($defaults['source'] ?? null, iq_js_or($row['source'] ?? null, 'manual')),
        'source_file'      => iq_js_or($defaults['sourceFile'] ?? null, ''),
        'imported_by'      => iq_js_or($defaults['importedBy'] ?? null, ''),
        'created_at'       => $now,
        'updated_at'       => $now,
        'source_program'   => 'B',
    ];
}

/**
 * PURE, generic primitive matching the brief's requested interface:
 * conflict on the unique key (iq_realization_key: company_code|pib_no|
 * line_no, string-cast) against $existing (rows carrying a GoogleSheets
 * `_row` sheet-row number) -> queued as an 'update' entry
 * `[sheetRow, incomingAssocRow]`; no match -> queued as an 'append' entry
 * (the incoming assoc row, unchanged). Matching is scoped to
 * incoming-vs-$existing only (mirrors the fact that server.js's real write
 * path never cross-checks rows within a single incoming batch against each
 * other either — see this file's header comment and
 * tests/test_realizations_write.php for the verified two-incoming-same-key
 * case). NOT invoked by the production routes (see header comment above);
 * kept as a tested, standalone utility per this task's interface contract.
 */
function iq_realizations_merge(array $existing, array $incoming): array {
    $byKey = [];
    foreach ($existing as $e) {
        $byKey[iq_realization_key($e)] = $e;
    }

    $update = [];
    $append = [];
    foreach ($incoming as $inc) {
        $k = iq_realization_key($inc);
        if (isset($byKey[$k])) {
            $update[] = [$byKey[$k]['_row'] ?? null, $inc];
        } else {
            $append[] = $inc;
        }
    }

    return ['update' => $update, 'append' => $append];
}

/** True if `companies` (by `code`, string-cast) contains $code — mirrors `.some(c => c.code === companyCode)`. */
function iq_company_exists(GoogleSheets $gs, string $sid, string $code): bool {
    foreach ($gs->table($sid, 'companies')['rows'] as $c) {
        if ((string) ($c['code'] ?? '') === $code) return true;
    }
    return false;
}

/**
 * Best-effort append to the Change_Log tab — mirrors store.logChange()
 * (lib/sheetsStore.js:275-290): a logging failure must NEVER abort the
 * caller's write, so every exception is swallowed here exactly like the
 * JS try/catch does.
 */
function iq_log_change(GoogleSheets $gs, string $sid, array $entry): void {
    try {
        $changedBy = $entry['changed_by'] ?? '';
        $gs->append($sid, 'Change_Log', [[
            iq_iso_now(),
            $entry['sheet'] ?? '',
            $entry['record_id'] ?? '',
            $entry['field'] ?? '',
            iq_log_cell($entry['old_value'] ?? null),
            iq_log_cell($entry['new_value'] ?? null),
            ($changedBy === null || $changedBy === '') ? 'api' : $changedBy,
            $entry['note'] ?? '',
        ]]);
    } catch (Throwable $e) {
        // best-effort only — swallow, matching server.js's logChange().
    }
}

/** Mirrors sheetsStore.js's `_toCell()` for the values inside a Change_Log row. */
function iq_log_cell($v) {
    if ($v === null) return '';
    if ($v === true) return 'TRUE';
    if ($v === false) return 'FALSE';
    return $v;
}

/**
 * Thin Sheets wrapper actually used by the write routes — mirrors
 * insertRealizationsSheets() (server.js:2319-2326) exactly: read the
 * `realizations` tab once to find `maxId` (max existing numeric `id`, 0 if
 * none), assign each incoming row the next sequential id, append them all
 * in one batch (appendAssocBulk), then best-effort log a single Change_Log
 * entry for the whole batch. Wrapped in iq_with_lock() so a concurrent
 * write can't compute a stale maxId. Returns the list of newly assigned ids
 * in the same order as $rows.
 *
 * $rows: array of raw camelCase row bodies (as sent by the frontend/import).
 * $defaults: ['source'=>string,'sourceFile'=>string,'importedBy'=>string].
 */
function iq_realizations_insert(GoogleSheets $gs, string $sid, string $companyCode, array $rows, array $defaults): array {
    return iq_with_lock(function () use ($gs, $sid, $companyCode, $rows, $defaults) {
        $existing = $gs->table($sid, 'realizations')['rows'];
        $maxId = 0;
        foreach ($existing as $r) {
            $n = (int) ($r['id'] ?? 0);
            if ($n > $maxId) $maxId = $n;
        }

        $objs = [];
        foreach ($rows as $row) {
            $maxId += 1;
            $objs[] = iq_realization_build($companyCode, is_array($row) ? $row : [], $defaults, $maxId);
        }

        if ($objs) {
            $gs->appendAssocBulk($sid, 'realizations', $objs);
            $importedBy = $defaults['importedBy'] ?? '';
            iq_log_change($gs, $sid, [
                'sheet'      => 'realizations',
                'record_id'  => implode(',', array_map(fn($o) => (string) $o['id'], $objs)),
                'field'      => '(insert)',
                'old_value'  => '',
                'new_value'  => $companyCode . ' × ' . count($objs),
                'changed_by' => ($importedBy === null || $importedBy === '') ? 'api' : $importedBy,
                'note'       => 'realization insert',
            ]);
        }

        return array_map(fn($o) => $o['id'], $objs);
    });
}

/**
 * Thin Sheets wrapper for DELETE /api/realizations/:id — mirrors the
 * Sheets branch of server.js's delete handler (server.js:2571-2599):
 * find the row by `id` (string-cast), physically remove it
 * (GoogleSheets::deleteRows — the PHP-idiomatic equivalent of the JS
 * store.rewriteTable() with that row filtered out; both end up removing
 * exactly that one row and leaving the rest untouched), then best-effort
 * log the delete. Returns true if a row was found+deleted, false if not
 * found (caller turns that into the 404).
 */
function iq_realizations_delete(GoogleSheets $gs, string $sid, $id): bool {
    return iq_with_lock(function () use ($gs, $sid, $id) {
        $row = find_by_id($gs, $sid, 'realizations', $id);
        if ($row === null) return false;

        $gs->deleteRows($sid, 'realizations', [$row['_row']]);
        iq_log_change($gs, $sid, [
            'sheet'      => 'realizations',
            'record_id'  => (string) $id,
            'field'      => '(delete)',
            'old_value'  => $id,
            'new_value'  => '',
            'changed_by' => 'api',
            'note'       => 'realization delete',
        ]);
        return true;
    });
}
