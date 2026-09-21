<?php
/**
 * GAS — Re-Apply GL ALLOY 3.000 MT adalah Re-Apply #1 (Submit #2), bukan #2.
 * Keputusan pemilik data 21-Sep-2026 (lanjutan tools/sinkron_reapply_2026-09-21.php).
 *
 *   Submit #1  BORDES ALLOY 6.000 → obtained 200 → dipindah revisi ke GI ALLOY
 *   Submit #2  GL ALLOY 3.000 (Re-Apply #1) · submit 14/09/2026 · Menunggu PERTEK Perubahan Terbit
 *   Total submission 9.000, obtained 200.
 *
 * Siklus "Obtained #2" lama (mt 0, SPI Perubahan 27/04/2026, GI 200) adalah
 * SPI Perubahan REVISI BORDES→GI, bukan pasangan re-apply. Kalau namanya
 * dibiarkan, ia berpasangan dengan Submit #2 baru dan re-apply terbaca sudah
 * terbit. Diganti nama sesuai asalnya — tidak dihapus, isinya utuh.
 *
 * Dry-run: php tools/gas_reapply1_2026-09-21.php   Terapkan: ... --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

$APPLY = in_array('--apply', $argv, true);
$cfg = sc_config(); $sid = $cfg['spreadsheets']['iqdash']; $gs = new GoogleSheets();
const CO = 'GAS';

$cyTbl = $gs->table($sid, 'cycles'); $cpTbl = $gs->table($sid, 'cycle_products'); $coTbl = $gs->table($sid, 'companies');
$prodOf = [];
foreach ($cpTbl['rows'] as $r) $prodOf[(string) $r['cycle_id']][] = $r;
$rows = array_values(array_filter($cyTbl['rows'], fn($r) => $r['company_code'] === CO));
usort($rows, fn($a, $b) => (int) $a['sort_order'] <=> (int) $b['sort_order']);
$num = fn($v) => ($v === '' || $v === null) ? null : (is_numeric($v) ? $v + 0 : $v);
$cycles = array_map(function ($r) use ($prodOf, $num) {
    $p = [];
    foreach ($prodOf[(string) $r['id']] ?? [] as $x) $p[$x['product']] = $num($x['mt']);
    return ['type' => $r['cycle_type'], 'mt' => $num($r['mt']), 'submitType' => $r['submit_type'],
        'submitDate' => $r['submit_date'], 'releaseType' => $r['release_type'], 'releaseDate' => $r['release_date'],
        'status' => $r['status'], 'products' => $p, 'pertekDate' => $r['pertek_date'], 'spiDate' => $r['spi_date'],
        '_fromRevReq' => in_array(strtoupper((string) $r['from_rev_req']), ['TRUE', '1'], true),
        'quotaYear' => ($r['quota_year'] ?? '') === '' ? null : (int) $r['quota_year']];
}, $rows);

$gagal = [];
$idx = fn($t) => array_keys(array_filter($cycles, fn($c) => $c['type'] === $t));
$o2 = $idx('Obtained #2'); $s3 = $idx('Submit #3');
if (count($o2) !== 1 || (float) $cycles[$o2[0]]['mt'] !== 0.0 || trim($cycles[$o2[0]]['spiDate']) !== '27/04/2026')
    $gagal[] = 'Obtained #2 bukan siklus revisi mt 0 / SPI 27/04/2026 yang diharapkan';
if (count($s3) !== 1 || (float) $cycles[$s3[0]]['mt'] !== 3000.0) $gagal[] = 'Submit #3 GL ALLOY 3.000 tidak ditemukan';
if ($idx('Submit #2')) $gagal[] = 'Submit #2 sudah ada';
if ($gagal) { echo "PAGAR GAGAL:\n - " . implode("\n - ", $gagal) . "\n"; exit(1); }

$cycles[$o2[0]]['type'] = 'Obtained (Revision #1) — SPI Perubahan 27/04/2026';
$cycles[$s3[0]] = array_merge($cycles[$s3[0]], [
    'type' => 'Submit #2', 'submitType' => 'Submit MOI Perubahan (Re-Apply #1)',
    'releaseType' => 'PERTEK Perubahan', 'status' => 'Menunggu PERTEK Perubahan Terbit · Re-Apply #1',
]);

$coRow = null; foreach ($coTbl['rows'] as $r) if ($r['code'] === CO) $coRow = $r;
$env = json_decode((string) $coRow['rev_note'], true);
$n = 0;
foreach ($env['_reapplyRequests'] ?? [] as $i => $rq) if (($rq['cycleType'] ?? '') === 'Submit #3') {
    $env['_reapplyRequests'][$i]['cycleType'] = 'Submit #2'; $n++;
}
if ($n !== 1) { echo "PAGAR GAGAL: permintaan Re-Apply bertaut Submit #3 = $n\n"; exit(1); }
$body = [
    'revNote' => json_encode($env, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    'statusUpdate' => 'Submit MOI Perubahan (Re-Apply #1) at 14/09/2026 — Menunggu PERTEK Perubahan Terbit',
    'submit1' => 9000, 'obtained' => 200,
    'updatedBy' => 'CorpSec (sinkron 21-Sep-26)', 'updatedDate' => '21-Sep-26',
];

foreach ($cycles as $c) printf("  %-52s mt=%-5s sub=%-10s rel=%-10s spi=%-10s | %s\n", $c['type'], (string) $c['mt'],
    $c['submitDate'], $c['releaseDate'], $c['spiDate'], $c['status']);
echo "  statusUpdate = {$body['statusUpdate']}\n";
if (getenv('RENCANA_JSON')) file_put_contents(getenv('RENCANA_JSON'), json_encode(['GAS' => ['cycles' => $cycles, 'body' => $body + ['revType' => 'active', 'revStatus' => 'Submit']]], JSON_UNESCAPED_UNICODE));
if (!$APPLY) { echo "(dry-run)\n"; exit(0); }

$bk = __DIR__ . '/../backups/iqdash_gas_sebelum_reapply1_' . gmdate('Y-m-d_His') . '.json';
file_put_contents($bk, json_encode(['cycles' => $rows, 'cycle_products' => array_values(array_filter($cpTbl['rows'],
    fn($r) => in_array($r['cycle_id'], array_column($rows, 'id'), true))), 'company' => $coRow], JSON_UNESCAPED_UNICODE));
echo "backup: " . realpath($bk) . "\n";
echo json_encode(iq_replace_cycles($gs, $sid, CO, $cycles)) . "\n";
$b = iq_patch_company($gs, $sid, CO, $body);
if (!empty($b['error'])) { echo 'patch GAGAL ' . json_encode($b) . "\n"; exit(2); }

$gs2 = new GoogleSheets();
$tipe = array_map(fn($x) => $x['cycle_type'], array_values(array_filter($gs2->table($sid, 'cycles')['rows'], fn($x) => $x['company_code'] === CO)));
$ok = $tipe === array_map(fn($c) => $c['type'], $cycles);
foreach ($gs2->table($sid, 'companies')['rows'] as $x) if ($x['code'] === CO) $ok = $ok && $x['rev_note'] === $body['revNote'] && $x['full_name'] !== '';
echo $ok ? "verifikasi baca-ulang: cocok\n" : "VERIFIKASI GAGAL\n";
