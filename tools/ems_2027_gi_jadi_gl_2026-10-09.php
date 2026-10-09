<?php
/**
 * EMS 2027: produk kedua pengajuan adalah GL ALLOY 4.000 MT, bukan GI ALLOY.
 *
 * Dikonfirmasi pemilik data 09-Okt-2026: pengajuan 2027 EMS = Sheet Pile 2.000 MT
 * + GL Alloy 4.000 MT. Sistem mencatat GI ALLOY 4.000 (Submit #4, quota_year 2027).
 *
 * Yang diubah — HANYA milik EMS tahun 2027:
 *   1. cycle_products siklus "Submit #4" (quota_year 2027): GI ALLOY -> GL ALLOY;
 *   2. amplop rev_note companies EMS: _newSubmissionByYear.2027 products &
 *      confirmedTargets GI ALLOY -> GL ALLOY;
 *   3. company_shipments EMS lot quota_year 2027 produk GI ALLOY (0 MT, placeholder)
 *      -> GL ALLOY, nomor lot disesuaikan bila bentrok.
 * Siklus/lot/stats 2026 tidak disentuh. MT tidak berubah (Σ tetap 6.000).
 *
 * Dry-run:   php tools/ems_2027_gi_jadi_gl_2026-10-09.php
 * Terapkan:  php tools/ems_2027_gi_jadi_gl_2026-10-09.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';

const CO = 'EMS';
const DARI = 'GI ALLOY';
const KE   = 'GL ALLOY';
$APPLY = in_array('--apply', $argv, true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

/* 1. Siklus Submit #4 2027 EMS dan baris produknya. */
$cy = null;
foreach ($gs->table($sid, 'cycles', false)['rows'] as $r) {
    if ((string) ($r['company_code'] ?? '') === CO && trim((string) ($r['cycle_type'] ?? '')) === 'Submit #4'
        && (string) ($r['quota_year'] ?? '') === '2027') { $cy = $r; break; }
}
if (!$cy) { echo "BERHENTI: Submit #4 2027 EMS tidak ditemukan.\n"; exit(1); }
$cpTbl = $gs->table($sid, 'cycle_products', false);
$cpRows = array_values(array_filter($cpTbl['rows'], fn($r) => (string) ($r['cycle_id'] ?? '') === (string) $cy['id']));
$cpGI = array_values(array_filter($cpRows, fn($r) => strtoupper(trim((string) ($r['product'] ?? ''))) === DARI));
$cpGL = array_values(array_filter($cpRows, fn($r) => strtoupper(trim((string) ($r['product'] ?? ''))) === KE));
printf("\nSiklus Submit #4 (id %s, mt %s): %s\n", $cy['id'], $cy['mt'],
    implode(', ', array_map(fn($r) => $r['product'] . ' ' . $r['mt'], $cpRows)));
if (count($cpGI) !== 1 || $cpGL) { echo "BERHENTI: bentuk baris produk tidak sesuai dugaan.\n"; exit(1); }

/* 2. Amplop rev_note. */
$coTbl = $gs->table($sid, 'companies', false);
$coRow = null;
foreach ($coTbl['rows'] as $r) if ((string) ($r['code'] ?? '') === CO) { $coRow = $r; break; }
$env = json_decode((string) ($coRow['rev_note'] ?? ''), true);
$ns  = $env['_newSubmissionByYear']['2027'] ?? null;
if (!$ns) { echo "BERHENTI: pengajuan 2027 EMS tidak ada di amplop.\n"; exit(1); }
$ganti = function (array $list) {
    return array_map(function ($x) { if (strtoupper(trim((string) ($x['product'] ?? ''))) === DARI) $x['product'] = KE; return $x; }, $list);
};
$env2 = $env;
$env2['_newSubmissionByYear']['2027']['products']         = $ganti($ns['products'] ?? []);
$env2['_newSubmissionByYear']['2027']['confirmedTargets'] = $ganti($ns['confirmedTargets'] ?? []);
printf("Pengajuan 2027: %s -> %s\n", json_encode($ns['products']), json_encode($env2['_newSubmissionByYear']['2027']['products']));

/* 3. Lot placeholder 2027. */
$shTbl = $gs->table($sid, 'company_shipments', false);
$lotGI = []; $lotGL = [];
foreach ($shTbl['rows'] as $r) {
    if ((string) ($r['company_code'] ?? '') !== CO) continue;
    $p = strtoupper(trim((string) ($r['product'] ?? '')));
    if ($p === DARI && (string) ($r['quota_year'] ?? '') === '2027') $lotGI[] = $r;
    if ($p === KE) $lotGL[] = $r;
}
foreach ($lotGI as $l) if ((float) ($l['util_mt'] ?? 0) != 0.0) { echo "BERHENTI: lot GI 2027 sudah berisi MT.\n"; exit(1); }
$maxGL = 0; foreach ($lotGL as $l) $maxGL = max($maxGL, (int) ($l['lot_no'] ?? 0));
printf("Lot 2027 GI ALLOY (0 MT): %d baris -> GL ALLOY lot %s\n", count($lotGI),
    implode(',', array_map(fn($i) => $maxGL + 1 + $i, array_keys($lotGI))));

if (!$APPLY) { echo "\nDry-run — belum menulis apa pun. Ulangi dengan --apply.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/ems_2027_sebelum_gi_jadi_gl_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode(['cycle_products' => $cpRows, 'company' => $coRow, 'lots' => $lotGI], JSON_UNESCAPED_UNICODE));
echo "Cadangan: $cad\n";

$r = $cpGI[0]; $r['product'] = KE; $n = (int) $r['_row']; unset($r['_row']);
$gs->updateAssoc($sid, 'cycle_products', $n, $r);

$c = $coRow; $c['rev_note'] = json_encode($env2, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$n = (int) $c['_row']; unset($c['_row']);
$gs->updateAssoc($sid, 'companies', $n, $c);

foreach ($lotGI as $i => $l) {
    $l['product'] = KE; $l['lot_no'] = (string) ($maxGL + 1 + $i);
    $n = (int) $l['_row']; unset($l['_row']);
    $gs->updateAssoc($sid, 'company_shipments', $n, $l);
}

/* Baca ulang. */
$ok = true;
$cp2 = array_values(array_filter($gs->table($sid, 'cycle_products', false)['rows'], fn($r) => (string) ($r['cycle_id'] ?? '') === (string) $cy['id']));
$prods = array_map(fn($r) => strtoupper(trim($r['product'])) . '=' . $r['mt'], $cp2);
sort($prods);
echo "Submit #4 sekarang: " . implode(', ', $prods) . "\n";
if (in_array(DARI, array_map(fn($r) => strtoupper(trim($r['product'])), $cp2), true)) $ok = false;
foreach ($gs->table($sid, 'companies', false)['rows'] as $r) if ((string) ($r['code'] ?? '') === CO) {
    $e = json_decode($r['rev_note'], true);
    if (json_encode($e['_newSubmissionByYear']['2027']['products']) !== json_encode($env2['_newSubmissionByYear']['2027']['products'])) $ok = false;
    if (($e['_perYear'] ?? null) !== ($env['_perYear'] ?? null)) { $ok = false; echo "  _perYear berubah!\n"; }
}
echo $ok ? "Selesai & terverifikasi.\n" : "PERINGATAN: baca ulang tidak sesuai — periksa cadangan.\n";
exit($ok ? 0 : 1);
