<?php
/**
 * CRM Projects REST API — backed by the CRM Projects Google Spreadsheet
 * (spreadsheet re-used as-is from the old crmproject.gunungprisma.com app,
 * which itself moved from Postgres to Google Sheets in July 2026 — see
 * ../crm-project/db/sheetSchema.js for the canonical column layout this
 * mirrors).
 *
 * Ported 1:1 from ../crm-project/server.js EXCEPT:
 *   - the whole auth/session/user-management layer (/api/auth/*, /api/users*,
 *     app_users table, SEED_USERS) — dropped, replaced by SalesConnect's
 *     shared login (sc_require_tool_api() below) + lib/access.php.
 *   - /api/debug/* — internal dev-only routes, not business functionality.
 *   - generated/formula columns (cogs, revenue, margin, margin_pct,
 *     total_ow_mt, est_wrp_volume_mt, est_annual_demand_t): the source app
 *     wrote Google Sheets FORMULA strings into these cells. SalesConnect's
 *     convention is valueInputOption=RAW everywhere (see ../CLAUDE.md), so
 *     here the values are computed in PHP and written as plain numbers —
 *     same end result, no formula cells mixed into a RAW-only sheet.
 *   - /api/sales-persons: source read names from the now-removed app_users
 *     table. Here it's re-derived from distinct non-empty sales_owner
 *     (pipeline_opportunities) + sales_person (sales_activities).
 *
 * IDs stay NUMERIC (auto-increment via the shared _meta tab, mirroring
 * db/sheetsdb.js nextval()) because the frontend (js/app.js) embeds row ids
 * directly as unquoted JS numeric literals in onclick handlers
 * (e.g. onclick="openEditPipeline(123)") — an opaque string id would break
 * those call sites.
 *
 * Routes (relative to /crmproject/api/), grouped like server.js:
 *   market/overview, market/manufacturers[/global|china[/:id]],
 *   market/trading[/:id], market/stockists[/:id],
 *   market/heavy-equipment (read-only), market/project-owners (read-only)
 *   products (read-only)
 *   pipeline/summary, pipeline/by-customer, pipeline/by-payment,
 *   pipeline/by-owner, pipeline/weighted, pipeline[/:id[/action]]
 *   crm/accounts[/:id[/action]]
 *   activities[/:id[/history]]
 *   mro/summary, mro[/:id]
 *   export/activities, export/customers
 *   audit-log
 *   sales-persons
 *   db-status
 */
require_once __DIR__ . '/../lib/sheet_util.php';
require_once __DIR__ . '/../lib/tool_guard.php';
sc_require_tool_api('crmproject');

$cfg = sc_config();
$SID = $cfg['spreadsheets']['crmproject'];
$gs  = new GoogleSheets();

$method = $_SERVER['REQUEST_METHOD'];
$parts  = array_values(array_filter(explode('/', trim(sc_route(), '/')), fn($p) => $p !== ''));
$res    = $parts[0] ?? '';

