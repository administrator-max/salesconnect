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
