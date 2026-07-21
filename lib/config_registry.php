<?php
/**
 * Central registry of DATA-DRIVEN CONFIG (lookup) tabs per module.
 *
 * Each lookup = a Sheets tab that holds admin-managed options (dropdowns, enums,
 * settings) so they can be changed in-app with NO code edits. Tabs are prefixed
 * `cfg_` to keep them separate from data tabs. The `seed` values reproduce the
 * previously-hardcoded lists so behaviour is identical the moment the tab is created.
 *
 * Shape per lookup:
 *   tab   : sheet tab name
 *   key   : the immutable identity column (records reference this value; never edited)
 *   cols  : header row, in order
 *   seed  : initial rows (aligned to cols) written only when the tab is first created
 */
function cfg_registry(): array {
    return [
        // ── CIL ───────────────────────────────────────────────────────────
        'cil' => [
            'channels' => [
                'tab'  => 'cfg_channels',
                'key'  => 'value',
                'cols' => ['value', 'label', 'icon', 'color', 'color2', 'sort_order', 'active'],
                'seed' => [
                    ['whatsapp', 'Chat / Message',  '💬', '#e8f5e9', '#2e7d32', '1', 'TRUE'],
                    ['offline',  'Offline Meeting', '🤝', '#e3f2fd', '#1565c0', '2', 'TRUE'],
                    ['phone',    'Phone Call',      '📞', '#e8eaf6', '#283593', '3', 'TRUE'],
                    ['zoom',     'Zoom / Video',    '🎥', '#e1f5fe', '#01579b', '4', 'TRUE'],
                ],
            ],
            'priorities' => [
                'tab'  => 'cfg_priorities',
                'key'  => 'value',
                'cols' => ['value', 'label', 'color', 'color2', 'sort_order', 'active'],
                'seed' => [
                    ['critical', 'Critical', '#fef2f2', '#dc2626', '1', 'TRUE'],
                    ['high',     'High',     '#fff7ed', '#ea580c', '2', 'TRUE'],
                    ['medium',   'Medium',   '#fefce8', '#ca8a04', '3', 'TRUE'],
                    ['low',      'Low',      '#f0fdf4', '#16a34a', '4', 'TRUE'],
                ],
            ],
            'complaint_statuses' => [
                'tab'  => 'cfg_complaint_statuses',
                'key'  => 'value',
                'cols' => ['value', 'label', 'color', 'color2', 'sort_order', 'is_default', 'is_closed', 'active'],
                'seed' => [
                    ['open',        'Open',        '#fee2e2', '#dc2626', '1', 'TRUE',  'FALSE', 'TRUE'],
                    ['in_progress', 'In Progress', '#fef3c7', '#b45309', '2', 'FALSE', 'FALSE', 'TRUE'],
                    ['resolved',    'Resolved',    '#dcfce7', '#15803d', '3', 'FALSE', 'TRUE',  'TRUE'],
                ],
            ],
        ],

        // ── costcore ──────────────────────────────────────────────────────
        'costcore' => [
            'payment_terms' => [
                'tab'  => 'cfg_payment_terms',
                'key'  => 'value',
                'cols' => ['value', 'sort_order', 'active'],
                'seed' => [
                    ['Cash Before Delivery (CBD)',                  '1', 'TRUE'],
                    ['DP 50% + Balance Before Delivery',            '2', 'TRUE'],
                    ['DP 30% + Balance Before Delivery',            '3', 'TRUE'],
                    ['DP 10%, Balance Payment 90% 3 days after BL', '4', 'TRUE'],
                    ['Full Payment 100% Before Delivery',           '5', 'TRUE'],
                    ['Cash on Delivery (COD)',                      '6', 'TRUE'],
                    ['NET 7 Days',                                  '7', 'TRUE'],
                    ['NET 14 Days',                                 '8', 'TRUE'],
                    ['NET 30 Days',                                 '9', 'TRUE'],
                ],
            ],
            'hedging_days' => [
                'tab' => 'cfg_hedging_days', 'key' => 'value', 'cols' => ['value', 'sort_order', 'active'],
                'seed' => [['60', '1', 'TRUE'], ['90', '2', 'TRUE'], ['150', '3', 'TRUE']],
            ],
            // NOTE: value codes below are bound to the pricing calc — relabel/reorder freely,
            // but do NOT change a `value` or add one without matching code.
            'shipment_types' => [
                'tab' => 'cfg_shipment_types', 'key' => 'value', 'cols' => ['value', 'label', 'sort_order', 'active'],
                'seed' => [
                    ['breakbulk', 'Break Bulk', '1', 'TRUE'],
                    ['container20', 'Container 20ft', '2', 'TRUE'],
                    ['container40', 'Container 40ft', '3', 'TRUE'],
                ],
            ],
            'margin_types' => [
                'tab' => 'cfg_margin_types', 'key' => 'value', 'cols' => ['value', 'label', 'sort_order', 'active'],
                'seed' => [['fixed', 'Fixed (IDR/kg)', '1', 'TRUE'], ['percent', 'Percentage (%)', '2', 'TRUE']],
            ],
            'commission_units' => [
                'tab' => 'cfg_commission_units', 'key' => 'value', 'cols' => ['value', 'label', 'sort_order', 'active'],
                'seed' => [['idr', 'IDR/kg', '1', 'TRUE'], ['usd', 'USD/MT', '2', 'TRUE']],
            ],
            // Trucking destinations + rates (drives the pricing calc). bb_* = break-bulk
            // (rate / return); ct_* = container (20ft / 40ft / combo). Blank ct_* = not a
            // container destination. Editing a rate changes pricing — keep values accurate.
            'trucking_rates' => [
                'tab' => 'cfg_trucking_rates', 'key' => 'destination',
                'cols' => ['destination', 'bb_r', 'bb_rt', 'ct_f20', 'ct_f40', 'ct_cb', 'sort_order', 'active'],
                'seed' => [
                    ['Cakung', '36000', '1800000', '1440000', '1800000', '2160000', '1', 'TRUE'],
                    ['Marunda', '36000', '1800000', '1440000', '1800000', '2160000', '2', 'TRUE'],
                    ['Ujung Menteng', '38400', '1920000', '', '', '', '3', 'TRUE'],
                    ['Bekasi', '42000', '2100000', '', '', '', '4', 'TRUE'],
                    ['Dadap / Kapuk', '46000', '2300000', '2000000', '2250000', '2750000', '5', 'TRUE'],
                    ['Cibitung', '48000', '2400000', '2040000', '2280000', '2760000', '6', 'TRUE'],
                    ['Tambun', '48000', '2400000', '1920000', '2160000', '2640000', '7', 'TRUE'],
                    ['Cikarang', '52800', '2640000', '2160000', '2520000', '3000000', '8', 'TRUE'],
                    ['Cileungsi', '52800', '2640000', '2160000', '2520000', '3000000', '9', 'TRUE'],
                    ['Depok', '54000', '2700000', '', '', '', '10', 'TRUE'],
                    ['Tigaraksa', '55200', '2760000', '2280000', '2640000', '3120000', '11', 'TRUE'],
                    ['Curug Tanggerang', '55200', '2760000', '2280000', '2640000', '3120000', '12', 'TRUE'],
                    ['Pasar Kemis', '55200', '2760000', '2280000', '2640000', '3120000', '13', 'TRUE'],
                    ['Jatake', '57600', '2880000', '', '', '', '14', 'TRUE'],
                    ['Balaraja', '60000', '3000000', '2760000', '3000000', '3600000', '15', 'TRUE'],
                    ['Karawang', '60000', '3000000', '2640000', '3000000', '3360000', '16', 'TRUE'],
                    ['Cikande', '72000', '3600000', '', '', '', '17', 'TRUE'],
                    ['Purwakarta', '78000', '3900000', '3240000', '3480000', '3960000', '18', 'TRUE'],
                    ['Serang Banten', '84000', '4200000', '3120000', '3480000', '3960000', '19', 'TRUE'],
                    ['Cilegon', '96000', '4800000', '', '', '', '20', 'TRUE'],
                ],
            ],
            'pbm_rates' => [
                'tab' => 'cfg_pbm_rates', 'key' => 'ship_type', 'cols' => ['ship_type', 'pbm', 'sort_order', 'active'],
                'seed' => [['breakbulk', '230', '1', 'TRUE'], ['container20', '350', '2', 'TRUE'], ['container40', '509', '3', 'TRUE']],
            ],
        ],

        // ── scot ──────────────────────────────────────────────────────────
        'scot' => [
            'cargo_types' => [
                'tab' => 'cfg_cargo_types', 'key' => 'value', 'cols' => ['value', 'sort_order', 'active'],
                'seed' => [['Import', '1', 'TRUE'], ['Domestic', '2', 'TRUE']],
            ],
            'shipment_types' => [
                'tab' => 'cfg_shipment_types', 'key' => 'value', 'cols' => ['value', 'sort_order', 'active'],
                'seed' => [['Breakbulk', '1', 'TRUE'], ['Container', '2', 'TRUE']],
            ],
            'cargo_statuses' => [
                'tab' => 'cfg_cargo_statuses', 'key' => 'value', 'cols' => ['value', 'sort_order', 'active'],
                'seed' => [['Direct', '1', 'TRUE'], ['Via Warehouse', '2', 'TRUE'], ['Storage', '3', 'TRUE']],
            ],
            'statuses' => [
                'tab' => 'cfg_statuses', 'key' => 'value', 'cols' => ['value', 'sort_order', 'active'],
                'seed' => [['Contract', '1', 'TRUE'], ['Booked', '2', 'TRUE'], ['On Going', '3', 'TRUE'], ['Done', '4', 'TRUE']],
            ],
            'shipment_routes' => [
                'tab' => 'cfg_shipment_routes', 'key' => 'value', 'cols' => ['value', 'sort_order', 'active'],
                'seed' => [['Direct', '1', 'TRUE'], ['Transit', '2', 'TRUE']],
            ],
            'document_types' => [
                'tab' => 'cfg_document_types', 'key' => 'value', 'cols' => ['value', 'label', 'sort_order', 'active'],
                'seed' => [
                    ['BL', 'BL', '1', 'TRUE'], ['PIB', 'PIB', '2', 'TRUE'],
                    ['SuratJalan', 'Surat Jalan', '3', 'TRUE'], ['Other', 'Other', '4', 'TRUE'],
                ],
            ],
        ],
    ];
}

/** Lookups for one module (empty array if none registered). */
function cfg_for(string $module): array {
    return cfg_registry()[$module] ?? [];
}