try {
    switch ($res) {

        // ── DB STATUS (untuk banner "belum seeded" di frontend) ─────────
        case 'db-status':
            if ($method === 'GET') {
                $seedTables = ['global_manufacturers', 'china_manufacturers', 'trading_offices', 'stockists',
                    'heavy_equipment_suppliers', 'project_owners', 'product_grades', 'pipeline_opportunities',
                    'crm_accounts', 'crm_contacts'];
                $userTables = ['sales_activities', 'mro_models'];
                $counts = [];
                foreach (array_merge($seedTables, $userTables) as $t) {
                    $counts[$t] = count($gs->table($SID, $t)['rows']);
                }
                $seeded = true;
                foreach ($seedTables as $t) { if (($counts[$t] ?? 0) <= 0) { $seeded = false; break; } }
                json_out(['seeded' => $seeded, 'tables' => $counts, 'user_tables' => $userTables, 'seed_tables' => $seedTables]);
            }
            break;

        // ── P1: MARKET BLUEPRINT ─────────────────────────────────────────
        case 'market':
            $sub = $parts[1] ?? '';

            if ($sub === 'overview' && $method === 'GET') {
                $g  = $gs->table($SID, 'global_manufacturers')['rows'];
                $c  = $gs->table($SID, 'china_manufacturers')['rows'];
                $t  = $gs->table($SID, 'trading_offices')['rows'];
                $st = $gs->table($SID, 'stockists')['rows'];
                $he = $gs->table($SID, 'heavy_equipment_suppliers')['rows'];
                $byCat = function ($cat) use ($st) {
                    $rows = array_values(array_filter($st, fn($s) => ($s['category'] ?? '') === $cat));
                    $vol = 0.0; foreach ($rows as $s) $vol += crm_num($s['annual_volume_mt'] ?? 0);
                    return ['count' => count($rows), 'vol' => $vol];
                };
                $tradingTotal = 0.0; foreach ($t as $x) $tradingTotal += crm_num($x['annual_volume_mt'] ?? 0);
                $heUnits = 0.0; foreach ($he as $x) $heUnits += crm_num($x['est_units_sold'] ?? 0);
                $heOW    = 0.0; foreach ($he as $x) $heOW    += crm_num($x['total_ow_mt'] ?? 0);
                json_out([
                    'globalMfr' => count($g), 'chinaMfr' => count($c),
                    'tradingTotal' => $tradingTotal,
                    'stockOEM' => $byCat('OEM'), 'stockFab' => $byCat('Fabricator'), 'stockDist' => $byCat('Distributor'),
                    'heUnits' => $heUnits, 'heOW' => $heOW,
                ]);
            }

            if ($sub === 'manufacturers') {
                $kind = $parts[2] ?? null;   // null | global | china
                $mid  = $parts[3] ?? null;

                if ($kind === null && $method === 'GET') {
                    $g = crm_sort_by_num($gs->table($SID, 'global_manufacturers')['rows'], 'sort_order');
                    $c = crm_sort_by_num($gs->table($SID, 'china_manufacturers')['rows'], 'sort_order');
                    json_out(['global' => array_map('crm_strip', $g), 'china' => array_map('crm_strip', $c)]);
                }

                if ($kind === 'global') {
                    if ($method === 'POST') {
                        $d = json_body();
                        $so = crm_next_sort_order($gs, $SID, 'global_manufacturers');
                        $row = [
                            'id' => crm_next_id($gs, $SID, 'global_manufacturers'), 'sort_order' => $so,
                            'brand' => $d['brand'] ?? '', 'mill_name' => $d['mill_name'] ?? '', 'country' => $d['country'] ?? '',
                            'category' => 'global', 'created_at' => sc_now(),
                            'notes' => crm_or_null($d['notes'] ?? null), 'contact_name' => crm_or_null($d['contact_name'] ?? null),
                            'contact_phone' => crm_or_null($d['contact_phone'] ?? null), 'website' => crm_or_null($d['website'] ?? null),
                        ];
                        $gs->appendAssoc($SID, 'global_manufacturers', $row);
                        json_out($row, 201);
                    }
                    if ($method === 'PUT' && $mid !== null) {
                        $row = find_by_id($gs, $SID, 'global_manufacturers', $mid);
                        if (!$row) json_out(['error' => 'Not found'], 404);
                        $d = json_body();
                        $row = array_merge($row, [
                            'brand' => $d['brand'] ?? '', 'mill_name' => $d['mill_name'] ?? '', 'country' => $d['country'] ?? '',
                            'notes' => crm_or_null($d['notes'] ?? null), 'contact_name' => crm_or_null($d['contact_name'] ?? null),
                            'contact_phone' => crm_or_null($d['contact_phone'] ?? null), 'website' => crm_or_null($d['website'] ?? null),
                        ]);
                        $gs->updateAssoc($SID, 'global_manufacturers', $row['_row'], $row);
                        json_out(crm_strip($row));
                    }
                    if ($method === 'DELETE' && $mid !== null) {
                        $row = find_by_id($gs, $SID, 'global_manufacturers', $mid);
                        if ($row) $gs->deleteRows($SID, 'global_manufacturers', [$row['_row']]);
                        json_out(['ok' => true]);
                    }
                }

                if ($kind === 'china') {
                    if ($method === 'POST') {
                        $d = json_body();
                        $so = crm_next_sort_order($gs, $SID, 'china_manufacturers');
                        $row = [
                            'id' => crm_next_id($gs, $SID, 'china_manufacturers'), 'sort_order' => $so,
                            'brand' => $d['brand'] ?? '', 'mill_name' => $d['mill_name'] ?? '',
                            'city_province' => crm_or_null($d['city_province'] ?? null), 'created_at' => sc_now(),
                            'notes' => crm_or_null($d['notes'] ?? null), 'contact_name' => crm_or_null($d['contact_name'] ?? null),
                            'contact_phone' => crm_or_null($d['contact_phone'] ?? null), 'website' => crm_or_null($d['website'] ?? null),
                        ];
                        $gs->appendAssoc($SID, 'china_manufacturers', $row);
                        json_out($row, 201);
                    }
                    if ($method === 'PUT' && $mid !== null) {
                        $row = find_by_id($gs, $SID, 'china_manufacturers', $mid);
                        if (!$row) json_out(['error' => 'Not found'], 404);
                        $d = json_body();
                        $row = array_merge($row, [
                            'brand' => $d['brand'] ?? '', 'mill_name' => $d['mill_name'] ?? '',
                            'city_province' => crm_or_null($d['city_province'] ?? null),
                            'notes' => crm_or_null($d['notes'] ?? null), 'contact_name' => crm_or_null($d['contact_name'] ?? null),
                            'contact_phone' => crm_or_null($d['contact_phone'] ?? null), 'website' => crm_or_null($d['website'] ?? null),
                        ]);
                        $gs->updateAssoc($SID, 'china_manufacturers', $row['_row'], $row);
                        json_out(crm_strip($row));
                    }
                    if ($method === 'DELETE' && $mid !== null) {
                        $row = find_by_id($gs, $SID, 'china_manufacturers', $mid);
                        if ($row) $gs->deleteRows($SID, 'china_manufacturers', [$row['_row']]);
                        json_out(['ok' => true]);
                    }
                }
            }

            if ($sub === 'trading') {
                $tid = $parts[2] ?? null;
                if ($tid === null && $method === 'GET') {
                    json_out(array_map('crm_strip', crm_sort_by_num($gs->table($SID, 'trading_offices')['rows'], 'sort_order')));
                }
                if ($tid === null && $method === 'POST') {
                    $d = json_body();
                    $so = crm_next_sort_order($gs, $SID, 'trading_offices');
                    $row = [
                        'id' => crm_next_id($gs, $SID, 'trading_offices'), 'sort_order' => $so,
                        'company_name' => $d['company_name'] ?? '', 'brand' => crm_or_null($d['brand'] ?? null),
                        'annual_volume_mt' => crm_num($d['annual_volume_mt'] ?? 0), 'market_share_pct' => crm_num($d['market_share_pct'] ?? 0),
                        'color_hex' => ($d['color_hex'] ?? '') !== '' ? $d['color_hex'] : '#0B3D6B', 'created_at' => sc_now(),
                        'notes' => crm_or_null($d['notes'] ?? null), 'contact_name' => crm_or_null($d['contact_name'] ?? null),
                        'contact_phone' => crm_or_null($d['contact_phone'] ?? null), 'location' => crm_or_null($d['location'] ?? null),
                    ];
                    $gs->appendAssoc($SID, 'trading_offices', $row);
                    json_out($row, 201);
                }
                if ($tid !== null && $method === 'PUT') {
                    $row = find_by_id($gs, $SID, 'trading_offices', $tid);
                    if (!$row) json_out(['error' => 'Not found'], 404);
                    $d = json_body();
                    $row = array_merge($row, [
                        'company_name' => $d['company_name'] ?? '', 'brand' => crm_or_null($d['brand'] ?? null),
                        'annual_volume_mt' => crm_num($d['annual_volume_mt'] ?? 0), 'market_share_pct' => crm_num($d['market_share_pct'] ?? 0),
                        'color_hex' => ($d['color_hex'] ?? '') !== '' ? $d['color_hex'] : '#0B3D6B',
                        'notes' => crm_or_null($d['notes'] ?? null), 'contact_name' => crm_or_null($d['contact_name'] ?? null),
                        'contact_phone' => crm_or_null($d['contact_phone'] ?? null), 'location' => crm_or_null($d['location'] ?? null),
                    ]);
                    $gs->updateAssoc($SID, 'trading_offices', $row['_row'], $row);
                    json_out(crm_strip($row));
                }
                if ($tid !== null && $method === 'DELETE') {
                    $row = find_by_id($gs, $SID, 'trading_offices', $tid);
                    if ($row) $gs->deleteRows($SID, 'trading_offices', [$row['_row']]);
                    json_out(['ok' => true]);
                }
            }

            if ($sub === 'stockists') {
                $sid2 = $parts[2] ?? null;
                if ($sid2 === null && $method === 'GET') {
                    $rows = $gs->table($SID, 'stockists')['rows'];
                    $category = $_GET['category'] ?? '';
                    if ($category !== '') {
                        $rows = crm_sort_by_num(array_values(array_filter($rows, fn($s) => ($s['category'] ?? '') === $category)), 'sort_order');
                    } else {
                        usort($rows, function ($a, $b) {
                            $c = strcmp((string) ($a['category'] ?? ''), (string) ($b['category'] ?? ''));
                            return $c !== 0 ? $c : (crm_num($a['sort_order'] ?? 0) <=> crm_num($b['sort_order'] ?? 0));
                        });
                    }
                    json_out(array_map('crm_strip', $rows));
                }
                if ($sid2 === null && $method === 'POST') {
                    $d = json_body();
                    $so = crm_next_sort_order($gs, $SID, 'stockists');
                    $row = [
                        'id' => crm_next_id($gs, $SID, 'stockists'), 'sort_order' => $so,
                        'category' => $d['category'] ?? '', 'company_name' => $d['company_name'] ?? '',
                        'location' => crm_or_null($d['location'] ?? null), 'annual_volume_mt' => crm_num($d['annual_volume_mt'] ?? 0),
                        'size_range' => crm_or_null($d['size_range'] ?? null), 'remarks' => crm_or_null($d['remarks'] ?? null),
                        'api_status' => crm_or_null($d['api_status'] ?? null), 'created_at' => sc_now(),
                        'contact_name' => crm_or_null($d['contact_name'] ?? null), 'contact_phone' => crm_or_null($d['contact_phone'] ?? null),
                        'website' => crm_or_null($d['website'] ?? null),
                    ];
                    $gs->appendAssoc($SID, 'stockists', $row);
                    json_out($row, 201);
                }
                if ($sid2 !== null && $method === 'PUT') {
                    $row = find_by_id($gs, $SID, 'stockists', $sid2);
                    if (!$row) json_out(['error' => 'Not found'], 404);
                    $d = json_body();
                    $row = array_merge($row, [
                        'category' => $d['category'] ?? '', 'company_name' => $d['company_name'] ?? '',
                        'location' => crm_or_null($d['location'] ?? null), 'annual_volume_mt' => crm_num($d['annual_volume_mt'] ?? 0),
                        'size_range' => crm_or_null($d['size_range'] ?? null), 'remarks' => crm_or_null($d['remarks'] ?? null),
                        'api_status' => crm_or_null($d['api_status'] ?? null),
                        'contact_name' => crm_or_null($d['contact_name'] ?? null), 'contact_phone' => crm_or_null($d['contact_phone'] ?? null),
                        'website' => crm_or_null($d['website'] ?? null),
                    ]);
                    $gs->updateAssoc($SID, 'stockists', $row['_row'], $row);
                    json_out(crm_strip($row));
                }
                if ($sid2 !== null && $method === 'DELETE') {
                    $row = find_by_id($gs, $SID, 'stockists', $sid2);
                    if ($row) $gs->deleteRows($SID, 'stockists', [$row['_row']]);
                    json_out(['ok' => true]);
                }
            }

            if ($sub === 'heavy-equipment' && $method === 'GET') {
                json_out(array_map('crm_strip', crm_sort_by_num($gs->table($SID, 'heavy_equipment_suppliers')['rows'], 'sort_order')));
            }
            if ($sub === 'project-owners' && $method === 'GET') {
                json_out(array_map('crm_strip', crm_sort_by_num($gs->table($SID, 'project_owners')['rows'], 'sort_order')));
            }
            break;

        // ── P2: PRODUCT GRADES (read-only) ───────────────────────────────
        case 'products':
            if ($method === 'GET') {
                $rows = $gs->table($SID, 'product_grades')['rows'];
                $category = $_GET['category'] ?? '';
                if ($category !== '') {
                    $rows = crm_sort_by_num(array_values(array_filter($rows, fn($p) => ($p['category'] ?? '') === $category)), 'sort_order');
                } else {
                    usort($rows, function ($a, $b) {
                        $c = strcmp((string) ($a['category'] ?? ''), (string) ($b['category'] ?? ''));
                        return $c !== 0 ? $c : (crm_num($a['sort_order'] ?? 0) <=> crm_num($b['sort_order'] ?? 0));
                    });
                }
                json_out(array_map('crm_strip', $rows));
            }
            break;

        // ── P3: SALES PIPELINE ───────────────────────────────────────────
        case 'pipeline':
            $sub2 = $parts[1] ?? null;

            if ($sub2 === 'summary' && $method === 'GET') {
                $rows = $gs->table($SID, 'pipeline_opportunities')['rows'];
                $q    = array_values(array_filter($rows, 'crm_is_q'));
                $lost = array_values(array_filter($rows, fn($r) => ($r['stage'] ?? '') === 'Lost'));
                $avgMpct = 0.0;
                if (count($q)) { $s = 0.0; foreach ($q as $r) $s += crm_num($r['margin_pct'] ?? 0); $avgMpct = $s / count($q); }
                $pipeRev = 0.0; foreach ($q as $r) $pipeRev += crm_num($r['revenue'] ?? 0);
                $pipeMargin = 0.0; foreach ($q as $r) $pipeMargin += crm_num($r['margin'] ?? 0);
                $lostRev = 0.0; foreach ($lost as $r) $lostRev += crm_num($r['revenue'] ?? 0);
                json_out([
                    'active_deals' => count($q), 'lost_deals' => count($lost),
                    'pipeline_revenue' => crm_r($pipeRev), 'pipeline_margin' => crm_r($pipeMargin),
                    'avg_margin_pct' => round($avgMpct * 100 * 100) / 100, 'lost_revenue' => crm_r($lostRev),
                ]);
            }
            if ($sub2 === 'by-customer' && $method === 'GET') {
                $q = array_values(array_filter($gs->table($SID, 'pipeline_opportunities')['rows'], 'crm_is_q'));
                $m = [];
                foreach ($q as $r) {
                    $k = $r['customer'] ?? '';
                    if (!isset($m[$k])) $m[$k] = ['customer' => $k, 'total_revenue' => 0.0, 'total_margin' => 0.0];
                    $m[$k]['total_revenue'] += crm_num($r['revenue'] ?? 0);
                    $m[$k]['total_margin']  += crm_num($r['margin'] ?? 0);
                }
                $out = array_map(fn($o) => ['customer' => $o['customer'], 'total_revenue' => crm_r($o['total_revenue']), 'total_margin' => crm_r($o['total_margin'])], array_values($m));
                usort($out, fn($a, $b) => $b['total_revenue'] <=> $a['total_revenue']);
                json_out($out);
            }
            if ($sub2 === 'by-payment' && $method === 'GET') {
                $q = array_values(array_filter($gs->table($SID, 'pipeline_opportunities')['rows'], 'crm_is_q'));
                $m = [];
                foreach ($q as $r) {
                    $k = $r['payment_term'] ?? '';
                    if (!isset($m[$k])) $m[$k] = ['payment_term' => $k, 'total_revenue' => 0.0];
                    $m[$k]['total_revenue'] += crm_num($r['revenue'] ?? 0);
                }
                $out = array_map(fn($o) => ['payment_term' => $o['payment_term'], 'total_revenue' => crm_r($o['total_revenue'])], array_values($m));
                usort($out, fn($a, $b) => $b['total_revenue'] <=> $a['total_revenue']);
                json_out($out);
            }
            if ($sub2 === 'by-owner' && $method === 'GET') {
                $q = array_values(array_filter($gs->table($SID, 'pipeline_opportunities')['rows'], 'crm_is_q'));
                $m = [];
                foreach ($q as $r) {
                    $k = $r['sales_owner'] ?? '';
                    if (!isset($m[$k])) $m[$k] = ['sales_owner' => $k, 'deals' => 0, 'revenue' => 0.0, 'margin' => 0.0];
                    $m[$k]['deals']++;
                    $m[$k]['revenue'] += crm_num($r['revenue'] ?? 0);
                    $m[$k]['margin']  += crm_num($r['margin'] ?? 0);
                }
                $out = array_map(fn($o) => ['sales_owner' => $o['sales_owner'], 'deals' => $o['deals'], 'revenue' => crm_r($o['revenue']), 'margin' => crm_r($o['margin'])], array_values($m));
                usort($out, fn($a, $b) => $b['revenue'] <=> $a['revenue']);
                json_out($out);
            }
            if ($sub2 === 'weighted' && $method === 'GET') {
                $q = array_values(array_filter($gs->table($SID, 'pipeline_opportunities')['rows'], 'crm_is_q'));
                $w = 0.0; foreach ($q as $r) $w += crm_num($r['revenue'] ?? 0) * crm_num($r['probability_pct'] ?? 0);
                json_out(['weighted_pipeline' => crm_r($w)]);
            }

            if ($sub2 === null && $method === 'GET') {
                $stage = $_GET['stage'] ?? ''; $owner = $_GET['owner'] ?? ''; $q = $_GET['q'] ?? '';
                $pipe = $gs->table($SID, 'pipeline_opportunities')['rows'];
                $accounts = $gs->table($SID, 'crm_accounts')['rows'];
                $actByCompany = [];
                foreach ($accounts as $a) $actByCompany[crm_norm($a['company'] ?? '')] = $a['action'] ?? null;
                $rows = $pipe;
                if ($stage !== '') $rows = array_values(array_filter($rows, fn($r) => ($r['stage'] ?? '') === $stage));
                if ($owner !== '') $rows = array_values(array_filter($rows, fn($r) => ($r['sales_owner'] ?? '') === $owner));
                if ($q !== '') {
                    $ql = mb_strtolower($q);
                    $rows = array_values(array_filter($rows, fn($r) =>
                        str_contains(crm_norm($r['customer'] ?? ''), $ql) ||
                        str_contains(crm_norm($r['product'] ?? ''), $ql) ||
                        str_contains(crm_norm($r['location'] ?? ''), $ql)
                    ));
                }
                usort($rows, fn($a, $b) => strcmp((string) ($a['opportunity_date'] ?? ''), (string) ($b['opportunity_date'] ?? '')));
                $out = array_map(function ($r) use ($actByCompany) {
                    $r = crm_strip($r);
                    $k = crm_norm($r['customer'] ?? '');
                    $r['company_action'] = array_key_exists($k, $actByCompany) ? $actByCompany[$k] : null;
                    return $r;
                }, $rows);
                json_out($out);
            }

            if ($sub2 === null && $method === 'POST') {
                $d = json_body();
                $calc = crm_pipeline_calc($d);
                $row = [
                    'id' => crm_next_id($gs, $SID, 'pipeline_opportunities'),
                    'opportunity_date' => $d['opportunity_date'] ?? '', 'customer' => $d['customer'] ?? '', 'location' => $d['location'] ?? '',
                    'product' => $d['product'] ?? '', 'volume_kg' => crm_num($d['volume_kg'] ?? 0), 'source' => $d['source'] ?? '',
                    'buying_price_kg' => crm_num($d['buying_price_kg'] ?? 0), 'selling_price_kg' => crm_num($d['selling_price_kg'] ?? 0),
                    'cogs' => $calc['cogs'], 'revenue' => $calc['revenue'],
                    'transport' => crm_num($d['transport'] ?? 0), 'financing' => crm_num($d['financing'] ?? 0),
                    'margin' => $calc['margin'], 'margin_pct' => $calc['margin_pct'],
                    'payment_term' => $d['payment_term'] ?? '', 'stage' => ($d['stage'] ?? '') !== '' ? $d['stage'] : 'Quotation',
                    'probability_pct' => array_key_exists('probability_pct', $d) ? crm_num($d['probability_pct']) : 0.6,
                    'expected_close_date' => crm_close_date($d['opportunity_date'] ?? '', $d['probability_pct'] ?? 0),
                    'sales_owner' => $d['sales_owner'] ?? '', 'notes' => $d['notes'] ?? null,
                    'created_at' => sc_now(), 'updated_at' => sc_now(),
                    'attachment' => crm_or_null($d['attachment'] ?? null), 'action' => crm_or_null($d['action'] ?? null),
                ];
                $gs->appendAssoc($SID, 'pipeline_opportunities', $row);
                json_out($row, 201);
            }

            if ($sub2 !== null && $method === 'PUT' && !isset($parts[2])) {
                $id = $sub2;
                $exists = find_by_id($gs, $SID, 'pipeline_opportunities', $id);
                if (!$exists) json_out(['error' => 'Pipeline opportunity not found: ' . $id], 404);
                $d = json_body();
                $calc = crm_pipeline_calc($d);
                $row = array_merge($exists, [
                    'opportunity_date' => $d['opportunity_date'] ?? '', 'customer' => $d['customer'] ?? '', 'location' => $d['location'] ?? '',
                    'product' => $d['product'] ?? '', 'volume_kg' => crm_num($d['volume_kg'] ?? 0), 'source' => $d['source'] ?? '',
                    'buying_price_kg' => crm_num($d['buying_price_kg'] ?? 0), 'selling_price_kg' => crm_num($d['selling_price_kg'] ?? 0),
                    'cogs' => $calc['cogs'], 'revenue' => $calc['revenue'],
                    'transport' => crm_num($d['transport'] ?? 0), 'financing' => crm_num($d['financing'] ?? 0),
                    'margin' => $calc['margin'], 'margin_pct' => $calc['margin_pct'],
                    'payment_term' => $d['payment_term'] ?? '', 'stage' => $d['stage'] ?? ($exists['stage'] ?? ''),
                    'probability_pct' => crm_num($d['probability_pct'] ?? ($exists['probability_pct'] ?? 0)),
                    'expected_close_date' => crm_close_date($d['opportunity_date'] ?? '', $d['probability_pct'] ?? 0),
                    'sales_owner' => $d['sales_owner'] ?? '', 'notes' => $d['notes'] ?? null,
                    'updated_at' => sc_now(), 'attachment' => crm_or_null($d['attachment'] ?? null),
                    // 'action' sengaja TIDAK disentuh di sini — diubah lewat PATCH .../action tersendiri.
                ]);
                $gs->updateAssoc($SID, 'pipeline_opportunities', $row['_row'], $row);
                json_out(crm_strip($row));
            }

            if ($sub2 !== null && $method === 'DELETE' && !isset($parts[2])) {
                $row = find_by_id($gs, $SID, 'pipeline_opportunities', $sub2);
                if ($row) $gs->deleteRows($SID, 'pipeline_opportunities', [$row['_row']]);
                json_out(['ok' => true]);
            }

            if ($sub2 !== null && ($parts[2] ?? null) === 'action' && $method === 'PATCH') {
                $d = json_body();
                $action = $d['action'] ?? null;
                $allowed = ['Follow Up 0-7 days', 'Follow Up 7-14 days', 'Follow Up 14-28 days', 'Follow Up >30 days', null, ''];
                if (!in_array($action, $allowed, true)) json_out(['error' => 'Invalid action value'], 400);
                $row = find_by_id($gs, $SID, 'pipeline_opportunities', $sub2);
                if (!$row) json_out(null);
                $row['action'] = crm_or_null($action);
                $gs->updateAssoc($SID, 'pipeline_opportunities', $row['_row'], $row);
                json_out(['id' => $row['id'], 'action' => $row['action']]);
            }
            break;

        // ── P4: CRM ACCOUNTS ──────────────────────────────────────────────
        case 'crm':
            if (($parts[1] ?? null) !== 'accounts') break;
            $aid    = $parts[2] ?? null;
            $action = $parts[3] ?? null;

            if ($aid === null && $method === 'GET') {
                $accounts  = $gs->table($SID, 'crm_accounts')['rows'];
                $contacts  = $gs->table($SID, 'crm_contacts')['rows'];
                $sectors   = $gs->table($SID, 'crm_sub_sectors')['rows'];
                $steps     = $gs->table($SID, 'crm_next_steps')['rows'];
                $pipeline  = $gs->table($SID, 'pipeline_opportunities')['rows'];
                $activities = $gs->table($SID, 'sales_activities')['rows'];

                $out = [];
                foreach (crm_sort_by_num($accounts, 'sort_order') as $a) {
                    $deals = array_values(array_filter($pipeline, fn($p) => ($p['customer'] ?? '') === ($a['company'] ?? '')));
                    $q     = array_values(array_filter($deals, 'crm_is_q'));
                    $withAction = array_values(array_filter($deals, fn($p) => ($p['action'] ?? null) !== null && $p['action'] !== ''));
                    usort($withAction, fn($x, $y) => strcmp((string) ($y['opportunity_date'] ?? ''), (string) ($x['opportunity_date'] ?? '')));
                    $acts = array_values(array_filter($activities, fn($s) => ($s['customer_visited'] ?? '') === ($a['company'] ?? '')));
                    $lastVisit = '';
                    foreach ($acts as $s) { $dt = (string) ($s['activity_date'] ?? ''); if ($dt > $lastVisit) $lastVisit = $dt; }

                    $activeRev = 0.0; foreach ($q as $p) $activeRev += crm_num($p['revenue'] ?? 0);
                    $activeMargin = 0.0; foreach ($q as $p) $activeMargin += crm_num($p['margin'] ?? 0);
                    $totalCalls = 0.0; foreach ($acts as $x) $totalCalls += crm_num($x['calls_made'] ?? 0);
                    $totalMeetings = 0.0; foreach ($acts as $x) $totalMeetings += crm_num($x['meetings'] ?? 0);
                    $totalQuotations = 0.0; foreach ($acts as $x) $totalQuotations += crm_num($x['quotations_sent'] ?? 0);

                    $row = crm_strip($a);
                    $row['contacts']    = array_map('crm_strip', crm_sort_by_num(array_values(array_filter($contacts, fn($c) => crm_num($c['account_id'] ?? 0) === crm_num($a['id'] ?? 0))), 'sort_order'));
                    $row['sub_sectors'] = array_map('crm_strip', crm_sort_by_num(array_values(array_filter($sectors, fn($c) => crm_num($c['account_id'] ?? 0) === crm_num($a['id'] ?? 0))), 'sort_order'));
                    $row['next_steps']  = array_map('crm_strip', crm_sort_by_num(array_values(array_filter($steps, fn($c) => crm_num($c['account_id'] ?? 0) === crm_num($a['id'] ?? 0))), 'sort_order'));
                    $row['pipeline'] = [
                        'total_deals' => count($deals), 'active_deals' => count($q),
                        'lost_deals' => count(array_filter($deals, fn($p) => ($p['stage'] ?? '') === 'Lost')),
                        'active_revenue' => crm_r($activeRev), 'active_margin' => crm_r($activeMargin),
                        'latest_action' => $withAction[0]['action'] ?? null, 'latest_action_date' => $withAction[0]['opportunity_date'] ?? null,
                    ];
                    $row['activity_stats'] = [
                        'total_calls' => $totalCalls, 'total_meetings' => $totalMeetings,
                        'total_quotations' => $totalQuotations, 'last_visit' => $lastVisit !== '' ? $lastVisit : null,
                    ];
                    $out[] = $row;
                }
                json_out($out);
            }

            if ($aid === null && $method === 'POST') {
                $d = json_body();
                $so = crm_next_sort_order($gs, $SID, 'crm_accounts');
                $newId = crm_next_id($gs, $SID, 'crm_accounts');
                $acct = [
                    'id' => $newId, 'sort_order' => $so, 'company' => $d['company'] ?? '',
                    'idea' => crm_or_null($d['idea'] ?? null), 'synthesis' => crm_or_null($d['synthesis'] ?? null),
                    'status' => ($d['status'] ?? '') !== '' ? $d['status'] : 'On-going 1 Inquiry',
                    'owner' => ($d['owner'] ?? '') !== '' ? $d['owner'] : 'Jordan',
                    'created_at' => sc_now(), 'updated_at' => sc_now(),
                    'subsector' => crm_or_null($d['subsector'] ?? null), 'nextstep' => crm_or_null($d['nextstep'] ?? null),
                    'action' => null,
                ];
                $gs->appendAssoc($SID, 'crm_accounts', $acct);

                if (isset($d['contacts']) && is_array($d['contacts'])) {
                    $i = 0;
                    foreach ($d['contacts'] as $c) {
                        $i++;
                        if (empty($c['name']) && empty($c['phone']) && empty($c['email'])) continue;
                        $gs->appendAssoc($SID, 'crm_contacts', [
                            'id' => crm_next_id($gs, $SID, 'crm_contacts'), 'account_id' => $newId, 'sort_order' => $i,
                            'name' => crm_or_null($c['name'] ?? null), 'email' => crm_or_null($c['email'] ?? null),
                            'phone' => crm_or_null($c['phone'] ?? null), 'role' => crm_or_null($c['role'] ?? null),
                            'created_at' => sc_now(),
                        ]);
                    }
                }
                if (!empty($d['subsector'])) {
                    $gs->appendAssoc($SID, 'crm_sub_sectors', [
                        'id' => crm_next_id($gs, $SID, 'crm_sub_sectors'), 'account_id' => $newId, 'sort_order' => 1,
                        'sector_name' => $d['subsector'], 'product_interest' => crm_or_null($d['idea'] ?? null), 'created_at' => sc_now(),
                    ]);
                }
                if (!empty($d['nextstep'])) {
                    $gs->appendAssoc($SID, 'crm_next_steps', [
                        'id' => crm_next_id($gs, $SID, 'crm_next_steps'), 'account_id' => $newId, 'sort_order' => 1,
                        'step_text' => $d['nextstep'], 'created_at' => sc_now(),
                    ]);
                }
                json_out($acct, 201);
            }

            if ($aid !== null && $action === null && $method === 'PUT') {
                $existing = find_by_id($gs, $SID, 'crm_accounts', $aid);
                // Sumber (server.js) memakai status 500 untuk "not found" di sini (fail() generik) —
                // di sini disamakan jadi 404 supaya konsisten dengan seluruh route lain di file ini.
                if (!$existing) json_out(['error' => 'Account not found'], 404);
                $d = json_body();
                $row = array_merge($existing, [
                    'company' => crm_or_null($d['company'] ?? null), 'idea' => crm_or_null($d['idea'] ?? null),
                    'subsector' => crm_or_null($d['subsector'] ?? null), 'synthesis' => crm_or_null($d['synthesis'] ?? null),
                    'nextstep' => crm_or_null($d['nextstep'] ?? null), 'status' => crm_or_null($d['status'] ?? null),
                    'owner' => crm_or_null($d['owner'] ?? null), 'updated_at' => sc_now(),
                ]);
                $gs->updateAssoc($SID, 'crm_accounts', $row['_row'], $row);

                if (isset($d['contacts']) && is_array($d['contacts'])) {
                    $old = array_values(array_filter($gs->table($SID, 'crm_contacts')['rows'], fn($c) => crm_num($c['account_id'] ?? 0) === crm_num($aid)));
                    if ($old) $gs->deleteRows($SID, 'crm_contacts', array_map(fn($c) => $c['_row'], $old));
                    $i = 0;
                    foreach ($d['contacts'] as $c) {
                        $i++;
                        if (empty($c['name']) && empty($c['phone']) && empty($c['email'])) continue;
                        $gs->appendAssoc($SID, 'crm_contacts', [
                            'id' => crm_next_id($gs, $SID, 'crm_contacts'), 'account_id' => crm_num($aid), 'sort_order' => $i,
                            'name' => crm_or_null($c['name'] ?? null), 'email' => crm_or_null($c['email'] ?? null),
                            'phone' => crm_or_null($c['phone'] ?? null), 'role' => crm_or_null($c['role'] ?? null),
                            'created_at' => sc_now(),
                        ]);
                    }
                }
                if (array_key_exists('nextstep', $d)) {
                    $old = array_values(array_filter($gs->table($SID, 'crm_next_steps')['rows'], fn($c) => crm_num($c['account_id'] ?? 0) === crm_num($aid)));
                    if ($old) $gs->deleteRows($SID, 'crm_next_steps', array_map(fn($c) => $c['_row'], $old));
                    if (!empty($d['nextstep'])) {
                        $gs->appendAssoc($SID, 'crm_next_steps', [
                            'id' => crm_next_id($gs, $SID, 'crm_next_steps'), 'account_id' => crm_num($aid), 'sort_order' => 1,
                            'step_text' => $d['nextstep'], 'created_at' => sc_now(),
                        ]);
                    }
                }
                if (array_key_exists('subsector', $d)) {
                    $old = array_values(array_filter($gs->table($SID, 'crm_sub_sectors')['rows'], fn($c) => crm_num($c['account_id'] ?? 0) === crm_num($aid)));
                    if ($old) $gs->deleteRows($SID, 'crm_sub_sectors', array_map(fn($c) => $c['_row'], $old));
                    if (!empty($d['subsector'])) {
                        $gs->appendAssoc($SID, 'crm_sub_sectors', [
                            'id' => crm_next_id($gs, $SID, 'crm_sub_sectors'), 'account_id' => crm_num($aid), 'sort_order' => 1,
                            'sector_name' => $d['subsector'], 'product_interest' => crm_or_null($d['idea'] ?? null), 'created_at' => sc_now(),
                        ]);
                    }
                }
                json_out(crm_strip($row));
            }

            if ($aid !== null && $action === null && $method === 'DELETE') {
                $row = find_by_id($gs, $SID, 'crm_accounts', $aid);
                if ($row) $gs->deleteRows($SID, 'crm_accounts', [$row['_row']]);
                foreach (['crm_contacts', 'crm_sub_sectors', 'crm_next_steps'] as $t) {
                    $old = array_values(array_filter($gs->table($SID, $t)['rows'], fn($c) => crm_num($c['account_id'] ?? 0) === crm_num($aid)));
                    if ($old) $gs->deleteRows($SID, $t, array_map(fn($c) => $c['_row'], $old));
                }
                json_out(['ok' => true]);
            }

            if ($aid !== null && $action === 'action' && $method === 'PATCH') {
                $d = json_body();
                $act = $d['action'] ?? null;
                $allowed = ['Follow Up 0-7 days', 'Follow Up 7-14 days', 'Follow Up 14-28 days', 'Follow Up >30 days', null, ''];
                if (!in_array($act, $allowed, true)) json_out(['error' => 'Invalid action value'], 400);
                $row = find_by_id($gs, $SID, 'crm_accounts', $aid);
                if (!$row) json_out(null);
                $row['action'] = crm_or_null($act);
                $gs->updateAssoc($SID, 'crm_accounts', $row['_row'], $row);
                json_out(['id' => $row['id'], 'company' => $row['company'], 'action' => $row['action']]);
            }
            break;

        // ── P5: SALES ACTIVITY ────────────────────────────────────────────
        case 'activities':
            $actId = $parts[1] ?? null;
            $sub3  = $parts[2] ?? null;

            if ($actId === null && $method === 'GET') {
                $from = $_GET['from'] ?? ''; $to = $_GET['to'] ?? ''; $person = $_GET['person'] ?? '';
                $rows = $gs->table($SID, 'sales_activities')['rows'];
                $rows = array_values(array_filter($rows, function ($r) use ($from, $to, $person) {
                    $d = substr((string) ($r['activity_date'] ?? ''), 0, 10);
                    if ($from !== '' && $d < $from) return false;
                    if ($to !== '' && $d > $to) return false;
                    if ($person !== '' && ($r['sales_person'] ?? '') !== $person) return false;
                    return true;
                }));
                usort($rows, fn($a, $b) => strcmp((string) ($b['activity_date'] ?? ''), (string) ($a['activity_date'] ?? '')));
                json_out(array_map('crm_strip', $rows));
            }

            if ($actId === null && $method === 'POST') {
                $d = json_body();
                $row = [
                    'id' => crm_next_id($gs, $SID, 'sales_activities'), 'activity_date' => $d['activity_date'] ?? '',
                    'sales_person' => $d['sales_person'] ?? '', 'customer_visited' => $d['customer_visited'] ?? '',
                    'calls_made' => crm_num($d['calls_made'] ?? 0), 'meetings' => crm_num($d['meetings'] ?? 0),
                    'quotations_sent' => crm_num($d['quotations_sent'] ?? 0), 'new_opportunities' => crm_num($d['new_opportunities'] ?? 0),
                    'deals_closed' => crm_num($d['deals_closed'] ?? 0), 'notes' => $d['notes'] ?? null,
                    'created_at' => sc_now(), 'execution' => ($d['execution'] ?? '') !== '' ? $d['execution'] : 'Planning',
                    'updated_at' => sc_now(), 'updated_by' => crm_or_null($d['updated_by'] ?? null),
                ];
                $gs->appendAssoc($SID, 'sales_activities', $row);
                json_out($row, 201);
            }

            if ($actId !== null && $sub3 === null && $method === 'PUT') {
                $prev = find_by_id($gs, $SID, 'sales_activities', $actId);
                if (!$prev) json_out(['error' => 'Activity not found'], 404);
                $d = json_body();
                $row = array_merge($prev, [
                    'activity_date' => $d['activity_date'] ?? '', 'sales_person' => $d['sales_person'] ?? '',
                    'customer_visited' => $d['customer_visited'] ?? '',
                    'calls_made' => crm_num($d['calls_made'] ?? 0), 'meetings' => crm_num($d['meetings'] ?? 0),
                    'quotations_sent' => crm_num($d['quotations_sent'] ?? 0), 'new_opportunities' => crm_num($d['new_opportunities'] ?? 0),
                    'deals_closed' => crm_num($d['deals_closed'] ?? 0), 'notes' => $d['notes'] ?? null,
                    'execution' => ($d['execution'] ?? '') !== '' ? $d['execution'] : 'Planning',
                    'updated_at' => sc_now(), 'updated_by' => crm_or_null($d['updated_by'] ?? null),
                ]);
                $gs->updateAssoc($SID, 'sales_activities', $row['_row'], $row);

                // Riwayat edit — fire-and-forget: kegagalan tidak boleh menggagalkan request utama.
                try {
                    $fields = ['activity_date', 'sales_person', 'customer_visited', 'calls_made', 'meetings',
                        'quotations_sent', 'new_opportunities', 'deals_closed', 'notes', 'execution'];
                    $changes = [];
                    foreach ($fields as $f) {
                        $before = (string) ($prev[$f] ?? '');
                        $after  = (string) ($d[$f] ?? '');
                        if ($before !== $after) $changes[$f] = ['from' => $prev[$f] ?? null, 'to' => $d[$f] ?? null];
                    }
                    $gs->appendAssoc($SID, 'activity_edit_history', [
                        'id' => crm_next_id($gs, $SID, 'activity_edit_history'), 'activity_id' => crm_num($actId),
                        'edited_at' => sc_now(), 'edited_by' => crm_or_null($d['updated_by'] ?? null),
                        'field_changes' => json_encode($changes, JSON_UNESCAPED_UNICODE),
                        'snapshot' => json_encode(crm_strip($row), JSON_UNESCAPED_UNICODE),
                    ]);
                } catch (Exception $histErr) { /* non-fatal */ }

                json_out(crm_strip($row));
            }

            if ($actId !== null && $sub3 === 'history' && $method === 'GET') {
                $rows = array_values(array_filter($gs->table($SID, 'activity_edit_history')['rows'], fn($r) => crm_num($r['activity_id'] ?? 0) === crm_num($actId)));
                usort($rows, fn($a, $b) => strcmp((string) ($b['edited_at'] ?? ''), (string) ($a['edited_at'] ?? '')));
                $out = array_map(function ($r) {
                    return [
                        'id' => $r['id'], 'edited_at' => $r['edited_at'] ?? null, 'edited_by' => $r['edited_by'] ?? null,
                        'field_changes' => json_decode((string) ($r['field_changes'] ?? ''), true),
                    ];
                }, $rows);
                json_out($out);
            }

            if ($actId !== null && $sub3 === null && $method === 'DELETE') {
                $row = find_by_id($gs, $SID, 'sales_activities', $actId);
                if ($row) $gs->deleteRows($SID, 'sales_activities', [$row['_row']]);
                json_out(['ok' => true]);
            }
            break;

        // ── PX: SUPPLIER LIST / EQUIPMENT MRO MODEL ───────────────────────
        case 'mro':
            $mroId = $parts[1] ?? null;

            if ($mroId === 'summary' && $method === 'GET') {
                $rows = $gs->table($SID, 'mro_models')['rows'];
                $total = 0.0; foreach ($rows as $r) $total += crm_num($r['est_annual_demand_t'] ?? 0);
                json_out(['entries' => count($rows), 'total_demand_t' => round($total * 100) / 100]);
            }

            if ($mroId === null && $method === 'GET') {
                $rows = crm_sort_by_num($gs->table($SID, 'mro_models')['rows'], 'id');
                $out = array_map(function ($r) {
                    $r = crm_strip($r);
                    $r['est_annual_demand_t'] = crm_round4($r['est_annual_demand_t'] ?? 0);
                    return $r;
                }, $rows);
                json_out($out);
            }

            if ($mroId === null && $method === 'POST') {
                $d = json_body();
                $est = crm_mro_calc($d);
                $row = [
                    'id' => crm_next_id($gs, $SID, 'mro_models'), 'customer' => $d['customer'] ?? '', 'site' => $d['site'] ?? '',
                    'equipment_type' => $d['equipment_type'] ?? '', 'equipment_qty' => crm_num($d['equipment_qty'] ?? 0),
                    'wear_part' => $d['wear_part'] ?? '', 'replacement_cycle_months' => array_key_exists('replacement_cycle_months', $d) ? crm_num($d['replacement_cycle_months']) : 12,
                    'plate_weight_kg' => crm_num($d['plate_weight_kg'] ?? 0), 'est_annual_demand_t' => $est,
                    'notes' => $d['notes'] ?? null, 'created_at' => sc_now(), 'updated_at' => sc_now(),
                ];
                $gs->appendAssoc($SID, 'mro_models', $row);
                $row['est_annual_demand_t'] = crm_round4($row['est_annual_demand_t']);
                json_out($row, 201);
            }

            if ($mroId !== null && $mroId !== 'summary' && $method === 'PUT') {
                $existing = find_by_id($gs, $SID, 'mro_models', $mroId);
                if (!$existing) json_out(null);
                $d = json_body();
                $merged = array_merge($existing, [
                    'customer' => $d['customer'] ?? $existing['customer'] ?? '', 'site' => $d['site'] ?? $existing['site'] ?? '',
                    'equipment_type' => $d['equipment_type'] ?? $existing['equipment_type'] ?? '',
                    'equipment_qty' => array_key_exists('equipment_qty', $d) ? crm_num($d['equipment_qty']) : crm_num($existing['equipment_qty'] ?? 0),
                    'wear_part' => $d['wear_part'] ?? $existing['wear_part'] ?? '',
                    'replacement_cycle_months' => array_key_exists('replacement_cycle_months', $d) ? crm_num($d['replacement_cycle_months']) : crm_num($existing['replacement_cycle_months'] ?? 0),
                    'plate_weight_kg' => array_key_exists('plate_weight_kg', $d) ? crm_num($d['plate_weight_kg']) : crm_num($existing['plate_weight_kg'] ?? 0),
                    'notes' => $d['notes'] ?? $existing['notes'] ?? null, 'updated_at' => sc_now(),
                ]);
                $merged['est_annual_demand_t'] = crm_mro_calc($merged);
                $gs->updateAssoc($SID, 'mro_models', $merged['_row'], $merged);
                $out = crm_strip($merged);
                $out['est_annual_demand_t'] = crm_round4($out['est_annual_demand_t']);
                json_out($out);
            }

            if ($mroId !== null && $mroId !== 'summary' && $method === 'DELETE') {
                $row = find_by_id($gs, $SID, 'mro_models', $mroId);
                if ($row) $gs->deleteRows($SID, 'mro_models', [$row['_row']]);
                json_out(['ok' => true]);
            }
            break;

        // ── EXPORT ─────────────────────────────────────────────────────
        case 'export':
            $what = $parts[1] ?? '';
            $u = sc_user();

            if ($what === 'activities' && $method === 'GET') {
                $from = $_GET['from'] ?? ''; $to = $_GET['to'] ?? ''; $person = $_GET['person'] ?? '';
                $rows = $gs->table($SID, 'sales_activities')['rows'];
                $rows = array_values(array_filter($rows, function ($r) use ($from, $to, $person) {
                    $d = substr((string) ($r['activity_date'] ?? ''), 0, 10);
                    if ($from !== '' && $d < $from) return false;
                    if ($to !== '' && $d > $to) return false;
                    if ($person !== '' && ($r['sales_person'] ?? '') !== $person) return false;
                    return true;
                }));
                usort($rows, fn($a, $b) => strcmp((string) ($b['activity_date'] ?? ''), (string) ($a['activity_date'] ?? '')));
                $headers = [
                    ['label' => 'Date', 'style' => 'date'], ['label' => 'Sales Person', 'style' => 'text'], ['label' => 'Customer Visited', 'style' => 'text'],
                    ['label' => 'Calls Made', 'style' => 'number'], ['label' => 'Meetings', 'style' => 'number'], ['label' => 'Quotations Sent', 'style' => 'number'],
                    ['label' => 'New Opportunities', 'style' => 'number'], ['label' => 'Deals Closed', 'style' => 'number'], ['label' => 'Notes', 'style' => 'text'], ['label' => 'Execution', 'style' => 'text'],
                ];
                $colWidths = [13, 14, 32, 12, 12, 17, 19, 14, 50, 12];
                $data = array_map(fn($r) => [
                    $r['activity_date'] ?? '', $r['sales_person'] ?? '', $r['customer_visited'] ?? '',
                    $r['calls_made'] ?? 0, $r['meetings'] ?? 0, $r['quotations_sent'] ?? 0,
                    $r['new_opportunities'] ?? 0, $r['deals_closed'] ?? 0, $r['notes'] ?? '', $r['execution'] ?? '',
                ], $rows);
                $buf = crm_make_xlsx([['name' => 'Sales Activity', 'headers' => $headers, 'rows' => $data, 'colWidths' => $colWidths]]);
                crm_audit($gs, $SID, $u, 'EXPORT_ACTIVITIES', ['from' => $from, 'to' => $to, 'person' => $person, 'rows' => count($rows)]);
                header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                header('Content-Disposition: attachment; filename="sales_activities.xlsx"');
                echo $buf;
                exit;
            }

            if ($what === 'customers' && $method === 'GET') {
                $accounts   = $gs->table($SID, 'crm_accounts')['rows'];
                $contacts   = $gs->table($SID, 'crm_contacts')['rows'];
                $pipeline   = $gs->table($SID, 'pipeline_opportunities')['rows'];
                $activities = $gs->table($SID, 'sales_activities')['rows'];
                $data = [];
                foreach (crm_sort_by_num($accounts, 'sort_order') as $a) {
                    $cList = crm_sort_by_num(array_values(array_filter($contacts, fn($x) => crm_num($x['account_id'] ?? 0) === crm_num($a['id'] ?? 0))), 'sort_order');
                    $c = $cList[0] ?? [];
                    $deals = array_values(array_filter($pipeline, fn($p) => ($p['customer'] ?? '') === ($a['company'] ?? '')));
                    $q = array_values(array_filter($deals, 'crm_is_q'));
                    $acts = array_values(array_filter($activities, fn($s) => ($s['customer_visited'] ?? '') === ($a['company'] ?? '')));
                    $lastVisit = '';
                    foreach ($acts as $s) { $dt = (string) ($s['activity_date'] ?? ''); if ($dt > $lastVisit) $lastVisit = $dt; }
                    $qRev = 0.0; foreach ($q as $p) $qRev += crm_num($p['revenue'] ?? 0);
                    $qMargin = 0.0; foreach ($q as $p) $qMargin += crm_num($p['margin'] ?? 0);
                    $calls = 0.0; foreach ($acts as $x) $calls += crm_num($x['calls_made'] ?? 0);
                    $meetings = 0.0; foreach ($acts as $x) $meetings += crm_num($x['meetings'] ?? 0);
                    $quotations = 0.0; foreach ($acts as $x) $quotations += crm_num($x['quotations_sent'] ?? 0);
                    $data[] = [
                        $a['sort_order'] ?? '', $a['company'] ?? '', $a['subsector'] ?? '', $a['status'] ?? '', $a['owner'] ?? '',
                        $a['nextstep'] ?? '', $a['synthesis'] ?? '', $c['name'] ?? '', $c['phone'] ?? '', $c['email'] ?? '', $c['role'] ?? '',
                        count($deals), count($q), crm_r($qRev), crm_r($qMargin), $calls, $meetings, $quotations, $lastVisit !== '' ? $lastVisit : null,
                    ];
                }
                $headers = [
                    ['label' => 'No', 'style' => 'number'], ['label' => 'Company', 'style' => 'text'], ['label' => 'Subsector', 'style' => 'text'], ['label' => 'Status', 'style' => 'text'],
                    ['label' => 'Owner', 'style' => 'text'], ['label' => 'Next Step', 'style' => 'text'], ['label' => 'Synthesis', 'style' => 'text'], ['label' => 'Contact Name', 'style' => 'text'],
                    ['label' => 'Contact Phone', 'style' => 'text'], ['label' => 'Contact Email', 'style' => 'text'], ['label' => 'Contact Role', 'style' => 'text'], ['label' => 'Total Deals', 'style' => 'number'],
                    ['label' => 'Active Deals', 'style' => 'number'], ['label' => 'Active Revenue', 'style' => 'number'], ['label' => 'Active Margin', 'style' => 'number'], ['label' => 'Total Calls', 'style' => 'number'],
                    ['label' => 'Total Meetings', 'style' => 'number'], ['label' => 'Total Quotations', 'style' => 'number'], ['label' => 'Last Visit', 'style' => 'date'],
                ];
                $colWidths = [6, 32, 20, 22, 12, 35, 40, 20, 16, 28, 16, 12, 13, 16, 14, 12, 15, 17, 13];
                $buf = crm_make_xlsx([['name' => 'Customer List', 'headers' => $headers, 'rows' => $data, 'colWidths' => $colWidths]]);
                crm_audit($gs, $SID, $u, 'EXPORT_CUSTOMERS', ['rows' => count($data)]);
                header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                header('Content-Disposition: attachment; filename="customer_list.xlsx"');
                echo $buf;
                exit;
            }
            break;

        // ── AUDIT LOG ──────────────────────────────────────────────────
        case 'audit-log':
            if ($method === 'GET') {
                $from = $_GET['from'] ?? ''; $to = $_GET['to'] ?? ''; $uq = $_GET['user'] ?? '';
                $rows = $gs->table($SID, 'audit_log')['rows'];
                $rows = array_values(array_filter($rows, function ($r) use ($from, $to, $uq) {
                    $d = substr((string) ($r['logged_at'] ?? ''), 0, 10);
                    if ($from !== '' && $d < $from) return false;
                    if ($to !== '' && $d > $to) return false;
                    if ($uq !== '' && ($r['username'] ?? '') !== $uq) return false;
                    return true;
                }));
                usort($rows, fn($a, $b) => strcmp((string) ($b['logged_at'] ?? ''), (string) ($a['logged_at'] ?? '')));
                $rows = array_slice($rows, 0, 200);
                $out = array_map(function ($r) {
                    $r = crm_strip($r);
                    $r['detail'] = json_decode((string) ($r['detail'] ?? ''), true);
                    return $r;
                }, $rows);
                json_out($out);
            }
            break;

        // ── SALES PERSONS DROPDOWN ────────────────────────────────────
        case 'sales-persons':
            if ($method === 'GET') {
                $pipe = $gs->table($SID, 'pipeline_opportunities')['rows'];
                $acts = $gs->table($SID, 'sales_activities')['rows'];
                $names = [];
                foreach ($pipe as $r) { $n = trim((string) ($r['sales_owner'] ?? '')); if ($n !== '') $names[$n] = true; }
                foreach ($acts as $r) { $n = trim((string) ($r['sales_person'] ?? '')); if ($n !== '') $names[$n] = true; }
                $out = array_keys($names);
                sort($out, SORT_STRING | SORT_FLAG_CASE);
                json_out($out);
            }
            break;
    }

    json_out(['error' => 'Not found: ' . $method . ' /' . implode('/', $parts)], 404);

} catch (Exception $e) {
    json_out(['error' => $e->getMessage()], 500);
}


// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** '' / null / non-numeric -> 0.0, seperti helper num() di server.js sumber. */
function crm_num($v) {
    if ($v === null || $v === '') return 0.0;
    if (is_bool($v)) return 0.0;
    if (!is_numeric($v)) return 0.0;
    return (float) $v;
}

/** Math.round() ala JS — dipakai untuk revenue/margin dsb yang dibulatkan ke rupiah bulat. */
function crm_r($v) {
    return (int) round(crm_num($v));
}

function crm_round4($v) {
    return round(crm_num($v), 4);
}

/** Urutkan array assoc berdasarkan satu kolom numerik, menaik. */
function crm_sort_by_num(array $rows, string $field): array {
    usort($rows, fn($a, $b) => crm_num($a[$field] ?? 0) <=> crm_num($b[$field] ?? 0));
    return $rows;
}

function crm_norm($s) {
    return mb_strtolower(trim((string) $s));
}

function crm_is_q($r) {
    return ($r['stage'] ?? '') === 'Quotation';
}

/** Buang kolom internal '_row' (nomor baris sheet) sebelum dikirim ke klien. */
function crm_strip($row) {
    if (is_array($row)) unset($row['_row']);
    return $row;
}

/** Setara `x || null` di JS: string kosong/absen -> null, selain itu apa adanya. */
function crm_or_null($v) {
    return ($v === null || $v === '') ? null : $v;
}

