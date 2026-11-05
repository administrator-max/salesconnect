<?php
/* Bersihkan siklus revisi palsu 2027 SGD & ADP (lihat logs/koreksi-produk-bukan-revisi_2026-11-05_log.md).
   - Hapus cycles Revision #3 + Obtained (Revision #3) quota_year 2027 dan cycle_products-nya.
   - perYear['2027'] di rev_note: kolom revisi dikosongkan (statusUpdate dibiarkan).
   - SGD Submit #3 (2027): rincian SHEET PILE 8.000 -> 6.000 (= total siklus).
   - companies.updated_at dinaikkan (tab basi ditolak 409). Backup ke backups/.
   Tanpa --apply hanya menampilkan rencana. */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
$APPLY = in_array('--apply', $argv, true);
$cfg = sc_config(); $gs = new GoogleSheets(); $gs->cacheClear(); $sid = $cfg['spreadsheets']['iqdash'];

$HAPUS = ['54726' => ['SGD', 'Revision #3'], '54727' => ['SGD', 'Obtained (Revision #3)'],
          '54574' => ['ADP', 'Revision #3'], '54575' => ['ADP', 'Obtained (Revision #3)']];
$cyc = $gs->table($sid, 'cycles', false)['rows'];
$cp  = $gs->table($sid, 'cycle_products', false)['rows'];
$co  = $gs->table($sid, 'companies', false)['rows'];

$barisCyc = []; $barisCp = []; $sgdSubmit = null;
foreach ($cyc as $r) {
  $id = (string) $r['id'];
  if (isset($HAPUS[$id])) {
    [$k, $t] = $HAPUS[$id];
    if ($r['company_code'] !== $k || $r['cycle_type'] !== $t || (string) $r['quota_year'] !== '2027') { echo "BATAL: cycles $id tidak cocok\n"; exit(1); }
    $barisCyc[] = (int) $r['_row']; echo "hapus cycles $id $k $t (2027)\n";
  }
  if ($id === '54725' && $r['company_code'] === 'SGD' && (string) $r['quota_year'] === '2027' && (float) $r['mt'] === 6000.0) $sgdSubmit = $r;
}
if (count($barisCyc) !== 4 || !$sgdSubmit) { echo "BATAL: baris tidak lengkap\n"; exit(1); }
$cpSgd = null;
foreach ($cp as $r) {
  if (isset($HAPUS[(string) $r['cycle_id']])) { $barisCp[] = (int) $r['_row']; echo "hapus cycle_products {$r['id']} ({$r['product']} {$r['mt']})\n"; }
  if ((string) $r['cycle_id'] === '54725') { if ($r['product'] !== 'SHEET PILE' || (float) $r['mt'] !== 8000.0 || $cpSgd) { echo "BATAL: rincian SGD Submit tidak seperti diperkirakan\n"; exit(1); } $cpSgd = $r; }
}
echo "SGD Submit #3 (2027): SHEET PILE 8000 -> 6000\n";

$hc = $gs->headers($sid, 'companies'); $colC = fn($k) => $gs->colLetterPublic(array_search($k, $hc, true) + 1);
$tulis = []; $now = gmdate('Y-m-d\TH:i:s.000\Z'); $backup = [];
foreach ($co as $r) {
  if (!in_array($r['code'], ['SGD', 'ADP'], true)) continue;
  $backup[$r['code']] = $r;
  $j = json_decode($r['rev_note'], true);
  if (!isset($j['_perYear']['2027'])) { echo "BATAL: perYear 2027 {$r['code']} tidak ada\n"; exit(1); }
  $y = &$j['_perYear']['2027'];
  echo "{$r['code']} perYear 2027: revType {$y['revType']} -> none, revStatus '{$y['revStatus']}' -> '', spiRef '{$y['spiRef']}' -> ''\n";
  $y['revType'] = 'none'; $y['revStatus'] = ''; $y['revNote'] = ''; $y['revSubmitDate'] = ''; $y['revMT'] = 0;
  $y['revFrom'] = []; $y['revTo'] = []; $y['spiRef'] = '';
  unset($y);
  $tulis[] = ['companies!' . $colC('rev_note') . $r['_row'], json_encode($j, JSON_UNESCAPED_UNICODE)];
  $tulis[] = ['companies!' . $colC('updated_at') . $r['_row'], $now];
}
$hp = $gs->headers($sid, 'cycle_products');
$tulis[] = ['cycle_products!' . $gs->colLetterPublic(array_search('mt', $hp, true) + 1) . $cpSgd['_row'], 6000];

if (!$APPLY) { echo "(rencana saja — jalankan dengan --apply)\n"; exit; }
$bk = __DIR__ . '/../backups/revisi_palsu_2027_sebelum_' . gmdate('Y-m-d_His') . '.json';
file_put_contents($bk, json_encode(['companies' => $backup,
  'cycles' => array_values(array_filter($cyc, fn($r) => isset($HAPUS[(string) $r['id']]) || (string) $r['id'] === '54725')),
  'cycle_products' => array_values(array_filter($cp, fn($r) => isset($HAPUS[(string) $r['cycle_id']]) || (string) $r['cycle_id'] === '54725'))],
  JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
echo "backup: $bk\n";
foreach ($tulis as [$rng, $v]) $gs->updateRange($sid, $rng, [[$v]]);
$gs->deleteRows($sid, 'cycle_products', $barisCp);
$gs->deleteRows($sid, 'cycles', $barisCyc);
$gs->cacheClear();
@unlink(__DIR__ . '/../cache/iqdash_payload_memo.json');
echo "selesai.\n";
