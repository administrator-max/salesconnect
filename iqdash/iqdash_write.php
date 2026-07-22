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

/* ═══════════════════════════════════════════════════════════════════════
 * Task 12 — PATCH /api/company/:code: patchCompanySheets, server.js:1385-
 * 1548 (+ the util-recompute mirror of recomputeUtilizationFromLots,
 * server.js:439). Sheets-branch quirks worth flagging up front:
 *
 * OPTIMISTIC LOCK — real discrepancy vs the brief. The route's design
 * comment (server.js:394-399) documents ONE system-wide concurrency rule
 * ("client echoes `_ifUpdatedAt`; server rejects 409 if the row changed
 * since"), and the Neon branch (server.js:1582-1599) implements it with
 * `dbTs - clientTs > 1000` (1s clock-drift tolerance), only when the
 * client actually SENDS a token (`if (body._ifUpdatedAt)`). But
 * `patchCompanySheets()` itself — the literal function this task ports —
 * NEVER checks `_ifUpdatedAt` at all; the route only reaches the Neon
 * concurrency block in the `else` (non-Sheets) branch (server.js:1560-
 * 1571 calls patchCompanySheets and returns before that block). This is a
 * verified gap in server.js's Sheets path, not a design choice this port
 * should reproduce: the brief's interface (`iq_is_stale(...)`, tests for
 * both "older client => stale" and "equal => not stale") explicitly asks
 * for the lock to exist here. `iq_patch_company()` therefore ADDS the
 * check to the Sheets path, using the Neon branch's exact comparison rule
 * (>1000ms, skip entirely when no client token was sent) as the source of
 * truth for "the" optimistic-lock semantic, since it's the only concrete
 * implementation of the documented rule anywhere in server.js.
 *
 * UTIL RECOMPUTE — the brief's `iq_recompute_util_from_lots(array $lots):
 * array` is specified to skip lots where `util <= 0` (lot-level), then sum
 * the rest per product. The real server.js recompute (server.js:1448-1449
 * + 439-471) instead sums ALL lots per product first (including zero/
 * negative), then skips the WHOLE PRODUCT if that total isn't > 0 — a
 * product-level filter, not a lot-level one. For every realistic payload
 * (util_mt is a shipped tonnage; it is never negative) the two are
 * identical: a lot-level skip of `<=0` values can only ever change the
 * result when a product's lots mix positive AND negative values, which
 * cannot occur with real tonnage data. Per the brief's explicit interface
 * contract + tests, this port implements (and uses, inside
 * `iq_patch_company()`) the lot-level-skip version; documented here as a
 * deliberate divergence from a byte-exact port, scoped to a pathological
 * negative-`util_mt` input server.js itself was never designed to receive.
 *
 * WRITE STRATEGY — server.js's `store.batchRewrite()` (lib/sheetsStore.js:
 * 244-273) rewrites all touched tabs with a WRITE-FIRST-THEN-CLEAR-
 * TRAILING order specifically to avoid the 2026-06-12 incident where a
 * clear-then-write rewrite left the `companies` tab blank after a failed
 * write. `GoogleSheets::replaceTable()` (this PHP client) does the
 * opposite (clear THEN write) and per this task's instructions
 * GoogleSheets.php must not be touched — so `iq_patch_company()` does NOT
 * use `replaceTable()`. Instead `iq_write_full_table()` below reimplements
 * the same write-first-then-clear-trailing order per tab using
 * GoogleSheets's public `updateRange()`/`clearValues()`. It is 2 API calls
 * per touched tab (update + clear) rather than server.js's 2 calls TOTAL
 * across every touched tab (one multi-range batchUpdate + one multi-range
 * batchClear) — GoogleSheets.php exposes no multi-range value batch call,
 * and adding one is out of this task's scope. Correctness (never leave a
 * tab blank on a failed write) is preserved; call-count is not optimized.
 */

/** JS Boolean(v) truthiness — PHP's native `!$v`/`empty($v)` diverge from JS on the string `'0'` (falsy in PHP, truthy in JS) and on `[]`/objects (JS: any object, even `{}`/`[]`, is truthy). Used everywhere this port needs `!!x` semantics. */
function iq_js_truthy($v): bool {
    if ($v === null || $v === false) return false;
    if ($v === '') return false;
    if (is_int($v) || is_float($v)) return $v != 0; // JS: 0/-0/NaN falsy, all other numbers truthy
    return true; // non-empty strings (incl. '0'), arrays/objects, true
}

