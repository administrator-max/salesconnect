<?php
/**
 * Sales Pulse — consolidation engine helpers + the /api/data builder.
 * Ported from ../sales_pulse/server.js (lines 112-218): normCompany, the
 * internal-companies loader, isInternalCompany, pickEndCustomer, normNoSpace,
 * endCustomerFromName, projectFamilyKey, parseProjectSheetDate, groupReduce.
 * sp_build_data (below) ports server.js:223-518 (GET /api/data).
 * Behavior is locked by tests/consolidation_test.php.
 */

require_once __DIR__ . '/salespulse_util.php';

/** server.js:112-113 — month keys + chart color palette, copied verbatim. */
const SP_MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SP_COLORS = ['#f59e0b', '#a78bfa', '#22d3ee', '#4ade80', '#fb923c', '#818cf8', '#38bdf8'];

/** Port of server.js normCompany (:123-124). */
function sp_norm_company($s) {
    $s = strtolower((string) ($s ?? ''));
    $s = preg_replace('/\bpt\.?\b/', '', $s);
    $s = preg_replace('/[^a-z0-9]+/', ' ', $s);
    return trim($s);
}

/**
 * Port of server.js INTERNAL_COMPANIES loader (:126-136). Loads
 * company-rank-exclusions.json, normalizes each companyName, caches in a
 * static so the file is only read/decoded once per request.
 */
function sp_internal_companies(): array {
    static $names = null;
    if ($names !== null) return $names;
    $names = [];
    $path = __DIR__ . '/company-rank-exclusions.json';
    $raw = @file_get_contents($path);
    if ($raw === false) return $names;
    $cfg = json_decode($raw, true);
    if (!is_array($cfg)) return $names;
    foreach (($cfg['companies'] ?? []) as $c) {
        $n = sp_norm_company($c['companyName'] ?? '');
        if ($n !== '') $names[] = $n;
    }
    return $names;
}

/** Port of server.js isInternalCompany (:138-141). */
function sp_is_internal_company($name): bool {
    $n = sp_norm_company($name);
    if ($n === '') return false;
    foreach (sp_internal_companies() as $inm) {
        if ($n === $inm || strpos($n, $inm) !== false) return true;
    }
    return false;
}

/**
 * Port of server.js pickEndCustomer (:145-153). Consolidated end-customer for
 * one project group: the most-frequent EXTERNAL customer among its headers;
 * falls back to the most-frequent overall if all are internal, then to the
 * first header's customer_name, then ''.
 */
function sp_pick_end_customer(array $headers): string {
    $tally = function (array $rows) {
        $m = [];
        foreach ($rows as $h) {
            $cn = $h['customer_name'] ?? '';
            if ($cn !== '' && $cn !== null) $m[$cn] = ($m[$cn] ?? 0) + 1;
        }
        if (!$m) return null;
        arsort($m);
        return array_key_first($m);
    };
    $external = array_values(array_filter($headers, function ($h) {
        return !sp_is_internal_company($h['customer_name'] ?? '');
    }));
    $picked = $tally($external ? $external : $headers);
    if ($picked !== null) return $picked;
    return ($headers[0]['customer_name'] ?? '') ?: '';
}

/** Port of server.js normNoSpace (:156). */
function sp_norm_no_space($s) {
    return str_replace(' ', '', sp_norm_company($s));
}

/** Port of server.js endCustomerFromName (:159-164). */
function sp_end_customer_from_name($projectName) {
    $parts = explode(' - ', (string) ($projectName ?? ''));
    if (count($parts) < 2) return '';
    $tail = trim($parts[count($parts) - 1]);
    return preg_match('/[a-z]/i', $tail) ? $tail : '';
}

/** Port of server.js projectFamilyKey (:168-170). */
function sp_project_family_key($projectName) {
    $parts = preg_split('/\s-\s*del\b/i', (string) ($projectName ?? ''));
    $s = strtolower(trim($parts[0]));
    return preg_replace('/\s+/', ' ', $s);
}

/**
 * Port of server.js parseProjectSheetDate (:172-206). Uses UTC (gmdate) to
 * match JS's getUTCMonth/toISOString semantics.
 */