/**
 * ID serial berikutnya untuk satu tabel, mem-port db/sheetsdb.js nextval():
 * ambil MAX(next_id tab _meta, MAX(id) baris yang ada)+1, lalu simpan balik
 * next_id di _meta (kalau ada barisnya). Dibaca TANPA cache (sama seperti
 * find_by_id() di lib/sheet_util.php) supaya risiko dua orang mendapat id
 * yang sama tetap kecil.
 *
 * ID sengaja tetap NUMERIK (bukan sc_uid() ala TaskFlow/CIL) karena
 * js/app.js menyisipkan id baris langsung sebagai literal angka JS di
 * atribut onclick (mis. onclick="openEditPipeline(123)") — id string akan
 * merusak pemanggilan itu.
 */
function crm_next_id(GoogleSheets $gs, $SID, $table) {
    $rows = $gs->table($SID, $table, false)['rows'];
    $maxId = 0;
    foreach ($rows as $r) {
        $n = $r['id'] ?? '';
        if (is_numeric($n) && (int) $n > $maxId) $maxId = (int) $n;
    }
    $metaRows = $gs->table($SID, '_meta', false)['rows'];
    $metaRow = null;
    foreach ($metaRows as $m) {
        if (($m['table_name'] ?? '') === $table) { $metaRow = $m; break; }
    }
    $next = $metaRow ? max((int) ($metaRow['next_id'] ?? 1), $maxId + 1) : ($maxId + 1);
    if ($metaRow) {
        $gs->updateAssoc($SID, '_meta', $metaRow['_row'], ['table_name' => $table, 'next_id' => $next + 1]);
    }
    return $next;
}

