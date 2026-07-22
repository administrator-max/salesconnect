<?php
/**
 * iqdash table loader + /api/data payload assembly (PRE-LEDGER).
 *
 * PHP port of IQ/server.js `_buildDataPayload()` (Sheets branch only —
 * the Postgres/`pg` branch in the JS is never used here) and the cycle
 * dedup logic in `getCyclesForSheets()`. Ports everything UP TO but
 * NOT INCLUDING the `applyLedger` quota-ledger overlay (server.js:1223+)
 * — that overlay is a later task (ledger overlay, ra synthesis from the
 * ledger, `_ledgerObtained` etc. are intentionally absent here).
 *
 * Two entry points:
 *   iq_load_tables(GoogleSheets $gs, string $sid): array
 *     Reads every tab this module needs and returns them keyed the way
 *     the rest of this file (and later tasks) expect. Does live Sheets
 *     I/O — not unit-testable offline.
 *   iq_build_payload_raw(array $t): array
 *     Pure function: takes the tables array (shape produced by
 *     iq_load_tables, or a synthetic equivalent) and returns
 *     {spi, pending, ra, products, productAliases, companyDirectory, lastUpdate}.
 */

require_once __DIR__ . '/iqdash_util.php';

/* ── iq_load_tables ─────────────────────────────────────────────────── */

/**
 * Read every Sheets tab the /api/data payload needs and return them as a
 * flat tables array. Each value is a list of assoc rows (header-keyed),
 * coerced the same way IQ/lib/sheetsStore.js's `coerce()` does (''/null
 * -> null, 'TRUE'/'FALSE' -> bool) so downstream logic can use the exact
 * same truthiness rules as the JS it was ported from.
 */
function iq_load_tables(GoogleSheets $gs, string $sid): array {
    $get = function (string $tab) use ($gs, $sid): array {
        $rows = $gs->table($sid, $tab)['rows'];
        return array_map('iq_coerce_row', $rows);
    };

    return [
        'companies'       => $get('companies'),
        'cycles'          => $get('cycles'),
        'cycleProducts'   => $get('cycle_products'),
        'stats'           => $get('company_product_stats'),
        'revisions'       => $get('revision_changes'),
        'lots'            => $get('company_shipments'),
        'realizations'    => $get('realizations'),
        'aliases'         => $get('product_aliases'),
        'products'        => $get('products'),
        'directory'       => $get('company_directory'),
        'companyProducts' => $get('company_products'),
        'reapply'         => $get('company_reapply_targets'),
        'ra'              => $get('ra_records'),
        'pendingMeta'     => $get('pending_meta'),
        'pertekRelease'   => $get('pertek_perubahan_release'),
    ];
}

/** Apply iq_coerce() to every field of a GoogleSheets::table() row, leaving
 *  the internal '_row' sheet-row-number marker untouched. */
function iq_coerce_row(array $row): array {
    $out = [];
    foreach ($row as $k => $v) {
        $out[$k] = ($k === '_row') ? $v : iq_coerce($v);
    }
    return $out;
}

/* ── small helpers ──────────────────────────────────────────────────── */

/** True when $v is neither null nor '' — mirrors JS `!= null` after coerce()
 *  has already turned empty cells into null (so '' only shows up when the
 *  caller passed an uncoerced/synthetic row, which we tolerate too). */
function iq_present($v): bool {
    return $v !== null && $v !== '';
}

/** Sort a list of rows by numeric `sort_order` ascending (stable — PHP 8 usort is stable). */
function iq_sort_by_sort_order(array $rows): array {
    $copy = array_values($rows);
    usort($copy, fn($a, $b) => iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0));
    return $copy;
}

/** Mirror JS `isNaN(c.mt) ? c.mt : Number(c.mt)` exactly:
 *  - null stays null (absence preserved).
 *  - '' becomes 0 (JS `Number('') === 0`).
 *  - a plain numeric string (no thousands-commas) becomes a number.
 *  - anything else (e.g. 'TBA', '1,234', other text) passes through as the
 *    raw string — this is the JS `isNaN` branch. Do NOT strip commas:
 *    `is_numeric('1,234')` is false in PHP, matching JS `Number('1,234')` = NaN. */
function iq_cycle_mt($v) {
    if ($v === null) return null;
    $s = (string) $v;
    if ($s === '') return 0;
    return is_numeric($s) ? $s + 0 : $v;
}

/** Mirror JS `new Date(v).toISOString()` for a Sheets date/datetime string; null on failure. */
function iq_iso_datetime($v): ?string {
    if (!iq_present($v)) return null;
    $ts = strtotime((string) $v);
    if ($ts === false) return null;
    return gmdate('Y-m-d\TH:i:s.000\Z', $ts);
}

/* ── cycles (mirrors getCyclesForSheets in IQ/server.js:244) ──────────── */