function sp_parse_project_sheet_date($value): array {
    if ($value === null || $value === '') return ['date' => null, 'monthIdx' => null];

    $raw = trim((string) $value);

    if (preg_match('/^\d+(\.\d+)?$/', $raw)) {
        $serial = (float) $raw;
        if ($serial > 20000 && $serial < 80000) {
            $seconds = (int) round(($serial - 25569) * 86400);
            return [
                'date' => gmdate('Y-m-d', $seconds),
                'monthIdx' => (int) gmdate('n', $seconds) - 1,
            ];
        }
    }

    if (preg_match('/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/', $raw, $dmy)) {
        $yyyy = strlen($dmy[3]) === 2 ? '20' . $dmy[3] : $dmy[3];
        $mm = str_pad($dmy[2], 2, '0', STR_PAD_LEFT);
        $dd = str_pad($dmy[1], 2, '0', STR_PAD_LEFT);
        return ['date' => "$yyyy-$mm-$dd", 'monthIdx' => ((int) $mm) - 1];
    }

    $ts = strtotime($raw);
    if ($ts !== false) {
        return ['date' => gmdate('Y-m-d', $ts), 'monthIdx' => (int) gmdate('n', $ts) - 1];
    }

    return ['date' => null, 'monthIdx' => null];
}

/**
 * Port of server.js groupReduce (:210-218). Group rows by keyFn, running
 * reducer(&$acc, $row) for each; acc is seeded per-group via seed().
 */
function sp_group_reduce(array $rows, callable $keyFn, callable $seed, callable $reducer): array {
    $map = [];
    $order = [];
    foreach ($rows as $r) {
        $k = $keyFn($r);
        if (!array_key_exists($k, $map)) {
            $map[$k] = ['key' => $k, 'acc' => $seed()];
            $order[] = $k;
        }
        $reducer($map[$k]['acc'], $r);
    }
    $out = [];
    foreach ($order as $k) $out[] = $map[$k];
    return $out;
}

/**
 * Port of `num(v).toLocaleString('id-ID')` for the KG/qty DISPLAY strings
 * (server.js:488-501). Replicates toLocaleString('id-ID') faithfully: '.'
 * thousands grouping, ',' decimal separator, up to 3 fraction digits with
 * trailing zeros (and a dangling separator) trimmed off.
 */
function sp_id_number($n): string {
    $s = number_format((float) $n, 3, ',', '.'); // up to 3 frac digits, id-ID grouping
    if (strpos($s, ',') !== false) {             // trim trailing zeros, then dangling comma
        $s = rtrim($s, '0');
        $s = rtrim($s, ',');
    }
    return $s;
}

/**
 * Port of server.js `GET /api/data` (server.js:223-518) — the main
 * consolidation builder. $actualsAll/$plansAll/$budgetAll/$headersAll/
 * $itemsAll are the raw rows from sp_get_table('monthly_actuals'|
 * 'plan_revisions'|'budget_lines'|'ps_headers'|'ps_items') respectively.
 * Returns the 6-key response shape the frontend consumes verbatim.
 *
 * Fidelity notes (deviations that preserve JSON output, not logic):
 *  - BUDGET month/product rollups guard month_idx to 0..11 before writing
 *    into the fixed 12-slot arrays. In JS, an out-of-range/null month_idx
 *    would set a stray non-index property on the array, which
 *    JSON.stringify silently drops when serializing an array — so the
 *    guard reproduces the same *effective* JSON output without ever
 *    corrupting the 12-slot arrays into a PHP-encoded object.
 */
