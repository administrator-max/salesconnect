<?php
/**
 * CRM Projects — stockists table: apply Cici's "03 Potential Customer – Wear Plate by Priority"
 * (18-Nov-2026). Category becomes only Stockist/Fabricator, "PT." is dropped from every name,
 * qty/size/API/location from the Excel, new companies appended. Companies not in the Excel stay.
 * Remarks: existing remarks kept; Excel remark appended if new.
 *
 * Run: php tools/crm_stockist_wearplate_2026-11-18.php          (dry run)
 *      php tools/crm_stockist_wearplate_2026-11-18.php --write
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$write = in_array('--write', $argv, true);
$cfg = sc_config(); $SID = $cfg['spreadsheets']['crmproject']; $gs = new GoogleSheets();

// [category, name, location, qty, size, api, remark] in the Excel's priority order
$X = [
 ['Stockist','Fine Steel Share','Karawang',4000,'6–100mm','API-U',''],
 ['Stockist','Sutindo Project','Jakarta',4000,'6–100mm','API-U',''],
 ['Stockist','Hanwa Indonesia','Marunda',1000,'6–50mm','API-U',''],
 ['Stockist','Garuda Pratama','Tangerang',500,'6–50mm','API-U',''],
 ['Stockist','Krupindo Lestari','P. Jayakarta, Jakarta',500,'6–50mm','API-U',''],
 ['Stockist','Persada Nusantara','Jakarta – Karawang',100,'6–25mm','API-U',''],
 ['Stockist','Dananjaya Sukses Mandiri','Jakarta',100,'6–20mm','API-U',''],
 ['Stockist','Triplon Metal Indo','Jakarta',200,'8–50mm','API-U',''],
 ['Stockist','Besindo Prima Steel','Jakarta',200,'8–50mm','API-U',''],
 ['Stockist','Triratna Metalindo Sejahtera','Delta Silicon, Cikarang',5000,'6–150mm','API-P','Has its own import licence'],
 ['Stockist','Kreasi Inti Sukses','Cibitung',2000,'6–100mm','API-U','Has its own import licence & non NM'],
 ['Stockist','Loco Steel','Jakarta',100,'6–20mm','API-U','Has an exclusive import partner; difficult to penetrate'],
 ['Fabricator','Tira Austenite, Tbk','Pulogadung, HO',5000,'6–100mm','API-P','Uses NM in non-critical parts'],
 ['Fabricator','Bima Bisalloy','Cikarang',500,'8–50mm','API-P',''],
 ['Fabricator','Hydraxle Perkasa','LPPU Curug, Tangerang',4900,'6–15mm','API-P','Does not use NM; approach with other origins'],
 ['Fabricator','Sanggar Sarana Baja','Millennium IE, Tigaraksa',5000,'6–90mm','API-P',''],
 ['Fabricator','Sigma Rekayasa Eng.','Kawasan Jababeka',300,'6–20mm','API-P',''],
 ['Fabricator','Growth Asia','Medan',150,'40–50mm','API-P','Does not use NM; mostly buys ready stock'],
 ['Fabricator','Maxima Mandiri Indonusa','Kawasan Delta Silicon',500,'6–50mm','API-P',''],
 ['Fabricator','Barkat Agra Yuda','Surabaya',100,'6–20mm','API-P',''],
 ['Fabricator','Suprabakti Mandiri','Tangerang',50,'8–12mm','API-P',''],
 ['Fabricator','Global Asia Sorowako','Makassar',100,'8–40mm','API-P',''],
 ['Fabricator','Samudera Mulia Abadi','Manado, Sulawesi Utara',0,'','API-P',''],
 ['Fabricator','Suksestama Manunggal Mandiri','Millennium IE, Tigaraksa',5000,'6–90mm','API-P',''],
 ['Fabricator','Bahrul Alam Persada (CLIK)','Bekasi',200,'6–90mm','API-P',''],
 ['Fabricator','UT Pandu Engineering','Kawasan Jababeka I',8000,'6–20mm','API-P','Has its own import licence'],
 ['Fabricator','Pindad','Bandung',150,'6–20mm','API-P','Low requirement for WR plate'],
 ['Fabricator','Steel Force Indonesia','Jakarta',1000,'6–25mm','API-P','Has its own import licence'],
];
$strip = fn($n) => trim(preg_replace('/^PT\.?\s+/i', '', trim((string) $n)));
$key = fn($n) => strtolower(preg_replace('/[^a-z0-9]/i', '', $strip($n)));
$catMap = ['OEM' => 'Stockist', 'Distributor' => 'Stockist', 'Fabricator' => 'Fabricator', 'Stockist' => 'Stockist'];

$t = $gs->table($SID, 'stockists', false); $rows = $t['rows'];
$byKey = []; foreach ($rows as $r) $byKey[$key($r['company_name'])] = $r;
$order = ['Stockist' => 0, 'Fabricator' => 0]; $seen = []; $updates = []; $appends = [];
$maxId = 0; foreach ($rows as $r) $maxId = max($maxId, (int) $r['id']);

foreach ($X as [$cat, $name, $loc, $qty, $size, $api, $rem]) {
    $k = $key($name); $seen[$k] = true; $so = ++$order[$cat];
    if (isset($byKey[$k])) {
        $r = $byKey[$k]; $old = $r;
        $remarks = trim((string) $r['remarks']);
        if ($name === 'Growth Asia') $remarks = 'Branded brand';
        if ($rem !== '' && stripos($remarks, $rem) === false) $remarks = $remarks === '' ? $rem : "$remarks; $rem";
        $r = array_merge($r, ['category' => $cat, 'company_name' => $name, 'location' => $loc, 'annual_volume_mt' => $qty,
            'size_range' => $size, 'api_status' => $api, 'remarks' => $remarks, 'sort_order' => $so]);
        $updates[] = [$old, $r];
    } else {
        $appends[] = ['id' => ++$maxId, 'sort_order' => $so, 'category' => $cat, 'company_name' => $name, 'location' => $loc,
            'annual_volume_mt' => $qty, 'size_range' => $size, 'remarks' => $rem, 'api_status' => $api, 'created_at' => sc_now(),
            'contact_name' => '', 'contact_phone' => '', 'website' => ''];
    }
}
// Companies not in the Excel: keep; only category, PT. and order change
foreach ($rows as $r) {
    if (isset($seen[$key($r['company_name'])])) continue;
    $old = $r; $cat = $catMap[$r['category']] ?? 'Stockist';
    $r = array_merge($r, ['category' => $cat, 'company_name' => $strip($r['company_name']), 'sort_order' => 100 + (++$order[$cat])]);
    $updates[] = [$old, $r];
}

$cols = ['category', 'company_name', 'location', 'annual_volume_mt', 'size_range', 'api_status', 'remarks', 'sort_order'];
foreach ($updates as [$o, $n]) {
    $d = []; foreach ($cols as $c) if ((string) $o[$c] !== (string) $n[$c]) $d[] = "$c: '{$o[$c]}' -> '{$n[$c]}'";
    echo "UPDATE row {$o['_row']} id {$o['id']} {$n['company_name']}\n   " . implode("\n   ", $d ?: ['(no change)']) . "\n";
}
foreach ($appends as $a) echo "ADD id {$a['id']} [{$a['category']}] {$a['company_name']} | {$a['location']} | {$a['annual_volume_mt']} | {$a['size_range']} | {$a['api_status']}\n";
echo "\n" . count($updates) . " updates, " . count($appends) . " adds\n";
if (!$write) { echo "DRY RUN - add --write\n"; exit; }

foreach ($updates as [$o, $n]) { $row = $n; unset($row['_row']); $gs->updateAssoc($SID, 'stockists', $o['_row'], $row); }
foreach ($appends as $a) $gs->appendAssoc($SID, 'stockists', $a);

$after = $gs->table($SID, 'stockists', false)['rows']; $tot = [];
foreach ($after as $r) {
    $c = $r['category']; $tot[$c][0] = ($tot[$c][0] ?? 0) + 1; $tot[$c][1] = ($tot[$c][1] ?? 0) + (float) $r['annual_volume_mt'];
    if (preg_match('/^PT\b/i', $r['company_name'])) echo "STILL PT: {$r['company_name']}\n";
    if (trim((string) $r['company_name']) === '') echo "EMPTY ROW {$r['_row']}\n";
}
echo "READ BACK: " . json_encode($tot) . " rows " . count($after) . "\n";