/**
 * @param array $codeSet        map of company_code => true (the companies in play)
 * @param array $cyclesRows     rows from the 'cycles' tab
 * @param array $cycleProductsRows rows from the 'cycle_products' tab
 * @return array company_code => list of cycle objects (camelCase, JS shape)
 */
function iq_get_cycles_for(array $codeSet, array $cyclesRows, array $cycleProductsRows): array {
    if (!count($codeSet)) return [];

    $all = array_values(array_filter($cyclesRows, fn($c) => isset($codeSet[$c['company_code'] ?? null])));
    usort($all, fn($a, $b) => iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0));

    // Dedup by company_code|cycle_type, keeping the lowest-sort_order row
    // (first one seen, since $all is already sorted ascending by sort_order).
    $seen = [];
    foreach ($all as $c) {
        $k = ($c['company_code'] ?? '') . '|' . ($c['cycle_type'] ?? '');
        if (!isset($seen[$k])) $seen[$k] = $c;
    }
    $cRows = array_values($seen);
    usort($cRows, function ($a, $b) {
        $ac = (string) ($a['company_code'] ?? '');
        $bc = (string) ($b['company_code'] ?? '');
        if ($ac !== $bc) return $ac < $bc ? -1 : 1;
        return iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0);
    });

    $idSet = [];
    foreach ($cRows as $r) { $idSet[(string) ($r['id'] ?? '')] = true; }

    $cpMap = [];
    foreach ($cycleProductsRows as $r) {
        $cid = (string) ($r['cycle_id'] ?? '');
        if (!isset($idSet[$cid])) continue;
        if (!isset($cpMap[$cid])) $cpMap[$cid] = [];
        $cpMap[$cid][$r['product'] ?? ''] = iq_cycle_mt($r['mt'] ?? null);
    }

    $byCode = [];
    foreach ($cRows as $c) {
        $code = $c['company_code'] ?? '';
        if (!isset($byCode[$code])) $byCode[$code] = [];
        $byCode[$code][] = [
            'type'        => $c['cycle_type'] ?? '',
            'mt'          => iq_cycle_mt($c['mt'] ?? null),
            'submitType'  => $c['submit_type'] ?? null,
            'submitDate'  => $c['submit_date'] ?? null,
            'releaseType' => $c['release_type'] ?? null,
            'releaseDate' => $c['release_date'] ?? null,
            'status'      => $c['status'] ?? null,
            'products'    => $cpMap[(string) ($c['id'] ?? '')] ?? [],
            'pertekDate'  => $c['pertek_date'] ?? '',
            'spiDate'     => $c['spi_date'] ?? '',
            '_fromRevReq' => $c['from_rev_req'] ?? false,
        ];
    }
    return $byCode;
}

/* ── per-company object (mirrors buildCompanyObj in IQ/server.js:337) ──── */

