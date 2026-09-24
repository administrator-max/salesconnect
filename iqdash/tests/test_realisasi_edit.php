<?php
/**
 * iq_realizations_update() — PUT/PATCH /api/realizations/:id.
 *
 * Sebelum rute ini ada, satu-satunya cara memperbaiki Uraian Barang yang salah
 * adalah menghapus barisnya lalu mengunggah ulang seluruh workbook. Untuk
 * sebuah suntingan teks itu perjalanan yang merusak, dan id barisnya hilang.
 *
 * Yang dijaga uji ini, dan kenapa:
 *
 *  1. TULIS SELURUH BARIS. GoogleSheets::updateAssoc() menulis ulang SELURUH
 *     baris sheet dari assoc yang diberikan, dan setiap header yang tidak ada
 *     di assoc jadi ''. Mengirim hanya kolom yang berubah akan mengosongkan
 *     company_code, volume, created_at, dan sisanya. Ini bukan kekhawatiran
 *     teoretis — cara itu pernah melenyapkan tiga baris master di sheet ini.
 *     Jadi baris lama dibaca dulu dan patch ditempelkan DI ATASNYA.
 *
 *  2. KOLOM IDENTITAS TIDAK BISA DISUNTING. id, company_code, created_at dan
 *     source_program adalah identitas, bukan isi. Membiarkannya berubah lewat
 *     rute sunting berarti sebuah baris realisasi bisa berpindah company tanpa
 *     jejak.
 *
 *  3. TANPA PERUBAHAN = TANPA TULIS. Menyimpan form yang tidak diubah tidak
 *     boleh mengotori Change_Log atau menyentuh sheet.
 *
 *  4. SETIAP KOLOM YANG BERUBAH DICATAT SENDIRI-SENDIRI, supaya suntingan bisa
 *     ditelusuri sama seperti insert dan delete.
 *
 * Run: php iqdash/tests/test_realisasi_edit.php
 */

require_once __DIR__ . '/../../lib/GoogleSheets.php';
require_once __DIR__ . '/../../lib/sheet_util.php';
require_once __DIR__ . '/../iqdash_util.php';
require_once __DIR__ . '/../iqdash_write.php';

function ok($c, $m) { echo ($c ? "PASS" : "FAIL") . " $m\n"; if (!$c) $GLOBALS['fail'] = 1; }

/**
 * GoogleSheets palsu: konstruktornya tidak memanggil yang asli (tidak butuh
 * kunci service account), dan setiap tulisan dicatat, bukan dikirim.
 */
class SheetsPalsu extends GoogleSheets {
    public $baris;
    public $ditulis = [];   // [[sheetRow, assoc], ...]
    public $log     = [];   // baris Change_Log

    public function __construct(array $baris) { $this->baris = $baris; }

    public function table($id, $tab, $cache = true) {
        return ['headers' => array_keys($this->baris[0] ?? []), 'rows' => $this->baris];
    }
    public function updateAssoc($id, $tab, $sheetRow, array $assoc) {
        $this->ditulis[] = [$sheetRow, $assoc];
        return true;
    }
    public function append($id, $tab, $rows) {
        foreach ($rows as $r) $this->log[] = $r;
        return true;
    }
}

/* Baris JKT yang sebenarnya, apa adanya dari sheet `realizations`. */
function barisJKT(): array {
    return [[
        '_row'             => 431,
        'id'               => '428',
        'company_code'     => 'JKT',
        'product'          => 'GL ALLOY',
        'line_no'          => '1',
        'description'      => 'FLAT ROLLED PRODUCTS OF ALLOY STEEL COATED WITH ALUMINIUM ZINC AND PAINTED',
        'hs_code'          => '7225.99.90',
        'volume'           => '45.648',
        'unit'             => 'TNE',
        'value_usd'        => '41000',
        'unit_price'       => '898',
        'kurs'             => '16000',
        'country_origin'   => 'CHINA',
        'port_destination' => 'TANJUNG PRIOK',
        'port_loading'     => 'SHANGHAI',
        'ls_no'            => '',
        'ls_date'          => '',
        'pib_no'           => '628646',
        'pib_date'         => '24-09-2026',
        'invoice_no'       => 'IN26-ATL-00057 - BP',
        'invoice_date'     => '',
        'pengajuan_no'     => '',
        'pengajuan_date'   => '',
        'source'           => 'excel',
        'source_file'      => '54. REALISASI JKT - SUMEC 1.xlsx',
        'imported_by'      => 'Operations',
        'created_at'       => '2026-09-24T04:52:36.122Z',
        'updated_at'       => '2026-09-24T04:52:36.122Z',
        'source_program'   => 'B',
        'quota_year'       => '',
    ]];
}

