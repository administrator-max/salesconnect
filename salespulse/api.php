<?php
/**
 * Sales Pulse REST API — backed by the Sales Pulse Google Spreadsheet. OPEN
 * (no login), mirrors ../sales_pulse/server.js's JSON contract exactly.
 * Routes relative to /salespulse/api/ :
 *   data                    GET, POST
 *   products                GET
 *   budget/import            POST
 *   budget/:year             DELETE
 *   project-sheet             POST
 *   project-sheet/:psNumber   DELETE
 *   health                   GET
 */
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/salespulse_util.php';
require_once __DIR__ . '/consolidation.php';

$cfg = sc_config();
$SID = $cfg['spreadsheets']['salespulse'];
$gs  = new GoogleSheets();

$method = $_SERVER['REQUEST_METHOD'];
$parts  = array_values(array_filter(explode('/', trim(sc_route(), '/')), fn($p) => $p !== ''));
$res    = $parts[0] ?? '';

/** Lenient parseInt-style leading-integer parse (mirrors JS parseInt on a string). */
function sp_lenient_int($v): ?int {
    if ($v === null) return null;
    if (is_int($v)) return $v;
    if (is_float($v)) return (int) $v;
    if (preg_match('/^\s*[-+]?\d+/', (string) $v, $m)) return (int) $m[0];
    return null;
}

