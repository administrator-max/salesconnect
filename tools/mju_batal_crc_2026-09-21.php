<?php
/**
 * MJU — revisi HRPO ALLOY 200 → CRC ALLOY 200 DIBATALKAN (Putri, 21-Sep-2026).
 * Produk akhir MJU: HRPO ALLOY 200 MT.
 *
 * Revisi ini tidak pernah punya siklus PERTEK/SPI Perubahan, jadi kuota dan
 * semua angka dashboard SUDAH HRPO ALLOY 200 — tidak ada MT yang bergerak.
 * Yang dibersihkan hanya jejaknya, yang membuat dashboard terus menampilkan
 * "Product Change HRPO ALLOY → CRC ALLOY":
 *   · 2 baris revision_changes MJU (from HRPO 200 / to CRC 200);
 *   · remarks company diberi catatan pembatalan (pola rrCancelRevision()).
 * Entri MJU di iqdash/data/pendingRevisions.json dihapus lewat commit terpisah.
 *
 * Dry-run: php tools/mju_batal_crc_2026-09-21.php   Terapkan: ... --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

$APPLY = in_array('--apply', $argv, true);
$cfg = sc_config(); $sid = $cfg['spreadsheets']['iqdash']; $gs = new GoogleSheets();

$rv = $gs->table($sid, 'revision_changes', false);
$mju = array_values(array_filter($rv['rows'], fn($r) => ($r['company_code'] ?? '') === 'MJU'));
$harap = [['from', 'HRPO ALLOY', '200'], ['to', 'CRC ALLOY', '200']];
$dapat = array_map(fn($r) => [$r['direction'], $r['product'], (string) (0 + $r['mt'])], $mju);
if ($dapat !== $harap) { echo "BERHENTI: baris revision_changes MJU tidak seperti yang diharapkan:\n" . json_encode($mju) . "\n"; exit(1); }

$co = null; foreach ($gs->table($sid, 'companies', false)['rows'] as $r) if ($r['code'] === 'MJU') $co = $r;
$catatan = ' — Revision CRC ALLOY Cancelled 21/09/2026 (produk akhir HRPO ALLOY 200 MT)';
$remarks = str_contains((string) $co['remarks'], 'CRC ALLOY Cancelled') ? $co['remarks'] : $co['remarks'] . $catatan;

echo "hapus revision_changes baris sheet: " . implode(', ', array_column($mju, '_row')) . "\n";
echo "remarks: {$co['remarks']}  ->  $remarks\n";
if (!$APPLY) { echo "(dry-run)\n"; exit(0); }

$bk = __DIR__ . '/../backups/iqdash_mju_sebelum_batal_crc_' . gmdate('Y-m-d_His') . '.json';
file_put_contents($bk, json_encode(['revision_changes_mju' => $mju, 'headers' => $rv['headers'], 'company' => $co], JSON_UNESCAPED_UNICODE));
echo "backup: " . realpath($bk) . "\n";

$gs->deleteRows($sid, 'revision_changes', array_map('intval', array_column($mju, '_row')));
$b = iq_patch_company($gs, $sid, 'MJU', ['remarks' => $remarks, 'updatedBy' => 'CorpSec (sinkron 21-Sep-26)', 'updatedDate' => '21-Sep-26']);
if (!empty($b['error'])) { echo 'patch GAGAL ' . json_encode($b) . "\n"; exit(2); }

/* Baca ulang: MJU tanpa baris revisi, jumlah baris company lain utuh, kolom company lain utuh. */
$gs2 = new GoogleSheets();
$rv2 = $gs2->table($sid, 'revision_changes', false)['rows'];
$sisaMju = count(array_filter($rv2, fn($r) => ($r['company_code'] ?? '') === 'MJU'));
$lain1 = count($rv['rows']) - count($mju); $lain2 = count($rv2) - $sisaMju;
$co2 = null; foreach ($gs2->table($sid, 'companies', false)['rows'] as $r) if ($r['code'] === 'MJU') $co2 = $r;
$utuh = true; foreach ($co as $k => $v) if (!in_array($k, ['remarks', 'updated_by', 'updated_date', 'updated_at'], true) && (string) $co2[$k] !== (string) $v) { $utuh = false; echo "kolom berubah: $k\n"; }
echo ($sisaMju === 0 && $lain1 === $lain2 && $co2['remarks'] === $remarks && $utuh)
    ? "verifikasi: cocok — revisi MJU bersih, $lain2 baris revisi company lain utuh\n" : "VERIFIKASI GAGAL (sisa MJU $sisaMju, lain $lain1→$lain2)\n";
