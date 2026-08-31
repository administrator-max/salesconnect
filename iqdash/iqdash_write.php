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
/* iq_sync_util_with_cycles() — aturan utilisasi milik jalur BACA, dipakai juga
   di sini supaya sheet dan dashboard tidak bisa memberi dua angka berbeda.
   iqdash_data.php tidak memuat berkas ini, jadi tidak ada lingkaran require. */
require_once __DIR__ . '/iqdash_data.php';
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/sheet_util.php'; // find_by_id(), used by iq_realizations_delete()

/* iq_wstr(), iq_realization_key() and iq_dedupe_realizations() moved to
 * iqdash_util.php (required above) so iqdash_insights.php — which loads no
 * other module — can dedupe too. Same implementations, unchanged. */

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

/**
 * Tahun kuota yang DITULIS ke sheet: 'YYYY' bila klien mengirim tahun yang
 * masuk akal, '' bila tidak.
 *
 * '' — bukan tahun bawaan — supaya baris lama tetap tak bertahun dan pembacanya
 * (iq_quota_year() di iqdash_data.php) yang memutuskan artinya. Menulis '2026'
 * ke ribuan baris lama akan menyamarkan mana yang benar-benar sudah ditandai
 * tim dan mana yang cuma kena tebakan sistem.
 */
