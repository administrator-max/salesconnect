<?php
/** Generic row lookups shared by the tool APIs. */
require_once __DIR__ . '/GoogleSheets.php';

/**
 * Cari satu baris berdasarkan kolom `id`.
 *
 * Sengaja membaca TANPA cache. Yang dipulangkan bukan cuma isi barisnya, tapi
 * juga '_row' — nomor baris fisik di sheet — dan hampir semua pemanggil memakai
 * nomor itu untuk updateAssoc()/deleteRows(). Kalau tabel dibaca dari cache
 * (TTL 10 detik) sementara orang lain menghapus atau menambah baris di detik
 * yang sama, nomor itu sudah bergeser: penulisan mendarat di baris ORANG LAIN
 * dan penghapusan membuang costing yang salah — diam-diam, tanpa error.
 * Dengan beberapa orang memakai aplikasi bersamaan, risiko itu tidak sepadan
 * dengan hemat satu panggilan API.
 */
function find_by_id(GoogleSheets $gs, $sid, $tab, $id) {
    if ($id === null || $id === '') return null;
    $needle = (string) $id;
    foreach ($gs->table($sid, $tab, false)['rows'] as $r) {
        if ((string) ($r['id'] ?? '') === $needle) return $r;
    }
    return null;
}

function find_by_name(GoogleSheets $gs, $sid, $tab, $name) {
    $needle = mb_strtolower(trim((string) $name));
    if ($needle === '') return null;
    foreach ($gs->table($sid, $tab)['rows'] as $r) {
        if (mb_strtolower(trim((string) ($r['name'] ?? ''))) === $needle) return $r;
    }
    return null;
}
