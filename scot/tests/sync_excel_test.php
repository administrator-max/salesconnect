<?php
/**
 * Sinkron SCOT ← Excel Drive: pembacaan .xlsx dan aturan pencocokan.
 * Tanpa jaringan: membangun .xlsx kecil sendiri lewat ZipArchive.
 * Run: php scot/tests/sync_excel_test.php
 */
require_once __DIR__ . '/../scot_sync.php';

$fail = 0;
function ok($c, $m) { global $fail; echo ($c ? 'PASS ' : 'FAIL ') . $m . "\n"; if (!$c) $fail = 1; }

/* ── .xlsx mini: sheet "Ship Analyze26", judul di baris 2, data mulai baris 3 ── */
function xlsx_mini(array $rows): string {
    $esc = fn($s) => htmlspecialchars((string) $s, ENT_XML1);
    $sheet = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    foreach ($rows as $ri => $r) {
        $sheet .= '<row r="' . ($ri + 1) . '">';
        foreach ($r as $ci => $v) {
            if ($v === null) continue;
            $ref = ($ci < 26 ? chr(65 + $ci) : chr(64 + intdiv($ci, 26)) . chr(65 + $ci % 26)) . ($ri + 1);
            $sheet .= is_numeric($v) ? "<c r=\"$ref\"><v>$v</v></c>" : "<c r=\"$ref\" t=\"inlineStr\"><is><t>{$esc($v)}</t></is></c>";
        }
        $sheet .= '</row>';
    }
    $sheet .= '</sheetData></worksheet>';
    $tmp = tempnam(sys_get_temp_dir(), 'xt'); $z = new ZipArchive(); $z->open($tmp, ZipArchive::OVERWRITE);
    $z->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Ship Analyze26" sheetId="1" r:id="rId1"/><sheet name="Catatan" sheetId="2" r:id="rId2"/></sheets></workbook>');
    $z->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>');
    $z->addFromString('xl/worksheets/sheet1.xml', $sheet);
    $z->addFromString('xl/worksheets/sheet2.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>No.</t></is></c></row></sheetData></worksheet>');
    $z->close(); $b = file_get_contents($tmp); @unlink($tmp); return $b;
}
$baris = function (array $o) { $r = array_fill(0, count(SCOT_EXCEL_KOLOM), null); foreach ($o as $k => $v) $r[array_search($k, SCOT_EXCEL_KOLOM, true)] = $v; return $r; };
$bytes = xlsx_mini([
    ['As of : 26 Feb 2026'],
    ['No.', 'Cargo Type', 'Consignee'],
    $baris(['no' => 1, 'cargo_type' => 'Import', 'consignee' => 'PT Selaras Prima Angkasa', 'project_name' => 'Arsen 54 LOT 2', 'quantity_mt' => 483.686, 'eta' => 46122, 'pib_billing' => '-', 'status' => 'Done']),
    $baris(['no' => 2, 'cargo_type' => 'Import', 'consignee' => 'Angkas Artha Dinamika', 'project_name' => 'Arsen 56B', 'quantity_mt' => 149.33, 'sppb' => '04/09/2026', 'actual_sailing_days' => 46329, 'est_sailing_days' => 21]),
    $baris(['no' => 3, 'cargo_type' => 'Import', 'consignee' => 'PT Selaras Prima Angkasa', 'project_name' => 'Centra Lays 03 - Del. October 2026', 'quantity_mt' => 13.65]),
    $baris(['no' => 4, 'cargo_type' => 'Import']),   // tanpa project → dilewati
]);

$rec = scot_excel_records(scot_xlsx_sheets($bytes));
ok(count($rec) === 3, 'tiga baris data terbaca; baris tanpa project & sheet lain diabaikan (' . count($rec) . ')');
ok($rec[0]['year'] === 2026, 'tahun dari nama sheet "Ship Analyze26"');
ok($rec[0]['eta'] === '2026-04-10', 'serial tanggal Excel 46122 → 2026-04-10 (' . $rec[0]['eta'] . ')');
ok($rec[0]['pib_billing'] === null, '"-" dibaca kosong');
ok($rec[1]['sppb'] === '2026-09-04', 'teks 04/09/2026 → 2026-09-04 (hari/bulan)');
ok($rec[1]['actual_sailing_days'] === null && $rec[1]['est_sailing_days'] == 21, 'hari 46329 (rumus ETA−ETD tanpa ETD) dibuang; 21 hari tetap');

$db = [
    ['id' => '106', 'year' => '2026', 'cargo_type' => 'Import', 'consignee' => 'Gantari Kara Loka', 'project_name' => 'Arsen 54 LOT 2', 'quantity_mt' => '5005', 'eta' => '2026-04-10', 'pib_billing' => '2026-04-09', 'status' => 'Done'],
    ['id' => '107', 'year' => '2026', 'cargo_type' => 'Import', 'consignee' => 'Angkasa Artha Dinamika Cemerlang', 'project_name' => ' Arsen 56B ', 'quantity_mt' => '149.33', 'sppb' => ''],
    ['id' => '200', 'year' => '2026', 'cargo_type' => 'Import', 'consignee' => 'X', 'project_name' => 'Hanya di dashboard', 'quantity_mt' => '10'],
];
$p = scot_sync_plan($rec, $db);
$u = []; foreach ($p['updates'] as $x) $u[$x['id']] = $x['data'];
ok(isset($u['106']['quantity_mt']) && $u['106']['quantity_mt'] == 483.686, 'Arsen 54 LOT 2 dicocokkan lewat nama project walau MT di dashboard salah ketik (5005 → 483,686)');
ok(!array_key_exists('pib_billing', $u['106'] ?? []), 'PIB "-" di Excel TIDAK menghapus tanggal PIB dashboard');
ok(($u['106']['consignee'] ?? null) === 'PT Selaras Prima Angkasa', 'consignee mengikuti Excel');
ok(isset($u['107']) && ($u['107']['sppb'] ?? null) === '2026-09-04', 'Arsen 56B cocok walau ejaan consignee beda & ada spasi; SPPB terisi');
ok(count($p['inserts']) === 1 && $p['inserts'][0]['project_name'] === 'Centra Lays 03 - Del. October 2026', 'shipment baru dari Excel jadi insert');
ok(count($p['db_only']) === 1 && $p['db_only'][0]['id'] === '200', 'baris yang hanya di dashboard dilaporkan, tidak dihapus');

/* Dua kandidat dengan nama sama & MT tidak cocok → jangan menebak. */
$p2 = scot_sync_plan([['year' => 2026, 'cargo_type' => 'Import', 'project_name' => 'Kembar', 'quantity_mt' => 50, '_sheet' => 's', '_baris' => 1] + array_fill_keys(SCOT_EXCEL_KOLOM, null)],
    [['id' => '1', 'year' => '2026', 'cargo_type' => 'Import', 'project_name' => 'Kembar', 'quantity_mt' => '10'],
     ['id' => '2', 'year' => '2026', 'cargo_type' => 'Import', 'project_name' => 'Kembar', 'quantity_mt' => '20']]);
ok(count($p2['updates']) === 0, 'nama project kembar tanpa MT yang cocok tidak ditebak');

echo $fail ? "\nGAGAL\n" : "\nSEMUA LULUS\n";
exit($fail);