function iq_build_company_obj(
    array $co,
    array $products,
    array $stats,
    array $revs,
    array $cycles,
    ?array $pendMeta,
    array $shipments,
    array $reapplyTargets
): array {
    $utilizationByProd = [];
    $availableByProd   = [];
    $realizationByProd = [];
    $etaByProd         = [];
    $arrivedByProd     = [];
    foreach ($stats as $s) {
        $prod = $s['product'] ?? '';
        if (iq_present($s['utilization_mt'] ?? null)) $utilizationByProd[$prod] = iq_num($s['utilization_mt']);
        if (iq_present($s['available_mt'] ?? null))   $availableByProd[$prod]   = iq_num($s['available_mt']);
        if (iq_present($s['realization_mt'] ?? null)) $realizationByProd[$prod] = iq_num($s['realization_mt']);
        if (($s['eta_jkt'] ?? null) !== null)          $etaByProd[$prod]         = $s['eta_jkt'];
        $arrivedByProd[$prod] = $s['arrived'] ?? false;
    }

    $mapRev = fn($r) => [
        'prod'  => $r['product'] ?? null,
        'mt'    => iq_present($r['mt'] ?? null) ? iq_num($r['mt']) : null,
        'label' => $r['label'] ?? null,
    ];
    $fromRows = array_values(array_filter($revs, fn($r) => ($r['direction'] ?? '') === 'from'));
    usort($fromRows, fn($a, $b) => iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0));
    $revFromArr = array_map($mapRev, $fromRows);

    $toRows = array_values(array_filter($revs, fn($r) => ($r['direction'] ?? '') === 'to'));
    usort($toRows, fn($a, $b) => iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0));
    $revToArr = array_map($mapRev, $toRows);

    // rev_note holds either free text OR a JSON-encoded salesRevRequest object.
    $rn = $co['rev_note'] ?? '';
    $revNote = $rn;
    $salesRevRequest = [];
    if (is_string($rn) && trim($rn) !== '') {
        $parsed = json_decode($rn);
        if ($parsed !== null && is_object($parsed)) {
            $revNote = '';
            $salesRevRequest = json_decode(json_encode($parsed), true) ?: [];
        }
    }

    $obj = [
        'code'            => $co['code'] ?? null,
        'fullName'        => $co['full_name'] ?? '',
        'group'           => $co['grp'] ?? null,
        'section'         => $co['section'] ?? null,
        'products'        => array_values(array_map(fn($p) => $p['product'] ?? null, iq_sort_by_sort_order($products))),
        'submit1'         => iq_present($co['submit1'] ?? null) ? iq_num($co['submit1']) : null,
        'obtained'        => iq_present($co['obtained'] ?? null) ? iq_num($co['obtained']) : 0,
        'utilizationMT'   => iq_num($co['utilization_mt'] ?? 0),
        'availableQuota'  => iq_present($co['available_quota'] ?? null) ? iq_num($co['available_quota']) : null,
        'revType'         => $co['rev_type'] ?? 'none',
        'revNote'         => $revNote,
        'salesRevRequest' => $salesRevRequest,
        'revSubmitDate'   => $co['rev_submit_date'] ?? '',
        'revStatus'       => $co['rev_status'] ?? '',
        'revMT'           => iq_num($co['rev_mt'] ?? 0),
        'revFrom'         => $revFromArr,
        'revTo'           => $revToArr,
        'remarks'         => $co['remarks'] ?? '',
        'spiRef'          => $co['spi_ref'] ?? '',
        'statusUpdate'    => $co['status_update'] ?? '',
        'pertekNo'        => $co['pertek_no'] ?? '',
        'spiNo'           => $co['spi_no'] ?? '',
        'updatedBy'       => $co['updated_by'] ?? '',
        'updatedDate'     => $co['updated_date'] ?? '',
        // ── Concurrency token — ISO timestamp of last server-side write.
        'updatedAt'       => iq_iso_datetime($co['updated_at'] ?? null),
        'utilizationByProd' => $utilizationByProd,
        'availableByProd'   => $availableByProd,
        'cycles'          => $cycles,
        'shipments'       => $shipments,
        'reapplyTargets'  => array_values($reapplyTargets),
    ];
    if (count($realizationByProd)) $obj['realizationByProd'] = $realizationByProd;
    if (count($etaByProd))         $obj['etaByProd']         = $etaByProd;
    if (count($arrivedByProd))     $obj['arrivedByProd']     = $arrivedByProd;
    if (($co['section'] ?? '') === 'PENDING' && $pendMeta) {
        $obj['mt']     = iq_num($pendMeta['mt'] ?? 0);
        $obj['status'] = $pendMeta['status'] ?? '';
        $obj['date']   = $pendMeta['date'] ?? '';
    }
    return $obj;
}

/* ── payload assembly (mirrors _buildDataPayload in IQ/server.js:998) ──── */

/**
 * Assemble the /api/data payload WITHOUT the quota-ledger overlay.
 * Return shape matches IQ/server.js:1351 minus `_ledger*` fields.
 */