/** sort_order berikutnya (MAX+1) untuk satu tabel — mem-port nextSortOrder() sumber. */
function crm_next_sort_order(GoogleSheets $gs, $SID, $table, $field = 'sort_order') {
    $rows = $gs->table($SID, $table, false)['rows'];
    $max = 0;
    foreach ($rows as $r) {
        $n = $r[$field] ?? '';
        if (is_numeric($n) && (float) $n > $max) $max = (float) $n;
    }
    return $max + 1;
}

/**
 * Kolom generated pipeline_opportunities (cogs/revenue/margin/margin_pct) —
 * dulu ditulis sebagai formula per-baris di Sheets, di sini dihitung di PHP
 * dan ditulis sebagai angka RAW (lihat catatan di kepala file).
 */
function crm_pipeline_calc(array $d): array {
    $vol   = crm_num($d['volume_kg'] ?? 0);
    $buy   = crm_num($d['buying_price_kg'] ?? 0);
    $sell  = crm_num($d['selling_price_kg'] ?? 0);
    $trans = crm_num($d['transport'] ?? 0);
    $fin   = crm_num($d['financing'] ?? 0);
    $cogs    = $vol * $buy;
    $revenue = $vol * $sell;
    $margin  = $revenue - $cogs - $trans - $fin;
    $marginPct = $revenue > 0 ? $margin / $revenue : 0.0;
    return ['cogs' => $cogs, 'revenue' => $revenue, 'margin' => $margin, 'margin_pct' => $marginPct];
}

