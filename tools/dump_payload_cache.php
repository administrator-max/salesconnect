<?php
/* Merekam jawaban API persis seperti yang dikirim ke browser,
 * ke cache/, untuk fixture uji .cjs sekaligus server pratinjau lokal.
 *
 * Harus persis: /api/data mengirim iq_normalize_payload($payload), BUKAN
 * payload mentah. Dan realisasi harus ikut disajikan sungguhan — versi
 * pratinjau sebelumnya memulangkan {realizations: []} dan itu membuat kartu
 * "Total Pending Shipment" membaca 25.996 (= Utilized, karena tidak ada
 * realisasi yang dikurangkan). Nyaris saya laporkan sebagai bug. Pratinjau
 * yang memalsukan sebagian data tidak bisa dipakai memeriksa tampilan.
 *
 * Hanya membaca — tidak menulis apa pun ke spreadsheet. */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();
$dir = __DIR__ . '/../cache';

$t       = iq_load_tables($gs, $sid);
$payload = iq_build_payload($t);

$tulis = function (string $nama, $data) use ($dir) {
    $f = $dir . '/' . $nama;
    file_put_contents($f, json_encode($data));
    fwrite(STDERR, sprintf("  %-24s %8d byte\n", $nama, filesize($f)));
};

$tulis('iqdash_data.json', $payload);  // fixture uji, sekaligus dipakai pratinjau

/* /api/data sebenarnya mengirim iq_normalize_payload($payload), tapi fungsi itu
 * hidup di dalam api.php yang ikut menjalankan router begitu di-require. Isi
 * normalisasinya sudah diperiksa: MURNI mengubah array kosong menjadi objek
 * kosong ([] -> {}) untuk beberapa field peta. Di JS keduanya beriterasi
 * kosong, jadi payload mentah setara untuk memeriksa tampilan. */

$rows = $gs->table($sid, 'realizations')['rows'];
$sum  = iq_realizations_summary($rows);
/* iq_empty_to_obj() juga tinggal di api.php; isinya satu baris. */
if (is_array($sum['counts']) && count($sum['counts']) === 0) $sum['counts'] = new stdClass();
$tulis('_api_realizations.json', ['realizations' => iq_realizations_list($rows, null)]);
$tulis('_api_realsummary.json',  $sum);

fwrite(STDERR, sprintf("ok — %d company, %d baris realisasi\n",
    count($payload['spi'] ?? []), count($rows)));
