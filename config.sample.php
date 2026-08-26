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
        'iqdash'     => '1t4MbpWLaQIe_NfMjb38gMtNTm27WPXLwpUq0THGMYd0',
    ],

    // Path ke JSON key service account (di secure/, atau di atas public_html).
    'service_account' => __DIR__ . '/secure/service_account.json',

    // Cache baca (detik). Lebih kecil = lebih realtime, lebih banyak panggilan API.
    'cache_ttl' => 10,
    'cache_dir' => __DIR__ . '/cache',

    // ── Login ────────────────────────────────────────────────────────────
    // Login normal memakai EMAIL + kode sekali pakai (OTP). Siapa boleh masuk
    // dan boleh membuka dashboard apa diatur di lib/access.php, BUKAN di sini.
    //
    // 'users' di bawah tinggal jadi PINTU DARURAT admin (/login.php?pw=1) untuk
    // dipakai kalau pengiriman email sedang mati. Akun ini dapat akses semua
    // dashboard. Kosongkan array-nya untuk menutup pintu itu sama sekali.
    // Buat hash: php tools/hash.php 'PasswordKamu'  → tempel hasilnya di bawah.
    'users' => [
        'admin' => 'GANTI_DENGAN_HASH_BCRYPT',
    ],

    'session_name' => 'salesconnect_sess',

    // Menit tanpa aktivitas sebelum sesi berakhir. Default 480 (8 jam) — sesi
    // juga selalu berakhir saat browser ditutup. Turunkan kalau perlu lebih ketat.
    'auth_idle_minutes' => 480,

    // SMTP untuk mengirim kode OTP. BOLEH DIKOSONGKAN: kalau host ini bisa
    // membaca berkas rahasia HR Center (/home/u5959765/hrcenter_private/
    // secrets.php), kredensialnya diambil dari sana dan tidak perlu ditulis
    // ulang di sini. Cek mana yang terpakai di /diag.php.
    // 'smtp' => [
    //     'host' => 'smtp.gmail.com', 'port' => 587, 'secure' => 'tls',
    //     'user' => '', 'pass' => '', 'from' => '', 'helo' => 'tapworkspace.com',
    // ],

    // Gemini OCR (untuk modul SCOT)
    'gemini_api_key' => '',
    'gemini_model'   => 'gemini-2.5-flash',
];