function iq_quota_year_in($v): string {
    if ($v === null || $v === '' || $v === false) return '';
    $s = trim((string) $v);
    return preg_match('/^\d{4}$/', $s) ? $s : '';
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
        'quota_year'       => iq_quota_year_in($row['quotaYear'] ?? ($defaults['quotaYear'] ?? null)),
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
 * opposite (clear THEN write), so `iq_patch_company()` does NOT use
 * `replaceTable()`. UPDATE (batch-writes task): `GoogleSheets` has since
 * gained a direct port of server.js's `batchRewrite()` — `GoogleSheets::
 * batchRewrite()`, a single values:batchUpdate + single values:batchClear
 * across every touched tab, same write-first-then-clear-trailing order,
 * purely additive to the shared client. `iq_patch_company()` (and every
 * other multi-tab full-table write site in this file) now goes through
 * `iq_batch_write_full_tables()`, which calls it — restoring server.js's
 * ORIGINAL cross-tab atomicity (one failed tab in the batch means NOTHING
 * in the batch is written) and its 2-calls-TOTAL-per-save call count,
 * rather than this port's previous 2-calls-PER-TAB (`iq_write_full_table()`
 * calling `updateRange()`+`clearValues()` once per tab, non-atomic across
 * tabs). `iq_write_full_table()` itself is now a thin single-tab wrapper
 * around `iq_batch_write_full_tables()` — see its docblock.
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
/**
 * Utilisasi efektif satu produk sesudah lot-nya diubah — memakai ATURAN YANG
 * SAMA dengan jalur baca, dengan memanggil iq_sync_util_with_cycles().
 *
 * KENAPA MEMANGGIL, BUKAN MENYALIN
 * --------------------------------
 * Sebelum 31-Agu-2026 jalur ini punya rumusnya sendiri:
 *
 *     baseline = prevUtil - Sigma lot SEBELUM patch
 *     effUtil  = baseline + Sigma lot BARU
 *
 * "baseline" dimaksudkan sebagai utilisasi yang tercatat master tapi belum
 * dirinci per lot. Rumus itu benar HANYA kalau setiap lot yang sudah ada pasti
 * ikut terhitung di dalam prevUtil, dan setiap lot yang baru ditambahkan pasti
 * peristiwa BARU. Keduanya tidak berlaku untuk baris master yang bersifat
 * AGREGAT.
 *
 * IKM GI ALLOY: master punya SATU baris "Utilization #1, 2.300 MT, 24/07/2026"
 * yang merangkum dua lot (2.000 @ 24/07 dan 300 @ 29/07). Saat Sales menyimpan
 * lot ketiga, oldLotSums baru tahu 2.300 sementara prevUtil sudah 2.600, jadi
 * baseline dihitung 300 dan hasilnya 300 + 2.600 = 2.900 — tertulis ke sheet,
 * Available jatuh dari 1.550 ke 1.250 (dilaporkan tim 28-Agu-2026).
 *
 * Jalur baca sudah diajari bentuk agregat itu: awalan lot yang jumlahnya PAS
 * sama dengan total siklus master ADALAH rincian baris master. Menyalin
 * aturannya ke sini berarti dua salinan yang harus dijaga tetap sama — dan dua
 * salinan yang menyimpang persis asal-usul bug ini. Jadi yang dipanggil fungsi
 * aslinya.
 *
 * CADANGAN: kalau company itu tidak punya baris cycle_utilization sama sekali,
 * iq_sync_util_with_cycles() memang tidak berbuat apa-apa — master diam berarti
 * tidak ada yang bisa dirujuk. Untuk kasus itu rumus lama dipertahankan apa
 * adanya: perilakunya sudah benar di sana, dan mengubahnya akan menggeser
 * company yang tidak ada hubungannya dengan bug ini.
 *
 * @param array  $ucRows    baris cycle_utilization MILIK COMPANY INI (mentah)
 * @param array  $lotRows   baris company_shipments produk ini SESUDAH patch (mentah)
 * @param string $product   ejaan produk seperti tertulis di stats
 * @param float  $prevUtil  utilization_mt tersimpan
 * @param float  $prevAvail available_mt tersimpan
 * @param float  $lotSum    Sigma util_mt lot sesudah patch
 * @param float  $oldLotSum Sigma util_mt lot SEBELUM patch (untuk cadangan)
 */
function iq_util_efektif_produk(
    array $ucRows, array $lotRows, string $product,
    float $prevUtil, float $prevAvail, float $lotSum, float $oldLotSum,
    array $aliasMap = []
): float {
    $rumusLama = fn(): float => max(0.0, $prevUtil - $oldLotSum) + $lotSum;
    if (!count($ucRows)) return $rumusLama();

    $co = [
        'utilizationByProd' => [$product => $prevUtil],
        'availableByProd'   => [$product => $prevAvail],
        'utilCycles'        => array_map(fn($u) => [
            'cycle'   => (string) ($u['cycle_type'] ?? ''),
            'product' => (string) ($u['product'] ?? ''),
            'mt'      => iq_num($u['util_mt'] ?? 0),
            'date'    => (string) ($u['util_date'] ?? ''),
        ], array_values(array_filter($ucRows, fn($u) => iq_num($u['util_mt'] ?? 0) > 0))),
        'shipments'         => [$product => array_map(fn($l) => [
            'utilMT'   => iq_num($l['util_mt'] ?? 0),
            'utilDate' => (string) ($l['util_date'] ?? ''),
        ], array_values($lotRows))],
    ];
    iq_sync_util_with_cycles($co, $aliasMap);

    /* Kunci keluaran memakai ejaan yang sama dengan masukan, tapi dibaca
       defensif: kalau produknya tidak muncul kembali, rumus lama lebih baik
       daripada menulis 0 ke sheet. */
    if (!array_key_exists($product, $co['utilizationByProd'] ?? [])) return $rumusLama();
    return (float) $co['utilizationByProd'][$product];
}

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
 * Rewrite the data region of MANY tabs from assoc rows in ONE round trip via
 * `GoogleSheets::batchRewrite()` (a single values:batchUpdate + a single
 * values:batchClear, covering every tab in $sets) instead of the old N×
 * (updateRange + clearValues) sequence — this is the atomicity fix: a
 * mid-write failure can no longer desync tabs that must move together
 * (e.g. `cycles`/`cycle_products`), because they're now one Sheets call
 * apart, not two separate round trips apart. Write-first-then-clear
 * ordering and the header row being untouched are unchanged (now enforced
 * inside `GoogleSheets::batchRewrite()` itself — see its docblock).
 *
 * $sets: list of ['tab'=>string, 'rows'=>array<assoc>, 'headers'=>array].
 * A set whose `headers` is empty is skipped (mirrors iq_write_full_table()'s
 * own "tab has no header row -> nothing we can safely write" guard) —
 * `headers` MUST be pre-fetched/known by the caller (this helper never
 * fetches them itself; single-tab callers needing that fallback go through
 * `iq_write_full_table()`, which does).
 */
function iq_batch_write_full_tables(GoogleSheets $gs, string $sid, array $sets): void {
    $tabWrites = [];
    foreach ($sets as $set) {
        $headers = $set['headers'] ?? [];
        if (!$headers) continue; // tab has no header row -> nothing we can safely write
        $tab = $set['tab'];
        $matrix = [];
        foreach (($set['rows'] ?? []) as $row) {
            $line = [];
            foreach ($headers as $h) {
                $line[] = iq_log_cell(array_key_exists($h, $row) ? $row[$h] : null);
            }
            $matrix[] = $line;
        }
        $tabWrites[] = ['tab' => $tab, 'rows' => $matrix];
    }
    if (!$tabWrites) return;
    $gs->batchRewrite($sid, $tabWrites);
}

/**
 * Rewrite a full tab from assoc rows: header row (row 1) is never touched;
 * data rows are written starting at A2 FIRST, and only the trailing region
 * below the freshly-written rows is cleared afterward — see the Task 12
 * header comment ("WRITE STRATEGY") for why this order matters. A cell
 * value is serialized via iq_log_cell() (null/missing -> '', true ->
 * 'TRUE', false -> 'FALSE'), mirroring sheetsStore.js's generic `_toCell()`
 * used by its own batchRewrite() for every tab, not just Change_Log.
 *
 * $headers: pass the tab's header row when the caller already read it (e.g.
 * iq_patch_company()'s earlier `$gs->table($sid,$tab)` whole-table reads
 * return `['headers'=>...,'rows'=>...]` for free) so this skips the
 * redundant `$gs->headers($sid,$tab)` call — a separate `getValues("$tab!1:1")`
 * that does NOT hit GoogleSheets' range-keyed read cache populated by the
 * earlier whole-tab read, costing one extra network round-trip per touched
 * tab on every full company save. Falls back to fetching them when the
 * caller doesn't have them handy (null, the default).
 *
 * Thin wrapper around `iq_batch_write_full_tables()` — a single-tab call
 * through the same ONE write code path every full-table write (single- or
 * multi-tab) now goes through.
 */
function iq_write_full_table(GoogleSheets $gs, string $sid, string $tab, array $assocRows, ?array $headers = null): void {
    $headers = $headers ?? $gs->headers($sid, $tab);
    iq_batch_write_full_tables($gs, $sid, [['tab' => $tab, 'rows' => $assocRows, 'headers' => $headers]]);
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
        // Headers captured alongside each whole-table read below, so the
        // final write loop's iq_write_full_table() calls can skip their own
        // redundant $gs->headers($sid,$tab) fetch — see that function's
        // docblock.
        $tabHeaders = [];

        $companiesTbl = $gs->table($sid, 'companies');
        $tabHeaders['companies'] = $companiesTbl['headers'];
        $companies = $companiesTbl['rows'];
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
            $cpTbl = $gs->table($sid, 'company_products');
            $tabHeaders['company_products'] = $cpTbl['headers'];
            $cp = array_values(array_filter(
                $cpTbl['rows'],
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
            $pmTbl = $gs->table($sid, 'pending_meta');
            $tabHeaders['pending_meta'] = $pmTbl['headers'];
            $pm = $pmTbl['rows'];
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
            $shipTbl = $gs->table($sid, 'company_shipments');
            $tabHeaders['company_shipments'] = $shipTbl['headers'];
            $ship = $shipTbl['rows'];
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

                    /* ── Tanggal kuota DIPAKAI (2026-08-07). Bukan etaJKT. ──
                       ABSEN != KOSONG. Baris lot ditulis utuh, jadi field yang
                       tidak dikirim penyimpan akan tertulis '' dan MENGHAPUS
                       tanggal yang sudah ada. Persis itu yang terjadi 10 Agu
                       2026: tombol Save utama (16-storage.js) tidak menyertakan
                       `utilDate`, dan setiap simpan menyapu bersih tanggal
                       seluruh lot company itu — seisi tab jadi kosong.

                       Aturannya sekarang: kirim '' = hapus (disengaja); tidak
                       mengirim sama sekali = pertahankan yang tersimpan.
                       Penyimpan yang lupa jadi tidak berbahaya. */
                    if (array_key_exists('utilDate', $lot)) {
                        $row['util_date'] = iq_js_or($lot['utilDate'], '');
                    } elseif ($exIdx !== null) {
                        $row['util_date'] = $ship[$exIdx]['util_date'] ?? '';
                    } else {
                        $row['util_date'] = '';
                    }

                    /* Tahun kuota lot: aturan ABSEN != KOSONG yang sama.
                       Penyimpan lama tidak mengirim field ini sama sekali, dan
                       menuliskannya '' akan melepas lot 2027 kembali ke tahun
                       bawaan tanpa ada yang meminta. */
                    if (array_key_exists('quotaYear', $lot)) {
                        $row['quota_year'] = iq_quota_year_in($lot['quotaYear']);
                    } elseif ($exIdx !== null) {
                        $row['quota_year'] = $ship[$exIdx]['quota_year'] ?? '';
                    } else {
                        $row['quota_year'] = '';
                    }

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
                $statsTbl = $gs->table($sid, 'company_product_stats');
                $tabHeaders['company_product_stats'] = $statsTbl['headers'];
                $stats = $statsTbl['rows'];
                $maxSid = 0;
                foreach ($stats as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxSid) $maxSid = $n; }
                $aliasMap = iq_alias_map($gs, $sid);
                /* Baris cycle_utilization milik company ini — masukan aturan
                   utilisasi bersama di iq_util_efektif_produk(). Dibaca SEKALI
                   untuk seluruh produk. */
                $ucCo = array_values(array_filter(
                    $gs->table($sid, 'cycle_utilization')['rows'],
                    fn($u) => (string) ($u['company_code'] ?? '') === $code
                ));
                foreach ($lotSums as $product => $util) {
                    // Canonical match: lots use `GI ALLOY`, legacy stats rows
                    // `GI BORON`. A literal compare missed and inserted a
                    // duplicate row — see iq_find_product_row_idx()'s docblock.
                    $exIdx = iq_find_product_row_idx($stats, $code, $product, $aliasMap);
                    $prevUtil  = $exIdx !== null ? iq_num($stats[$exIdx]['utilization_mt'] ?? 0) : 0.0;
                    $prevAvail = ($exIdx !== null && ($stats[$exIdx]['available_mt'] ?? null) !== null) ? iq_num($stats[$exIdx]['available_mt']) : 0.0;
                    $obtained  = $exIdx !== null ? $prevUtil + $prevAvail : $util;
                    /* Aturan utilisasi ada di SATU tempat — lihat docblock
                       iq_util_efektif_produk(). Rumus "baseline + Sigma lot"
                       yang dulu di sini menggelembungkan IKM GI ALLOY jadi
                       2.900, karena baris master yang bersifat agregat sudah
                       merangkum sebagian lot. */
                    $lotProd = array_values(array_filter(
                        $companyLots,
                        fn($r) => iq_canon_product((string) ($r['product'] ?? ''), $aliasMap)
                               === iq_canon_product((string) $product, $aliasMap)
                    ));
                    $effUtil   = iq_util_efektif_produk(
                        $ucCo, $lotProd, (string) $product,
                        $prevUtil, $prevAvail, (float) $util,
                        (float) ($oldLotSums[$product] ?? 0.0), $aliasMap
                    );
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

        /* ── per-product utilization DATE (company_product_stats.eta_jkt) ──
         * The master keeps utilization as a PAIR of rows per company:
         * `Utilization (MT)` and `Utilization (date)`. `company_product_stats`
         * has mirrored that shape since the port — utilization_mt + eta_jkt —
         * and the payload already ships the date as `etaByProd`. Nothing ever
         * WROTE it, though: every site that creates a stats row hardcodes
         * `'eta_jkt' => ''`, so the column has always been empty and the
         * period filter had no per-product date to slice utilization by.
         *
         * Deliberately DATE-ONLY. The obvious alternative — carry the date on
         * a shipment lot — routes through the lot recompute above, whose
         * `baseline + lotSum` would DOUBLE the utilization of every product
         * whose figure came from the master rather than from lots (baseline
         * still holds the full master figure while oldLotSums is 0). That is
         * the same additive trap as the ledger+lot bug fixed on 2026-08-03.
         * Writing only eta_jkt cannot move a single MT.
         *
         * Body shape mirrors the payload's own: { product => 'DD/MM/YYYY' }.
         * Matching is CANONICAL (iq_find_product_row_idx) so `GL ALLOY` finds
         * a legacy `GL BORON` row instead of silently missing. A product with
         * no stats row is skipped — this endpoint dates existing utilization,
         * it never invents a utilization row. */
        if (is_array($body['etaByProd'] ?? null) && count($body['etaByProd'])) {
            if (array_key_exists('company_product_stats', $changed)) {
                $statsEta = $changed['company_product_stats'];
            } else {
                $etaTbl = $gs->table($sid, 'company_product_stats');
                $tabHeaders['company_product_stats'] = $etaTbl['headers'];
                $statsEta = $etaTbl['rows'];
            }
            $aliasMapEta = iq_alias_map($gs, $sid);
            foreach ($body['etaByProd'] as $product => $date) {
                $exIdx = iq_find_product_row_idx($statsEta, $code, (string) $product, $aliasMapEta);
                if ($exIdx === null) continue;
                $statsEta[$exIdx]['eta_jkt'] = iq_js_or($date, '');
            }
            $changed['company_product_stats'] = $statsEta;
        }

        // ── reapply targets upsert ──
        if (iq_is_list($body['reapplyTargets'] ?? null)) {
            $rtTbl = $gs->table($sid, 'company_reapply_targets');
            $tabHeaders['company_reapply_targets'] = $rtTbl['headers'];
            $rt = $rtTbl['rows'];
            $maxId = 0;
            foreach ($rt as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxId) $maxId = $n; }
            $aliasMapRt = iq_alias_map($gs, $sid);
            foreach ($body['reapplyTargets'] as $t) {
                $product = is_array($t) ? ($t['product'] ?? null) : null;
                // Canonical match, same reason as the stats upsert: a target
                // saved as `GL ALLOY` must find the legacy `GL BORON` row
                // instead of inserting a twin (5 such pairs already exist —
                // AMP, BDG, BHG, HKG, JKT). iq_find_product_row_idx() returns
                // null for an empty/null product, preserving the original
                // guard that a null product never matches a genuinely-'' cell.
                $exIdx = iq_find_product_row_idx($rt, $code, $product, $aliasMapRt);
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
        if (array_key_exists('ra', $body) && iq_js_truthy($body['ra'])) {
            $r = is_array($body['ra']) ? $body['ra'] : [];
            $raTbl = $gs->table($sid, 'ra_records');
            $tabHeaders['ra_records'] = $raTbl['headers'];
            $ra = $raTbl['rows'];
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
            if (isset($changed['company_product_stats'])) {
                $stats = $changed['company_product_stats'];
            } else {
                $statsTbl2 = $gs->table($sid, 'company_product_stats');
                $tabHeaders['company_product_stats'] = $statsTbl2['headers'];
                $stats = $statsTbl2['rows'];
            }
            $maxSid = 0;
            foreach ($stats as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxSid) $maxSid = $n; }
            $aliasMapObt = iq_alias_map($gs, $sid);
            foreach ($body['obtainedStats'] as $it) {
                $product = trim((string) iq_js_or(is_array($it) ? ($it['product'] ?? null) : null, ''));
                $obtainedRaw = is_array($it) ? ($it['obtained'] ?? null) : null;
                $obtained = is_numeric($obtainedRaw) ? (float) $obtainedRaw : NAN;
                if ($product === '' || !is_finite($obtained) || $obtained < 0) continue;
                $exIdx = iq_find_product_row_idx($stats, $code, $product, $aliasMapObt);
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

        // Batch every touched tab into ONE write. All rows go up in a single
        // values:batchUpdate request, so a failure of that request writes none
        // of them; write-first-then-clear (see GoogleSheets::batchRewrite())
        // then guarantees a failed/partial write never leaves a tab blank.
        // `companies` (carrying the new updated_at concurrency token) is
        // grouped into that same single request, so a concurrent reader /
        // next-PATCH won't see an advanced token for a write that failed to
        // land. (Note: the trailing values:batchClear is a separate request —
        // its failure leaves recoverable stale trailing rows, never a wipe.)
        $order = ['company_products', 'pending_meta', 'company_shipments', 'company_product_stats', 'company_reapply_targets', 'ra_records', 'companies'];
        $sets = [];
        foreach ($order as $tab) {
            if (array_key_exists($tab, $changed)) {
                $sets[] = ['tab' => $tab, 'rows' => $changed[$tab], 'headers' => $tabHeaders[$tab] ?? $gs->headers($sid, $tab)];
            }
        }
        iq_batch_write_full_tables($gs, $sid, $sets);

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

/* ═══════════════════════════════════════════════════════════════════════
 * Task 13 — POST /api/company (create) + PATCH /api/company/:code/cycles
 * (full-replace). Ports:
 *   - the Sheets branch of `POST /api/company`                  server.js:1791-1832
 *   - the Sheets branch of `PATCH /api/company/:code/cycles`    server.js:1919-1951
 */

/**
 * Indonesian short-month 'DD Mon YYYY' label, matching JS
 * `new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})`
 * (used for `companies.updated_date` on create — server.js:1803). CLDR
 * id-ID abbreviated month names.
 */
function iq_id_date_now(): string {
    static $months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    $now = new DateTime('now', new DateTimeZone('UTC'));
    return sprintf('%02d %s %d', (int) $now->format('d'), $months[(int) $now->format('n') - 1], (int) $now->format('Y'));
}

/**
 * Full port of the Sheets branch of `POST /api/company` (server.js:1791-
 * 1832): create a new PENDING company. Validates `code` is present (JS
 * truthy check, `if (!code)`) and unique (string-cast compare against
 * existing `companies` rows) -> 400 / 409 on failure. On success: appends
 * one `companies` row, one `company_products` row per non-empty product
 * (`Array.isArray(products) ? products.filter(Boolean) : []`, sort_order =
 * position), one `pending_meta` row, one seed `cycles` row ("Submit #1" /
 * "Submit MOI", `release_date` left BLANK = pending — the Sheets branch's
 * behavior, NOT the Neon branch's literal `'TBA'`), and one
 * `cycle_products` row per product linked to that seed cycle (both id
 * spaces sequential, maxed over the WHOLE tab, matching
 * `.reduce((m,r)=>Math.max(m,Number(r.id)||0),0)`). `full_name` resolves
 * from `body.fullName`, else `company_directory`'s row for this code (by
 * `abbreviation`), else ''. Wrapped in iq_with_lock() (same pattern as
 * every other write helper in this file — server.js relies on Node's
 * single-threaded event loop for the equivalent serialization).
 *
 * Returns `['ok'=>true,'code'=>string,'fullName'=>string]` on success, or
 * `['error'=>string,'status'=>400|409]` on invalid/duplicate.
 */
function iq_create_company(GoogleSheets $gs, string $sid, array $body): array {
    if (!iq_js_truthy($body['code'] ?? null)) {
        return ['error' => 'code is required', 'status' => 400];
    }
    $code = (string) $body['code'];

    return iq_with_lock(function () use ($gs, $sid, $body, $code) {
        $companies = $gs->table($sid, 'companies')['rows'];
        foreach ($companies as $c) {
            if ((string) ($c['code'] ?? '') === $code) {
                return ['error' => "Company $code already exists", 'status' => 409];
            }
        }

        $dirFullName = '';
        foreach ($gs->table($sid, 'company_directory')['rows'] as $d) {
            if ((string) ($d['abbreviation'] ?? '') === $code) { $dirFullName = $d['full_name'] ?? ''; break; }
        }
        $fullName = iq_js_or($body['fullName'] ?? null, iq_js_or($dirFullName, ''));

        $now = iq_iso_now();
        $mt  = $body['mt'] ?? null;

        $gs->appendAssoc($sid, 'companies', [
            'code' => $code, 'full_name' => $fullName, 'grp' => iq_js_or($body['grp'] ?? null, 'CD'), 'section' => 'PENDING',
            'submit1' => iq_js_or($mt, 0), 'obtained' => 0, 'utilization_mt' => 0, 'available_quota' => '',
            'rev_type' => 'none', 'rev_note' => '', 'rev_submit_date' => '', 'rev_status' => '', 'rev_mt' => 0,
            'remarks' => iq_js_or($body['remarks'] ?? null, ''), 'spi_ref' => '', 'status_update' => iq_js_or($body['statusUpdate'] ?? null, ''),
            'pertek_no' => '', 'spi_no' => '', 'updated_by' => iq_js_or($body['updatedBy'] ?? null, ''), 'updated_date' => iq_id_date_now(),
            'created_at' => $now, 'updated_at' => $now, 'source_program' => 'B',
        ]);

        $prodList = array_values(array_filter(
            is_array($body['products'] ?? null) ? $body['products'] : [],
            'iq_js_truthy'
        ));

        if ($prodList) {
            $cpRows = $gs->table($sid, 'company_products')['rows'];
            $cpId = 0;
            foreach ($cpRows as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $cpId) $cpId = $n; }
            $objs = [];
            foreach ($prodList as $i => $p) {
                $cpId++;
                $objs[] = ['id' => $cpId, 'company_code' => $code, 'product' => $p, 'sort_order' => $i, 'source_program' => 'B'];
            }
            $gs->appendAssocBulk($sid, 'company_products', $objs);
        }

        $gs->appendAssoc($sid, 'pending_meta', [
            'company_code' => $code, 'mt' => iq_js_or($mt, 0),
            'status' => iq_js_or($body['status'] ?? null, ''), 'date' => iq_js_or($body['date'] ?? null, ''),
            'source_program' => 'B',
        ]);

        // Seed Submit #1 cycle. release_date left BLANK (not 'TBA') = pending.
        $cyRows = $gs->table($sid, 'cycles')['rows'];
        $cyId = 0;
        foreach ($cyRows as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $cyId) $cyId = $n; }
        $cyId++;
        $gs->appendAssoc($sid, 'cycles', [
            'id' => $cyId, 'company_code' => $code, 'cycle_type' => 'Submit #1', 'mt' => (string) iq_js_or($mt, 0),
            'submit_type' => 'Submit MOI', 'submit_date' => iq_js_or($body['submitDate'] ?? null, ''),
            'release_type' => 'PERTEK', 'release_date' => '', 'status' => iq_js_or($body['statusUpdate'] ?? null, ''),
            'sort_order' => 0, 'pertek_date' => '', 'spi_date' => '', 'from_rev_req' => false,
            'quota_year' => iq_quota_year_in($body['quotaYear'] ?? null), 'source_program' => 'B',
        ]);

        if ($prodList) {
            $cpiRows = $gs->table($sid, 'cycle_products')['rows'];
            $cpiId = 0;
            foreach ($cpiRows as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $cpiId) $cpiId = $n; }
            $objs = [];
            foreach ($prodList as $p) {
                $cpiId++;
                $objs[] = ['id' => $cpiId, 'cycle_id' => $cyId, 'product' => $p, 'mt' => (string) iq_js_or($mt, 0), 'source_program' => 'B'];
            }
            $gs->appendAssocBulk($sid, 'cycle_products', $objs);
        }

        iq_log_change($gs, $sid, [
            'sheet' => 'companies', 'record_id' => $code, 'field' => '(create)',
            'old_value' => '', 'new_value' => $fullName,
            'changed_by' => iq_js_or($body['updatedBy'] ?? null, 'api'), 'note' => 'company create',
        ]);

        return ['ok' => true, 'code' => $code, 'fullName' => $fullName];
    });
}

/**
 * PURE: guarantee a cycle row carries its terbit date in the DEDICATED date
 * column, not only in `release_date`.
 *
 * `release_date` is doubly overloaded in this data set: it holds the terbit
 * DATE for cycles written by the main edit form and by /record-obtained, but
 * older Revision-Management saves put the document NUMBER there instead
 * (e.g. '1075/ILMATE/PERTEK-SPI-U-Rev.1/VI/2026'). The browser filter copes
 * on the Obtained side — cycleDates() reads `pDate(releaseDate) ||
 * pDate(spiDate)` — but the Submit/Revision side has NO fallback
 * (`pertekTerbit = pDate(releaseDate)`, deliberately not widened, see the
 * 2026-07-08 decision in assets/js/02-period-filter.js:271). A cycle whose
 * release_date is a number therefore drops out of every active period.
 *
 * This copies a REAL release_date into the matching dedicated column when
 * that column is still blank, so the date survives even if a later save
 * overwrites release_date with a number:
 *   Submit #N / Revision #N  -> pertek_date   (release_date = PERTEK Terbit)
 *   Obtained #N              -> spi_date      (release_date = SPI Terbit)
 * Fill-blanks only: an existing pertek_date/spi_date is never overwritten,
 * and a release_date that is not a date (number/'TBA'/blank) is left alone
 * — this normalises going forward, it does not rewrite historical cells.
 */
function iq_cycle_backfill_dates(array $row): array {
    $rd = $row['release_date'] ?? null;
    if (!iq_is_date_like($rd)) return $row;

    $type = (string) ($row['cycle_type'] ?? '');
    if (preg_match('/^obtained/i', $type)) {
        $target = 'spi_date';
    } elseif (preg_match('/^(submit|revision)\s*#/i', $type)) {
        $target = 'pertek_date';
    } else {
        return $row; // Revision Request / anything else: no dedicated column
    }

    if (!iq_is_date_like($row[$target] ?? null)) $row[$target] = $rd;
    return $row;
}

/**
 * PURE: build the full replacement `cycles` + `cycle_products` matrices
 * for a full-replace PATCH /api/company/:code/cycles — mirrors the Sheets
 * branch of server.js's cycles-replace handler (server.js:1924-1946)
 * exactly:
 *   - OTHER companies' `cycles`/`cycle_products` rows are preserved
 *     unchanged (`allCycles.filter(c => c.company_code !== code)` +
 *     dropping any `cycle_products` row whose `cycle_id` belonged to one
 *     of `code`'s removed cycles).
 *   - `code`'s existing `cycles`/`cycle_products` rows are dropped
 *     entirely.
 *   - each incoming cycle in `$newCycles` gets a freshly minted
 *     sequential `id` (`++cyId`, starting from the max `id` over ALL
 *     existing cycle rows across ALL companies — not just `code`'s) and
 *     becomes a `cycles` row, in incoming order (`sort_order` = index).
 *   - each incoming cycle's `products` map (`product => mt`) becomes
 *     `cycle_products` rows carrying that cycle's freshly minted id as
 *     `cycle_id` (the product id space is likewise maxed over ALL
 *     existing `cycle_products` rows across ALL companies, and keeps
 *     incrementing across every new cycle in this same call — i.e. NOT
 *     reset per cycle).
 *   - a date of 'TBA' (any case, trimmed) is normalized to '' (server.js's
 *     inline `norm()`) — TBA dates are stored BLANK = pending; any other
 *     value (including a non-TBA string with surrounding whitespace) is
 *     passed through as-is. Applied to all four date columns
 *     (submit/release/pertek/spi), not just submit+release: a literal 'TBA'
 *     parked in `pertek_date`/`spi_date` is the same "no date yet" state and
 *     must not masquerade as a filled dedicated date column below.
 *   - `iq_cycle_backfill_dates()` then copies a REAL `release_date` into the
 *     matching dedicated column (`pertek_date` for Submit/Revision rows,
 *     `spi_date` for Obtained rows) when that column is still blank — see
 *     its docblock for why the dedicated column must never be left empty.
 *   - `from_rev_req` is stored as a real boolean via iq_js_truthy() (same
 *     simplification Task 12 already applies to boolean-shaped fields
 *     like `cargo_arrived`, rather than JS's `x || false` which can also
 *     return a truthy non-boolean `x` unchanged).
 *
 * $allCycleRows / $allCycleProductRows: the FULL `cycles` / `cycle_products`
 * tab contents (every company), as read via GoogleSheets::table()['rows'].
 * $newCycles: the incoming camelCase cycle objects from the PATCH body's
 * `cycles` array (type, mt, submitType, submitDate, releaseType,
 * releaseDate, status, products, pertekDate, spiDate, _fromRevReq) — see
 * assets/js/16-storage.js's patchCyclesToServer() for the exact shape the
 * frontend sends.
 *
 * Returns `['cycles'=>[...], 'cycleProducts'=>[...]]` — the FULL new
 * contents of both tabs (other companies' rows + this company's
 * replacement rows), ready to hand to iq_write_full_table().
 */
function iq_build_cycles_replacement(array $allCycleRows, array $allCycleProductRows, string $code, array $newCycles): array {
    $norm = function ($d) {
        $fallback = iq_js_or($d, '');
        $test = trim((string) $fallback);
        return preg_match('/^tba$/i', $test) ? '' : $fallback;
    };

    $removedIds = [];
    foreach ($allCycleRows as $c) {
        if ((string) ($c['company_code'] ?? '') === $code) {
            $removedIds[(string) ($c['id'] ?? '')] = true;
        }
    }
    $keepCycles = array_values(array_filter($allCycleRows, fn($c) => (string) ($c['company_code'] ?? '') !== $code));
    $keepCp = array_values(array_filter($allCycleProductRows, fn($cp) => !isset($removedIds[(string) ($cp['cycle_id'] ?? '')])));

    $cyId = 0;
    foreach ($allCycleRows as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $cyId) $cyId = $n; }
    $cpId = 0;
    foreach ($allCycleProductRows as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $cpId) $cpId = $n; }

    $addCycles = [];
    $addCp = [];
    foreach (array_values($newCycles) as $i => $c) {
        $c = is_array($c) ? $c : [];
        $cyId++;
        $id = $cyId;
        $addCycles[] = iq_cycle_backfill_dates([
            'id' => $id,
            'company_code' => $code,
            'cycle_type' => iq_js_or($c['type'] ?? null, ''),
            'mt' => (!array_key_exists('mt', $c) || $c['mt'] === null) ? '' : $c['mt'],
            'submit_type' => iq_js_or($c['submitType'] ?? null, ''),
            'submit_date' => $norm($c['submitDate'] ?? null),
            'release_type' => iq_js_or($c['releaseType'] ?? null, ''),
            'release_date' => $norm($c['releaseDate'] ?? null),
            'status' => iq_js_or($c['status'] ?? null, ''),
            'sort_order' => $i,
            'pertek_date' => $norm($c['pertekDate'] ?? null),
            'spi_date' => $norm($c['spiDate'] ?? null),
            'from_rev_req' => iq_js_truthy($c['_fromRevReq'] ?? null),
            /* Tahun kuota ikut siklusnya. PATCH /cycles MENGGANTI seluruh baris
               company ini, jadi klien wajib mengirim siklus SEMUA tahun (lihat
               allCyclesForSave() di 01a-quota-year.js) — kalau tidak, menyimpan
               sambil filter 2027 aktif akan menghapus siklus 2026. */
            'quota_year' => iq_quota_year_in($c['quotaYear'] ?? null),
            'source_program' => 'B',
        ]);

        if (isset($c['products']) && is_array($c['products'])) {
            foreach ($c['products'] as $product => $mt) {
                $cpId++;
                $addCp[] = [
                    'id' => $cpId,
                    'cycle_id' => $id,
                    'product' => $product,
                    'mt' => ($mt === null) ? '' : (string) $mt,
                    'source_program' => 'B',
                ];
            }
        }
    }

    return [
        'cycles' => array_merge($keepCycles, $addCycles),
        'cycleProducts' => array_merge($keepCp, $addCp),
    ];
}

/**
 * Thin Sheets wrapper for PATCH /api/company/:code/cycles — mirrors the
 * Sheets branch of server.js's cycles-replace handler (server.js:1919-
 * 1951) exactly: read `cycles` + `cycle_products` (whole tabs), build the
 * full replacement matrices via iq_build_cycles_replacement(), write BOTH
 * tabs atomically in ONE `iq_batch_write_full_tables()` call (backed by
 * `GoogleSheets::batchRewrite()` — write-first-then-clear across both tabs
 * in a single values:batchUpdate + values:batchClear pair, restoring
 * cross-tab atomicity: see Task 12's header comment, "WRITE STRATEGY", for
 * the 2026-06-12 incident this ordering guards against), best-effort log a
 * single Change_Log entry, and return the same `{ok:true, cycles:N}` shape
 * server.js's route responds with (N = `count($newCycles)`, i.e.
 * `cycles.length` — NOT the post-merge row count of either tab). Wrapped
 * in iq_with_lock() so a concurrent write can't compute stale max-id
 * counters (same pattern as every other write helper in this file).
 */
function iq_replace_cycles(GoogleSheets $gs, string $sid, string $code, array $newCycles): array {
    return iq_with_lock(function () use ($gs, $sid, $code, $newCycles) {
        $cyTbl = $gs->table($sid, 'cycles');
        $cpTbl = $gs->table($sid, 'cycle_products');

        $result = iq_build_cycles_replacement($cyTbl['rows'], $cpTbl['rows'], $code, $newCycles);

        iq_batch_write_full_tables($gs, $sid, [
            ['tab' => 'cycles', 'rows' => $result['cycles'], 'headers' => $cyTbl['headers']],
            ['tab' => 'cycle_products', 'rows' => $result['cycleProducts'], 'headers' => $cpTbl['headers']],
        ]);

        iq_log_change($gs, $sid, [
            'sheet' => 'cycles',
            'record_id' => $code,
            'field' => '(replace)',
            'old_value' => '',
            'new_value' => count($newCycles) . ' cycles',
            'changed_by' => 'api',
            'note' => 'cycle editor',
        ]);

        return ['ok' => true, 'cycles' => count($newCycles)];
    });
}

/**
 * PUT /api/company/:code/cycle-utilization — full-replace baris
 * `cycle_utilization` milik SATU company. Baris company lain tidak disentuh.
 *
 * Tab ini menyimpan utilisasi PER SIKLUS PER PRODUK, tiap baris dengan
 * tanggalnya sendiri (master 05/08/2026 memecah "Utilization (MT)" menjadi
 * "Utilization #1/#2/#3"). Berkunci (company_code, cycle_type, product) —
 * SENGAJA tidak dititipkan di `cycle_products`, karena iq_build_cycles_replacement()
 * menulis ulang seluruh baris cycle_products milik company itu dengan id baru
 * dan hanya membaca `products`, sehingga utilisasi di sana akan terhapus
 * diam-diam pada edit cycle berikutnya.
 *
 * Satu (cycle_type, product) BOLEH punya beberapa baris: master memuat
 * pemakaian yang terjadi pada tanggal berbeda untuk produk yang sama
 * (mis. GKL GI ALLOY 1.000 MT @ 29/12/2025 + 100 MT @ 31/03/2026).
 *
 * $rows: [{ cycle, product, mt, date }, ...]
 */
function iq_replace_cycle_utilization(GoogleSheets $gs, string $sid, string $code, array $rows): array {
    return iq_with_lock(function () use ($gs, $sid, $code, $rows) {
        $tbl  = $gs->table($sid, 'cycle_utilization');
        $keep = array_values(array_filter(
            $tbl['rows'],
            fn($r) => (string) ($r['company_code'] ?? '') !== $code
        ));

        $maxId = 0;
        foreach ($tbl['rows'] as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxId) $maxId = $n; }

        $add = [];
        foreach ($rows as $x) {
            if (!is_array($x)) continue;
            $mt = iq_num($x['mt'] ?? 0);
            if ($mt <= 0) continue;                 // 0 MT bukan utilisasi
            $add[] = [
                'id'             => ++$maxId,
                'company_code'   => $code,
                'cycle_type'     => iq_js_or($x['cycle'] ?? null, ''),
                'product'        => iq_js_or($x['product'] ?? null, ''),
                'util_mt'        => $mt,
                'util_date'      => iq_js_or($x['date'] ?? null, ''),
                'quota_year'     => iq_quota_year_in($x['quotaYear'] ?? null),
                'source_program' => 'B',
            ];
        }

        iq_batch_write_full_tables($gs, $sid, [
            ['tab' => 'cycle_utilization', 'rows' => array_merge($keep, $add), 'headers' => $tbl['headers']],
        ]);

        iq_log_change($gs, $sid, [
            'sheet' => 'cycle_utilization',
            'record_id' => $code,
            'field' => '(replace)',
            'old_value' => '',
            'new_value' => count($add) . ' baris utilisasi',
            'changed_by' => 'api',
            'note' => 'master import',
        ]);

        return ['ok' => true, 'rows' => count($add)];
    });
}

/* ═══════════════════════════════════════════════════════════════════════
 * Task 14 (FINAL write endpoints) — POST /api/company/:code/record-obtained
 * + POST /api/company/:code/pertek-perubahan-release. Ports:
 *   - the Sheets branch of `POST .../record-obtained`             server.js:2015-2088
 *   - the Sheets branch of `POST .../pertek-perubahan-release`     server.js:2101-2126
 *
 * RECORD-OBTAINED SYNC — the whole point of this endpoint (per historical
 * SJH/LCP/BBB manual fix-up bugs) is that a newly-granted quota must show up
 * BOTH in the cycles-based KPI (mark the cycle terbit: release_date/spi_date/
 * status/from_rev_req) AND in the stats-based breakdown
 * (company_product_stats.available_mt for the product) — then the
 * company-level obtained/utilization/available fields are RECOMPUTED from
 * the stats rows so the top-level KPI always equals the per-product
 * breakdown sum. server.js achieves idempotency by NETTING: it reads the
 * cycle's OLD `mt` and OLD `release_date`/`from_rev_req` state BEFORE
 * mutating it, computes `prevContribution` (the OLD mt IF that cycle was
 * already terbit-and-not-a-rev-req-artifact, else 0), then applies
 * `available_mt = max(0, available_mt - prevContribution + mt)` — so
 * re-posting the exact same terbit (same mt) nets to +0 (no double-count),
 * while re-posting with a DIFFERENT mt (a correction) nets to the delta
 * between old and new. `iq_record_obtained()` below ports this netting
 * exactly, reading `prevContribution` from the real cycle row it finds.
 *
 * PURE PLANNING HELPER — `iq_record_obtained_plan()` implements the
 * SIMPLER boolean contract this task's brief literally specifies
 * (`$alreadyTerbit` as a bare flag, not the OLD mt): alreadyTerbit=true ->
 * skip entirely (no delta); alreadyTerbit=false -> delta = +$mt. This is a
 * faithful model of server.js's netting for the two cases the brief's own
 * test asks for — a genuine no-op re-post of unchanged data collapses to
 * skip=true/delta=0 either way (prevContribution==mt => net 0), and a
 * brand-new recording (prevContribution=0) is exactly delta=+mt — but it
 * does NOT capture the "re-post with a DIFFERENT mt" correction case (that
 * needs the OLD mt, not just a boolean), which server.js's netting DOES
 * handle. `iq_record_obtained()` therefore does NOT call this pure helper —
 * it implements the full netting itself (see above) so a correction still
 * nets correctly. `iq_record_obtained_plan()` is kept as the tested,
 * documented pure primitive the brief's interface asked for, same pattern
 * as Task 11's `iq_realizations_merge()` (a faithful-but-not-wired pure
 * helper, divergence documented in its own header comment).
 *
 * PERTEK PERUBAHAN RELEASE — STORAGE FORMAT. This task's brief says
 * "accept DD/MM/YYYY or ISO → store ISO", but the REAL server.js handler
 * (server.js:2101-2126) never converts: `row.release_date = releaseDate;`
 * stores the trimmed input VERBATIM, and the route's JSON response echoes
 * that same raw string back (`res.json({ ok:true, code, releaseDate })`),
 * not an ISO-normalized one. Confirmed further by reading
 * lib/pendingRevisionGate.js's `isReleased()`: the un-gate check only tests
 * "non-empty and not literally /^tba$/i" — it is completely FORMAT-
 * AGNOSTIC, so nothing downstream depends on ISO storage either. Per this
 * task's own ambiguity-resolution note ("if server.js stores raw ... match
 * that exactly"), `iq_pertek_perubahan_release()` stores the ORIGINAL raw
 * `$releaseDate` string, not `iq_date_iso()`'s converted return value.
 * `iq_date_iso()` (already in iqdash_util.php) is used ONLY as a stricter
 * input-validity GATE — real calendar validation (via PHP's checkdate())
 * that also rejects server.js's shape-only-valid-but-nonsensical dates like
 * 31/02/2026 — before the raw string is accepted for storage.
 */

/**
 * PURE: the brief's literal planning-helper contract — see the "PURE
 * PLANNING HELPER" note in this section's header comment for exactly what
 * this does and does not model. Finds the existing `company_product_stats`
 * row for `$product` (string-cast compare, this codebase's ID-compare
 * convention) to get its current `available_mt` (0.0 if no row yet).
 *
 * `$alreadyTerbit === true` -> the intended change is a no-op: returns the
 * CURRENT available_mt unchanged, `skipped => true`, `delta => 0.0`.
 * `$alreadyTerbit === false` -> the intended change adds `$mt` to the
 * current available_mt (floored at 0, mirroring server.js's
 * `Math.max(0, ...)`): returns the NEW available_mt, `skipped => false`,
 * `delta => $mt`.
 *
 * Returns `['skipped'=>bool, 'delta'=>float, 'newAvailable'=>float,
 * 'foundExisting'=>bool]` — `foundExisting` tells the caller whether an
 * UPDATE (existing stats row) or an INSERT (brand-new stats row) is needed
 * to apply this plan, mirroring server.js's `if (st) {...} else {...}`
 * branch (server.js:2066-2071).
 */
function iq_record_obtained_plan(array $statsRows, string $product, float $mt, bool $alreadyTerbit, array $aliasMap = []): array {
    // $statsRows is already company-scoped by the caller, so match on product
    // alone — but canonically, so `GI ALLOY` still finds a legacy `GI BORON`
    // row instead of planning a phantom insert. An empty $aliasMap keeps the
    // original literal behaviour for callers that have no map to hand.
    $existing = null;
    $want = iq_canon_product($product, $aliasMap);
    foreach ($statsRows as $s) {
        if (iq_canon_product($s['product'] ?? '', $aliasMap) === $want) { $existing = $s; break; }
    }
    $foundExisting = $existing !== null;
    $prevAvailable = $foundExisting ? iq_num($existing['available_mt'] ?? 0) : 0.0;

    if ($alreadyTerbit) {
        return [
            'skipped'       => true,
            'delta'         => 0.0,
            'newAvailable'  => $prevAvailable,
            'foundExisting' => $foundExisting,
        ];
    }

    return [
        'skipped'       => false,
        'delta'         => $mt,
        'newAvailable'  => max(0.0, $prevAvailable + $mt),
        'foundExisting' => $foundExisting,
    ];
}

/**
 * Full port of `POST /api/company/:code/record-obtained` (server.js:2015-
 * 2088, Sheets branch). See this section's header comment for the netting
 * idempotency rule this implements directly (not via
 * `iq_record_obtained_plan()` — see why there). Validates `product`
 * required, `terbitDate` required, `mt` a finite positive number (mirrors
 * server.js's `!Number.isFinite(mt) || mt <= 0` check) -> 400; company must
 * exist -> 404. Wrapped in `iq_with_lock()` (same pattern as every other
 * write helper in this file).
 *
 * Finds (or seeds, server.js:2035-2042) the `cycles` row for
 * (company_code=$code, cycle_type=$cycleType — default 'Obtained #2'),
 * nets out its prior counted contribution before applying the new `mt` to
 * `company_product_stats.available_mt` for `$product`, marks the cycle
 * terbit (release_date/spi_date/status/from_rev_req), replaces that
 * cycle's `cycle_products` breakdown with the single product, and
 * recomputes `companies.utilization_mt`/`available_quota`/`obtained` from
 * the company's stats rows so the top-level KPI always equals the
 * per-product breakdown sum.
 *
 * `from_rev_req` on the EXISTING cycle row read back from Sheets is a raw
 * cell value ('TRUE'/'FALSE'/'' — GoogleSheets::table() does not coerce
 * types), so it is run through `iq_coerce()` before the `=== false`
 * comparison server.js makes against its already-coerced store row — this
 * mirrors sheetsStore.js's own `coerce()` step that JS gets for free on
 * every table read.
 *
 * Returns `['ok'=>true,'code'=>string,'product'=>string,'obtained'=>float,
 * 'utilization'=>float,'available'=>float]` on success, or
 * `['error'=>string,'status'=>400|404]` on invalid input / company not
 * found.
 */
function iq_record_obtained(GoogleSheets $gs, string $sid, string $code, array $body): array {
    $cycleType  = trim((string) iq_js_or($body['cycleType'] ?? null, 'Obtained #2'));
    $product    = trim((string) ($body['product'] ?? ''));
    $terbitDate = trim((string) ($body['terbitDate'] ?? ''));
    $mtRaw      = $body['mt'] ?? null;
    $mt         = is_numeric($mtRaw) ? (float) $mtRaw : NAN;

    if ($product === '')            return ['error' => 'product required', 'status' => 400];
    if ($terbitDate === '')         return ['error' => 'terbitDate required', 'status' => 400];
    if (!is_finite($mt) || $mt <= 0) return ['error' => 'mt must be a positive number', 'status' => 400];

    return iq_with_lock(function () use ($gs, $sid, $code, $body, $cycleType, $product, $terbitDate, $mt) {
        $nowISO = iq_iso_now();

        $companiesTbl = $gs->table($sid, 'companies');
        $companies = $companiesTbl['rows'];
        $coIdx = null;
        foreach ($companies as $i => $c) {
            if ((string) ($c['code'] ?? '') === $code) { $coIdx = $i; break; }
        }
        if ($coIdx === null) return ['error' => 'company not found', 'status' => 404];
        $co = $companies[$coIdx];

        // ── find (or seed) the obtained cycle for this company + type ──
        $cyTbl = $gs->table($sid, 'cycles');
        $cycles = $cyTbl['rows'];
        $cyIdx = null;
        foreach ($cycles as $i => $c) {
            if ((string) ($c['company_code'] ?? '') === $code && (string) ($c['cycle_type'] ?? '') === $cycleType) { $cyIdx = $i; break; }
        }
        if ($cyIdx === null) {
            $maxCyId = 0;
            foreach ($cycles as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxCyId) $maxCyId = $n; }
            $sortOrder = 0;
            foreach ($cycles as $r) { if ((string) ($r['company_code'] ?? '') === $code) $sortOrder++; }
            $cyc = [
                'id' => (string) ($maxCyId + 1), 'company_code' => $code, 'cycle_type' => $cycleType, 'mt' => $mt,
                'submit_type' => 'Submit MOT (Submit #2) Perubahan', 'submit_date' => '', 'release_type' => 'SPI Perubahan',
                'release_date' => '', 'status' => '', 'sort_order' => $sortOrder,
                'pertek_date' => '', 'spi_date' => '', 'from_rev_req' => false,
                'quota_year' => iq_quota_year_in($body['quotaYear'] ?? null), 'source_program' => 'B',
            ];
            $cycles[] = $cyc;
            $cyIdx = count($cycles) - 1;
        } else {
            $cyc = $cycles[$cyIdx];
        }

        // ── idempotency: net out any prior counted contribution of THIS cycle ──
        $rd = trim((string) ($cyc['release_date'] ?? ''));
        $wasCounted = (iq_coerce($cyc['from_rev_req'] ?? null) === false) && $rd !== '' && !preg_match('/^tba$/i', $rd);
        $prevContribution = $wasCounted ? iq_num($cyc['mt'] ?? 0) : 0.0;

        $cyc['release_date'] = $terbitDate;
        $cyc['spi_date']     = $terbitDate;
        $cyc['status']       = 'SPI TERBIT ' . $terbitDate;
        $cyc['from_rev_req'] = false;
        $cyc['mt']           = $mt;
        $cycles[$cyIdx] = $cyc;

        // ── cycle_products: this cycle's breakdown becomes the single product ──
        $cpTbl = $gs->table($sid, 'cycle_products');
        $cp = $cpTbl['rows'];
        $maxCpId = 0;
        foreach ($cp as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxCpId) $maxCpId = $n; }
        $cp = array_values(array_filter($cp, fn($r) => (string) ($r['cycle_id'] ?? '') !== (string) $cyc['id']));
        $maxCpId++;
        $cp[] = ['id' => $maxCpId, 'cycle_id' => $cyc['id'], 'product' => $product, 'mt' => (string) $mt, 'source_program' => 'B'];

        // ── stats: net-add the new mt to AVAILABLE; utilization untouched ──
        $statsTbl = $gs->table($sid, 'company_product_stats');
        $stats = $statsTbl['rows'];
        $maxSid = 0;
        foreach ($stats as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxSid) $maxSid = $n; }
        $stIdx = iq_find_product_row_idx($stats, $code, $product, iq_alias_map($gs, $sid));
        if ($stIdx !== null) {
            $prevAvail = iq_num($stats[$stIdx]['available_mt'] ?? 0);
            $stats[$stIdx]['available_mt'] = max(0.0, $prevAvail - $prevContribution + $mt);
        } else {
            $maxSid++;
            $stats[] = ['id' => $maxSid, 'company_code' => $code, 'product' => $product, 'utilization_mt' => 0, 'available_mt' => $mt, 'realization_mt' => '', 'eta_jkt' => '', 'arrived' => false, 'source_program' => 'B'];
        }

        // ── recompute company totals from its stats (keeps KPI == breakdown) ──
        $coUtil = 0.0; $coAvail = 0.0;
        foreach ($stats as $s) {
            if ((string) ($s['company_code'] ?? '') !== $code) continue;
            $coUtil  += iq_num($s['utilization_mt'] ?? 0);
            $coAvail += iq_num($s['available_mt'] ?? 0);
        }
        $co['utilization_mt']  = $coUtil;
        $co['available_quota'] = $coAvail;
        $co['obtained']        = $coUtil + $coAvail;
        $co['updated_at']      = $nowISO;
        $companies[$coIdx] = $co;

        // Anti-wipe guard (2026-06-12 incident): a single-company mutation
        // must never shrink/empty the master companies list. Checked BEFORE
        // the batch write so a would-be-empty companies tab is never sent.
        if (!iq_is_list($companies) || count($companies) === 0) {
            return ['error' => 'refusing to write empty companies tab', 'status' => 500];
        }

        iq_batch_write_full_tables($gs, $sid, [
            ['tab' => 'cycles', 'rows' => $cycles, 'headers' => $cyTbl['headers']],
            ['tab' => 'cycle_products', 'rows' => $cp, 'headers' => $cpTbl['headers']],
            ['tab' => 'company_product_stats', 'rows' => $stats, 'headers' => $statsTbl['headers']],
            ['tab' => 'companies', 'rows' => $companies, 'headers' => $companiesTbl['headers']],
        ]);

        iq_log_change($gs, $sid, [
            'sheet'      => 'cycles',
            'record_id'  => $code,
            'field'      => 'record-obtained',
            'old_value'  => "$cycleType prevCounted=$prevContribution",
            'new_value'  => "$product +{$mt}→avail terbit $terbitDate",
            'changed_by' => iq_js_or($body['updatedBy'] ?? null, 'api'),
            'note'       => 'record new obtained (auto)',
        ]);

        return ['ok' => true, 'code' => $code, 'product' => $product, 'obtained' => $co['obtained'], 'utilization' => $coUtil, 'available' => $coAvail];
    });
}

/**
 * Full port of `POST /api/company/:code/pertek-perubahan-release`
 * (server.js:2101-2126, Sheets branch). See this section's header comment
 * ("PERTEK PERUBAHAN RELEASE — STORAGE FORMAT") for why the RAW
 * `$releaseDate` string is stored (not `iq_date_iso()`'s ISO conversion).
 *
 * Validates: `$releaseDate` non-empty (400 'releaseDate required'); the
 * company must have a pending PERTEK Perubahan entry in
 * `iq_pending_revisions()` (mirrors server.js's `PENDING_REVISIONS[code]`
 * check — 400 'company has no pending PERTEK Perubahan' — this prevents a
 * stray write from accidentally un-gating an unrelated code); the date must
 * pass `iq_date_iso()` (400 'releaseDate must be DD/MM/YYYY or YYYY-MM-DD').
 *
 * Upserts one row per `$code` (string-cast compare) into
 * `pertek_perubahan_release`: updates `release_date`/`updated_at` on a
 * match, else appends a new row. Wrapped in `iq_with_lock()` (same pattern
 * as every other write helper in this file).
 *
 * Returns `['ok'=>true,'code'=>string,'releaseDate'=>string]` on success
 * (releaseDate = the raw input, echoed back exactly like server.js does),
 * or `['error'=>string,'status'=>400]` on invalid input.
 */
function iq_pertek_perubahan_release(GoogleSheets $gs, string $sid, string $code, string $releaseDate): array {
    $releaseDate = trim($releaseDate);
    if ($releaseDate === '') return ['error' => 'releaseDate required', 'status' => 400];

    $pending = iq_pending_revisions();
    if (!isset($pending[$code])) {
        return ['error' => 'company has no pending PERTEK Perubahan', 'status' => 400];
    }

    if (iq_date_iso($releaseDate) === null) {
        return ['error' => 'releaseDate must be DD/MM/YYYY or YYYY-MM-DD', 'status' => 400];
    }

    return iq_with_lock(function () use ($gs, $sid, $code, $releaseDate) {
        $nowISO = iq_iso_now();
        $tbl = $gs->table($sid, 'pertek_perubahan_release');
        $rows = $tbl['rows'];
        $idx = null;
        foreach ($rows as $i => $r) {
            if (trim((string) ($r['code'] ?? '')) === $code) { $idx = $i; break; }
        }
        $old = $idx !== null ? (string) ($rows[$idx]['release_date'] ?? '') : '';
        if ($idx !== null) {
            $rows[$idx]['release_date'] = $releaseDate;
            $rows[$idx]['updated_at']   = $nowISO;
        } else {
            $rows[] = ['code' => $code, 'release_date' => $releaseDate, 'updated_at' => $nowISO];
        }

        iq_write_full_table($gs, $sid, 'pertek_perubahan_release', $rows, $tbl['headers']);

        iq_log_change($gs, $sid, [
            'sheet'      => 'pertek_perubahan_release',
            'record_id'  => $code,
            'field'      => 'release_date',
            'old_value'  => $old,
            'new_value'  => $releaseDate,
            'changed_by' => 'api',
            'note'       => 'PERTEK Perubahan terbit → un-gate split',
        ]);

        return ['ok' => true, 'code' => $code, 'releaseDate' => $releaseDate];
    });
}


