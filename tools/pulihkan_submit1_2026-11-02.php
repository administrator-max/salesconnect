<?php
/* Pulihkan Submit #1 (kuota 2026) EMS/KJK/BBB yang tertimpa pengajuan 2027 oleh bug draft
   form Input Data (KJK 30-Okt, EMS & BBB 02-Nov-2026). Nilai asli dari snapshot 20-Okt-2026.
   Disetujui pengguna 02-Nov-2026 ("pulihkan"). Status siklus TIDAK diubah (berisi update
   sah CorpSec 27/10). Lihat logs/draft-form-lintas-tahun_2026-11-02_log.md.
   Tanpa --apply hanya menampilkan rencana. */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$APPLY = in_array('--apply', $argv, true);
$cfg = sc_config(); $gs = new GoogleSheets(); $gs->cacheClear(); $sid = $cfg['spreadsheets']['iqdash'];

$ASLI = [
  'EMS' => ['id' => '53294', 'mt' => 8000, 'submit_date' => '15/10/2025', 'produk' => ['SHEET PILE' => 8000]],
  'KJK' => ['id' => '53353', 'mt' => 6000, 'submit_date' => '15/10/2025', 'produk' => ['GL ALLOY' => 6000]],
  'BBB' => ['id' => '53255', 'mt' => 6000, 'submit_date' => '21/10/2025', 'produk' => ['GL ALLOY' => 6000]],
];
$kol = function (string $tab, string $nama) use ($gs, $sid) {
  $i = array_search($nama, $gs->headers($sid, $tab), true);
  if ($i === false) { fwrite(STDERR, "kolom $tab.$nama tidak ada\n"); exit(1); }
  return $gs->colLetterPublic($i + 1);
};
$cyc = $gs->table($sid, 'cycles', false)['rows'];
$cp  = $gs->table($sid, 'cycle_products', false)['rows'];
$tulis = []; $hapus = [];
foreach ($ASLI as $code => $a) {
  $row = null; foreach ($cyc as $r) if ((string) $r['id'] === $a['id']) $row = $r;
  if (!$row || $row['company_code'] !== $code || $row['cycle_type'] !== 'Submit #1' || (string) $row['quota_year'] !== '2026') { echo "BATAL: baris cycles $code id {$a['id']} tidak cocok\n"; exit(1); }
  echo "$code cycles baris {$row['_row']}: mt {$row['mt']} -> {$a['mt']}, submit_date {$row['submit_date']} -> {$a['submit_date']}\n";
  $tulis[] = ['cycles!' . $kol('cycles', 'mt') . $row['_row'], $a['mt']];
  $tulis[] = ['cycles!' . $kol('cycles', 'submit_date') . $row['_row'], $a['submit_date']];
  $ada = [];
  foreach ($cp as $p) if ((string) $p['cycle_id'] === $a['id']) {
    $prod = (string) $p['product'];
    if (isset($a['produk'][$prod])) { $ada[$prod] = true; echo "   cycle_products baris {$p['_row']} $prod: {$p['mt']} -> {$a['produk'][$prod]}\n"; $tulis[] = ['cycle_products!' . $kol('cycle_products', 'mt') . $p['_row'], $a['produk'][$prod]]; }
    else { echo "   cycle_products baris {$p['_row']} $prod {$p['mt']} -> DIHAPUS (milik pengajuan 2027)\n"; $hapus[] = (int) $p['_row']; }
  }
  foreach ($a['produk'] as $prod => $mt) if (empty($ada[$prod])) { echo "BATAL: baris produk $prod untuk $code tidak ada\n"; exit(1); }
}
if (!$APPLY) { echo "\n(uji kering — jalankan dengan --apply untuk menulis)\n"; exit(0); }
foreach ($tulis as [$range, $nilai]) $gs->updateRange($sid, $range, [[$nilai]]);
if ($hapus) $gs->deleteRows($sid, 'cycle_products', $hapus);
$gs->cacheClear();
echo "\n== BACA ULANG\n";
$cyc = $gs->table($sid, 'cycles', false)['rows']; $cp = $gs->table($sid, 'cycle_products', false)['rows'];
foreach ($ASLI as $code => $a) {
  foreach ($cyc as $r) if ((string) $r['id'] === $a['id']) echo "$code Submit #1: mt {$r['mt']} · submit {$r['submit_date']} · qY {$r['quota_year']} · status " . mb_strimwidth((string) $r['status'], 0, 70, '…') . "\n";
  $p = []; foreach ($cp as $x) if ((string) $x['cycle_id'] === $a['id']) $p[] = $x['product'] . ' ' . $x['mt'];
  echo "    produk: " . implode(', ', $p) . "\n";
}