/** expected_close_date: +120 hari dari opportunity_date bila probability_pct>0, else hari ini. */
function crm_close_date($opportunityDate, $probabilityPct): string {
    if (crm_num($probabilityPct) > 0) {
        $ts = strtotime((string) $opportunityDate);
        if ($ts === false) $ts = time();
        return date('Y-m-d', $ts + 120 * 86400);
    }
    return date('Y-m-d');
}

/** Kolom generated mro_models.est_annual_demand_t — sama alasan seperti crm_pipeline_calc(). */
function crm_mro_calc(array $d): float {
    $qty   = crm_num($d['equipment_qty'] ?? 0);
    $wt    = crm_num($d['plate_weight_kg'] ?? 0);
    $cycle = crm_num($d['replacement_cycle_months'] ?? 0);
    if ($cycle > 0) return ($qty * $wt * (12 / $cycle)) / 1000;
    return 0.0;
}

/** Catat audit log (fire-and-forget — kegagalan tidak menggagalkan request). */
function crm_audit(GoogleSheets $gs, $SID, $user, string $action, array $detail = []) {
    try {
        $gs->appendAssoc($SID, 'audit_log', [
            'id' => crm_next_id($gs, $SID, 'audit_log'),
            'username' => $user['email'] ?? '', 'user_name' => $user['name'] ?? '',
            'action' => $action, 'detail' => json_encode($detail, JSON_UNESCAPED_UNICODE), 'logged_at' => sc_now(),
        ]);
    } catch (Exception $e) { /* non-fatal */ }
}


