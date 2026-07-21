<?php
/**
 * Offline unit tests for lib/config_util.php (in-memory fake GoogleSheets, no network).
 * Run:  php tools/config_test.php
 */
require_once __DIR__ . '/../lib/config_util.php';

/** In-memory GoogleSheets: overrides only what config_util touches. */
class FakeGS extends GoogleSheets {
    public array $tabs = [];   // tab => [ assocRow, ... ]  (no _row; added on read)
    public function __construct() { /* skip real construct: no SA/network needed */ }
    public function table($id, $tab, $useCache = true) {
        $rows = [];
        foreach ($this->tabs[$tab] ?? [] as $i => $r) $rows[] = array_merge(['_row' => $i + 2], $r);
        return ['headers' => [], 'rows' => $rows];
    }
    public function appendAssoc($id, $tab, array $assoc) { $this->tabs[$tab][] = $assoc; return true; }
    public function updateAssoc($id, $tab, $sheetRow, array $assoc) { $this->tabs[$tab][$sheetRow - 2] = $assoc; return true; }
    public function deleteRows($id, $tab, array $rows) { foreach ($rows as $r) unset($this->tabs[$tab][$r - 2]); $this->tabs[$tab] = array_values($this->tabs[$tab]); return true; }
}

$pass = 0; $fail = 0;
function ok($cond, $name) { global $pass, $fail; if ($cond) { $pass++; echo "  ok   - $name\n"; } else { $fail++; echo "  FAIL - $name\n"; } }
function throws(callable $fn, $code, $name) {
    try { $fn(); global $fail; $fail++; echo "  FAIL - $name (no throw)\n"; }
    catch (Exception $e) { ok($e->getCode() === $code, "$name (code {$e->getCode()})"); }
}

$LK = [
    'tab'  => 'cfg_x',
    'key'  => 'value',
    'cols' => ['value', 'label', 'sort_order', 'active'],
    'seed' => [],
];

// cfg_is_active
ok(cfg_is_active('') === true, 'blank active => true');
ok(cfg_is_active(null) === true, 'null active => true');
ok(cfg_is_active('TRUE') === true, 'TRUE => true');
ok(cfg_is_active('FALSE') === false, 'FALSE => false');
ok(cfg_is_active('0') === false, '0 => false');

// cfg_row_from_input: limit to cols + defaults + missing->''
$r = cfg_row_from_input($LK, ['value' => 'a', 'label' => 'A', 'junk' => 'x'], ['active' => 'TRUE']);
ok($r === ['value' => 'a', 'label' => 'A', 'sort_order' => '', 'active' => 'TRUE'], 'row_from_input limits+defaults');

// list: filter inactive, sort, skip empty key
$g = new FakeGS();
$g->tabs['cfg_x'] = [
    ['value' => 'b', 'label' => 'B', 'sort_order' => '2', 'active' => 'TRUE'],
    ['value' => '',  'label' => 'skip', 'sort_order' => '9', 'active' => 'TRUE'],
    ['value' => 'a', 'label' => 'A', 'sort_order' => '1', 'active' => 'TRUE'],
    ['value' => 'c', 'label' => 'C', 'sort_order' => '3', 'active' => 'FALSE'],
];
$list = cfg_list($g, 'sid', $LK);
ok(count($list) === 2, 'list drops empty-key + inactive');
ok($list[0]['value'] === 'a' && $list[1]['value'] === 'b', 'list sorted by sort_order');
ok(!isset($list[0]['_row']), 'list drops _row');
ok(count(cfg_list($g, 'sid', $LK, true)) === 3, 'includeInactive keeps active rows (still drops empty key)');

// find + next_sort
ok(cfg_find($g, 'sid', $LK, 'b')['label'] === 'B', 'find by key');
ok(cfg_find($g, 'sid', $LK, 'zzz') === null, 'find miss => null');
ok(cfg_next_sort($g, 'sid', $LK) === 10, 'next_sort = max+1 (max sort_order across all rows is 9)');

// add: empty key -> 400, duplicate -> 409, success sets defaults
throws(fn() => cfg_add($g, 'sid', $LK, ['value' => '']), 400, 'add empty key');
throws(fn() => cfg_add($g, 'sid', $LK, ['value' => 'a']), 409, 'add duplicate');
$added = cfg_add($g, 'sid', $LK, ['value' => 'd', 'label' => 'D']);
ok($added['active'] === 'TRUE' && $added['sort_order'] === '10', 'add applies active+sort defaults');
ok(cfg_find($g, 'sid', $LK, 'd') !== null, 'added row persisted');

// update: key immutable, other cols change
cfg_update($g, 'sid', $LK, 'd', ['label' => 'D2', 'value' => 'HACK']);
$d = cfg_find($g, 'sid', $LK, 'd');
ok($d !== null && $d['label'] === 'D2', 'update changes label');
ok(cfg_find($g, 'sid', $LK, 'HACK') === null, 'update cannot change key');

// delete: soft (active=FALSE)
cfg_delete($g, 'sid', $LK, 'd');
$d = cfg_find($g, 'sid', $LK, 'd');
ok($d['active'] === 'FALSE', 'delete is soft (active=FALSE)');
ok(count(cfg_list($g, 'sid', $LK)) === 2, 'soft-deleted row hidden from active list');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