function sp_build_data(int $year, array $actualsAll, array $plansAll, array $budgetAll, array $headersAll, array $itemsAll): array {
    // server.js:236-242
    $budgetRows = array_values(array_filter($budgetAll, fn($r) => ($r['year'] ?? null) === $year));
    $headerRows = array_values(array_filter($headersAll, fn($h) => ($h['dashboard_year'] ?? null) === $year));
    $psNumbersInYear = [];
    foreach ($headerRows as $h) $psNumbersInYear[(string) ($h['ps_number'] ?? '')] = true;
    $itemRows = array_values(array_filter($itemsAll, fn($i) => isset($psNumbersInYear[(string) ($i['ps_number'] ?? '')])));

    $actualRows = array_values(array_filter($actualsAll, fn($r) => ($r['year'] ?? null) === $year));
    usort($actualRows, fn($a, $b) => ($a['month_idx'] ?? 0) <=> ($b['month_idx'] ?? 0));

    $planRows = array_values(array_filter($plansAll, fn($r) => ($r['year'] ?? null) === $year));
    usort($planRows, function ($a, $b) {
        $cmp = ($a['month_idx'] ?? 0) <=> ($b['month_idx'] ?? 0);
        return $cmp !== 0 ? $cmp : (($a['id'] ?? 0) <=> ($b['id'] ?? 0));
    });

    // server.js:245-246 — ps_items grouped by ps_number.
    $itemsByPs = [];
    foreach ($itemRows as $it) $itemsByPs[(string) ($it['ps_number'] ?? '')][] = $it;

    // server.js:254-256 — external, item-bearing sale leg (see file-header note
    // on gross-margin vs external-only-revenue asymmetry).
    $isExternalSaleLeg = function (array $h) use ($itemsByPs): bool {
        if (sp_is_internal_company($h['customer_name'] ?? '')) return false;
        foreach (($itemsByPs[(string) ($h['ps_number'] ?? '')] ?? []) as $it) {
            if (sp_num($it['total_weight_kg'] ?? null) > 0) return true;
        }
        return false;
    };

    // ── 1. BUDGET (server.js:258-286) ──────────────────────────────────────
    $BUDGET = [
        'margin' => array_fill(0, 12, 0),
        'revenue' => array_fill(0, 12, 0),
        'products' => [],
    ];
    $budgetMonthly = sp_group_reduce(
        $budgetRows,
        fn($r) => $r['month_idx'] ?? null,
        fn() => ['margin' => 0.0, 'revenue' => 0.0, 'volume' => 0.0],
        function (&$a, $r) {
            $a['margin'] += sp_num($r['margin_idr'] ?? null);
            $a['revenue'] += sp_num($r['revenue_idr'] ?? null);
            $a['volume'] += sp_num($r['volume_mt'] ?? null);
        }
    );
    foreach ($budgetMonthly as $g) {
        $m = $g['key'];
        if (!is_int($m) || $m < 0 || $m > 11) continue;
        $BUDGET['margin'][$m] = $g['acc']['margin'] / 1e6;
        $BUDGET['revenue'][$m] = $g['acc']['revenue'] / 1e6;
    }
    $budgetByProduct = sp_group_reduce(
        $budgetRows,
        fn($r) => ($r['month_idx'] ?? '') . '__' . ($r['product'] ?? ''),
        fn() => ['month_idx' => null, 'product' => null, 'volume' => 0.0, 'revenue' => 0.0, 'margin' => 0.0],
        function (&$a, $r) {
            $a['month_idx'] = $r['month_idx'] ?? null;
            $a['product'] = $r['product'] ?? null;
            $a['volume'] += sp_num($r['volume_mt'] ?? null);
            $a['revenue'] += sp_num($r['revenue_idr'] ?? null);
            $a['margin'] += sp_num($r['margin_idr'] ?? null);
        }
    );
    foreach ($budgetByProduct as $g) {
        $p = $g['acc']['product'];
        $mi = $g['acc']['month_idx'];
        if ($p === null || !is_int($mi) || $mi < 0 || $mi > 11) continue;
        if (!isset($BUDGET['products'][$p])) {
            $BUDGET['products'][$p] = [
                'volume' => array_fill(0, 12, 0),
                'revenue' => array_fill(0, 12, 0),
                'margin' => array_fill(0, 12, 0),
            ];
        }
        $BUDGET['products'][$p]['volume'][$mi] = $g['acc']['volume'];
        $BUDGET['products'][$p]['revenue'][$mi] = $g['acc']['revenue'] / 1e6;
        $BUDGET['products'][$p]['margin'][$mi] = $g['acc']['margin'] / 1e6;
    }

    // ── 2. ACTUAL (server.js:288-312) ──────────────────────────────────────
    // margin/revenue computed LIVE from ps_headers per month; plan_margin &
    // notes come from monthly_actuals (manual dashboard input).
    $ACTUAL = [
        'margin' => array_fill(0, 12, null),
        'plan' => array_fill(0, 12, null),
        'revenue' => array_fill(0, 12, null),
        'notes' => array_fill(0, 12, ''),
    ];
    $actMonth = [];
    for ($i = 0; $i < 12; $i++) $actMonth[$i] = ['count' => 0, 'margin' => 0.0, 'revenue' => 0.0];
    foreach ($headerRows as $h) {
        $m = $h['dashboard_month_idx'] ?? null;
        if (!is_int($m) || $m < 0 || $m > 11) continue;
        $actMonth[$m]['count']++;
        $actMonth[$m]['margin'] += sp_num($h['margin'] ?? null); // gross: semua leg (by design)
        if ($isExternalSaleLeg($h)) $actMonth[$m]['revenue'] += sp_num($h['sales_revenue'] ?? null);
    }
    for ($m = 0; $m < 12; $m++) {
        if ($actMonth[$m]['count'] > 0) {
            $ACTUAL['margin'][$m] = $actMonth[$m]['margin'] / 1e6;
            $ACTUAL['revenue'][$m] = $actMonth[$m]['revenue'] / 1e6;
        }
    }
    foreach ($actualRows as $r) {
        $mi = $r['month_idx'] ?? null;
        if (!is_int($mi) || $mi < 0 || $mi > 11) continue;
        $ACTUAL['plan'][$mi] = isset($r['plan_margin']) && $r['plan_margin'] !== null ? sp_num($r['plan_margin']) : null;
        $ACTUAL['notes'][$mi] = ($r['notes'] ?? null) ?: '';
    }

    // ── 2b. ACTUAL_PRODUCTS (server.js:314-348) ────────────────────────────
    $ACTUAL_PRODUCTS = [];
    $ensureProd = function ($p) use (&$ACTUAL_PRODUCTS) {
        if (!isset($ACTUAL_PRODUCTS[$p])) {
            $ACTUAL_PRODUCTS[$p] = [
                'volume' => array_fill(0, 12, 0),
                'revenue' => array_fill(0, 12, 0),
                'margin' => array_fill(0, 12, 0),
            ];
        }
    };
    $validMonthHeaders = array_values(array_filter($headerRows, function ($h) {
        $m = $h['dashboard_month_idx'] ?? null;
        return is_int($m) && $m >= 0 && $m <= 11;
    }));
    $actualByProduct = sp_group_reduce(
        $validMonthHeaders,
        fn($h) => $h['dashboard_month_idx'] . '__' . sp_prod_key($h['product'] ?? null),
        fn() => ['month_idx' => null, 'product' => null, 'margin' => 0.0, 'revenue' => 0.0],
        function (&$a, $h) use ($isExternalSaleLeg) {
            $a['month_idx'] = $h['dashboard_month_idx'];
            $a['product'] = sp_prod_key($h['product'] ?? null);
            $a['margin'] += sp_num($h['margin'] ?? null);
            if ($isExternalSaleLeg($h)) $a['revenue'] += sp_num($h['sales_revenue'] ?? null);
        }
    );
    foreach ($actualByProduct as $g) {
        $p = $g['acc']['product'];
        $mi = $g['acc']['month_idx'];
        $ensureProd($p);
        $ACTUAL_PRODUCTS[$p]['margin'][$mi] = $g['acc']['margin'] / 1e6;
        $ACTUAL_PRODUCTS[$p]['revenue'][$mi] = $g['acc']['revenue'] / 1e6;
    }
    // Physical volume: EXTERNAL legs only (dedup intercompany — see file header).
    foreach ($headerRows as $h) {
        $mi = $h['dashboard_month_idx'] ?? null;
        if (!is_int($mi) || $mi < 0 || $mi > 11) continue;
        if (sp_is_internal_company($h['customer_name'] ?? '')) continue;
        $kg = 0.0;
        foreach (($itemsByPs[(string) ($h['ps_number'] ?? '')] ?? []) as $it) $kg += sp_num($it['total_weight_kg'] ?? null);
        if ($kg <= 0) continue;
        $p = sp_prod_key($h['product'] ?? null);
        $ensureProd($p);
        $ACTUAL_PRODUCTS[$p]['volume'][$mi] += $kg / 1000.0;
    }

    // ── 3. PLAN_REVISIONS (server.js:350-363) ──────────────────────────────
    $PLAN_REVISIONS = [];
    for ($i = 0; $i < 12; $i++) $PLAN_REVISIONS[$i] = [];
    foreach ($planRows as $r) {
        $mi = $r['month_idx'] ?? null;
        if (!is_int($mi) || $mi < 0 || $mi > 11) continue;
        $PLAN_REVISIONS[$mi][] = [
            'id' => $r['id'] ?? null,
            'name' => $r['name'] ?? null,
            'margin' => (isset($r['margin']) && $r['margin'] !== null) ? sp_num($r['margin']) : '',
            'revenue' => (isset($r['revenue']) && $r['revenue'] !== null) ? sp_num($r['revenue']) : '',
            'notes' => $r['notes'] ?? null,
            'qty' => $r['qty'] ?? [],
            'ts' => $r['ts'] ?? null,
        ];
    }

    // ── 4. PS_CHAINS + QTY_DATA (server.js:365-507) ────────────────────────
    $PS_CHAINS = [];
    $QTY_DATA = [];
    foreach (SP_MONTH_KEYS as $mk) { $PS_CHAINS[$mk] = []; $QTY_DATA[$mk] = []; }

    // ps_headers ordered by po_date asc (null/'' last), then ps_number asc.
    $orderedHeaders = $headerRows;
    usort($orderedHeaders, function ($a, $b) {
        $da = ($a['po_date'] ?? null) ?: "\u{FFFF}";
        $db = ($b['po_date'] ?? null) ?: "\u{FFFF}";
        if ($da !== $db) return $da < $db ? -1 : 1;
        // strcmp vs JS localeCompare: identical ordering for the uniform "PSF26-..." ps_number format (no digit-adjacent-to-hyphen ambiguity); documented divergence otherwise.
        return strcmp((string) ($a['ps_number'] ?? ''), (string) ($b['ps_number'] ?? ''));
    });

    // Group by (project_name || ps_number) __ dashboard_month_idx.
    $projectGroups = [];
    $groupOrder = [];
    foreach ($orderedHeaders as $header) {
        $mIdx = $header['dashboard_month_idx'] ?? null;
        if (!is_int($mIdx) || $mIdx < 0 || $mIdx > 11) continue;
        $pname = $header['project_name'] ?? null;
        $nameOrPs = ($pname !== null && $pname !== '') ? $pname : ($header['ps_number'] ?? '');
        $groupKey = $nameOrPs . '__' . $mIdx;
        if (!isset($projectGroups[$groupKey])) {
            $projectGroups[$groupKey] = [
                'mKey' => SP_MONTH_KEYS[$mIdx],
                'projectName' => $nameOrPs,
                'headers' => [],
            ];
            $groupOrder[] = $groupKey;
        }
        $projectGroups[$groupKey]['headers'][] = $header;
    }

    // Family -> { customerNoSpace: {name, volumeMT} } for external "child" legs.
    $familyChildren = [];
    foreach ($headerRows as $h) {
        $cn = $h['customer_name'] ?? '';
        if (sp_is_internal_company($cn) || $cn === '' || $cn === null) continue;
        $fk = sp_project_family_key($h['project_name'] ?? null);
        $key = sp_norm_no_space($cn);
        $kgSum = 0.0;
        foreach (($itemsByPs[(string) ($h['ps_number'] ?? '')] ?? []) as $it) $kgSum += sp_num($it['total_weight_kg'] ?? null);
        $vol = $kgSum / 1000.0;
        if (!isset($familyChildren[$fk])) $familyChildren[$fk] = [];
        if (!isset($familyChildren[$fk][$key])) $familyChildren[$fk][$key] = ['name' => $cn, 'volumeMT' => 0.0];
        $familyChildren[$fk][$key]['volumeMT'] += $vol;
    }

    $colorIdx = 0;
    foreach ($groupOrder as $gk) {
        $group = $projectGroups[$gk];
        $mKey = $group['mKey'];
        $projectName = $group['projectName'];
        $headers = $group['headers'];

        // Customer = external end-customer (intercompany roll-up).
        $customer = sp_pick_end_customer($headers);
        $customerInternal = sp_is_internal_company($customer);

        // Parallel-parent: internal leg whose name names >=2 end-customers ("A dan B").
        $customerSplit = null;
        if ($customerInternal) {
            $namesRaw = sp_end_customer_from_name($projectName);
            $names = array_values(array_filter(array_map('trim', preg_split('/\s+dan\s+/i', $namesRaw))));
            if (count($names) >= 2) {
                $children = $familyChildren[sp_project_family_key($projectName)] ?? [];
                $parts = [];
                foreach ($names as $nm) {
                    $child = $children[sp_norm_no_space($nm)] ?? null;
                    $parts[] = ['customer' => $child ? $child['name'] : $nm, 'volumeMT' => $child ? $child['volumeMT'] : 0.0];
                }
                $totalVol = 0.0;
                foreach ($parts as $p) $totalVol += $p['volumeMT'];
                $customerSplit = array_map(function ($p) use ($totalVol, $parts) {
                    return [
                        'customer' => $p['customer'],
                        'weight' => $totalVol > 0 ? $p['volumeMT'] / $totalVol : 1 / count($parts),
                    ];
                }, $parts);
                $customer = $namesRaw; // combined name, shown in the modal
                $customerInternal = false; // already handled via split
            }
        }

        $totalMarginIDR = 0.0;
        foreach ($headers as $h) $totalMarginIDR += sp_num($h['margin'] ?? null); // gross (semua leg)

        // revenue = external sale (dedup, item-bearing external leg) — aligned with KPI/volume.
        $totalRevenueIDR = 0.0;
        foreach ($headers as $h) {
            if ($isExternalSaleLeg($h)) $totalRevenueIDR += sp_num($h['sales_revenue'] ?? null);
        }
        $totalPct = $totalRevenueIDR > 0 ? round($totalMarginIDR / $totalRevenueIDR * 100, 4) : 0.0;

        // Canonical product = consensus of ps_headers.product among the legs.
        $productCounts = [];
        foreach ($headers as $h) {
            $p = $h['product'] ?? null;
            if ($p !== null && $p !== '') $productCounts[$p] = ($productCounts[$p] ?? 0) + 1;
        }
        $canonicalProduct = 'Projects';
        if ($productCounts) {
            arsort($productCounts);
            $canonicalProduct = array_key_first($productCounts);
        }
        $segmentVal = null;
        foreach ($headers as $h) {
            if (!empty($h['segment'])) { $segmentVal = $h['segment']; break; }
        }

        $subsidiaries = [];
        foreach ($headers as $h) {
            $marginIDR = sp_num($h['margin'] ?? null);
            $marginNativeSrc = (isset($h['net_margin_native']) && $h['net_margin_native'] !== null)
                ? $h['net_margin_native'] : ($h['margin'] ?? 0);
            $subsidiaries[] = [
                'ps' => $h['ps_number'] ?? null,
                'sub' => $h['subsidiary'] ?? '',
                'currency' => !empty($h['currency']) ? $h['currency'] : 'IDR',
                'fxRate' => sp_num(($h['fx_rate'] ?? null) ?: 1),
                'marginNative' => sp_num($marginNativeSrc),
                'marginIDR' => $marginIDR,
                'marginMIDR' => round($marginIDR / 1e6, 3),
                'pct' => sp_num($h['margin_percentage'] ?? null),
            ];
        }

        $PS_CHAINS[$mKey][] = [
            'name' => $projectName,
            'ps' => implode(' · ', array_map(fn($h) => (string) ($h['ps_number'] ?? ''), $headers)),
            'customer' => $customer,
            'customerInternal' => $customerInternal,
            'customerSplit' => $customerSplit,
            'product' => $canonicalProduct,
            'segment' => $segmentVal,
            'revenue' => round($totalRevenueIDR / 1e6, 3),
            'margin' => round($totalMarginIDR / 1e6, 3),
            'pct' => $totalPct,
            'note' => implode(' | ', array_values(array_filter(array_map(fn($h) => $h['notes'] ?? '', $headers)))),
            'subsidiaries' => $subsidiaries,
        ];

        // QTY_DATA — physical tonnage: item ONLY from external end-customer legs
        // (dedup intercompany, consistent with ACTUAL_PRODUCTS.volume).
        $totalKg = 0.0;
        $totalQty = 0.0;
        $unit = 'pcs';
        $allProducts = [];
        foreach ($headers as $header) {
            if (sp_is_internal_company($header['customer_name'] ?? '')) continue;
            foreach (($itemsByPs[(string) ($header['ps_number'] ?? '')] ?? []) as $item) {
                $totalKg += sp_num($item['total_weight_kg'] ?? null);
                $totalQty += sp_num($item['qty_val'] ?? null);
                if (!empty($item['qty_unit'])) $unit = trim((string) $item['qty_unit']);
                $material = $item['material'] ?? '';
                $size = $item['size'] ?? '';
                $name = trim($material . (($size !== '' && $size !== null) ? ' (' . $size . ')' : ''));
                $allProducts[] = [
                    'name' => $name,
                    'qty' => sp_id_number(sp_num($item['qty_val'] ?? null)) . ' ' . (($item['qty_unit'] ?? '') ?: ''),
                    'weight' => sp_id_number(sp_num($item['total_weight_kg'] ?? null)) . ' KG',
                ];
            }
        }

        if ($totalKg > 0) {
            $QTY_DATA[$mKey][] = [
                'name' => $projectName,
                'color' => SP_COLORS[$colorIdx++ % count(SP_COLORS)],
                'customer' => $customer,
                'customerInternal' => sp_is_internal_company($customer),
                'totalQty' => sp_id_number($totalQty) . ' ' . $unit,
                'totalWeight' => sp_id_number($totalKg) . ' KG (' . sp_id_number(round($totalKg / 1000)) . ' MT)',
                'product' => $canonicalProduct,
                'segment' => $segmentVal,
                'products' => $allProducts,
            ];
        }
    }

    return [
        'BUDGET' => $BUDGET,
        'ACTUAL' => $ACTUAL,
        'ACTUAL_PRODUCTS' => $ACTUAL_PRODUCTS,
        'PLAN_REVISIONS' => $PLAN_REVISIONS,
        'PS_CHAINS' => $PS_CHAINS,
        'QTY_DATA' => $QTY_DATA,
    ];
}

