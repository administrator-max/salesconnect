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
