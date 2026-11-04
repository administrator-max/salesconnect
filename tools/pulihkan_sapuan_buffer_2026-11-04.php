<?php
/* Pulihkan kerusakan sapuan buffer browser (lihat logs/buffer-menimpa-input-lain_2026-11-04_log.md).
   - Kolom company 2026 yang 29-Okt diganti nilai irisan 2027 → nilai 20-Okt (snapshot payload
     20-Okt 15:28 WIB; tidak ada perubahan kolom company tercatat antara snapshot dan sapuan).
     Kolom yang SUDAH diubah tim sesudah sapuan (ADP/BBB/MSN/SPA status, dsb.) TIDAK disentuh.
   - KJK: nilai sah 30-Okt (input Putri) yang dihapus sapuan 02-Nov.
   - Lot BBB GL ALLOY #1: input David 02-Nov (100 MT, 30 October 2026, ETA 31 December 2026).
   Setiap sel dicek: hanya ditulis bila isinya MASIH sama dengan nilai rusak. updated_at company
   dinaikkan agar tab basi mana pun ditolak 409. Backup baris sebelum: backups/.
   Tanpa --apply hanya menampilkan rencana. */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$APPLY = in_array('--apply', $argv, true);
$cfg = sc_config(); $gs = new GoogleSheets(); $gs->cacheClear(); $sid = $cfg['spreadsheets']['iqdash'];