// ═══════════════════════════════════════════════════════════════
// EXCEL EXPORT — XLSX (OOXML) dibangun manual seperti sumber, tapi
// mekanika zip/deflate diserahkan ke ZipArchive bawaan PHP (bukan CRC32/
// DEFLATE tulisan tangan ala makeExcel() di server.js).
// ═══════════════════════════════════════════════════════════════

function crm_xlsx_esc($v): string {
    return htmlspecialchars((string) ($v ?? ''), ENT_QUOTES | ENT_XML1, 'UTF-8');
}

/** Serial tanggal Excel (basis 1899-12-30), dari string 'YYYY-MM-DD...'. */
function crm_excel_date_serial($val) {
    $s = substr((string) $val, 0, 10);
    $d = DateTime::createFromFormat('Y-m-d', $s);
    if (!$d) return null;
    $epoch = new DateTime('1899-12-30');
    $diff  = $epoch->diff($d);
    $days  = (int) $diff->format('%a');
    return $diff->invert ? -$days : $days;
}

/**
 * Wrapped in a function (not a top-level const) on purpose: function
 * declarations are hoisted by PHP and available anywhere in the file, but a
 * top-level `const` is only defined once execution reaches that line — and
 * crm_make_xlsx() below gets called from the dispatch code near the TOP of
 * this file (inside the export routes), long before the bottom of the file
 * would otherwise run. A plain const here would throw "undefined constant"
 * at request time.
 */
