<?php
/* Pulihkan lot GL ALLOY #1 BBB (Arsen 69C) yang diinput David 02-Nov-2026 08:33 WIB lalu
   tertimpa simpanan form lama 09:50 WIB. Nilai = input David menurut log aktivitas.
   Disetujui pengguna ("pulihkan lot BBB"). */
require_once __DIR__ . '/../lib/GoogleSheets.php'; require_once __DIR__ . '/../lib/helpers.php';
$cfg = sc_config(); $gs = new GoogleSheets(); $gs->cacheClear(); $sid = $cfg['spreadsheets']['iqdash'];
$TAB = 'company_shipments'; $ID = '45';
$row = null; foreach ($gs->table($sid, $TAB, false)['rows'] as $r) if ((string) $r['id'] === $ID) $row = $r;
if (!$row || $row['company_code'] !== 'BBB' || $row['product'] !== 'GL ALLOY' || (string) $row['lot_no'] !== '1' || (float) $row['util_mt'] !== 0.0) { echo "BATAL: baris tidak cocok\n"; exit(1); }
$h = $gs->headers($sid, $TAB);
$sel = fn($k) => $TAB . '!' . $gs->colLetterPublic(array_search($k, $h, true) + 1) . $row['_row'];
foreach (['util_mt' => 100, 'util_date' => '30 October 2026', 'eta_jkt' => '31 December 2026'] as $k => $v) $gs->updateRange($sid, $sel($k), [[$v]]);
$gs->cacheClear();
foreach ($gs->table($sid, $TAB, false)['rows'] as $r) if ((string) $r['id'] === $ID) echo "BBB lot GL ALLOY #{$r['lot_no']}: util {$r['util_mt']} MT · tgl util {$r['util_date']} · ETA {$r['eta_jkt']}\n";
