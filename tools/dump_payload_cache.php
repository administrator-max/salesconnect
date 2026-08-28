<?php
/* Sementara — menyegarkan cache/iqdash_data.json dari spreadsheet SUNGGUHAN.
 *
 * Berkas itu adalah memo payload /api/data, dan juga yang dibaca oleh seluruh
 * uji .cjs. Salinan lokal sudah tertanggal 10-Agu, sehingga uji berjalan di
 * atas data lama: uji baris kosong Available Quota "lulus" dengan 0 baris
 * kosong padahal di data sekarang ada 6. Uji yang tidak menyentuh keadaan yang
 * dijaganya bukan bukti apa-apa.
 *
 * Hanya membaca. Hapus berkas ini sesudah dipakai. */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$t       = iq_load_tables($gs, $sid);
$payload = iq_build_payload($t);

$out = __DIR__ . '/../cache/iqdash_data.json';
file_put_contents($out, json_encode($payload));
fwrite(STDERR, sprintf("ok — %d company, %d byte -> %s\n",
    count($payload['spi'] ?? []), filesize($out), realpath($out)));