// [code, kolom, nilai rusak yang diharapkan sekarang, nilai pulih]
$R = [
 ['AADC','remarks','','SUBMIT MOI 02/02/26'], ['AADC','spi_ref','','SPI TERBIT 16/07/2026'],
 ['AADC','status_update','Update 27/10/2026 - Menunggu Disposisi Kasi','01/07/26 PERTEK TERBIT'],
 ['AADC','pertek_no','','550/ILMATE/PERTEK-SPI-U/IV/2026'], ['AADC','spi_no','','04.PI-05.26.3350'],
 ['AADC','rev_status','Revision Request dikonfirmasi','Menunggu Disposisi Kasi'],
 ['ADP','remarks','','SUBMIT MOT 21/11/25'], ['ADP','spi_ref',' · Rev #1: GI ALLOY→GI BORON','SPI TERBIT 16/12/25 · Target re-apply Mid-March'],
 ['ADP','spi_no','','04.PI-05.25.3734'],
 ['BBB','remarks','','SUBMIT MOT 3/12/25 — Revision Cancelled 09/09/2026'], ['BBB','spi_ref','','SPI TERBIT 15/01/26 · Target re-apply Mid-March'],
 ['BDG','remarks','','SUBMIT MOI Perubahan 04/02/26'], ['BDG','spi_ref','','SPI TERBIT 13/01/26'],
 ['BDG','status_update','Submit MOI 14/10/2026',''], ['BDG','pertek_no','','1199/ILMATE/PERTEK-SPIU/XII/2025'],
 ['BDG','spi_no','','04.PI-05.26.0397'], ['BDG','rev_status','Revision Request dikonfirmasi','SPI TERBIT 13/01/2026'],
 ['BDG','rev_type','active','complete'],
 ['EMS','status_update','Update 27/10/2026 - Menunggu Disposisi Kasi','MOI Submit #1 on 08/10/2026'],
 ['GAS','remarks','','SUBMIT MOI Perubahan 20/01/26 —  —  —  — Revision Cancelled 18/05/2026'], ['GAS','spi_ref','','SPI TERBIT 09/01/26'],
 ['GAS','status_update','Submit MOI 08/10/2026','Submit MOI Perubahan (Re-Apply #1) at 14/09/2026 — Menunggu PERTEK Perubahan Terbit'],
 ['GAS','pertek_no','','1080/ILMATE/PERTEK-SPIU/XI/2025'], ['GAS','spi_no','','04.PI-05.26.0328'],
 ['GAS','rev_status','Revision Request dikonfirmasi','Menunggu Disposisi Kasi'],
 ['GKL','remarks','','SUBMIT MOT 26/11/25 — Revision Cancelled 04/06/2026'], ['GKL','spi_ref','','SPI TERBIT 24/12/25 · GI BORON +100 MT util · ETA 31 May 2026'],
 ['GKL','status_update','Update 27/10/2026 - Menunggu Disposisi Kasubdit','SPI Perubahan (re-apply) Terbit at 05/08/2026'],
 ['GKL','pertek_no','','1073/ILMATE/ PERTEK-SPI-U-Rev.1/VII/2026'], ['GKL','spi_no','',' 04.PI-05.25.3797.1'],
 ['GKL','rev_status','SPI Perubahan Terbit','SPI Terbit'],
 ['HDP','status_update','Update 27/10/2026 - Menunggu Disposisi Direktur','Submit MOI 08/10/2026'],
 ['HKG','status_update','Update 27/10/2026 - Menunggu Persetujuan Kasubdit','Submit MOI 09/10/2026'],
 ['JKT','status_update','Update 27/10/2026 - Menunggu Persetujuan Kasubdit','Submit MOI 09/10/2026'],
 ['LSJ','status_update','Update 27/10/2026 - Menunggu Persetujuan Kasubdit','Submit MOI 09/10/2026'],
 ['KJK','remarks','','SUBMIT MOT 03/12/25'], ['KJK','spi_ref','','SPI TERBIT 31/12/2025'],
 ['KJK','status_update','Update 27/10/2026 - Menunggu Disposisi Kasi','PERTEK Perubahan 2 Terbit at 05/10/2026'],
 ['KJK','pertek_no','','1076/ ILMATE/PERTEK-SPI-U-Rev.2/IX/2026'], ['KJK','spi_no','','04.PI-05.25.3899.2'],
 ['KJK','rev_status','SPI Perubahan Terbit','SPI TERBIT 31/12/2025'],
 ['LCP','remarks','','SUBMIT MOT 22/12/25'], ['LCP','spi_ref','',"SPI TERBIT 09/01/26 · Target re-apply April'26"],
 ['LCP','status_update','Update 27/10/2026 - Menunggu Disposisi Kasi','Submit MOT Perubahan #3  (re-apply #2) at 28/09/2026'],
 ['LCP','pertek_no','','1106/ILMATE/PERTEK-SPI-U-Rev.1/VI/2026'], ['LCP','spi_no','','TBA'],
 ['LCP','rev_status','SPI Perubahan Terbit','Submit SPI'], ['LCP','rev_type','complete','active'],
 ['MSN','remarks','','SUBMIT MOT 09/12/25'], ['MSN','spi_ref','','SPI TERBIT 06/01/26 · Target re-apply Early-March'],
 ['MSN','pertek_no','','1085/ILMATE/PERTEK-SPIU/XI/2025'], ['MSN','spi_no','','04.PI-05.26.0273'],
 ['SGD','remarks','','SUBMIT MOT 20/01/26'], ['SGD','spi_ref',' · Rev #1: GL ALLOY→SHEETPILE','SPI TERBIT 28/01/26 · Target re-apply Early-March'],
 ['SGD','status_update','Submit MOI 09/10/2026',''], ['SGD','pertek_no','','92/ILMATE/PERTEK-SPI-U/I/2026'],
 ['SGD','spi_no','','04.PI-05.26.0857'], ['SGD','rev_status','Menunggu PERTEK Perubahan — GL ALLOY → SHEETPILE','SPI TERBIT 28/01/2026'],
 ['SGD','rev_type','active','complete'],
 ['SMS','remarks','','SUBMIT MOT 27/02/26'], ['SMS','spi_ref','','SPI Terbit 05/03/2026'],
 ['SMS','status_update','Submit MOI 20/10.2026',''], ['SMS','pertek_no','','323/ILMATE/PERTEK-SPI-U/II/2026'],
 ['SMS','spi_no','','04.PI-05.26.1674'], ['SMS','rev_status','Revision Request dikonfirmasi','SPI Perubahan Terbit 10/07/2026'],
 ['SMS','rev_type','active','complete'],
 ['SPA','remarks',' — Revision Cancelled 04/11/2026','SUBMIT MOT 3/12/25 — Revision Cancelled 04/11/2026'],
 ['SPA','spi_ref','· Original product unchanged','SPI TERBIT 13/01/26 · Target re-apply Early-March · Original product unchanged'],
 ['SPA','pertek_no','','1079/ILMATE/PERTEK-SPI-U-Rev.1/VI/2026'], ['SPA','spi_no','','04.PI-05.26.0407.1'],
 ['SPP','remarks','','SPI TERBIT 16/12/25 · Revision submitted 13/01/26 — Cancelled, original SPI stands'],
 ['SPP','spi_ref','','✅ SPI TERBIT 16/12/25 · GI BORON 250 MT · Revision Cancelled · ETA JKT 30 Apr 2026'],
 ['SPP','status_update','Update 27/10/2026 - Menunggu Disposisi Kasi',''], ['SPP','pertek_no','','1086/ILMATE/PERTEK-SPIU/XI/2025'],
 ['SPP','spi_no','','04.PI-05.25.3738'], ['SPP','rev_status','','✅ Done — Revision Cancelled · Original SPI Active'],
];

