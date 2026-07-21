<?php
/**
 * Round-trip safety test: for every REAL costing, decompose the nested object into
 * columns and recompose it, then confirm the recomposed object equals the original
 * (ignoring transient UI fields + item ids). READ-ONLY — never writes.
 *   php tools/costcore_roundtrip_test.php
 */
require_once __DIR__ . '/../lib/costcore_store.php';

/** Canonical, comparable form of a costing data object (same rules applied to both sides). */
function canon(array $d, string $type): array {
    $items = is_array($d['items'] ?? null) ? $d['items'] : [];
    $out = [];
    if ($type === 'import') {
        foreach (['shipType','tujuan','commUnit','marginType','payTerms','customer'] as $k) $out[$k] = (string) ($d[$k] ?? '');
        foreach (['kurs','importDuty','wht','portCharges','hedgeRate','hedgeDays','stripping','addCost','commission','margin'] as $k) $out[$k] = (float) ($d[$k] ?? 0);
        $out['isPipa'] = !empty($d['isPipa']);
        $out['items'] = array_map(fn($it) => [
            'name' => (string) ($it['name'] ?? ''), 'qty' => (string) ($it['qty'] ?? ''),
            'cif' => (string) ($it['cif'] ?? ''), 'remark' => (string) ($it['remark'] ?? ''),
        ], array_values($items));
    } else {
        foreach (['customer','trkFrom','trkTo','payTerms'] as $k) $out[$k] = (string) ($d[$k] ?? '');
        foreach (['whtRate','addCost','trkCost'] as $k) $out[$k] = (float) ($d[$k] ?? 0);
        $out['margins'] = array_map(fn($m) => ['name' => (string) ($m['name'] ?? ''), 'val' => (float) ($m['val'] ?? 0)],
            array_values(is_array($d['margins'] ?? null) ? $d['margins'] : []));
        $out['items'] = array_map(fn($it) => [
            'name' => (string) ($it['name'] ?? ''), 'qtyKg' => (string) ($it['qtyKg'] ?? ''),
            'buyPrice' => (string) ($it['buyPrice'] ?? ''), 'marginIdx' => (int) ($it['marginIdx'] ?? 0),
            'remark' => (string) ($it['remark'] ?? ''),
        ], array_values($items));
    }
    return $out;
}

$cfg = sc_config();
$sid = $cfg['spreadsheets']['costcore'];
$gs  = new GoogleSheets($cfg['costcore_service_account']);

$pass = 0; $fail = 0; $fails = [];
foreach ($gs->table($sid, CS_TAB, false)['rows'] as $r) {
    $id = $r['id'] ?? '';
    if ($id === '' || empty($r['data_json'])) continue;
    $type = $r['type'] ?? 'import';
    $orig = json_decode((string) $r['data_json'], true);
    if (!is_array($orig)) { $fail++; $fails[] = "$id: bad data_json"; continue; }

    [$h, $items, $margins] = cc_decompose($id, $type, (string) ($r['customer'] ?? ''), $orig, '', '');
    $recomposed = cc_recompose($h, $items, $margins);

    $a = json_encode(canon($orig, $type));
    $b = json_encode(canon($recomposed, $type));
    if ($a === $b) { $pass++; }
    else { $fail++; $fails[] = "$id ($type)\n    orig: $a\n    new : $b"; }
}

echo "Round-trip: $pass passed, $fail failed\n";
foreach (array_slice($fails, 0, 8) as $f) echo "  FAIL $f\n";
exit($fail ? 1 : 0);
