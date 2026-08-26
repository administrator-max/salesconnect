<?php
/**
 * Tambahkan kolom `quota_year` ke tab-tab IQ Dash yang perlu membedakan kuota
 * 2026 dan 2027.
 *
 * ══ KAPAN INI PERLU DIJALANKAN ═════════════════════════════════════════════
 * SEBELUM baris kuota 2027 yang pertama diinput. Sampai saat itu tidak ada
 * yang rusak kalau kolomnya belum ada: pembaca (iq_quota_year() di
 * iqdash_data.php) memperlakukan baris tanpa kolom sebagai tahun bawaan 2026,
 * yaitu tepat keadaan seluruh data hari ini.
 *
 * Yang TIDAK boleh terjadi adalah menginput data 2027 sementara kolomnya belum
 * ada: penulisnya (iq_write_full_table) hanya menulis kolom yang ada di baris
 * header, jadi tahunnya hilang diam-diam saat disimpan dan barisnya muncul
 * kembali sebagai data 2026 setelah halaman dimuat ulang.
 *
 * ══ APA YANG DILAKUKAN ═════════════════════════════════════════════════════
 * Menulis satu sel header baru di kolom pertama yang kosong pada setiap tab.
 * TIDAK menyentuh satu pun baris data — seluruh sel `quota_year` dibiarkan
 * kosong, dan kosong berarti "tahun bawaan". Mengisinya dengan '2026' massal
 * justru merugikan: sesudah itu tidak ada lagi cara membedakan baris yang
 * memang sudah ditandai tim dari baris yang cuma kena tebakan skrip.
 *
 * Aman dijalankan berulang: tab yang sudah punya kolomnya dilewati.
 *
 * ══ CARA MENJALANKAN ═══════════════════════════════════════════════════════
 *   php tools/add_quota_year_columns.php            # tampilkan rencana saja
 *   php tools/add_quota_year_columns.php --apply    # tulis ke spreadsheet
 *
 * Jalankan dari folder repo (butuh config.php + secure/service_account.json).
 */

require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';

const TABS = [
    'cycles',                 // sumber utama — tahun kuota melekat di siklus
    'cycle_utilization',      // utilisasi per siklus per produk
    'company_product_stats',  // util/available per produk
    'company_shipments',      // lot pengapalan
    'ra_records',             // realisasi & re-apply
    'realizations',           // baris PIB
];

$apply = in_array('--apply', $argv ?? [], true);

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash']
    ?? $cfg['spreadsheets']['iq']
    ?? null;
if (!$sid) {
    fwrite(STDERR, "Tidak menemukan spreadsheet id iqdash di config.php (kunci 'spreadsheets').\n");
    exit(1);
}

$gs = new GoogleSheets();

echo $apply ? "MODE: TULIS\n" : "MODE: RENCANA SAJA (tambahkan --apply untuk menulis)\n";
echo "Spreadsheet: $sid\n\n";

$ditambah = 0;
$dilewati = 0;

foreach (TABS as $tab) {
    try {
        $headers = $gs->headers($sid, $tab);
    } catch (Throwable $e) {
        printf("  ??  %-24s tidak terbaca: %s\n", $tab, $e->getMessage());
        continue;
    }

    if (!$headers) {
        printf("  ??  %-24s tidak punya baris header — dilewati\n", $tab);
        continue;
    }

    if (in_array('quota_year', $headers, true)) {
        printf("  ok  %-24s sudah punya quota_year\n", $tab);
        $dilewati++;
        continue;
    }

    /* Kolom baru diletakkan SESUDAH header terakhir. Menyisipkan di tengah akan
       menggeser seluruh kolom dan memutus rumus/rentang apa pun yang menunjuk
       ke posisi kolom, jadi selalu menambah di ujung. */
    $col  = $gs->colLetterPublic(count($headers) + 1);
    $cell = "$tab!{$col}1";

    if ($apply) {
        $gs->updateRange($sid, $cell, [['quota_year']]);
        printf("  +   %-24s quota_year ditulis di %s\n", $tab, $cell);
    } else {
        printf("  +   %-24s quota_year AKAN ditulis di %s\n", $tab, $cell);
    }
    $ditambah++;
}

echo "\n$ditambah tab perlu kolom baru · $dilewati sudah siap\n";
if ($ditambah && !$apply) {
    echo "Jalankan ulang dengan --apply untuk benar-benar menulis.\n";
}
if ($apply) {
    $gs->cacheClear();
    echo "Cache baca dibersihkan — dashboard akan membaca header baru pada muat berikutnya.\n";
}