/* ── 1. Suntingan deskripsi: seluruh kolom lain harus utuh ─────────────── */
{
    $gs = new SheetsPalsu(barisJKT());
    $baru = iq_realizations_update($gs, 'SID', 428, [
        'description' => 'FLAT ROLLED PRODUCTS OF ALLOY STEEL - REVISI BEA CUKAI',
    ], 'Ridwan');

    ok(count($gs->ditulis) === 1, 'satu tulisan ke sheet');
    [$sheetRow, $assoc] = $gs->ditulis[0];
    ok($sheetRow === 431, 'menulis ke nomor baris sheet yang benar (431)');
    ok($assoc['description'] === 'FLAT ROLLED PRODUCTS OF ALLOY STEEL - REVISI BEA CUKAI',
        'deskripsi terganti');

    /* Inti uji ini: assoc yang dikirim ke updateAssoc() harus LENGKAP.
       Kalau tidak, kolom yang hilang jadi '' di sheet. */
    foreach (['company_code' => 'JKT', 'product' => 'GL ALLOY', 'volume' => '45.648',
              'hs_code' => '7225.99.90', 'pib_no' => '628646', 'unit' => 'TNE',
              'value_usd' => '41000', 'country_origin' => 'CHINA',
              'source' => 'excel', 'source_file' => '54. REALISASI JKT - SUMEC 1.xlsx',
              'imported_by' => 'Operations', 'created_at' => '2026-09-24T04:52:36.122Z',
              'source_program' => 'B'] as $k => $v) {
        ok(($assoc[$k] ?? null) === $v, "kolom $k utuh sesudah sunting deskripsi");
    }
    ok(!array_key_exists('_row', $assoc), '_row tidak ikut ditulis sebagai kolom');
    ok($assoc['updated_at'] !== '2026-09-24T04:52:36.122Z', 'updated_at disegarkan');
    ok($baru['description'] === $assoc['description'], 'baris hasil dikembalikan ke pemanggil');

    ok(count($gs->log) === 1, 'satu baris Change_Log untuk satu kolom yang berubah');
    ok($gs->log[0][1] === 'realizations' && $gs->log[0][2] === '428'
       && $gs->log[0][3] === 'description', 'Change_Log menyebut sheet, id dan kolomnya');
    ok(strpos($gs->log[0][4], 'AND PAINTED') !== false, 'Change_Log menyimpan nilai lama');
    ok($gs->log[0][6] === 'Ridwan', 'Change_Log menyimpan siapa yang menyunting');
}

/* ── 2. Kolom identitas tidak bisa disunting ───────────────────────────── */
{
    $gs = new SheetsPalsu(barisJKT());
    iq_realizations_update($gs, 'SID', 428, [
        'company_code'   => 'BBB',
        'id'             => '9999',
        'created_at'     => '2020-01-01T00:00:00.000Z',
        'source_program' => 'Z',
        'description'    => 'sunting sah supaya tetap ada tulisan',
    ]);
    [, $assoc] = $gs->ditulis[0];
    ok($assoc['company_code'] === 'JKT',   'company_code tidak bisa dipindah lewat rute sunting');
    ok($assoc['id'] === '428',             'id tidak bisa diganti');
    ok($assoc['created_at'] === '2026-09-24T04:52:36.122Z', 'created_at tidak bisa diganti');
    ok($assoc['source_program'] === 'B',   'source_program tidak bisa diganti');
}

/* ── 3. Tanpa perubahan = tanpa tulis ──────────────────────────────────── */
{
    $gs = new SheetsPalsu(barisJKT());
    $hasil = iq_realizations_update($gs, 'SID', 428, [
        'description' => 'FLAT ROLLED PRODUCTS OF ALLOY STEEL COATED WITH ALUMINIUM ZINC AND PAINTED',
        'hs_code'     => '7225.99.90',
    ]);
    ok(count($gs->ditulis) === 0, 'nilai yang sama tidak memicu tulisan');
    ok(count($gs->log) === 0,     'nilai yang sama tidak mengotori Change_Log');
    ok(is_array($hasil) && $hasil['description'] !== '', 'baris tetap dikembalikan walau tanpa perubahan');
}

/* ── 4. Beberapa kolom berubah → satu baris log per kolom ──────────────── */
{
    $gs = new SheetsPalsu(barisJKT());
    iq_realizations_update($gs, 'SID', 428, [
        'description' => 'URAIAN BARU',
        'hsCode'      => '7210.61.11',
        'volume'      => 50.5,
    ]);
    [, $assoc] = $gs->ditulis[0];
    ok($assoc['hs_code'] === '7210.61.11', 'camelCase hsCode dipetakan ke kolom hs_code');
    ok((float) $assoc['volume'] === 50.5,  'volume masuk sebagai angka');
    ok(count($gs->log) === 3, 'tiga kolom berubah → tiga baris Change_Log');
    $kolom = array_map(fn($r) => $r[3], $gs->log);
    sort($kolom);
    ok($kolom === ['description', 'hs_code', 'volume'], 'setiap kolom dicatat namanya sendiri');
}

/* ── 5. id yang tidak ada → null, bukan baris baru ─────────────────────── */
{
    $gs = new SheetsPalsu(barisJKT());
    $hasil = iq_realizations_update($gs, 'SID', 99999, ['description' => 'x']);
    ok($hasil === null,           'id tidak dikenal mengembalikan null');
    ok(count($gs->ditulis) === 0, 'id tidak dikenal tidak menulis apa pun');
}

echo empty($GLOBALS['fail']) ? "\nSEMUA LULUS\n" : "\nADA YANG GAGAL\n";
exit(empty($GLOBALS['fail']) ? 0 : 1);
