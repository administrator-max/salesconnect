<?php
/**
 * 19-Nov-2026 — Cost Core:
 *   1) tambah kolom `pipa` di tab costings (checkbox PIPA Break Bulk)
 *   2) PBM Break Bulk 230 -> 255 di cfg_pbm_rates
 *      (125 stevedoring via lap + 15 izin TL/lembur + 15 handling inklaring
 *       + 10 red line/bahandle + 90 storage fee; rincian Badui Logistik)
 * Run:  php tools/costcore_pipa_pbm255_2026-11-19.php          (dry-run)
 *       php tools/costcore_pipa_pbm255_2026-11-19.php --apply
 */
require_once __DIR__ . '/../lib/config_util.php';
require_once __DIR__ . '/../lib/costcore_store.php';

$apply = in_array('--apply', $argv, true);
$cfg = sc_config();
$sid = $cfg['spreadsheets']['costcore'];
$gs  = new GoogleSheets($cfg['costcore_service_account']);

$hdr = $gs->headers($sid, CS_TAB);
echo "costings: " . count($hdr) . " kolom; pipa " . (in_array('pipa', $hdr, true) ? 'SUDAH ada' : 'belum ada') . "\n";
if ($apply && !in_array('pipa', $hdr, true)) cc_ensure_header($gs, $sid);

$t = $gs->table($sid, 'cfg_pbm_rates', false);
foreach ($t['rows'] as $r) {
    echo "  pbm {$r['ship_type']} = {$r['pbm']}\n";
    if ($r['ship_type'] === 'breakbulk' && (string) $r['pbm'] !== '255') {
        $row = $r; unset($row['_row']); $row['pbm'] = '255';   // baris lengkap: updateAssoc menimpa seluruh baris
        echo "  -> breakbulk {$r['pbm']} -> 255" . ($apply ? '' : ' (dry-run)') . "\n";
        if ($apply) $gs->updateAssoc($sid, 'cfg_pbm_rates', $r['_row'], $row);
    }
}

if ($apply) {
    $gs->cacheClear();
    $hdr = $gs->headers($sid, CS_TAB);
    echo "verifikasi: pipa di header = " . (in_array('pipa', $hdr, true) ? 'YA' : 'TIDAK') . "\n";
    foreach ($gs->table($sid, 'cfg_pbm_rates', false)['rows'] as $r) echo "verifikasi: {$r['ship_type']} = {$r['pbm']}\n";
}