function iq_build_payload_raw(array $t): array {
    $productMeta = iq_sort_by_sort_order($t['products'] ?? []);
    $dirRows     = iq_sort_by_sort_order($t['directory'] ?? []);

    $companies = array_values($t['companies'] ?? []);
    usort($companies, function ($a, $b) {
        $as = (string) ($a['section'] ?? '');
        $bs = (string) ($b['section'] ?? '');
        if ($as !== $bs) return $as < $bs ? -1 : 1;
        $ac = (string) ($a['code'] ?? '');
        $bc = (string) ($b['code'] ?? '');
        if ($ac === $bc) return 0;
        return $ac < $bc ? -1 : 1;
    });

    $productsList = array_map(fn($p) => [
        'name'       => $p['name'] ?? '',
        'hsCode'     => $p['hs_code'] ?? '',
        'colorSolid' => $p['color_solid'] ?? '#64748b',
        'colorLight' => $p['color_light'] ?? '#f1f5f9',
        'colorText'  => $p['color_text'] ?? '#475569',
        'sortOrder'  => (int) iq_num($p['sort_order'] ?? 0),
    ], $productMeta);

    $aliasMap = [];
    foreach (($t['aliases'] ?? []) as $a) {
        $aliasMap[$a['alias']] = $a['canonical'];
    }

    $companyDirectory = array_map(fn($r) => [
        'fullName'     => $r['full_name'] ?? '',
        'abbreviation' => $r['abbreviation'] ?? '',
        'sortOrder'    => (int) iq_num($r['sort_order'] ?? 0),
    ], $dirRows);

    $codes = array_values(array_filter(array_map(fn($c) => $c['code'] ?? '', $companies), fn($c) => $c !== ''));
    if (!count($codes)) {
        return [
            'spi'              => [],
            'pending'          => [],
            'ra'               => [],
            'products'         => $productsList,
            'productAliases'   => $aliasMap,
            'companyDirectory' => $companyDirectory,
            'lastUpdate'       => null,
        ];
    }
    $codeSet = array_fill_keys($codes, true);

    $filterByCode = fn(array $rows) => array_values(array_filter($rows, fn($r) => isset($codeSet[$r['company_code'] ?? null])));

    $products = $filterByCode($t['companyProducts'] ?? []);
    usort($products, function ($x, $y) {
        $xc = (string) ($x['company_code'] ?? '');
        $yc = (string) ($y['company_code'] ?? '');
        if ($xc !== $yc) return $xc < $yc ? -1 : 1;
        return iq_num($x['sort_order'] ?? 0) <=> iq_num($y['sort_order'] ?? 0);
    });

    $stats      = $filterByCode($t['stats'] ?? []);
    $revChanges = $filterByCode($t['revisions'] ?? []);
    $pendMetas  = $filterByCode($t['pendingMeta'] ?? []);
    $raRows     = $filterByCode($t['ra'] ?? []);

    $shipRows = $filterByCode($t['lots'] ?? []);
    usort($shipRows, function ($x, $y) {
        $xc = (string) ($x['company_code'] ?? '');
        $yc = (string) ($y['company_code'] ?? '');
        if ($xc !== $yc) return $xc < $yc ? -1 : 1;
        $xp = (string) ($x['product'] ?? '');
        $yp = (string) ($y['product'] ?? '');
        if ($xp !== $yp) return $xp < $yp ? -1 : 1;
        return iq_num($x['lot_no'] ?? 0) <=> iq_num($y['lot_no'] ?? 0);
    });

    $reapplyRows = $filterByCode($t['reapply'] ?? []);
    $realzRows   = $filterByCode($t['realizations'] ?? []);

    $cyclesMap = iq_get_cycles_for($codeSet, $t['cycles'] ?? [], $t['cycleProducts'] ?? []);

    $byCode = function (array $rows): array {
        $m = [];
        foreach ($rows as $r) {
            $k = $r['company_code'] ?? '';
            $m[$k][] = $r;
        }
        return $m;
    };
    $prodMap  = $byCode($products);
    $statsMap = $byCode($stats);
    $revMap   = $byCode($revChanges);

    $pendMap = [];
    foreach ($pendMetas as $p) { $pendMap[$p['company_code'] ?? ''] = $p; }

    $shipMap = [];
    foreach ($shipRows as $s) {
        $code = $s['company_code'] ?? '';
        $prod = $s['product'] ?? '';
        if (!isset($shipMap[$code])) $shipMap[$code] = [];
        if (!isset($shipMap[$code][$prod])) $shipMap[$code][$prod] = [];
        $shipMap[$code][$prod][] = [
            'lotNo'        => $s['lot_no'] ?? null,
            'utilMT'       => iq_num($s['util_mt'] ?? 0),
            'etaJKT'       => $s['eta_jkt'] ?? '',
            'note'         => $s['note'] ?? '',
            'realMT'       => iq_num($s['real_mt'] ?? 0),
            'pibDate'      => $s['pib_date'] ?? '',
            'cargoArrived' => $s['cargo_arrived'] ?? false,
        ];
    }

    $spi = [];
    $pending = [];
    foreach ($companies as $co) {
        $code = $co['code'] ?? '';
        $companyReapply = array_values(array_filter($reapplyRows, fn($r) => ($r['company_code'] ?? '') === $code));
        $obj = iq_build_company_obj(
            $co,
            $prodMap[$code] ?? [],
            $statsMap[$code] ?? [],
            $revMap[$code] ?? [],
            $cyclesMap[$code] ?? [],
            $pendMap[$code] ?? null,
            $shipMap[$code] ?? [],
            $companyReapply
        );
        if (($co['section'] ?? '') === 'SPI') $spi[] = $obj;
        else                                  $pending[] = $obj;
    }

    $ra = [];
    foreach ($raRows as $r) {
        $ra[] = [
            'code'                 => $r['company_code'] ?? null,
            'product'              => $r['product'] ?? null,
            'berat'                => iq_num($r['berat'] ?? 0),
            'obtained'             => iq_num($r['obtained'] ?? 0),
            'cargoArrived'         => $r['cargo_arrived'] ?? false,
            'realPct'              => iq_num($r['real_pct'] ?? 0),
            'utilPct'              => iq_present($r['util_pct'] ?? null) ? iq_num($r['util_pct']) : null,
            'arrivalDate'          => $r['arrival_date'] ?? null,
            'etaJKT'               => $r['eta_jkt'] ?? null,
            'reapplyEst'           => $r['reapply_est'] ?? '',
            'reapplyStage'         => (int) (iq_num($r['reapply_stage'] ?? 0) ?: 1),
            'reapplyProduct'       => $r['reapply_product'] ?? null,
            'reapplyNewTotal'      => iq_present($r['reapply_new_total'] ?? null) ? iq_num($r['reapply_new_total']) : null,
            'reapplyPrevObtained'  => iq_present($r['reapply_prev_obtained'] ?? null) ? iq_num($r['reapply_prev_obtained']) : null,
            'reapplyAdditional'    => iq_present($r['reapply_additional'] ?? null) ? iq_num($r['reapply_additional']) : null,
            'reapplySubmitDate'    => $r['reapply_submit_date'] ?? null,
            'reapplyStatus'        => $r['reapply_status'] ?? null,
            'target'               => iq_present($r['target'] ?? null) ? iq_num($r['target']) : null,
            'pertek'               => $r['pertek'] ?? null,
            'spi'                  => $r['spi'] ?? null,
            'catatan'              => $r['catatan'] ?? null,
        ];
    }

    // ── Realized = single source of truth: PIB realizations (deduped) ────
    // Override each RA record's realized (berat/cargoArrived/realPct) with
    // the company's total realized volume from `realizations`, deduped by
    // (pib_no, line_no). Synthesize an RA entry for companies that have PIB
    // realizations but no ra_records row. (Mirrors server.js:1154-1194.)
    $pibRealized = [];
    $seen = [];
    foreach ($realzRows as $r) {
        $code = $r['company_code'] ?? null;
        if (!$code) continue;
        $key = $code . '|' . ($r['pib_no'] ?? '') . '|' . ($r['line_no'] ?? '');
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $pibRealized[$code] = ($pibRealized[$code] ?? 0) + iq_num($r['volume'] ?? 0);
    }
    $spiObtained = [];
    foreach ($spi as $c) { $spiObtained[$c['code']] = iq_num($c['obtained'] ?? 0); }
    $raIdx = [];
    foreach ($ra as $i => $r) { $raIdx[$r['code']] = $i; }
    foreach ($pibRealized as $code => $mtRaw) {
        $mt = round($mtRaw * 1000) / 1000;
        if (!($mt > 0)) continue;
        if (isset($raIdx[$code])) {
            $i = $raIdx[$code];
            $ra[$i]['berat']        = $mt;
            $ra[$i]['cargoArrived'] = true;
            $obt = $ra[$i]['obtained'] ?: ($spiObtained[$code] ?? 0);
            $ra[$i]['realPct']      = $obt > 0 ? $mt / $obt : 0;
        } else {
            $obt = $spiObtained[$code] ?? 0;
            $ra[] = [
                'code' => $code, 'product' => '', 'berat' => $mt, 'obtained' => $obt, 'cargoArrived' => true,
                'realPct' => $obt > 0 ? $mt / $obt : 0, 'utilPct' => null, 'arrivalDate' => null, 'etaJKT' => null,
                'reapplyEst' => '', 'reapplyStage' => 1, 'reapplyProduct' => null, 'reapplyNewTotal' => null,
                'reapplyPrevObtained' => null, 'reapplyAdditional' => null, 'reapplySubmitDate' => null,
                'reapplyStatus' => null, 'target' => null, 'pertek' => null, 'spi' => null, 'catatan' => null,
            ];
        }
    }

    // ── lastUpdate: max updated_at across companies/shipments(lots)/ra ────
    $maxTs = function (array $arr): int {
        $m = 0;
        foreach ($arr as $r) {
            $v = $r['updated_at'] ?? null;
            if (!iq_present($v)) continue;
            $ts = strtotime((string) $v);
            if ($ts !== false && $ts * 1000 > $m) $m = $ts * 1000;
        }
        return $m;
    };
    $lastMs = max($maxTs($companies), $maxTs($shipRows), $maxTs($raRows));
    $lastUpdate = $lastMs > 0 ? gmdate('Y-m-d\TH:i:s.000\Z', intdiv($lastMs, 1000)) : null;

    return [
        'spi'              => $spi,
        'pending'          => $pending,
        'ra'               => $ra,
        'products'         => $productsList,
        'productAliases'   => $aliasMap,
        'companyDirectory' => $companyDirectory,
        'lastUpdate'       => $lastUpdate,
    ];
}

