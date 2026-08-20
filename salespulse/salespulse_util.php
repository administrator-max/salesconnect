<?php
/**
 * Sales Pulse — schema, coercion, lock, autoincrement.
 * Ported from ../sales_pulse/sheetsRepo.js (TABLES, parseCell, serializeCell,
 * colLetter, getTable, replaceTable). Behavior is locked by tests/util_test.php.
 */
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../lib/GoogleSheets.php';

/** Tab -> column schema. Order/type mirrors sheetsRepo.js TABLES (lines 24-86). */
const SP_TABLES = [
    'monthly_actuals' => [
        ['year', 'int'], ['month_idx', 'int'],
        ['actual_margin', 'float'], ['plan_margin', 'float'], ['revenue', 'float'],
        ['notes', 'string'], ['updated_at', 'string'],
    ],
    'plan_revisions' => [
        ['id', 'int'], ['year', 'int'], ['month_idx', 'int'],
        ['name', 'string'], ['margin', 'float'], ['revenue', 'float'],
        ['notes', 'string'], ['qty', 'json'], ['ts', 'string'], ['created_at', 'string'],
    ],
    'budget_lines' => [
        ['id', 'int'], ['year', 'int'], ['month_idx', 'int'],
        ['segment', 'string'], ['product', 'string'],
        ['volume_mt', 'float'], ['revenue_idr', 'float'], ['margin_idr', 'float'],
        ['updated_at', 'string'],
    ],
    'products' => [
        ['canonical_name', 'string'], ['macro_category', 'string'], ['display_order', 'int'],
    ],
    'product_aliases' => [
        ['alias', 'string'], ['canonical_name', 'string'],
    ],
    'ps_headers' => [
        ['ps_number', 'string'], ['dashboard_year', 'int'], ['dashboard_month_idx', 'int'],
        ['project_code', 'string'], ['project_name', 'string'], ['subsidiary', 'string'],
        ['customer_name', 'string'], ['supplier_name', 'string'], ['po_date', 'date'],
        ['currency', 'string'], ['fx_rate', 'float'], ['net_margin_native', 'float'],
        ['sales_revenue', 'float'], ['purchase_cost', 'float'],
        ['margin', 'float'], ['margin_percentage', 'float'],
        ['product', 'string'], ['segment', 'string'], ['notes', 'string'],
        ['created_at', 'string'],
    ],
    'ps_items' => [
        ['id', 'int'], ['ps_number', 'string'],
        ['dashboard_year', 'int'], ['dashboard_month_idx', 'int'], ['project_name', 'string'],
        ['item_no', 'int'],
        ['material', 'string'], ['size', 'string'], ['length', 'string'],
        ['qty_val', 'float'], ['qty_unit', 'string'],
        ['total_weight_kg', 'float'], ['purchase_price_kg', 'float'],
        ['created_at', 'string'],
    ],
];

/** Tabs that carry an autoincrement id column (sheetsRepo.js `autoId`). */
const SP_AUTOID = ['plan_revisions' => 'id', 'budget_lines' => 'id', 'ps_items' => 'id'];

/** JS `num`: parseFloat, NaN -> 0. */
function sp_num($v): float {
    if (is_int($v) || is_float($v)) return (float) $v;
    if (preg_match('/^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/', (string) $v, $m)) {
        return (float) $m[0];
    }
    return 0.0;
}

/* ── BUCKET UNTUK PS YANG PRODUKNYA BELUM DIISI ──────────────────────────────
   Dulu product kosong dipetakan ke 'Projects'. Masalahnya 'Projects' adalah
   produk NYATA di tab `products` (macro_category "projects") dan punya 12 baris
   budget sendiri (Rp 250 juta margin/bulan). Jadi tiap PS yang field product-nya
   belum terisi diam-diam menumpang di kategori yang memang sudah ada isinya —
   angkanya tampak sah lengkap dengan achievement %, padahal itu lubang data.

   Dilaporkan tim 2026-08-20: filter Juli 2026 memunculkan "Projects"
   Rp 407,79 juta (163,12% dari budget) di Top 3 Products, padahal tidak ada satu
   pun PS Juli berproduk Projects. Isinya 4 leg rantai SUMEC 01A/01B
   (PSF26-ATL-000045.R1, PSF26-HKG-000002.R1, PSF26-ATL-000046.R1,
   PSF26-JKT-000002.R2) yang product-nya kosong.

   Sentinel ini sengaja pakai tanda kurung supaya tidak mungkin bertabrakan
   dengan nama produk mana pun di master, dan langsung terbaca sebagai
   "belum diisi" — bukan sebagai kategori bisnis. */
