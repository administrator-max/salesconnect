<?php
/**
 * SalesConnect — CONTOH konfigurasi.
 * Salin file ini menjadi `config.php`, lalu isi nilai aslinya.
 * `config.php` di-gitignore (berisi hash password); file sample ini yang di-commit.
 */
return [

    // Google Sheets "databases" (satu spreadsheet per tool)
    'spreadsheets' => [
        'cil'        => '1TYDed6FlNbDQDa1zrqQr989myZO9C50GJqdM1pIPIsg',
        'taskflow'   => '1U5J4T9jNcKji--VDpJOFkgs2VMLm6wLAtdr8mtL-164',
        'scot'       => 'YOUR_SCOT_SPREADSHEET_ID',
        'salespulse' => 'YOUR_SALESPULSE_SPREADSHEET_ID',
    ],

    // Path ke JSON key service account (di secure/, atau di atas public_html).
    'service_account' => __DIR__ . '/secure/service_account.json',

    // Cache baca (detik). Lebih kecil = lebih realtime, lebih banyak panggilan API.
    'cache_ttl' => 10,
    'cache_dir' => __DIR__ . '/cache',

    // Akun login: username => bcrypt hash.
    // Buat hash: php tools/hash.php 'PasswordKamu'  → tempel hasilnya di bawah.
    'users' => [
        'admin' => 'GANTI_DENGAN_HASH_BCRYPT',
    ],

    'session_name' => 'salesconnect_sess',

    // Gemini OCR (untuk modul SCOT)
    'gemini_api_key' => '',
    'gemini_model'   => 'gemini-2.5-flash',
];
