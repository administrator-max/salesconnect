<?php
/** Audit: baris "TOTAL" Excel yang ikut terimpor sebagai baris realisasi.
 *  HANYA MEMBACA. */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$cfg = sc_config(); $gs = new GoogleSheets();
$t = $gs->table($cfg['spreadsheets']['iqdash'], 'realizations', false);
$perFile = [];
foreach ($t['rows'] as $r) {
  $f = trim((string)($r['source_file'] ?? ''));
  if ($f === '' || $f === 'programA') continue;
  $p = trim((string)($r['product'] ?? '')); $pib = trim((string)($r['pib_no'] ?? ''));
  $v = (float)($r['volume'] ?? 0);
  $kosong = ($p === '' && $pib === '');
  $perFile[$f][$kosong ? 'total' : 'isi'][] = ['id'=>$r['id']??'', 'vol'=>$v, 'co'=>$r['company_code']??''];
}
ksort($perFile);
$cocok = 0; $tidak = 0; $jumlahHantu = 0.0;
foreach ($perFile as $f => $g) {
  if (empty($g['total'])) continue;
  $sumIsi = 0.0; foreach ($g['isi'] ?? [] as $x) $sumIsi += $x['vol'];
  foreach ($g['total'] as $x) {
    $sama = abs($x['vol'] - $sumIsi) < 0.01;
    if ($sama) { $cocok++; $jumlahHantu += $x['vol']; } else $tidak++;
    printf("%-42s co=%-5s baris-kosong id=%-4s vol=%-10s | Σ baris isi (%d) = %-10s | %s\n",
      $f, $x['co'], $x['id'], number_format($x['vol'],3), count($g['isi'] ?? []),
      number_format($sumIsi,3), $sama ? 'COCOK = baris TOTAL Excel' : 'TIDAK COCOK — periksa manual');
  }
}
echo "\nCocok (baris TOTAL, dobel hitung): $cocok  | tidak cocok: $tidak\n";
echo "Volume hantu: " . number_format($jumlahHantu,3) . " MT\n";