$h = $gs->headers($sid, 'companies');
$col = fn($k) => $gs->colLetterPublic(array_search($k, $h, true) + 1);
$rows = []; foreach ($gs->table($sid, 'companies', false)['rows'] as $r) $rows[(string) $r['code']] = $r;
$tulis = []; $lewat = []; $kena = [];
foreach ($R as [$code, $k, $rusak, $pulih]) {
  $r = $rows[$code] ?? null;
  if (!$r || array_search($k, $h, true) === false) { echo "BATAL: $code.$k tidak ada\n"; exit(1); }
  $kini = (string) ($r[$k] ?? '');
  if ($kini === $pulih) { $lewat[] = "$code.$k sudah benar"; continue; }
  if ($kini !== $rusak) { $lewat[] = "$code.$k DIUBAH tim sesudah sapuan → dibiarkan: " . json_encode($kini, JSON_UNESCAPED_UNICODE); continue; }
  $tulis[] = ['companies!' . $col($k) . $r['_row'], $pulih];
  $kena[$code] = $r['_row'];
  echo sprintf("%-5s %-14s %s  →  %s\n", $code, $k, json_encode($kini, JSON_UNESCAPED_UNICODE), json_encode($pulih, JSON_UNESCAPED_UNICODE));
}
foreach ($lewat as $l) echo "  lewati: $l\n";

// Lot BBB
$sh = null; foreach ($gs->table($sid, 'company_shipments', false)['rows'] as $r) if ((string) $r['id'] === '45') $sh = $r;
$hs = $gs->headers($sid, 'company_shipments');
$colS = fn($k) => $gs->colLetterPublic(array_search($k, $hs, true) + 1);
if ($sh && $sh['company_code'] === 'BBB' && $sh['product'] === 'GL ALLOY' && (string) $sh['lot_no'] === '1' && (float) $sh['util_mt'] === 0.0) {
  foreach (['util_mt' => 100, 'util_date' => '30 October 2026', 'eta_jkt' => '31 December 2026'] as $k => $v) $tulis[] = ['company_shipments!' . $colS($k) . $sh['_row'], $v];
  $kena['BBB'] = $rows['BBB']['_row'];
  echo "BBB   lot GL ALLOY #1  util 0 → 100 MT, tgl 30 October 2026, ETA 31 December 2026\n";
} else echo "  lewati: lot BBB #1 tidak 0 / tidak cocok (util " . ($sh['util_mt'] ?? '?') . ")\n";

echo count($tulis) . " sel akan ditulis, " . count($kena) . " company.\n";
if (!$APPLY) { echo "(rencana saja — jalankan dengan --apply)\n"; exit; }

$bk = __DIR__ . '/../backups/companies_sebelum_pulih_sapuan_' . gmdate('Y-m-d_His') . '.json';
file_put_contents($bk, json_encode(['companies' => array_values($rows), 'shipment45' => $sh], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo "backup: $bk\n";
$now = gmdate('Y-m-d\TH:i:s.000\Z');
foreach ($kena as $code => $row) $tulis[] = ['companies!' . $col('updated_at') . $row, $now];
foreach ($tulis as [$rng, $v]) $gs->updateRange($sid, $rng, [[$v]]);
$gs->cacheClear();
@unlink(__DIR__ . '/../cache/iqdash_payload_memo.json');
echo "selesai: " . count($tulis) . " sel ditulis.\n";
