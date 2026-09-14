<?php
/**
 * Rapikan spasi berulang pada kolom tanggal di tab `lots`.
 *
 * IKM lot #5 tersimpan sebagai "11  September 2026" — dua spasi, salah ketik
 * biasa. Pembaca tanggal sudah dibuat tahan terhadap itu (pDate dan
 * iq_util_day_key, 14-Sep-2026), jadi 300 MT-nya sudah terhitung. Tapi
 * nilainya di spreadsheet masih tidak rapi: terbaca aneh bagi orang yang
 * membuka sheet-nya, dan pembaca LAIN — rumus Excel, ekspor, skrip lain —
 * tidak ikut kebal.
 *
 * Membereskan sumbernya lebih baik daripada mengandalkan toleransi di hilir.
 *
 * CARA MENULISNYA — PENTING
 * updateAssoc() menulis ULANG SELURUH BARIS; kolom yang tidak disebut menjadi
 * KOSONG. Tanggal 11-Sep-2026 saya sendiri menghapus tiga baris cycles dengan
 * memanggilnya memakai assoc parsial. Jadi di sini barisnya dibaca utuh dulu,
 * satu nilai diubah, lalu dikirim balik LENGKAP. Sesudah menulis, barisnya
 * dibaca ULANG dan dibandingkan.
 *
 * Dry-run:  php tools/rapikan_tanggal_lot.php
 * Terapkan: php tools/rapikan_tanggal_lot.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$apply = in_array('--apply', $argv, true);
$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

/* Nama TAB di spreadsheet, bukan kunci di iq_load_tables(). */
const TAB    = 'company_shipments';
const KOLOM  = ['util_date', 'eta_jkt'];

$tabel   = $gs->table($sid, TAB, false);
$headers = $tabel['headers'] ?? [];
$rows    = $tabel['rows'] ?? [];

$rencana = [];
foreach ($rows as $r) {
    $assoc = $r; unset($assoc['_row']);
    $ubah = false;
    foreach (KOLOM as $k) {
        if (!array_key_exists($k, $assoc)) continue;
        $lama = (string) $assoc[$k];
        $baru = preg_replace('/\s+/', ' ', trim($lama));
        if ($baru !== $lama) { $assoc[$k] = $baru; $ubah = true; }
    }
    if (!$ubah) continue;
    /* Pagar: setiap kolom sheet HARUS ada di assoc, kalau tidak kolom yang
       terlewat akan ditulis kosong. */
    $kurang = array_values(array_filter($headers, fn($h) => !array_key_exists($h, $assoc)));
    $rencana[] = ['row' => $r['_row'], 'assoc' => $assoc, 'kurang' => $kurang,
                  'ket' => ($r['company_code'] ?? '?') . ' ' . ($r['product'] ?? '?')
                         . ' lot ' . ($r['lot_no'] ?? '?')];
}

echo "\n=== BARIS YANG PERLU DIRAPIKAN (" . count($rencana) . ") ===\n";
foreach ($rencana as $p) {
    echo "  baris {$p['row']}  {$p['ket']}\n";
    foreach (KOLOM as $k) {
        if (!array_key_exists($k, $p['assoc'])) continue;
        $lama = null;
        foreach ($rows as $r) if ((string) $r['_row'] === (string) $p['row']) $lama = (string) ($r[$k] ?? '');
        if ($lama !== null && $lama !== $p['assoc'][$k]) {
            echo "     $k: " . json_encode($lama) . ' -> ' . json_encode($p['assoc'][$k]) . "\n";
        }
    }
    if ($p['kurang']) { echo "     ! kolom tak terisi: " . implode(', ', $p['kurang']) . "\n"; }
}

$adaKurang = array_filter($rencana, fn($p) => count($p['kurang']));
if ($adaKurang) {
    echo "\nTIDAK MENULIS — ada kolom yang akan jadi kosong. Perbaiki dulu.\n";
    exit(1);
}
if (!count($rencana)) { echo "\nTidak ada yang perlu dirapikan.\n"; exit(0); }
if (!$apply) { echo "\nDRY-RUN. Jalankan ulang dengan --apply.\n"; exit(0); }

echo "\n=== MENULIS ===\n";
foreach ($rencana as $p) {
    $gs->updateAssoc($sid, TAB, (int) $p['row'], $p['assoc']);
    echo "  ok  baris {$p['row']}\n";
}

/* BACA ULANG dan bandingkan — jangan percaya "ok" dari API saja. */
echo "\n=== VERIFIKASI BACA ULANG ===\n";
$gs->cacheClear();
$sesudah = $gs->table($sid, TAB, false)['rows'] ?? [];
$gagal = 0;
foreach ($rencana as $p) {
    $ada = null;
    foreach ($sesudah as $r) if ((string) $r['_row'] === (string) $p['row']) $ada = $r;
    if (!$ada) { echo "  GAGAL baris {$p['row']} hilang!\n"; $gagal++; continue; }
    $beda = [];
    foreach ($p['assoc'] as $k => $v) {
        if ((string) ($ada[$k] ?? '') !== (string) $v) $beda[] = "$k=" . json_encode($ada[$k] ?? null);
    }
    if ($beda) { echo "  GAGAL baris {$p['row']}: " . implode(' ', $beda) . "\n"; $gagal++; }
    else       { echo "  ok    baris {$p['row']} utuh, " . count($p['assoc']) . " kolom cocok\n"; }
}
echo "\n" . ($gagal ? "ADA $gagal BARIS TIDAK COCOK — periksa segera." : 'Semua baris terverifikasi utuh.') . "\n";
exit($gagal ? 1 : 0);
