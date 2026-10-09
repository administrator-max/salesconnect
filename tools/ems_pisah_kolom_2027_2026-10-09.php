<?php
/**
 * EMS: pulihkan kolom 2026 yang tertimpa simpanan Quota Year 2027.
 *
 * KEJADIAN (09-Okt-2026)
 * ---------------------
 * CorpSec menyimpan status pengajuan 2027 EMS ("MOI Submit #1 on 08/10/2026")
 * dari tampilan 2027. Saat itu kolom tingkat company masih satu per company,
 * sehingga tiga kolom milik 2026 + catatan revisi tertimpa nilai 2027:
 *
 *   rev_status       Submit SPI  -> Submit
 *   rev_submit_date  24/08/2026  -> 08/10/2026
 *   status_update    "Submit MOI Perubahan (Re-Apply #2) at 24/08/2026 — Menunggu
 *                     PERTEK Perubahan #2 Terbit" -> "MOI Submit #1 on 08/10/2026"
 *   rev_note         amplop: _revNoteTeks "MOI Submit #1 on 08/10/2026" (sebelumnya
 *                     tidak ada — catatan revisi 2026 kosong)
 *
 * Nilai sebelum diambil dari cache payload 08-Okt-2026 (sebelum kejadian).
 * Sejak 01a-quota-year.js v-baru, nilai tahun selain tahun pertama disimpan di
 * amplop `_perYear`. Skrip ini MENGEMBALIKAN kolom 2026 dan MEMINDAHKAN nilai
 * 2027 ke `_perYear["2027"]` — tidak ada nilai yang dibuang.
 *
 * PAGAR: hanya baris EMS di tab companies; siklus, lot, stats tidak disentuh.
 * Baris ditulis LENGKAP (updateAssoc menimpa seluruh kolom) lalu dibaca ulang.
 *
 * Dry-run:   php tools/ems_pisah_kolom_2027_2026-10-09.php
 * Terapkan:  php tools/ems_pisah_kolom_2027_2026-10-09.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';

const CO = 'EMS';
$APPLY = in_array('--apply', $argv, true);

$KEMBALI = [
    'rev_status'      => 'Submit SPI',
    'rev_submit_date' => '24/08/2026',
    'status_update'   => 'Submit MOI Perubahan (Re-Apply #2) at 24/08/2026 — Menunggu PERTEK Perubahan #2 Terbit',
];
$TAHUN_2027 = [
    'revStatus'     => 'Submit',
    'revSubmitDate' => '08/10/2026',
    'statusUpdate'  => 'MOI Submit #1 on 08/10/2026',
    'revNote'       => 'MOI Submit #1 on 08/10/2026',
];

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$tbl = $gs->table($sid, 'companies', false);
$row = null;
foreach ($tbl['rows'] as $r) if ((string) ($r['code'] ?? '') === CO) { $row = $r; break; }
if (!$row) { echo "BERHENTI: " . CO . " tidak ada.\n"; exit(1); }

/* Pastikan keadaannya MEMANG keadaan sesudah kejadian — kalau sudah dipulihkan
   atau diubah orang lain, jangan tulis apa pun. */
if ((string) ($row['status_update'] ?? '') !== 'MOI Submit #1 on 08/10/2026'
    || (string) ($row['rev_status'] ?? '') !== 'Submit') {
    printf("BERHENTI: keadaan tidak sesuai dugaan (rev_status=%s, status_update=%s). Tidak ada yang ditulis.\n",
        $row['rev_status'] ?? '', $row['status_update'] ?? '');
    exit(1);
}

$env = json_decode((string) ($row['rev_note'] ?? ''), true);
if (!is_array($env)) { echo "BERHENTI: rev_note bukan amplop JSON.\n"; exit(1); }

$baru = $row;
foreach ($KEMBALI as $k => $v) $baru[$k] = $v;
$env2 = $env;
unset($env2['_revNoteTeks']);
$py = is_array($env2['_perYear'] ?? null) ? $env2['_perYear'] : [];
$py['2027'] = array_merge($py['2027'] ?? [], $TAHUN_2027);
$env2['_perYear'] = $py;
$baru['rev_note'] = json_encode($env2, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

echo "\n── RENCANA (baris sheet {$row['_row']}) ─────────────────────────────\n";
foreach ($KEMBALI as $k => $v) printf("  %-16s %s\n  %-16s -> %s\n", $k, $row[$k] ?? '', '', $v);
printf("  rev_note         hapus _revNoteTeks (\"%s\"), tambah _perYear.2027 = %s\n",
    $env['_revNoteTeks'] ?? '', json_encode($TAHUN_2027, JSON_UNESCAPED_UNICODE));
$lainBerubah = array_diff(array_keys($baru), array_merge(array_keys($KEMBALI), ['rev_note']));
$bedaLain = array_filter($lainBerubah, fn($k) => ($baru[$k] ?? null) !== ($row[$k] ?? null));
printf("  kolom lain yang berubah: %s\n", $bedaLain ? implode(', ', $bedaLain) : 'tidak ada');
if ($bedaLain) { echo "BERHENTI.\n"; exit(1); }

if (!$APPLY) { echo "\nDry-run — belum menulis apa pun. Ulangi dengan --apply.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/ems_sebelum_pisah_kolom_2027_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode($row, JSON_UNESCAPED_UNICODE));
echo "Cadangan: $cad\n";

$tulis = $baru; unset($tulis['_row']);
$gs->updateAssoc($sid, 'companies', (int) $row['_row'], $tulis);

/* Baca ulang. */
$cek = null;
foreach ($gs->table($sid, 'companies', false)['rows'] as $r) if ((string) ($r['code'] ?? '') === CO) { $cek = $r; break; }
$ok = $cek && $cek['rev_status'] === $KEMBALI['rev_status'] && $cek['rev_submit_date'] === $KEMBALI['rev_submit_date']
    && $cek['status_update'] === $KEMBALI['status_update']
    && (json_decode($cek['rev_note'], true)['_perYear']['2027']['statusUpdate'] ?? null) === $TAHUN_2027['statusUpdate'];
foreach ($row as $k => $v) {
    if ($k === '_row' || array_key_exists($k, $KEMBALI) || $k === 'rev_note') continue;
    if ((string) ($cek[$k] ?? '') !== (string) $v) { $ok = false; echo "  KOLOM BERUBAH TAK TERDUGA: $k\n"; }
}
echo $ok ? "Selesai & terverifikasi.\n" : "PERINGATAN: hasil baca ulang tidak sesuai — periksa dengan cadangan.\n";
exit($ok ? 0 : 1);