/* ── quota ledger overlay (mirrors IQ/server.js:1196-1342 + lib/pendingRevisionGate.js) ──
 *
 * Single source for Obtained / Utilized / Available: derives these per
 * company from the HS-keyed ledger seeded from the authoritative master
 * (iqdash/data/quotaLedger.json), overriding the divergent cycles/stats-based
 * numbers `iq_build_payload_raw()` computed. `iq_build_payload()` is the
 * public entry point later tasks (the /api/data route) call.
 */

/** Mirror isReleased() from IQ/lib/pendingRevisionGate.js: '' or "TBA"
 *  (any case) means the PERTEK Perubahan release date has NOT been entered. */
function iq_is_released($releaseDate): bool {
    $d = trim((string) ($releaseDate ?? ''));
    return $d !== '' && !preg_match('/^tba$/i', $d);
}

/**
 * Port of `applyPendingRevision` (IQ/lib/pendingRevisionGate.js). A company's
 * PERTEK can be revised into a product split (e.g. Wear Plate 600 ->
 * Wear Plate 247 + GI Alloy 353); the split only becomes official once its
 * PERTEK Perubahan release (terbit) date is entered. Until then this reverses
 * the not-yet-released split in the per-product maps — moving `mt` from
 * `to` back into `from` — so the ORIGINAL PERTEK is shown. Pure + in-place
 * (mutates $maps by reference); no I/O.
 *
 * @param array  $maps   ['obtByProd'=>..., 'utilByProd'=>..., 'availByProd'=>...], mutated in place
 * @param array  $revDef ['from'=>string, 'to'=>string, 'mt'=>number] — empty/[] when the company has no gated split
 * @param string $releaseDate the company's recorded release_date, or '' when none
 * @return array ['reversed'=>bool, 'reason'?=>string]
 */