function crm_xlsx_styles_xml(): string {
    return <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><sz val="10"/><b/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><sz val="10"/><b/><name val="Calibri"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B3D6B"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F6FA"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDDE3ED"/></left><right style="thin"><color rgb="FFDDE3ED"/></right><top style="thin"><color rgb="FFDDE3ED"/></top><bottom style="thin"><color rgb="FFDDE3ED"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0"  fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0"  fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="3"  fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="14" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0"  fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
</styleSheet>
XML;
}

/**
 * Bangun berkas .xlsx minimal dari daftar sheet: [{name, headers:[{label,style}], rows:[[..]], colWidths:[..]}].
 * style per header: 'number' | 'date' | 'text' (default).
 */
function crm_make_xlsx(array $sheets): string {
    $sheetXmls = [];
    foreach ($sheets as $sheet) {
        $colDefs = '';
        foreach (($sheet['colWidths'] ?? []) as $i => $w) {
            $colDefs .= '<col min="' . ($i + 1) . '" max="' . ($i + 1) . '" width="' . $w . '" customWidth="1"/>';
        }
        $headerCells = '';
        foreach ($sheet['headers'] as $ci => $h) {
            $col = chr(65 + $ci);
            $headerCells .= '<c r="' . $col . '1" s="1" t="inlineStr"><is><t>' . crm_xlsx_esc($h['label']) . '</t></is></c>';
        }
        $headerRow = '<row r="1" ht="22" customHeight="1">' . $headerCells . '</row>';

        $dataRows = '';
        foreach ($sheet['rows'] as $ri => $row) {
            $rn = $ri + 2;
            $cells = '';
            foreach ($sheet['headers'] as $ci => $h) {
                $col = chr(65 + $ci);
                $ref = $col . $rn;
                $val = $row[$ci] ?? null;
                $style = $h['style'] ?? 'text';
                if ($style === 'number') {
                    if ($val === null || $val === '' || !is_numeric($val)) {
                        $cells .= '<c r="' . $ref . '" s="2" t="inlineStr"><is><t></t></is></c>';
                    } else {
                        $cells .= '<c r="' . $ref . '" s="3"><v>' . (0 + $val) . '</v></c>';
                    }
                } elseif ($style === 'date' && $val) {
                    $serial = crm_excel_date_serial($val);
                    if ($serial !== null) {
                        $cells .= '<c r="' . $ref . '" s="4"><v>' . $serial . '</v></c>';
                    } else {
                        $cells .= '<c r="' . $ref . '" s="2" t="inlineStr"><is><t>' . crm_xlsx_esc($val) . '</t></is></c>';
                    }
                } else {
                    $cells .= '<c r="' . $ref . '" s="2" t="inlineStr"><is><t>' . crm_xlsx_esc($val) . '</t></is></c>';
                }
            }
            $dataRows .= '<row r="' . $rn . '">' . $cells . '</row>';
        }

        $lastCol = chr(64 + max(1, count($sheet['headers'])));
        $xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
             . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
             . '<sheetViews><sheetView workbookViewId="0" showGridLines="1"><selection activeCell="A1"/></sheetView></sheetViews>'
             . '<sheetFormatPr defaultRowHeight="16"/><cols>' . $colDefs . '</cols>'
             . '<sheetData>' . $headerRow . $dataRows . '</sheetData>'
             . '<autoFilter ref="A1:' . $lastCol . '1"/>'
             . '</worksheet>';
        $sheetXmls[] = ['name' => $sheet['name'], 'xml' => $xml];
    }

    $sheetTags = '';
    $relTags = '';
    $overrideTags = '';
    foreach ($sheetXmls as $i => $s) {
        $sheetTags .= '<sheet name="' . crm_xlsx_esc($s['name']) . '" sheetId="' . ($i + 1) . '" r:id="rId' . ($i + 2) . '"/>';
        $relTags   .= '<Relationship Id="rId' . ($i + 2) . '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' . ($i + 1) . '.xml"/>';
        $overrideTags .= '<Override PartName="/xl/worksheets/sheet' . ($i + 1) . '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }

    $wbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' . $sheetTags . '</sheets></workbook>';
    $relsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' . $relTags . '</Relationships>';
    $pkgRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    $contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' . $overrideTags . '</Types>';

    $tmp = tempnam(sys_get_temp_dir(), 'crmxlsx');
    $zip = new ZipArchive();
    if ($zip->open($tmp, ZipArchive::OVERWRITE) !== true) {
        throw new Exception('Gagal membuat berkas xlsx sementara.');
    }
    $zip->addFromString('[Content_Types].xml', $contentTypes);
    $zip->addFromString('_rels/.rels', $pkgRels);
    $zip->addFromString('xl/workbook.xml', $wbXml);
    $zip->addFromString('xl/styles.xml', crm_xlsx_styles_xml());
    $zip->addFromString('xl/_rels/workbook.xml.rels', $relsXml);
    foreach ($sheetXmls as $i => $s) {
        $zip->addFromString('xl/worksheets/sheet' . ($i + 1) . '.xml', $s['xml']);
    }
    $zip->close();

    $bytes = file_get_contents($tmp);
    @unlink($tmp);
    return $bytes;
}