const SP_PRODUK_BELUM_DIISI = '(Produk Belum Diisi)';

/** JS `prodKey`: trim; '' -> sentinel produk belum diisi (BUKAN 'Projects'). */
function sp_prod_key($v): string {
    $s = trim((string) $v);
    return $s === '' ? SP_PRODUK_BELUM_DIISI : $s;
}

/** Segment untuk sebuah produk kanonik; null kalau produknya tidak dikenal.
    Dipakai jalur upload PS (api.php) DAN tool perbaikan data, supaya keduanya
    tidak bisa memberi segment berbeda untuk produk yang sama. */
function sp_segment_for_product(?string $product): ?string {
    static $map = [
        'Sheet Pile' => 'Long', 'ERW Pipe' => 'Long', 'Seamless Pipe' => 'Long', 'Angle' => 'Long',
        'Bar' => 'Long', 'Beam' => 'Long', 'Channel' => 'Long', 'As Steel' => 'Long', 'Hollow' => 'Long',
        'HRC' => 'Flat', 'HRPO' => 'Flat', 'Plate' => 'Flat', 'Chequered Plate' => 'Flat', 'Wear Plate' => 'Flat',
        'Galvalume' => 'Coated', 'Galvanized' => 'Coated', 'PPGL' => 'Coated', 'Wiremesh' => 'Coated',
        'Slab' => 'Semi-Finished', 'Billet' => 'Semi-Finished',
        'HBI' => 'Raw Material', 'Scrap' => 'Raw Material',
        'Projects' => 'Projects',
    ];
    return $product === null ? null : ($map[$product] ?? null);
}

/** Port of sheetsRepo.js parseCell (lines 142-163). */
function sp_parse_cell($value, $type) {
    if ($value === null || $value === '') {
        return $type === 'json' ? [] : null;
    }
    switch ($type) {
        case 'int': {
            if (is_int($value)) return $value;
            if (is_float($value)) return (int) $value;
            if (preg_match('/^\s*[-+]?\d+/', (string) $value, $m)) return (int) $m[0];
            return null;
        }
        case 'float': {
            if (is_int($value) || is_float($value)) return (float) $value;
            if (preg_match('/^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/', (string) $value, $m)) {
                return (float) $m[0];
            }
            return null;
        }
        case 'json': {
            if (is_array($value)) return $value;
            $decoded = json_decode((string) $value, true);
            return json_last_error() === JSON_ERROR_NONE ? $decoded : [];
        }
        case 'date':
        case 'string':
        default:
            return (string) $value;
    }
}

/** Port of sheetsRepo.js serializeCell (lines 165-180). */
function sp_serialize_cell($value, $type) {
    if ($value === null || $value === '') return '';
    if ($type === 'json') {
        if (is_string($value)) return $value;
        $enc = json_encode($value);
        return $enc === false ? '' : $enc;
    }
    if ($type === 'int' || $type === 'float') {
        return is_numeric($value) ? ($value + 0) : '';
    }
    if ($type === 'date') {
        return substr((string) $value, 0, 10);
    }
    return $value;
}

/** Port of sheetsRepo.js colLetter (lines 183-188): 1 -> A, 26 -> Z, 27 -> AA ... */
function sp_col_letter($n) {
    $s = '';
    while ($n > 0) {
        $m = ($n - 1) % 26;
        $s = chr(65 + $m) . $s;
        $n = intdiv($n - 1, 26);
    }
    return $s;
}

/**
 * Port of sheetsRepo.js getTable (lines 195-230). Reads UNFORMATTED so numeric
 * cells come back as real numbers; header row maps columns, falling back to
 * schema order when the header doesn't match any known column.
 */
