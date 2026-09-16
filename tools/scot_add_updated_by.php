<?php
/**
 * Tambahkan kolom header `updated_by` di tab `shipments` spreadsheet SCOT.
 *
 * Hanya menulis SATU sel header di kolom kosong paling kanan — tidak menyentuh
 * satu pun baris data. Idempotent: kalau kolomnya sudah ada, tidak menulis apa
 * pun. Dijalankan sekali dari komputer lokal:
 *
 *   php tools/scot_add_updated_by.php          # lihat rencananya saja
 *   php tools/scot_add_updated_by.php --write  # benar-benar menulis
 *
 * Kenapa perlu: GoogleSheets::appendAssoc()/updateAssoc() memetakan assoc ke
 * kolom LEWAT baris header. Kolom yang tidak ada di header dibuang diam-diam —
 * jadi tanpa langkah ini, `updated_by` dari api.php tidak akan pernah tersimpan
 * dan tidak ada galat apa pun yang memberi tahu.
 */
require_once __DIR__ . '/../lib/sheet_util.php';

$write = in_array('--write', $argv, true);
$cfg = sc_config();
$sid = $cfg['spreadsheets']['scot'];
$gs  = new GoogleSheets();

$headers = $gs->headers($sid, 'shipments');
echo 'shipments: ' . count($headers) . " kolom\n";

$pos = array_search('updated_by', $headers, true);
if ($pos !== false) {
    echo "updated_by SUDAH ada di kolom " . ($pos + 1) . " — tidak ada yang perlu ditulis.\n";
    exit(0);
}

$col = count($headers) + 1;
$letter = $gs->colLetterPublic($col);
echo "updated_by akan ditulis di kolom $col ($letter), sel {$letter}1\n";

if (!$write) { echo "(uji coba — jalankan ulang dengan --write untuk menulis)\n"; exit(0); }

// Grid tab ini pas 39 kolom — tidak ada kolom cadangan, jadi lebarkan dulu
// satu kolom sebelum menulis headernya (kalau tidak: "exceeds grid limits").
$sheetId = $gs->sheetMeta($sid)['shipments'] ?? null;
if ($sheetId === null) { fwrite(STDERR, "GAGAL: sheetId tab shipments tidak ketemu.\n"); exit(1); }
$gs->batchUpdate($sid, [[
    'appendDimension' => ['sheetId' => $sheetId, 'dimension' => 'COLUMNS', 'length' => 1],
]]);
$gs->updateRange($sid, 'shipments!' . $letter . '1', [['updated_by']]);

// Baca ulang dari sumbernya, jangan percaya "ok" dari API.
$after = $gs->headers($sid, 'shipments');
$posAfter = array_search('updated_by', $after, true);
if ($posAfter === false) {
    fwrite(STDERR, "GAGAL: header dibaca ulang dan updated_by tidak ada.\n");
    exit(1);
}
echo "OK: updated_by ada di kolom " . ($posAfter + 1) . ", total sekarang " . count($after) . " kolom.\n";

// Pagar keamanan: pastikan tidak ada kolom lama yang hilang atau bergeser.
$expected = array_merge($headers, ['updated_by']);
if ($after !== $expected) {
    fwrite(STDERR, "PERINGATAN: susunan header tidak seperti yang diharapkan!\n");
    fwrite(STDERR, 'sebelum: ' . implode(',', $headers) . "\n");
    fwrite(STDERR, 'sesudah: ' . implode(',', $after) . "\n");
    exit(1);
}
echo "Susunan kolom lama tidak berubah.\n";

// Baris data tidak boleh tersentuh.
$t = $gs->table($sid, 'shipments', false);
echo 'baris data: ' . count($t['rows']) . "\n";