/**
 * Port of server.js reaggregateActuals (:682-701). Re-derives monthly_actuals
 * margin/revenue for one (month, year) bucket from ps_headers, after a PS
 * upsert/delete. Mutates $actualsAll in place (upsert-or-clear the matching
 * row) and returns the summary the caller echoes back to the client.
 */
function sp_reaggregate_actuals(array &$actualsAll, array $headersAll, int $monthIdx, int $psYear): array {
    $inBucket = array_values(array_filter($headersAll, function ($h) use ($monthIdx, $psYear) {
        return ($h['dashboard_month_idx'] ?? null) === $monthIdx && ($h['dashboard_year'] ?? null) === $psYear;
    }));
    $idx = null;
    foreach ($actualsAll as $i => $r) {
        if (($r['month_idx'] ?? null) === $monthIdx && ($r['year'] ?? null) === $psYear) { $idx = $i; break; }
    }
    $now = date('c');

    if (count($inBucket) > 0) {
        $m = 0.0; $r = 0.0;
        foreach ($inBucket as $h) {
            $m += sp_num($h['margin'] ?? null);
            $r += sp_num($h['sales_revenue'] ?? null);
        }
        $m /= 1e6; $r /= 1e6;
        if ($idx !== null) {
            $actualsAll[$idx]['actual_margin'] = $m;
            $actualsAll[$idx]['revenue'] = $r;
            $actualsAll[$idx]['updated_at'] = $now;
        } else {
            $actualsAll[] = [
                'month_idx' => $monthIdx, 'year' => $psYear,
                'actual_margin' => $m, 'plan_margin' => null, 'revenue' => $r,
                'notes' => '', 'updated_at' => $now,
            ];
        }
        return ['mMIDR' => $m, 'rMIDR' => $r, 'remaining' => count($inBucket)];
    }

    // No PS left in this bucket -> clear actual_margin/revenue if the row exists.
    if ($idx !== null) {
        $actualsAll[$idx]['actual_margin'] = null;
        $actualsAll[$idx]['revenue'] = null;
        $actualsAll[$idx]['updated_at'] = $now;
    }
    return ['mMIDR' => 0.0, 'rMIDR' => 0.0, 'remaining' => 0];
}
