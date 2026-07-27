<?php
/**
 * Regression: company_product_stats rows must be matched by CANONICAL product
 * name, not by raw string.
 *
 * The bug (found 2026-07-27): every stats lookup in iqdash_write.php compared
 * `$s['product'] === $product` literally. Shipment lots are recorded under the
 * canonical name (`GI ALLOY`) while legacy stats rows still carry the alias
 * (`GI BORON`), so the lookup missed and the recompute INSERTED a second stats
 * row for the same real product. Six companies ended up with duplicate pairs —
 * BDG, BHG, HKG, JKT, SMS, SPA — which then corrupt the obtained basis
 * (`prevUtil + prevAvail`) used as the quota ceiling on the next lot edit.
 *
 * See logs/audit-mt-truncation_2026-07-27_log.md.
 *
 * Run: php iqdash/tests/test_product_alias_stats.php
 */
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_write.php';

function ok($c, $m) { echo ($c ? 'PASS' : 'FAIL') . " $m\n"; if (!$c) $GLOBALS['fail'] = 1; }

$ALIASES = ['GI BORON' => 'GI ALLOY', 'GI Boron' => 'GI ALLOY', 'GL BORON' => 'GL ALLOY', 'SHEETPILE' => 'SHEET PILE'];

/* ── iq_canon_product ───────────────────────────────────────────────── */
echo "-- iq_canon_product --\n";
ok(iq_canon_product('GI BORON', $ALIASES) === 'GI ALLOY', "'GI BORON' -> 'GI ALLOY'");
ok(iq_canon_product('GI ALLOY', $ALIASES) === 'GI ALLOY', "'GI ALLOY' -> itself (already canonical)");
ok(iq_canon_product('SHEETPILE', $ALIASES) === 'SHEET PILE', "'SHEETPILE' -> 'SHEET PILE'");
ok(iq_canon_product('  GL BORON  ', $ALIASES) === 'GL ALLOY', 'surrounding whitespace trimmed before lookup');
ok(iq_canon_product('SEAMLESS PIPE', $ALIASES) === 'SEAMLESS PIPE', 'unknown product passes through unchanged');
ok(iq_canon_product('', $ALIASES) === '', 'empty string stays empty');
ok(iq_canon_product(null, $ALIASES) === '', 'null becomes empty string, never a crash');

/* ── iq_find_product_row_idx ──────────────────────────────────────────────── */
echo "-- iq_find_product_row_idx --\n";
$stats = [
    ['id' => 69,  'company_code' => 'BDG', 'product' => 'GI BORON', 'utilization_mt' => '0',   'available_mt' => '0'],
    ['id' => 68,  'company_code' => 'BDG', 'product' => 'GL BORON', 'utilization_mt' => '650', 'available_mt' => '0'],
    ['id' => 110, 'company_code' => 'BDG', 'product' => 'BORDES ALLOY', 'utilization_mt' => '0', 'available_mt' => '50'],
    ['id' => 75,  'company_code' => 'SMS', 'product' => 'SHEETPILE', 'utilization_mt' => '0', 'available_mt' => '150'],
];
ok(iq_find_product_row_idx($stats, 'BDG', 'GI ALLOY', $ALIASES) === 0,
   "lot product 'GI ALLOY' finds BDG's legacy 'GI BORON' row (this is the bug)");
ok(iq_find_product_row_idx($stats, 'BDG', 'GL ALLOY', $ALIASES) === 1, "'GL ALLOY' finds the 'GL BORON' row");
ok(iq_find_product_row_idx($stats, 'BDG', 'BORDES ALLOY', $ALIASES) === 2, 'exact (non-alias) name still matches');
ok(iq_find_product_row_idx($stats, 'SMS', 'SHEET PILE', $ALIASES) === 3, "'SHEET PILE' finds 'SHEETPILE'");
ok(iq_find_product_row_idx($stats, 'BDG', 'SHEET PILE', $ALIASES) === null, 'no match for a product BDG does not hold');
ok(iq_find_product_row_idx($stats, 'SMS', 'GI ALLOY', $ALIASES) === null, 'company scoping respected (SMS has no GI row here)');
ok(iq_find_product_row_idx($stats, 'BDG', 'GI BORON', $ALIASES) === 0, 'passing the alias itself also matches');
ok(iq_find_product_row_idx($stats, 'BDG', '', $ALIASES) === null, 'empty product never matches a genuinely-empty product cell');
ok(iq_find_product_row_idx($stats, 'BDG', null, $ALIASES) === null, 'null product never matches (guard preserved from the old inline code)');

// The same helper keys company_reapply_targets, which had the identical defect.
$targets = [
    ['id' => 1, 'company_code' => 'HKG', 'product' => 'GL BORON', 'target_mt' => '500'],
    ['id' => 2, 'company_code' => 'AMP', 'product' => 'GL ALLOY', 'target_mt' => '200'],
];
ok(iq_find_product_row_idx($targets, 'HKG', 'GL ALLOY', $ALIASES) === 0,
   "reapply target 'GL ALLOY' finds HKG's legacy 'GL BORON' row");
ok(iq_find_product_row_idx($targets, 'AMP', 'GL BORON', $ALIASES) === 1, 'reapply target matches the other direction too');