function iq_apply_pending_revision(array &$maps, array $revDef, string $releaseDate): array {
    if (empty($revDef)) return ['reversed' => false, 'reason' => 'no-def'];
    if (iq_is_released($releaseDate)) return ['reversed' => false, 'reason' => 'released'];

    $from = $revDef['from'] ?? null;
    $to   = $revDef['to'] ?? null;

    // The "to" product must exist and be untouched (fully available) while pending.
    if (!array_key_exists($to, $maps['obtByProd'])) return ['reversed' => false, 'reason' => 'to-missing'];
    if ((iq_num($maps['utilByProd'][$to] ?? 0)) > 0) return ['reversed' => false, 'reason' => 'to-utilized'];

    $toObt = iq_num($maps['obtByProd'][$to] ?? 0);
    $mt = min(iq_num($revDef['mt'] ?? 0), $toObt); // clamp: can't move more than exists
    if ($mt <= 0) return ['reversed' => false, 'reason' => 'zero-mt'];

    // Move `mt` from `to` back into `from` (obtained + available; util on `to` is 0).
    $maps['obtByProd'][$from]   = (iq_num($maps['obtByProd'][$from] ?? 0)) + $mt;
    $maps['availByProd'][$from] = (iq_num($maps['availByProd'][$from] ?? 0)) + $mt;
    if (!array_key_exists($from, $maps['utilByProd'])) $maps['utilByProd'][$from] = 0;

    $maps['obtByProd'][$to]   = $toObt - $mt;
    $maps['availByProd'][$to] = (iq_num($maps['availByProd'][$to] ?? 0)) - $mt;
    if ($maps['obtByProd'][$to] <= 0) {
        unset($maps['obtByProd'][$to], $maps['utilByProd'][$to], $maps['availByProd'][$to]);
    }

    return ['reversed' => true];
}

/**
 * Port of the `applyLedger` closure (IQ/server.js:1223-1266). Computes
 * per-product obtained/util/available from the ledger entity `$ent`
 * (`{HS: {obtained, util}}`), reconciling the master-snapshot util with LIVE
 * utilization the user records via shipment lots on `$co['shipments']`
 * (Task 4 shape: product name => list of lots, each carrying `utilMT`):
 *
 *   effective util = min(obtained, ledgerUtil + Sum(lot.utilMT))
 *
 * capped at obtained (you can't utilize more than you were granted; the cap
 * also prevents a lot that merely re-itemizes the master snapshot from
 * double-counting). Then applies the pending-revision gate (if `$revDef` is
 * given), sums to get the company total, rounds to 3 decimals, and MUTATES
 * `$co` in place: obtained, utilizationMT, availableQuota, utilizationByProd,
 * availableByProd, _ledgerObtained, _ledgerObtainedByProd, products.
 *
 * Signature note (see task-5-report.md "signatures" section for the full
 * rationale): the JS closure captures `hsName`/`releasedMap`/`PENDING_REVISIONS`
 * from its enclosing scope; PHP has no equivalent closure context here, so
 * they're explicit parameters instead — `$hsName`/`$releasedDate`/`$revDef`
 * default to "no overlay effect" values so a bare 2-arg call (as in the
 * task-5 brief's starter test) still behaves sanely (HS codes pass through
 * as their own name, no release date, no pending-revision def).
 *
 * @param array  $co           company object (Task 4 shape), mutated in place
 * @param array  $ent          ledger entity for this company: HS => {obtained, util}
 * @param array  $hsName       HS code => product name (ledger's own `products` map)
 * @param string $releaseDate  this company's `pertek_perubahan_release` date, or ''
 * @param array|null $revDef   this company's PENDING_REVISIONS entry, or null
 */
