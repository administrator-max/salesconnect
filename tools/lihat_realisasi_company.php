<?php
/** Lihat baris realisasi JKT. HANYA MEMBACA. */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$cfg = sc_config();
$SID = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();
$t = $gs->table($SID, 'realizations', false);
$H = $t['headers'] ?? []; $R = $t['rows'] ?? [];
echo "KOLOM (" . count($H) . "): " . implode(' | ', $H) . "\n";
echo "TOTAL BARIS: " . count($R) . "\n\n";
$kode = strtoupper($argv[1] ?? 'JKT');
$n = 0;
foreach ($R as $r) {
  if (strtoupper(trim((string)($r['company_code'] ?? ''))) !== $kode) continue;
  $n++;
  echo sprintf("id=%-5s line=%-3s prod=%-12s vol=%-10s hs=%s\n   desc: %s\n   pib=%s %s | inv=%s | src=%s | file=%s | by=%s\n\n",
    $r['id'] ?? '', $r['line_no'] ?? '', $r['product'] ?? '', $r['volume'] ?? '', $r['hs_code'] ?? '',
    $r['description'] ?? '',
    $r['pib_no'] ?? '', $r['pib_date'] ?? '', $r['invoice_no'] ?? '',
    $r['source'] ?? '', $r['source_file'] ?? '', $r['imported_by'] ?? '');
}
echo "BARIS $kode: $n\n";