try {
    switch ($res) {
        // ====================================================================
        // 1 & 5. GET/POST /api/data
        // ====================================================================
        case 'data':
            if ($method === 'GET') {
                $year = sp_lenient_int($_GET['year'] ?? null);
                if (!$year) $year = 2026; // parseInt(...) || 2026

                $actualsAll = sp_get_table($gs, $SID, 'monthly_actuals');
                $plansAll   = sp_get_table($gs, $SID, 'plan_revisions');
                $budgetAll  = sp_get_table($gs, $SID, 'budget_lines');
                $headersAll = sp_get_table($gs, $SID, 'ps_headers');
                $itemsAll   = sp_get_table($gs, $SID, 'ps_items');

                header('Cache-Control: private, max-age=5, must-revalidate');
                json_out(sp_build_data($year, $actualsAll, $plansAll, $budgetAll, $headersAll, $itemsAll));
            }

            if ($method === 'POST') {
                $b = json_body();
                $ACTUAL = $b['ACTUAL'] ?? null;
                $PLAN_REVISIONS = $b['PLAN_REVISIONS'] ?? null;
                if (!is_array($ACTUAL) || !is_array($PLAN_REVISIONS)) {
                    json_out(['error' => 'Invalid payload'], 400);
                }
                $aYear = sp_lenient_int($b['year'] ?? null);
                if (!$aYear) $aYear = 2026;

                sp_with_lock(function () use ($gs, $SID, $ACTUAL, $PLAN_REVISIONS, $aYear) {
                    $now = date('c');

                    // monthly_actuals: upsert 12 rows for this year, keep other years.
                    $actualsAll = sp_get_table($gs, $SID, 'monthly_actuals');
                    $keptActuals = array_values(array_filter($actualsAll, fn($r) => ($r['year'] ?? null) !== $aYear));
                    $newActuals = [];
                    for ($i = 0; $i < 12; $i++) {
                        $newActuals[] = [
                            'month_idx' => $i, 'year' => $aYear,
                            'actual_margin' => $ACTUAL['margin'][$i] ?? null,
                            'plan_margin'   => $ACTUAL['plan'][$i] ?? null,
                            'revenue'       => $ACTUAL['revenue'][$i] ?? null,
                            'notes'         => $ACTUAL['notes'][$i] ?? '',
                            'updated_at'    => $now,
                        ];
                    }
                    sp_replace_table($gs, $SID, 'monthly_actuals', array_merge($keptActuals, $newActuals));

                    // plan_revisions: drop this year, reinsert. Other years kept.
                    $plansAll = sp_get_table($gs, $SID, 'plan_revisions');
                    $keptPlans = array_values(array_filter($plansAll, fn($r) => ($r['year'] ?? null) !== $aYear));
                    $newPlans = [];
                    for ($i = 0; $i < 12; $i++) {
                        $revs = is_array($PLAN_REVISIONS[$i] ?? null) ? $PLAN_REVISIONS[$i] : [];
                        foreach ($revs as $rev) {
                            $margin  = $rev['margin']  ?? null;
                            $revenue = $rev['revenue'] ?? null;
                            $newPlans[] = [
                                'month_idx' => $i, 'year' => $aYear,
                                'name'    => $rev['name']  ?? null,
                                'margin'  => ($margin  !== '' && $margin  !== null) ? sp_num($margin)  : null,
                                'revenue' => ($revenue !== '' && $revenue !== null) ? sp_num($revenue) : null,
                                'notes'   => $rev['notes'] ?? null,
                                'qty'     => $rev['qty']   ?? [],
                                'ts'      => $rev['ts']    ?? null,
                                'created_at' => $now,
                            ];
                        }
                    }
                    sp_replace_table($gs, $SID, 'plan_revisions', array_merge($keptPlans, $newPlans));
                });

                json_out(['success' => true]);
            }
            break;

        // ====================================================================
        // 2. GET /api/products
        // ====================================================================
        case 'products':
            if ($method === 'GET') {
                $prodRows  = sp_get_table($gs, $SID, 'products');
                $aliasRows = sp_get_table($gs, $SID, 'product_aliases');

                $products = [];
                foreach ($prodRows as $r) {
                    if (empty($r['canonical_name'])) continue;
                    $products[] = [
                        'canonical_name' => $r['canonical_name'],
                        'macro_category' => $r['macro_category'] ?? null,
                        'display_order'  => $r['display_order']  ?? null,
                    ];
                }
                usort($products, function ($a, $b) {
                    // JS `display_order || 100`: falsy 0 maps to 100 too (not just null).
                    $ao = $a['display_order']; $ao = (!$ao) ? 100 : $ao;
                    $bo = $b['display_order']; $bo = (!$bo) ? 100 : $bo;
                    if ($ao !== $bo) return $ao <=> $bo;
                    return strcmp((string) $a['canonical_name'], (string) $b['canonical_name']);
                });

                $aliases = [];
                foreach ($aliasRows as $r) {
                    if (!empty($r['alias'])) $aliases[$r['alias']] = $r['canonical_name'];
                }

                header('Cache-Control: public, max-age=300');
                json_out(['products' => $products, 'aliases' => $aliases]);
            }
            break;

        // ====================================================================
        // 3 & 4. POST /api/budget/import , DELETE /api/budget/:year
        // ====================================================================
        case 'budget':
            $sub = $parts[1] ?? null;

            if ($sub === 'import' && $method === 'POST') {
                $b = json_body();
                $year  = $b['year']  ?? null;
                $lines = $b['lines'] ?? null;
                if (!is_int($year) || !is_array($lines)) {
                    json_out(['error' => 'Invalid payload — expect { year:int, lines:array }'], 400);
                }
                if (count($lines) === 0) {
                    json_out(['error' => 'No lines to import'], 400);
                }

                $result = sp_with_lock(function () use ($gs, $SID, $year, $lines) {
                    // Validate products against master.
                    $prodRows = sp_get_table($gs, $SID, 'products');
                    $validProducts = [];
                    foreach ($prodRows as $r) {
                        if (!empty($r['canonical_name'])) $validProducts[$r['canonical_name']] = true;
                    }
                    $rawProducts = [];
                    foreach ($lines as $l) {
                        $p = $l['product'] ?? null;
                        $rawProducts[(string) $p] = $p;
                    }
                    $unknown = [];
                    foreach ($rawProducts as $p) {
                        if (!isset($validProducts[$p])) $unknown[] = $p;
                    }
                    if (count($unknown) > 0) {
                        $shown = array_slice($unknown, 0, 5);
                        $shownStr = implode(', ', array_map(fn($p) => $p === null ? '' : (string) $p, $shown));
                        throw new Exception('Unknown product(s): ' . $shownStr . (count($unknown) > 5 ? '…' : ''));
                    }

                    $all = sp_get_table($gs, $SID, 'budget_lines');
                    // Replace this year fully, keep other years.
                    $kept = array_values(array_filter($all, fn($r) => ($r['year'] ?? null) !== $year));

                    // UPSERT-sum per (year, month_idx, segment, product) for this year.
                    $merged = [];
                    $order = [];
                    $now = date('c');
                    foreach ($lines as $l) {
                        $mIdx = sp_lenient_int($l['month_idx'] ?? null);
                        if ($mIdx === null || $mIdx < 0 || $mIdx > 11) continue;
                        $segRaw = $l['segment'] ?? null;
                        if ($segRaw === null || $segRaw === '' || $segRaw === false) $segRaw = 'Unknown';
                        $segment = trim((string) $segRaw);
                        $product = trim((string) ($l['product'] ?? ''));
                        $k = $mIdx . '__' . $segment . '__' . $product;
                        if (!isset($merged[$k])) {
                            $merged[$k] = [
                                'year' => $year, 'month_idx' => $mIdx,
                                'segment' => $segment, 'product' => $product,
                                'volume_mt' => 0.0, 'revenue_idr' => 0.0, 'margin_idr' => 0.0,
                                'updated_at' => $now,
                            ];
                            $order[] = $k;
                        }
                        $merged[$k]['volume_mt']   += sp_num($l['volume_mt']   ?? null);
                        $merged[$k]['revenue_idr'] += sp_num($l['revenue_idr'] ?? null);
                        $merged[$k]['margin_idr']  += sp_num($l['margin_idr']  ?? null);
                    }
                    $newRows = [];
                    foreach ($order as $k) $newRows[] = $merged[$k];

                    $written = sp_replace_table($gs, $SID, 'budget_lines', array_merge($kept, $newRows));
                    $count = 0;
                    foreach ($written as $r) { if (($r['year'] ?? null) === $year) $count++; }
                    return $count;
                });

                json_out(['success' => true, 'year' => $year, 'rowsInserted' => $result]);
            }

            if ($sub !== null && $sub !== 'import' && $method === 'DELETE') {
                $year = sp_lenient_int($sub);
                if ($year === null) json_out(['error' => 'Invalid year'], 400);

                $deleted = sp_with_lock(function () use ($gs, $SID, $year) {
                    $all = sp_get_table($gs, $SID, 'budget_lines');
                    $kept = array_values(array_filter($all, fn($r) => ($r['year'] ?? null) !== $year));
                    sp_replace_table($gs, $SID, 'budget_lines', $kept);
                    return count($all) - count($kept);
                });

                json_out(['success' => true, 'year' => $year, 'rowsDeleted' => $deleted]);
            }
            break;

        // ====================================================================
        // 6 & 7. POST /api/project-sheet , DELETE /api/project-sheet/:psNumber
        // ====================================================================
        case 'project-sheet':
            $psParam = $parts[1] ?? null;

            if ($method === 'POST' && $psParam === null) {
                $b = json_body();
                $header = $b['header'] ?? null;
                $items  = $b['items']  ?? null;
                if (!is_array($header) || empty($header['psNumber'])) {
                    json_out(['error' => 'Missing header.psNumber'], 400);
                }
                if (!is_array($items)) $items = [];

                $out = sp_with_lock(function () use ($gs, $SID, $header, $items) {
                    $parsedPoDate = sp_parse_project_sheet_date($header['poDate'] ?? null);
                    $monthIdx = $parsedPoDate['monthIdx'];
                    if ($monthIdx === null) $monthIdx = 0;
                    if ($monthIdx < 0 || $monthIdx > 11) $monthIdx = 0;

                    $psYear = sp_lenient_int($header['dashboardYear'] ?? null);
                    if (!$psYear) {
                        $psYear = $parsedPoDate['date'] ? (int) substr($parsedPoDate['date'], 0, 4) : (int) date('Y');
                    }

                    // Detect canonical product from material/project name via product_aliases.
                    $detectedProduct = null;
                    $detectedSegment = null;
                    if (count($items) > 0) {
                        $aliasRows = sp_get_table($gs, $SID, 'product_aliases');
                        $aliases = [];
                        foreach ($aliasRows as $r) {
                            if (!empty($r['alias'])) {
                                $aliases[] = ['alias' => strtolower((string) $r['alias']), 'canonical' => $r['canonical_name']];
                            }
                        }
                        usort($aliases, fn($a, $b) => strlen($b['alias']) <=> strlen($a['alias'])); // longest alias first

                        $matStr = '';
                        foreach (array_slice($items, 0, 5) as $it) {
                            $matStr .= ' ' . ($it['material'] ?? '') . ' ' . ($it['size'] ?? '');
                        }
                        $haystack = strtolower(($header['projectName'] ?? '') . ' ' . $matStr);
                        foreach ($aliases as $al) {
                            if ($al['alias'] !== '' && strpos($haystack, $al['alias']) !== false) {
                                $detectedProduct = $al['canonical'];
                                break;
                            }
                        }
                    }
                    if ($detectedProduct) {
                        $segMap = [
                            'Sheet Pile' => 'Long', 'ERW Pipe' => 'Long', 'Seamless Pipe' => 'Long', 'Angle' => 'Long',
                            'Bar' => 'Long', 'Beam' => 'Long', 'Channel' => 'Long', 'As Steel' => 'Long', 'Hollow' => 'Long',
                            'HRC' => 'Flat', 'HRPO' => 'Flat', 'Plate' => 'Flat', 'Chequered Plate' => 'Flat', 'Wear Plate' => 'Flat',
                            'Galvalume' => 'Coated', 'Galvanized' => 'Coated', 'PPGL' => 'Coated', 'Wiremesh' => 'Coated',
                            'Slab' => 'Semi-Finished', 'Billet' => 'Semi-Finished',
                            'HBI' => 'Raw Material', 'Scrap' => 'Raw Material',
                            'Projects' => 'Projects',
                        ];
                        $detectedSegment = $segMap[$detectedProduct] ?? null;
                    }

                    $now = date('c');

                    // ps_headers: upsert by ps_number.
                    $headersAll = sp_get_table($gs, $SID, 'ps_headers');
                    $hIdx = null;
                    foreach ($headersAll as $i => $h) {
                        if (($h['ps_number'] ?? null) === $header['psNumber']) { $hIdx = $i; break; }
                    }
                    $newHeader = [
                        'ps_number'           => $header['psNumber'],
                        'dashboard_month_idx' => $monthIdx,
                        'dashboard_year'      => $psYear,
                        'project_code'        => $header['projectCode']  ?? null,
                        'project_name'        => $header['projectName']  ?? null,
                        'subsidiary'          => $header['subsidiary']   ?? null,
                        'customer_name'       => $header['customerName'] ?? null,
                        'supplier_name'       => $header['supplierName'] ?? null,
                        'po_date'             => $parsedPoDate['date'],
                        'currency'            => $header['currency'] ?? 'IDR',
                        'fx_rate'             => $header['fxToIDR']  ?? 1,
                        'net_margin_native'   => (array_key_exists('netMarginNative', $header) && $header['netMarginNative'] !== null)
                                                    ? $header['netMarginNative'] : ($header['margin'] ?? null),
                        'sales_revenue'       => (array_key_exists('salesIDR', $header) && $header['salesIDR'] !== null)
                                                    ? $header['salesIDR'] : ($header['sales'] ?? null),
                        'purchase_cost'       => $header['purchase'] ?? null,
                        'margin'              => (array_key_exists('marginIDR', $header) && $header['marginIDR'] !== null)
                                                    ? $header['marginIDR'] : ($header['margin'] ?? null),
                        'margin_percentage'   => $header['marginPct'] ?? null,
                        'product'             => $detectedProduct,
                        'segment'             => $detectedSegment,
                        'notes'               => $hIdx !== null ? ($headersAll[$hIdx]['notes'] ?? null) : null,
                        'created_at'          => $hIdx !== null ? ($headersAll[$hIdx]['created_at'] ?? $now) : $now,
                    ];
                    if ($hIdx !== null) $headersAll[$hIdx] = $newHeader; else $headersAll[] = $newHeader;
                    sp_replace_table($gs, $SID, 'ps_headers', $headersAll);

                    // ps_items: drop this PS's old items, insert the new set.
                    $itemsAll = sp_get_table($gs, $SID, 'ps_items');
                    $keptItems = array_values(array_filter($itemsAll, fn($i) => ($i['ps_number'] ?? null) !== $header['psNumber']));
                    $newItems = [];
                    foreach ($items as $item) {
                        $newItems[] = [
                            'ps_number'          => $header['psNumber'],
                            'dashboard_year'     => $psYear,
                            'dashboard_month_idx' => $monthIdx,
                            'project_name'       => $header['projectName'] ?? null,
                            'item_no'            => $item['no'] ?? null,
                            'material'           => $item['material'] ?? null,
                            'size'               => $item['size'] ?? null,
                            'length'             => $item['length'] ?? null,
                            'qty_val'            => $item['qtyVal'] ?? null,
                            'qty_unit'           => $item['qtyUnit'] ?? null,
                            'total_weight_kg'    => $item['totalWeight'] ?? null,
                            'purchase_price_kg'  => $item['purchasePrice'] ?? null,
                            'created_at'         => $now,
                        ];
                    }
                    sp_replace_table($gs, $SID, 'ps_items', array_merge($keptItems, $newItems));

                    // Re-aggregate monthly_actuals for this (year, month) only.
                    $actualsAll = sp_get_table($gs, $SID, 'monthly_actuals');
                    $agg = sp_reaggregate_actuals($actualsAll, $headersAll, $monthIdx, $psYear);
                    sp_replace_table($gs, $SID, 'monthly_actuals', $actualsAll);

                    return ['monthIdx' => $monthIdx, 'year' => $psYear, 'mMIDR' => $agg['mMIDR'], 'rMIDR' => $agg['rMIDR']];
                });

                json_out([
                    'success' => true,
                    'message' => "Imported {$header['psNumber']}.",
                    'monthIdx' => $out['monthIdx'], 'year' => $out['year'],
                    'mMIDR' => $out['mMIDR'], 'rMIDR' => $out['rMIDR'],
                ]);
            }

            if ($method === 'DELETE' && $psParam !== null) {
                $psNumber = urldecode($psParam);

                $out = sp_with_lock(function () use ($gs, $SID, $psNumber) {
                    $headersAll = sp_get_table($gs, $SID, 'ps_headers');
                    $target = null;
                    foreach ($headersAll as $h) {
                        if (($h['ps_number'] ?? null) === $psNumber) { $target = $h; break; }
                    }
                    if ($target === null) return ['notFound' => true];

                    $monthIdx = $target['dashboard_month_idx'] ?? null;
                    $psYear   = $target['dashboard_year'] ?? null;

                    $remainingHeaders = array_values(array_filter($headersAll, fn($h) => ($h['ps_number'] ?? null) !== $psNumber));
                    sp_replace_table($gs, $SID, 'ps_headers', $remainingHeaders);

                    $itemsAll = sp_get_table($gs, $SID, 'ps_items');
                    sp_replace_table($gs, $SID, 'ps_items', array_values(array_filter($itemsAll, fn($i) => ($i['ps_number'] ?? null) !== $psNumber)));

                    $actualsAll = sp_get_table($gs, $SID, 'monthly_actuals');
                    $agg = sp_reaggregate_actuals($actualsAll, $remainingHeaders, (int) $monthIdx, (int) $psYear);
                    sp_replace_table($gs, $SID, 'monthly_actuals', $actualsAll);

                    return ['monthIdx' => $monthIdx, 'year' => $psYear, 'remaining' => $agg['remaining']];
                });

                if ($out['notFound'] ?? false) json_out(['error' => 'PS not found'], 404);
                json_out([
                    'success' => true,
                    'message' => "$psNumber deleted.",
                    'monthIdx' => $out['monthIdx'], 'year' => $out['year'], 'remaining' => $out['remaining'],
                ]);
            }
            break;

        // ====================================================================
        // 8. GET /api/health
        // ====================================================================
        case 'health':
            if ($method === 'GET') {
                try {
                    $gs->headers($SID, 'products');
                } catch (Throwable $e) {
                    json_out(['ok' => false, 'error' => $e->getMessage()], 503);
                }
                json_out(['ok' => true]);
            }
            break;
    }

    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 500);
}