function iq_apply_ledger(array &$co, array $ent, array $hsName = [], string $releaseDate = '', ?array $revDef = null): void {
    $utilByProd = [];
    $availByProd = [];
    $obtByProd = [];
    $ships = $co['shipments'] ?? [];

    foreach ($ent as $hs => $v) {
        $name = $hsName[$hs] ?? $hs;
        $o = iq_num($v['obtained'] ?? 0);
        $ledgerU = iq_num($v['util'] ?? 0);
        $lotU = 0.0;
        foreach (($ships[$name] ?? []) as $l) {
            $lotU += iq_num($l['utilMT'] ?? 0);
        }
        $u = min($o, $ledgerU + $lotU);
        $obtByProd[$name] = $o;
        $utilByProd[$name] = $u;
        $availByProd[$name] = max(0, $o - $u);
    }

    // PERTEK Perubahan gate: reverse a not-yet-released product split so the
    // dashboard shows the ORIGINAL PERTEK until the release date is entered.
    if ($revDef) {
        $maps = ['obtByProd' => $obtByProd, 'utilByProd' => $utilByProd, 'availByProd' => $availByProd];
        $res = iq_apply_pending_revision($maps, $revDef, $releaseDate);
        $obtByProd = $maps['obtByProd'];
        $utilByProd = $maps['utilByProd'];
        $availByProd = $maps['availByProd'];
        if ($res['reversed']) {
            $co['_pendingRevision'] = [
                'from'   => $revDef['from'] ?? null,
                'to'     => $revDef['to'] ?? null,
                'mt'     => $revDef['mt'] ?? null,
                'origMT' => $obtByProd[$revDef['from'] ?? ''] ?? 0,
            ];
        } else {
            unset($co['_pendingRevision']);
        }
    }

    $obt = 0.0;
    $util = 0.0;
    foreach (array_keys($obtByProd) as $name) {
        $obt += iq_num($obtByProd[$name] ?? 0);
        $util += iq_num($utilByProd[$name] ?? 0);
    }
    $obt = round($obt * 1000) / 1000;
    $util = round($util * 1000) / 1000;

    $co['obtained'] = $obt;
    $co['utilizationMT'] = $util;
    $co['availableQuota'] = max(0, round(($obt - $util) * 1000) / 1000);
    $co['utilizationByProd'] = $utilByProd;
    $co['availableByProd'] = $availByProd;
    $co['_ledgerObtained'] = $obt;
    $co['_ledgerObtainedByProd'] = $obtByProd;
    $co['products'] = array_keys($obtByProd);
}

/**
 * Public entry point: `iq_build_payload_raw($t)` then overlay the quota
 * ledger + pending-revision gate on every SPI company AND every
 * pending/ledger-only company (mirrors IQ/server.js:1196-1342). This is
 * what /api/data (a later task) calls.
 */