/** `Array.isArray(v)` for a PHP value decoded from JSON (assoc mode): a JSON array decodes to a PHP list; a JSON object decodes to a PHP assoc array. Both `[]` and `{}` decode identically in PHP (a known, accepted ambiguity — see the header comment above), so this can only distinguish non-empty arrays from non-empty objects. */
function iq_is_list($v): bool {
    return is_array($v) && array_values($v) === $v;
}

/**
 * PURE: mirrors the Neon branch's optimistic-lock comparison exactly
 * (server.js:1582-1599: `if (body._ifUpdatedAt) { ... dbTs - clientTs >
 * 1000 ... }`) — the only concrete implementation of the concurrency rule
 * documented at server.js:394-399, and what this port applies to the
 * Sheets path (see the Task 12 header comment above for why). No client
 * token sent (null/'') -> skip the check entirely -> not stale (matches
 * `if (body._ifUpdatedAt)` being falsy for `null`/''/undefined — the
 * frontend sends `_ifUpdatedAt: co._updatedAt || null`, so "no prior save"
 * literally sends `null`). An unparsable token on either side is treated
 * the same way (best-effort; never blocks a save on a parse failure).
 */
function iq_is_stale(?string $clientToken, ?string $sheetToken): bool {
    if ($clientToken === null || $clientToken === '') return false;
    $clientMs = iq_ts_ms($clientToken);
    $sheetMs  = iq_ts_ms($sheetToken);
    if ($clientMs === null || $sheetMs === null) return false;
    return ($sheetMs - $clientMs) > 1000;
}

/** Parse an ISO-ish or "Y-m-d H:i:s"-ish timestamp string into milliseconds since epoch (mirrors JS `new Date(s).getTime()` closely enough for the 1s-tolerance comparison above); null on an unparsable/empty string. */
function iq_ts_ms(?string $s): ?int {
    if ($s === null || $s === '') return null;
    $t = strtotime($s);
    if ($t === false) return null;
    $ms = 0;
    if (preg_match('/\.(\d+)/', $s, $m)) {
        $ms = (int) substr(str_pad($m[1], 3, '0'), 0, 3);
    }
    return $t * 1000 + $ms;
}

/**
 * PURE: per-product Σ util_mt across shipment lots — mirrors
 * recomputeUtilizationFromLots (server.js:439) / the inline mirror inside
 * patchCompanySheets (server.js:1448-1449+1458), with the lot-level-skip
 * semantic documented in this file's Task 12 header comment: a lot whose
 * `util_mt <= 0` never contributes to (and can never single-handedly
 * create) a product's total, so a util_mt=0 lot (e.g. a realization-only
 * lot with no utilization of its own) can never lower or zero out an
 * existing utilization figure. A product whose lots are ALL <=0 is simply
 * absent from the returned map (equivalent to server.js's `continue` that
 * leaves the product's existing stats row untouched).
 *
 * $lots: list of assoc rows with at least `product` and `util_mt`.
 * Returns: [product => float utilMT], only for products with a positive sum.
 */
function iq_recompute_util_from_lots(array $lots): array {
    $sums = [];
    foreach ($lots as $lot) {
        $util = iq_num($lot['util_mt'] ?? 0);
        if ($util <= 0) continue;
        $product = (string) ($lot['product'] ?? '');
        $sums[$product] = ($sums[$product] ?? 0.0) + $util;
    }
    return $sums;
}

/**
 * Rewrite a full tab from assoc rows: header row (row 1) is never touched;
 * data rows are written starting at A2 FIRST, and only the trailing region
 * below the freshly-written rows is cleared afterward — see the Task 12
 * header comment ("WRITE STRATEGY") for why this order matters. A cell
 * value is serialized via iq_log_cell() (null/missing -> '', true ->
 * 'TRUE', false -> 'FALSE'), mirroring sheetsStore.js's generic `_toCell()`
 * used by its own batchRewrite() for every tab, not just Change_Log.
 */
function iq_write_full_table(GoogleSheets $gs, string $sid, string $tab, array $assocRows): void {
    $headers = $gs->headers($sid, $tab);
    if (!$headers) return; // tab has no header row -> nothing we can safely write

    $matrix = [];
    foreach ($assocRows as $row) {
        $line = [];
        foreach ($headers as $h) {
            $line[] = iq_log_cell(array_key_exists($h, $row) ? $row[$h] : null);
        }
        $matrix[] = $line;
    }
    if ($matrix) {
        $gs->updateRange($sid, $tab . '!A2', $matrix);
    }
    $clearFromRow = count($matrix) + 2;
    $gs->clearValues($sid, $tab . '!A' . $clearFromRow . ':BZ100000');
}