function sp_get_table(GoogleSheets $gs, $sid, $name): array {
    if (!isset(SP_TABLES[$name])) throw new Exception("Tabel tidak dikenal: $name");
    $columns = SP_TABLES[$name];
    $vals = $gs->getValues($sid, $name, true, true);
    if (empty($vals)) return [];

    $headerRow = array_map(function ($h) { return trim((string) ($h ?? '')); }, $vals[0]);
    $typeByCol = [];
    foreach ($columns as [$col, $type]) $typeByCol[$col] = $type;

    $fieldByIdx = array_map(function ($h) use ($typeByCol) {
        return isset($typeByCol[$h]) ? $h : null;
    }, $headerRow);
    $useSchemaOrder = true;
    foreach ($fieldByIdx as $f) { if ($f !== null) { $useSchemaOrder = false; break; } }

    $rows = [];
    $count = count($vals);
    for ($r = 1; $r < $count; $r++) {
        $row = $vals[$r] ?? [];
        $allBlank = true;
        foreach ($row as $c) {
            if ($c !== '' && $c !== null) { $allBlank = false; break; }
        }
        if ($allBlank) continue;

        $obj = [];
        if ($useSchemaOrder) {
            foreach ($columns as $i => [$col, $type]) {
                $obj[$col] = sp_parse_cell($row[$i] ?? null, $type);
            }
        } else {
            foreach ($fieldByIdx as $i => $col) {
                if ($col === null) continue;
                $obj[$col] = sp_parse_cell($row[$i] ?? null, $typeByCol[$col]);
            }
            foreach ($columns as [$col, $type]) {
                if (!array_key_exists($col, $obj)) $obj[$col] = $type === 'json' ? [] : null;
            }
        }
        $rows[] = $obj;
    }
    return $rows;
}

/**
 * Port of sheetsRepo.js replaceTable (lines 237-273). Assigns max+1 autoIds to
 * rows missing a valid int id, serializes to a header+rows matrix, and
 * overwrites the whole tab via GoogleSheets::replaceTable. Returns the rows
 * with ids assigned.
 */
function sp_replace_table(GoogleSheets $gs, $sid, $name, array $rows): array {
    if (!isset(SP_TABLES[$name])) throw new Exception("Tabel tidak dikenal: $name");
    $columns = SP_TABLES[$name];
    $autoIdCol = SP_AUTOID[$name] ?? null;

    $working = $rows;
    if ($autoIdCol !== null) {
        $maxId = 0;
        foreach ($rows as $r) {
            $v = $r[$autoIdCol] ?? null;
            if (is_int($v) || is_float($v) || (is_string($v) && preg_match('/^\s*[-+]?\d+\s*$/', $v))) {
                $n = (int) $v;
                if ($n > $maxId) $maxId = $n;
            }
        }
        $working = array_map(function ($r) use ($autoIdCol, &$maxId) {
            $cur = $r[$autoIdCol] ?? null;
            $isValidInt = is_int($cur) || (is_string($cur) && preg_match('/^\s*[-+]?\d+\s*$/', $cur));
            if (!$isValidInt) {
                $maxId++;
                $r[$autoIdCol] = $maxId;
            }
            return $r;
        }, $working);
    }

    $header = array_map(function ($c) { return $c[0]; }, $columns);
    $matrix = [$header];
    foreach ($working as $r) {
        $line = [];
        foreach ($columns as [$col, $type]) {
            $line[] = sp_serialize_cell($r[$col] ?? null, $type);
        }
        $matrix[] = $line;
    }

    $gs->replaceTable($sid, $name, $matrix, count($columns));
    return $working;
}

/** Serialize writes on the salespulse module via a file lock (same shape as scot_with_lock). */
function sp_with_lock(callable $fn) {
    $cfg = sc_config();
    $dir = rtrim($cfg['cache_dir'] ?? (__DIR__ . '/../cache'), '/');
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $fh = @fopen($dir . '/salespulse.lock', 'c');
    if ($fh === false) return $fn();
    @flock($fh, LOCK_EX);
    try { return $fn(); }
    finally { @flock($fh, LOCK_UN); @fclose($fh); }
}