function iq_build_payload(array $t): array {
    $raw = iq_build_payload_raw($t);

    $ledger = iq_ledger();
    $ledgerCompanies = $ledger['companies'] ?? [];
    // Mirrors JS `if (QUOTA_LEDGER && QUOTA_LEDGER.companies) { ... }` — when
    // there is no ledger at all, none of this overlay runs (not even the
    // `_ledgerObtained = 0` fallback), so the raw payload stands unmodified.
    if (!is_array($ledgerCompanies) || !count($ledgerCompanies)) {
        return $raw;
    }
    $hsName = is_array($ledger['products'] ?? null) ? $ledger['products'] : [];

    $spi = $raw['spi'];
    $pending = $raw['pending'];

    // dirName: abbreviation -> fullName (used only when synthesizing a
    // brand-new ledger-only company that has no `companies` row at all).
    $dirName = [];
    foreach (($raw['companyDirectory'] ?? []) as $d) {
        $dirName[$d['abbreviation'] ?? ''] = $d['fullName'] ?? '';
    }

    // releasedMap: code -> release_date, from the `pertek_perubahan_release`
    // tab. Sheets-only store; an absent/empty tab just yields no releases
    // (mirrors the JS try/catch around a possibly-missing tab).
    $releasedMap = [];
    foreach (($t['pertekRelease'] ?? []) as $r) {
        $d = trim((string) ($r['release_date'] ?? ''));
        $code = trim((string) ($r['code'] ?? ''));
        if ($code !== '' && $d !== '') $releasedMap[$code] = $d;
    }

    $pendingRevisions = iq_pending_revisions();
    $ledgerCompanyDates = iq_ledger_company_dates();

    // shipRows: lots filtered to companies actually present in the
    // `companies` tab (mirrors server.js's `shipRows`, which is filtered by
    // the codeSet built from `companies` — so a company with NO `companies`
    // row never has any lots attached here, matching upstream behavior).
    $companyCodes = [];
    foreach (($t['companies'] ?? []) as $c) {
        $cc = $c['code'] ?? '';
        if ($cc !== '') $companyCodes[$cc] = true;
    }
    $shipRows = array_values(array_filter($t['lots'] ?? [], fn($s) => isset($companyCodes[$s['company_code'] ?? null])));

    // 1) Overlay every SPI company already present.
    $spiByCode = [];
    foreach ($spi as $i => $co) { $spiByCode[$co['code'] ?? null] = $i; }
    foreach ($spi as &$co) {
        $code = $co['code'] ?? null;
        $ent = $ledgerCompanies[$code] ?? null;
        if ($ent) {
            $revDef = $pendingRevisions[$code] ?? null;
            $release = $releasedMap[$code] ?? '';
            iq_apply_ledger($co, $ent, $hsName, $release, $revDef);
        } else {
            $co['_ledgerObtained'] = 0; // not in current master -> contributes 0
        }
    }
    unset($co);

    // 2) Synthesize ledger companies absent from SPI (e.g. IKM sitting in pending).
    foreach ($ledgerCompanies as $code => $ent) {
        if (isset($spiByCode[$code])) continue;

        // If we know this ledger-only company's obtained/terbit date, prepare
        // a synthetic "Obtained #1" cycle so the client PERIOD filter can
        // place it in the right month. Used ONLY when the company has no
        // real cycles of its own.
        $obtDate = $ledgerCompanyDates[$code] ?? null;
        $synthCycles = [];
        if ($obtDate) {
            $prodMap = [];
            $totMt = 0.0;
            foreach ($ent as $hs => $v) {
                $nm = $hsName[$hs] ?? $hs;
                $o = iq_num($v['obtained'] ?? 0);
                if ($o > 0) { $prodMap[$nm] = $o; $totMt += $o; }
            }
            $synthCycles = [[
                'type'        => 'Obtained #1',
                'mt'          => $totMt,
                'products'    => $prodMap,
                'submitType'  => '',
                'submitDate'  => '',
                'releaseType' => 'SPI Terbit',
                'releaseDate' => $obtDate,
                'status'      => "Obtained (ledger) — terbit {$obtDate}",
                'pertekDate'  => $obtDate,
                'spiDate'     => $obtDate,
                '_fromRevReq' => false,
            ]];
        }

        // Reuse the company's REAL, fully-built object if it already exists
        // (IKM lives in `pending`, built by iq_build_company_obj) — this
        // preserves its persisted scalars (pertekNo/spiNo/status/cycles).
        // Only companies truly absent from the DB fall back to a fresh object.
        $pi = null;
        foreach ($pending as $idx => $p) {
            if (($p['code'] ?? null) === $code) { $pi = $idx; break; }
        }

        if ($pi !== null) {
            $co = $pending[$pi];
            array_splice($pending, $pi, 1);
            $co['section'] = 'SPI';
            if (empty($co['cycles']) && count($synthCycles)) $co['cycles'] = $synthCycles;
        } else {
            $shipMapFor = [];
            foreach ($shipRows as $s) {
                if (($s['company_code'] ?? null) !== $code) continue;
                $prod = $s['product'] ?? '';
                if (!isset($shipMapFor[$prod])) $shipMapFor[$prod] = [];
                $shipMapFor[$prod][] = [
                    'lotNo'        => $s['lot_no'] ?? null,
                    'utilMT'       => iq_num($s['util_mt'] ?? 0),
                    'etaJKT'       => $s['eta_jkt'] ?? '',
                    'note'         => $s['note'] ?? '',
                    'realMT'       => iq_num($s['real_mt'] ?? 0),
                    'pibDate'      => $s['pib_date'] ?? '',
                    'cargoArrived' => $s['cargo_arrived'] ?? false,
                ];
            }
            $co = [
                'code' => $code, 'fullName' => $dirName[$code] ?? $code, 'group' => '', 'section' => 'SPI',
                'products' => [], 'submit1' => 0, 'obtained' => 0, 'utilizationMT' => 0, 'availableQuota' => 0,
                'cycles' => $synthCycles, 'shipments' => $shipMapFor,
                'utilizationByProd' => [], 'availableByProd' => [], 'arrivedByProd' => [],
                'revType' => 'none', 'revNote' => '', 'revSubmitDate' => '', 'revStatus' => '', 'revMT' => 0,
                'revFrom' => [], 'revTo' => [], 'salesRevRequest' => [], 'reapplyTargets' => [],
                'remarks' => '', 'spiRef' => '', 'statusUpdate' => '', 'pertekNo' => '', 'spiNo' => '',
                'updatedBy' => '', 'updatedDate' => '', 'updatedAt' => null, 'cycleProducts' => [],
            ];
        }

        $revDef = $pendingRevisions[$code] ?? null;
        $release = $releasedMap[$code] ?? '';
        iq_apply_ledger($co, $ent, $hsName, $release, $revDef);
        $spi[] = $co;
    }

    $raw['spi'] = $spi;
    $raw['pending'] = $pending;
    return $raw;
}