/**
 * Full port of `patchCompanySheets()` (server.js:1385-1548). Wrapped in
 * iq_with_lock() so a concurrent PATCH can't interleave reads/writes
 * (server.js relies on Node's single-threaded event loop + its own
 * per-tab-array mutation-in-place for this; the file lock is this port's
 * equivalent serialization primitive, same pattern as Task 11's write
 * helpers). See the Task 12 header comment for the three documented
 * divergences (optimistic lock added, lot-level util skip, per-tab write
 * order) — everything else below is a line-for-line port.
 *
 * Returns `['ok'=>true,'updatedAt'=>string,'ra'=>bool]` on success, or
 * `['error'=>string,'status'=>404|409|500]` on not-found / stale / the
 * anti-wipe guard.
 */
function iq_patch_company(GoogleSheets $gs, string $sid, string $code, array $body): array {
    return iq_with_lock(function () use ($gs, $sid, $code, $body) {
        $companies = $gs->table($sid, 'companies')['rows'];
        $idx = null;
        foreach ($companies as $i => $c) {
            if ((string) ($c['code'] ?? '') === $code) { $idx = $i; break; }
        }
        if ($idx === null) return ['error' => 'company not found', 'status' => 404];

        $co = $companies[$idx];

        // ── optimistic lock — see Task 12 header comment ──
        $clientToken = array_key_exists('_ifUpdatedAt', $body) && $body['_ifUpdatedAt'] !== null
            ? (string) $body['_ifUpdatedAt'] : null;
        if (iq_is_stale($clientToken, $co['updated_at'] ?? null)) {
            return ['error' => 'stale', 'status' => 409];
        }

        $nowISO = iq_iso_now();

        // ── scalar fields (same allow-list as Neon; util/avail excluded) ──
        $allowed = ['submit1','obtained','rev_type','rev_note','rev_submit_date','rev_status','rev_mt','remarks','spi_ref','status_update','pertek_no','spi_no','updated_by','updated_date'];
        foreach ($allowed as $f) {
            $camel = preg_replace_callback('/_([a-z])/', fn($m) => strtoupper($m[1]), $f);
            if (array_key_exists($camel, $body)) {
                $co[$f] = $body[$camel];
            } elseif (array_key_exists($f, $body)) {
                $co[$f] = $body[$f];
            }
        }
        $co['updated_at'] = $nowISO;

        $changed = [];

        // ── products: full replace company_products ──
        if (iq_is_list($body['products'] ?? null)) {
            $cp = array_values(array_filter(
                $gs->table($sid, 'company_products')['rows'],
                fn($r) => (string) ($r['company_code'] ?? '') !== $code
            ));
            $maxId = 0;
            foreach ($cp as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxId) $maxId = $n; }
            $seen = [];
            $sortOrder = 0;
            foreach ($body['products'] as $p) {
                if (!iq_js_truthy($p)) continue; // filter(Boolean)
                $key = (string) $p;
                if (isset($seen[$key])) continue;
                $seen[$key] = true;
                $maxId++;
                $cp[] = ['id' => $maxId, 'company_code' => $code, 'product' => $p, 'sort_order' => $sortOrder, 'source_program' => 'B'];
                $sortOrder++;
            }
            $changed['company_products'] = $cp;
        }

        // ── pending_meta (PENDING companies only) ──
        if ((array_key_exists('pendingMt', $body) || array_key_exists('pendingStatus', $body) || array_key_exists('pendingDate', $body))
            && ($co['section'] ?? null) === 'PENDING') {
            $pm = $gs->table($sid, 'pending_meta')['rows'];
            $pi = null;
            foreach ($pm as $i => $r) { if ((string) ($r['company_code'] ?? '') === $code) { $pi = $i; break; } }
            $cur = $pi !== null ? $pm[$pi] : ['company_code' => $code, 'mt' => 0, 'status' => '', 'date' => '', 'source_program' => 'B'];
            $upd = $cur;
            $upd['mt']     = $body['pendingMt']     ?? ($cur['mt'] ?? 0);
            $upd['status'] = $body['pendingStatus'] ?? ($cur['status'] ?? '');
            $upd['date']   = $body['pendingDate']   ?? ($cur['date'] ?? '');
            if ($pi !== null) $pm[$pi] = $upd; else $pm[] = $upd;
            $changed['pending_meta'] = $pm;
        }

        // ── shipments (lots) upsert per product ──
        $shipmentsTouched = false;
        $oldLotSums = []; // pre-patch Σ util_mt per product (baseline preservation)
        // JS: `if (body.shipments && typeof body.shipments === 'object')` — a
        // truthy object triggers this even when EMPTY (`{}`); the frontend
        // always sends `shipments: shipPayload` (never omitted), so this is
        // effectively always true in practice. Ported as-is: an empty
        // shipments payload still re-runs the recompute below over the
        // company's EXISTING lots (see the recompute step's own comment) —
        // that is server.js's real, idempotent-by-design behavior, not a gap.
        if (array_key_exists('shipments', $body) && $body['shipments'] !== null && $body['shipments'] !== false && is_array($body['shipments'])) {
            $shipmentsTouched = true;
            $ship = $gs->table($sid, 'company_shipments')['rows'];
            foreach ($ship as $r) {
                if ((string) ($r['company_code'] ?? '') === $code) {
                    $prod = $r['product'] ?? '';
                    $oldLotSums[$prod] = ($oldLotSums[$prod] ?? 0.0) + iq_num($r['util_mt'] ?? 0);
                }
            }
            $maxId = 0;
            foreach ($ship as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxId) $maxId = $n; }

            foreach ($body['shipments'] as $product => $lots) {
                if (!is_array($lots)) continue;
                // Note: a lot with a null/missing lotNo must never spuriously
                // "keep" (or later match) a sheet row whose lot_no cell is
                // genuinely '' — hence the `!== null` guards below rather than
                // a bare (string) cast of both sides to ''/''.
                $keep = [];
                foreach ($lots as $l) {
                    if (array_key_exists('lotNo', $l) && $l['lotNo'] !== null) $keep[(string) $l['lotNo']] = true;
                }
                $ship = array_values(array_filter($ship, function ($r) use ($code, $product, $keep) {
                    return !((string) ($r['company_code'] ?? '') === $code
                        && (string) ($r['product'] ?? '') === (string) $product
                        && !isset($keep[(string) ($r['lot_no'] ?? '')]));
                }));
                foreach ($lots as $lot) {
                    $lotNo = array_key_exists('lotNo', $lot) ? $lot['lotNo'] : null;
                    $exIdx = null;
                    foreach ($ship as $i => $r) {
                        if ((string) ($r['company_code'] ?? '') === $code
                            && (string) ($r['product'] ?? '') === (string) $product
                            && $lotNo !== null
                            && (string) ($r['lot_no'] ?? '') === (string) $lotNo) { $exIdx = $i; break; }
                    }
                    $row = [
                        'company_code'  => $code,
                        'product'       => $product,
                        'lot_no'        => $lot['lotNo'] ?? null,
                        'util_mt'       => iq_js_or($lot['utilMT'] ?? null, 0),
                        'eta_jkt'       => iq_js_or($lot['etaJKT'] ?? null, ''),
                        'note'          => iq_js_or($lot['note'] ?? null, ''),
                        'real_mt'       => iq_js_or($lot['realMT'] ?? null, 0),
                        'pib_date'      => iq_js_or($lot['pibDate'] ?? null, ''),
                        'cargo_arrived' => iq_js_truthy($lot['cargoArrived'] ?? null),
                        'updated_at'    => $nowISO,
                    ];
                    if ($exIdx !== null) {
                        $ship[$exIdx] = array_merge($ship[$exIdx], $row);
                    } else {
                        $maxId++;
                        $ship[] = array_merge(['id' => $maxId, 'created_at' => $nowISO, 'source_program' => 'B'], $row);
                    }
                }
            }
            $changed['company_shipments'] = $ship;
        }

        // ── recompute utilization from lots (mirror recomputeUtilizationFromLots) ──
        if ($shipmentsTouched) {
            $companyLots = array_values(array_filter($changed['company_shipments'], fn($r) => (string) ($r['company_code'] ?? '') === $code));
            $lotSums = iq_recompute_util_from_lots($companyLots);
            if (count($lotSums)) {
                $stats = $gs->table($sid, 'company_product_stats')['rows'];
                $maxSid = 0;
                foreach ($stats as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxSid) $maxSid = $n; }
                foreach ($lotSums as $product => $util) {
                    $exIdx = null;
                    foreach ($stats as $i => $s) {
                        if ((string) ($s['company_code'] ?? '') === $code && (string) ($s['product'] ?? '') === (string) $product) { $exIdx = $i; break; }
                    }
                    $prevUtil  = $exIdx !== null ? iq_num($stats[$exIdx]['utilization_mt'] ?? 0) : 0.0;
                    $prevAvail = ($exIdx !== null && ($stats[$exIdx]['available_mt'] ?? null) !== null) ? iq_num($stats[$exIdx]['available_mt']) : 0.0;
                    $obtained  = $exIdx !== null ? $prevUtil + $prevAvail : $util;
                    $baseline  = max(0.0, $prevUtil - ($oldLotSums[$product] ?? 0.0));
                    $effUtil   = $baseline + $util;
                    $newAvail  = max(0.0, $obtained - $effUtil);
                    if ($exIdx !== null) {
                        $stats[$exIdx]['utilization_mt'] = $effUtil;
                        $stats[$exIdx]['available_mt']   = $newAvail;
                    } else {
                        $maxSid++;
                        $stats[] = ['id' => $maxSid, 'company_code' => $code, 'product' => $product, 'utilization_mt' => $effUtil, 'available_mt' => $newAvail, 'realization_mt' => '', 'eta_jkt' => '', 'arrived' => false, 'source_program' => 'B'];
                    }
                }
                $changed['company_product_stats'] = $stats;
                $coUtil = 0.0;
                foreach ($stats as $s) { if ((string) ($s['company_code'] ?? '') === $code) $coUtil += iq_num($s['utilization_mt'] ?? 0); }
                $coObt = (($co['obtained'] ?? null) !== null && $co['obtained'] !== '') ? iq_num($co['obtained']) : $coUtil;
                $co['utilization_mt']  = $coUtil;
                $co['available_quota'] = max(0.0, $coObt - $coUtil);
            }
        }

        // ── reapply targets upsert ──
        if (iq_is_list($body['reapplyTargets'] ?? null)) {
            $rt = $gs->table($sid, 'company_reapply_targets')['rows'];
            $maxId = 0;
            foreach ($rt as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxId) $maxId = $n; }
            foreach ($body['reapplyTargets'] as $t) {
                $product = is_array($t) ? ($t['product'] ?? null) : null;
                // Guard as above: a null product must never spuriously match a
                // sheet row whose product cell is genuinely ''.
                $exIdx = null;
                foreach ($rt as $i => $r) {
                    if ((string) ($r['company_code'] ?? '') === $code
                        && $product !== null
                        && (string) ($r['product'] ?? '') === (string) $product) { $exIdx = $i; break; }
                }
                $row = [
                    'company_code' => $code,
                    'product'      => $product,
                    'target_mt'    => (is_array($t) ? ($t['targetMT'] ?? null) : null) ?? '',
                    'submitted'    => iq_js_truthy(is_array($t) ? ($t['submitted'] ?? null) : null),
                    'submit_date'  => iq_js_or(is_array($t) ? ($t['submitDate'] ?? null) : null, ''),
                    'notes'        => iq_js_or(is_array($t) ? ($t['notes'] ?? null) : null, ''),
                    'source_program' => 'B',
                ];
                if ($exIdx !== null) $rt[$exIdx] = array_merge($rt[$exIdx], $row);
                else { $maxId++; $rt[] = array_merge(['id' => $maxId, 'created_at' => $nowISO], $row); }
            }
            $changed['company_reapply_targets'] = $rt;
        }

        // ── ra record update (UPDATE-only, like Neon) ──
        $raTouched = false;
        if (array_key_exists('ra', $body) && $body['ra'] !== null && $body['ra'] !== false) {
            $r = is_array($body['ra']) ? $body['ra'] : [];
            $ra = $gs->table($sid, 'ra_records')['rows'];
            $exIdx = null;
            foreach ($ra as $i => $x) { if ((string) ($x['company_code'] ?? '') === $code) { $exIdx = $i; break; } }
            if ($exIdx !== null) {
                $ra[$exIdx] = array_merge($ra[$exIdx], [
                    'berat'               => $r['berat'] ?? null,
                    'obtained'            => $r['obtained'] ?? null,
                    'cargo_arrived'       => iq_js_truthy($r['cargoArrived'] ?? null),
                    'real_pct'            => $r['realPct'] ?? null,
                    'util_pct'            => $r['utilPct'] ?? '',
                    'arrival_date'        => iq_js_or($r['arrivalDate'] ?? null, ''),
                    'eta_jkt'             => iq_js_or($r['etaJKT'] ?? null, ''),
                    'reapply_est'         => iq_js_or($r['reapplyEst'] ?? null, ''),
                    'reapply_stage'       => iq_js_or($r['reapplyStage'] ?? null, 1),
                    'reapply_submit_date' => iq_js_or($r['reapplySubmitDate'] ?? null, ''),
                    'reapply_status'      => iq_js_or($r['reapplyStatus'] ?? null, ''),
                    'target'              => $r['target'] ?? '',
                    'pertek'              => iq_js_or($r['pertek'] ?? null, ''),
                    'spi'                 => iq_js_or($r['spi'] ?? null, ''),
                    'catatan'             => iq_js_or($r['catatan'] ?? null, ''),
                    'updated_at'          => $nowISO,
                ]);
                $changed['ra_records'] = $ra;
                $raTouched = true;
            }
        }

        // ── Obtained stats reconcile (Manual Update "Obtained MT per product") ──
        if (iq_is_list($body['obtainedStats'] ?? null) && count($body['obtainedStats'])) {
            $stats = $changed['company_product_stats'] ?? $gs->table($sid, 'company_product_stats')['rows'];
            $maxSid = 0;
            foreach ($stats as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxSid) $maxSid = $n; }
            foreach ($body['obtainedStats'] as $it) {
                $product = trim((string) iq_js_or(is_array($it) ? ($it['product'] ?? null) : null, ''));
                $obtainedRaw = is_array($it) ? ($it['obtained'] ?? null) : null;
                $obtained = is_numeric($obtainedRaw) ? (float) $obtainedRaw : NAN;
                if ($product === '' || !is_finite($obtained) || $obtained < 0) continue;
                $exIdx = null;
                foreach ($stats as $i => $s) {
                    if ((string) ($s['company_code'] ?? '') === $code && (string) ($s['product'] ?? '') === $product) { $exIdx = $i; break; }
                }
                $util  = $exIdx !== null ? iq_num($stats[$exIdx]['utilization_mt'] ?? 0) : 0.0;
                $avail = max(0.0, $obtained - $util);
                if ($exIdx !== null) {
                    $stats[$exIdx]['available_mt'] = $avail; // utilization preserved
                } else {
                    $maxSid++;
                    $stats[] = ['id' => $maxSid, 'company_code' => $code, 'product' => $product, 'utilization_mt' => 0, 'available_mt' => $avail, 'realization_mt' => '', 'eta_jkt' => '', 'arrived' => false, 'source_program' => 'B'];
                }
            }
            $changed['company_product_stats'] = $stats;
            $coUtil = 0.0; $coAvail = 0.0;
            foreach ($stats as $s) {
                if ((string) ($s['company_code'] ?? '') !== $code) continue;
                $coUtil  += iq_num($s['utilization_mt'] ?? 0);
                $coAvail += iq_num($s['available_mt'] ?? 0);
            }
            $co['utilization_mt']  = $coUtil;
            $co['available_quota'] = $coAvail;
            $co['obtained']        = $coUtil + $coAvail;
        }

        $companies[$idx] = $co;
        $changed['companies'] = $companies;
        // Anti-wipe guard: a single-company patch must never shrink the master
        // list (idx!==null already implies >=1 row; this catches any future
        // regression that would otherwise blank the companies tab — see the
        // 2026-06-12 incident).
        if (!iq_is_list($changed['companies']) || count($changed['companies']) === 0) {
            return ['error' => 'refusing to write empty companies tab', 'status' => 500];
        }

        // Write dependent tabs first, `companies` (carrying the new
        // updated_at concurrency token) last — if a later write in this
        // sequence fails, the token a concurrent reader/next-PATCH sees
        // hasn't advanced yet, so it won't look like this save "completed".
        $order = ['company_products', 'pending_meta', 'company_shipments', 'company_product_stats', 'company_reapply_targets', 'ra_records', 'companies'];
        foreach ($order as $tab) {
            if (array_key_exists($tab, $changed)) {
                iq_write_full_table($gs, $sid, $tab, $changed[$tab]);
            }
        }

        $fieldsChanged = implode(',', array_filter(array_keys($body), fn($k) => $k !== '_ifUpdatedAt'));
        iq_log_change($gs, $sid, [
            'sheet'      => 'companies',
            'record_id'  => $code,
            'field'      => $fieldsChanged,
            'old_value'  => '',
            'new_value'  => '(patch)',
            'changed_by' => iq_js_or($body['updatedBy'] ?? null, 'api'),
            'note'       => 'company patch',
        ]);

        return ['ok' => true, 'updatedAt' => $co['updated_at'], 'ra' => $raTouched];
    });
}