/* ── iq_record_obtained_plan must use the same canonical matching ───── */
echo "-- iq_record_obtained_plan --\n";
$statsEms = [['id' => 1, 'company_code' => 'EMS', 'product' => 'GI BORON', 'utilization_mt' => '50', 'available_mt' => '100']];
$plan = iq_record_obtained_plan($statsEms, 'GI ALLOY', 30.0, false, $ALIASES);
ok($plan['foundExisting'] === true, "recording 'GI ALLOY' finds the legacy 'GI BORON' row (no phantom insert)");
ok(abs($plan['newAvailable'] - 130.0) < 0.0001, 'nets onto the existing 100, giving 130 (not a fresh 30)');
$planNoAlias = iq_record_obtained_plan($statsEms, 'GI ALLOY', 30.0, false);
ok($planNoAlias['foundExisting'] === false, 'omitting the alias map keeps the old literal behaviour (back-compatible)');

/* ── end-to-end: a lot saved under the canonical name must NOT create a
      second stats row next to the legacy alias row ───────────────────── */
echo "-- end-to-end via iq_patch_company --\n";

class AliasStubSheets extends GoogleSheets {
    public array $tables = [];
    public function __construct() {}
    public function seedTable(string $tab, array $headers, array $rows): void {
        $out = [];
        foreach ($rows as $i => $r) {
            $assoc = ['_row' => $i + 2];
            foreach ($headers as $h) $assoc[$h] = array_key_exists($h, $r) ? $r[$h] : '';
            $out[] = $assoc;
        }
        $this->tables[$tab] = ['headers' => $headers, 'rows' => $out];
    }
    public function headers($id, $tab) { return $this->tables[$tab]['headers'] ?? []; }
    public function table($id, $tab, $useCache = true) { return $this->tables[$tab] ?? ['headers' => [], 'rows' => []]; }
    /** Mirrors GoogleSheets::batchRewrite — $tabWrites is a LIST of
     *  ['tab' => name, 'rows' => matrix-of-cell-arrays]. */
    public function batchRewrite($id, array $tabWrites) {
        foreach ($tabWrites as $w) {
            $tab     = $w['tab'];
            $matrix  = $w['rows'] ?? [];
            $headers = $this->tables[$tab]['headers'] ?? [];
            $rows = [];
            foreach ($matrix as $i => $line) {
                $assoc = ['_row' => $i + 2];
                foreach ($headers as $c => $h) $assoc[$h] = $line[$c] ?? '';
                $rows[] = $assoc;
            }
            $this->tables[$tab]['rows'] = $rows;
        }
    }
    public function updateRange($id, $range, array $rows) {}
    public function clearValues($id, $range) {}
    public function append($id, $tab, array $rows) {}
    public function appendAssoc($id, $tab, array $row) {}
    public function appendAssocBulk($id, $tab, array $rows) {}
    public function deleteRows($id, $tab, array $rowNums) {}
    public function cacheClear() {}
}

$gs = new AliasStubSheets();
$gs->seedTable('product_aliases', ['alias', 'canonical', 'created_at', 'source_program'], [
    ['alias' => 'GI BORON', 'canonical' => 'GI ALLOY'],
]);
$gs->seedTable('companies',
    ['code','grp','section','submit1','obtained','utilization_mt','available_quota','rev_type','rev_note','rev_submit_date','rev_status','rev_mt','remarks','spi_ref','status_update','pertek_no','spi_no','updated_by','updated_date','created_at','updated_at','full_name','source_program'],
    [['code' => 'BDG', 'obtained' => '650', 'utilization_mt' => '0', 'available_quota' => '650', 'updated_at' => '2026-01-01T00:00:00.000Z']]);
$gs->seedTable('company_product_stats',
    ['id','company_code','product','utilization_mt','available_mt','realization_mt','eta_jkt','arrived','source_program'],
    [['id' => '69', 'company_code' => 'BDG', 'product' => 'GI BORON', 'utilization_mt' => '0', 'available_mt' => '650']]);
$gs->seedTable('company_shipments',
    ['id','company_code','product','lot_no','util_mt','eta_jkt','note','real_mt','pib_date','cargo_arrived','created_at','updated_at','source_program'],
    []);

$res = iq_patch_company($gs, 'SID', 'BDG', [
    'shipments' => ['GI ALLOY' => [
        ['lotNo' => 1, 'utilMT' => 350, 'etaJKT' => '31 Agustus 2026', 'note' => '', 'realMT' => 0, 'pibDate' => '', 'cargoArrived' => false],
    ]],
    '_ifUpdatedAt' => null,
]);
ok(!isset($res['error']), 'patch succeeded' . (isset($res['error']) ? " (error: {$res['error']})" : ''));

$bdgStats = array_values(array_filter($gs->tables['company_product_stats']['rows'],
    fn($s) => (string) $s['company_code'] === 'BDG'));
ok(count($bdgStats) === 1,
   'exactly ONE stats row for BDG after the patch — no duplicate created (got ' . count($bdgStats) . ')');
if (count($bdgStats) === 1) {
    ok((string) $bdgStats[0]['product'] === 'GI BORON',
       'the existing row was updated in place; its product name is left alone (renaming is a data task, not a write-path job)');
    ok(abs(iq_num($bdgStats[0]['utilization_mt']) - 350.0) < 0.0001,
       'utilization from the lot landed on the existing row (350)');
    ok(abs(iq_num($bdgStats[0]['available_mt']) - 300.0) < 0.0001,
       'available recomputed against the row\'s own obtained basis: 650 - 350 = 300');
}

echo (empty($GLOBALS['fail']) ? "\nSEMUA LULUS\n" : "\nADA YANG GAGAL\n");
exit(empty($GLOBALS['fail']) ? 0 : 1);
